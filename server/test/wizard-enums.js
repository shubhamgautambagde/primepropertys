import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../src/auth.js';
import { openDb } from '../src/db.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-wiz-enums-'));
const dbPath = join(tmp, 'enums.db');
let proc;
let base;
let seller;
let admin;

function cookieOf(res) {
  const set = res.headers.get('set-cookie');
  return set ? set.split(';')[0] : '';
}
async function api(path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8977', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8977';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Enum Seller')`)
    .run('seller-enums@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Enum Admin')`)
    .run('admin-enums@example.com', hashPassword('Secret123'));
  db.close();
  seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'seller-enums@example.com', password: 'Secret123' } }));
  admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'admin-enums@example.com', password: 'Secret123' } }));
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('wizard enums: lease + PG + Office + Shop + Warehouse create, publish and go public', async () => {
  const cases = [
    { title: 'Lease House', property_type: 'House', listing_type: 'lease' },
    { title: 'PG Room', property_type: 'PG', listing_type: 'rent' },
    { title: 'Office Space', property_type: 'Office', listing_type: 'lease' },
    { title: 'Corner Shop', property_type: 'Shop', listing_type: 'sale' },
    { title: 'Warehouse Unit', property_type: 'Warehouse', listing_type: 'rent' },
  ];
  for (const c of cases) {
    const created = await api('/api/properties', {
      method: 'POST', cookie: seller,
      body: { ...c, price_inr: 100000, city: 'Nagpur' },
    });
    assert.equal(created.status, 201, `${c.property_type}/${c.listing_type} must be accepted`);
    const draft = await created.json();
    assert.equal(draft.property_type, c.property_type);
    assert.equal(draft.listing_type, c.listing_type);
    assert.equal(draft.status, 'draft');
    const pub = await api(`/api/properties/${draft.id}/publish`, { method: 'POST', cookie: admin });
    assert.equal(pub.status, 200, `${c.property_type}/${c.listing_type} must publish`);
    assert.equal((await pub.json()).status, 'published');
    const detail = await api(`/api/properties/${draft.id}`);
    assert.equal(detail.status, 200, 'published new-type property must be public');
    assert.equal((await detail.json()).property_type, c.property_type);
  }
});

test('wizard enums: old types still work, genuinely unsupported values still rejected', async () => {
  const old = await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Old Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' },
  });
  assert.equal(old.status, 201);
  for (const bad of [{ property_type: 'Castle' }, { listing_type: 'auction' }, { property_type: 'Commercial ' }]) {
    const r = await api('/api/properties', {
      method: 'POST', cookie: seller,
      body: { title: 'Bad', property_type: 'Apartment', listing_type: 'sale', price_inr: 100, city: 'Nagpur', ...bad },
    });
    assert.equal(r.status, 400, `${JSON.stringify(bad)} must still be rejected`);
  }
});

test('wizard enums: PATCH to a new type works, and choice pages no longer carry the unsupported note', async () => {
  const created = await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Patch Me', property_type: 'Apartment', listing_type: 'sale', price_inr: 100000, city: 'Nagpur' },
  });
  const draft = await created.json();
  const patched = await api(`/api/properties/${draft.id}`, {
    method: 'PATCH', cookie: seller, body: { property_type: 'PG', listing_type: 'lease' },
  });
  assert.equal(patched.status, 200);
  const after = await patched.json();
  assert.equal(after.property_type, 'PG');
  assert.equal(after.listing_type, 'lease');
  const purpose = await (await fetch(`${base}/sections/post-property/select-purpose.html`)).text();
  assert.ok(!purpose.includes('supported nahi hain'));
  const type = await (await fetch(`${base}/sections/post-property/select-property-type.html`)).text();
  assert.ok(!type.includes('supported nahi hain'));
  assert.ok(type.includes('data-choice-value="Warehouse"'));
});

// Migration-preservation test: build a pre-029 database by hand
// (001-028 + schema_migrations rows), seed old-type rows plus child
// rows, then let openDb() apply only 029 and verify nothing is lost.
test('migration 029: rebuild preserves existing rows, child rows, ids and indexes', async () => {
  const migDir = join(here, '..', 'migrations');
  const path = join(tmp, 'pre029.db');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const mark = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    if (f === '029_wizard_enums.sql') continue;
    db.exec(readFileSync(join(migDir, f), 'utf8'));
    mark.run(f);
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO users (email, password_hash, full_name) VALUES ('mig@x.com','h','Mig')").run();
  db.prepare(`INSERT INTO properties (owner_id, title, description, property_type, listing_type, price_inr, city, locality, area_sqft, bedrooms, status, facing, category, featured)
    VALUES (1,'Old Flat','d','Apartment','sale',5000000,'Nagpur','A',1200,2,'published','East','residential',1)`).run();
  db.prepare(`INSERT INTO properties (owner_id, title, property_type, listing_type, price_inr, city, status)
    VALUES (1,'Old Shop','Commercial','rent',30000,'Nagpur','draft')`).run();
  db.prepare("INSERT INTO property_images (property_id, url) VALUES (1,'https://example.com/a.jpg')").run();
  db.prepare('INSERT INTO saved_properties (user_id, property_id) VALUES (1,1)').run();
  const before = db.prepare('SELECT * FROM properties ORDER BY id').all();
  db.close();

  const upgraded = openDb(path);
  const after = upgraded.prepare('SELECT * FROM properties ORDER BY id').all();
  assert.deepEqual(after, before, 'every existing property row must survive byte-for-byte');
  assert.equal(upgraded.prepare('SELECT COUNT(*) c FROM property_images').get().c, 1, 'child image rows must survive');
  assert.equal(upgraded.prepare('SELECT COUNT(*) c FROM saved_properties').get().c, 1, 'child saved rows must survive');
  assert.deepEqual(upgraded.prepare('PRAGMA foreign_key_check').all(), [], 'no FK violations after rebuild');
  const indexes = upgraded.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='properties' ORDER BY name").all().map((r) => r.name);
  for (const idx of ['idx_properties_search', 'idx_properties_price', 'idx_properties_owner', 'idx_properties_status', 'idx_properties_search_filters', 'idx_properties_newest']) {
    assert.ok(indexes.includes(idx), `index ${idx} must be recreated`);
  }
  const sql = upgraded.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='properties'").get().sql;
  assert.match(sql, /'PG'/);
  assert.match(sql, /'lease'/);
  // AUTOINCREMENT sequence must not be reused after the rebuild.
  const nextId = Number(upgraded.prepare(`INSERT INTO properties (owner_id, title, property_type, listing_type, price_inr, city)
    VALUES (1,'Next','Apartment','sale',100,'Nagpur')`).run().lastInsertRowid);
  assert.ok(nextId > 2, `next id ${nextId} must exceed the pre-migration max id`);
  upgraded.close();
});
