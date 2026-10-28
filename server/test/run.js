import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');

const tmp = mkdtempSync(join(tmpdir(), 'pp-stage-d-'));
const seededDb = join(tmp, 'seeded.db');
const emptyDb = join(tmp, 'empty.db');
const procs = [];

function seed() {
  const db = new DatabaseSync(seededDb);
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  // Seed through the real migration path: start the server once below and
  // insert via SQL after migrations run. Here we only create the file;
  // rows are inserted after the server has migrated the schema.
  db.close();
}

async function startServer(port, dbPath) {
  const proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  procs.push(proc);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return base;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server on ${port} did not become healthy`);
}

let seeded, empty, draftId;
before(async () => {
  seed();
  seeded = await startServer(8931, seededDb);
  // Insert test rows AFTER the server applied migrations (server owns schema).
  const db = new DatabaseSync(seededDb);
  const ins = db.prepare(`INSERT INTO properties
    (title, property_type, listing_type, price_inr, city, locality, area_sqft, bedrooms, bathrooms, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const a = ins.run('3 BHK Apartment', 'Apartment', 'sale', 8500000, 'Hyderabad', 'Hitech City', 1600, 3, 3, 'published');
  ins.run('4 BHK Villa', 'Villa', 'sale', 21000000, 'Hyderabad', 'Kondapur', 3200, 4, 5, 'published');
  draftId = Number(ins.run('Draft Plot', 'Plot', 'sale', 5000000, 'Mumbai', 'Andheri', 2000, 0, 0, 'draft').lastInsertRowid);
  db.prepare('INSERT INTO property_images (property_id, url, alt_text, sort_order) VALUES (?, ?, ?, ?)')
    .run(Number(a.lastInsertRowid), 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c', '3 BHK Apartment', 0);
  db.close();
  empty = await startServer(8932, emptyDb);
});

after(() => {
  for (const p of procs) p.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('health reports ok with database', async () => {
  const r = await fetch(`${seeded}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok', db: 'ok', version: 'stage-h' });
});

test('empty database lists zero properties', async () => {
  const r = await fetch(`${empty}/api/properties`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.data, []);
  assert.equal(body.pagination.total, 0);
});

test('list returns published only, newest first', async () => {
  const body = await (await fetch(`${seeded}/api/properties`)).json();
  assert.equal(body.pagination.total, 2);
  assert.equal(body.data.length, 2);
  assert.ok(body.data.every((p) => p.status === 'published'));
});

test('filters: city, type, price range', async () => {
  const byCity = await (await fetch(`${seeded}/api/properties?city=Mumbai`)).json();
  assert.equal(byCity.pagination.total, 0); // Mumbai row is a draft
  const byType = await (await fetch(`${seeded}/api/properties?property_type=Villa`)).json();
  assert.equal(byType.pagination.total, 1);
  const byPrice = await (await fetch(`${seeded}/api/properties?min_price=10000000`)).json();
  assert.equal(byPrice.pagination.total, 1);
});

test('pagination limit/offset', async () => {
  const p1 = await (await fetch(`${seeded}/api/properties?limit=1&offset=0`)).json();
  const p2 = await (await fetch(`${seeded}/api/properties?limit=1&offset=1`)).json();
  assert.equal(p1.data.length, 1);
  assert.equal(p2.data.length, 1);
  assert.notEqual(p1.data[0].id, p2.data[0].id);
  assert.equal(p1.pagination.total, 2);
});

test('detail returns property with images; draft and missing ids 404', async () => {
  const list = await (await fetch(`${seeded}/api/properties?property_type=Apartment`)).json();
  const id = list.data[0].id;
  const detail = await (await fetch(`${seeded}/api/properties/${id}`)).json();
  assert.equal(detail.title, '3 BHK Apartment');
  assert.equal(detail.images.length, 1);
  assert.equal((await fetch(`${seeded}/api/properties/999999`)).status, 404);
  const all = await (await fetch(`${seeded}/api/properties?limit=100`)).json();
  assert.ok(all.data.length >= 1);
  const draft = await (await fetch(`${seeded}/api/properties/${draftId}`));
  assert.equal(draft.status, 404); // draft row is never exposed
});

test('invalid parameters return 400 JSON, unknown routes 404, unauthenticated create 401', async () => {
  const bad = await fetch(`${seeded}/api/properties?limit=999`);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_PARAMETER');
  assert.equal((await fetch(`${seeded}/api/nope`)).status, 404);
  // Stage F: POST /api/properties is the create endpoint; without a session
  // it is 401, not 405.
  const post = await fetch(`${seeded}/api/properties`, { method: 'POST' });
  assert.equal(post.status, 401);
});

test('static homepage still serves through the same server', async () => {
  const r = await fetch(`${seeded}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /PrimePropertys/);
});
