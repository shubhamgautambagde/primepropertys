import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../src/auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-wiz-p1-'));
const dbPath = join(tmp, 'wizp1.db');
let proc;
let base;
let seller;

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
const valid = {
  title: 'Wizard P1 Flat', property_type: 'Apartment', listing_type: 'sale',
  price_inr: 6000000, city: 'Nagpur',
};

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8969', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8969';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Wiz P1 Seller')`)
    .run('seller-wizp1@example.com', hashPassword('Secret123'));
  db.close();
  seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'seller-wizp1@example.com', password: 'Secret123' } }));
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('wizard: unsupported choices fail explicitly naming the choice, never remapped', async () => {
  for (const [field, value] of [['listing_type', 'lease'], ['property_type', 'PG'], ['property_type', 'Office'], ['property_type', 'Shop'], ['property_type', 'Warehouse']]) {
    const r = await api('/api/properties', { method: 'POST', cookie: seller, body: { ...valid, [field]: value } });
    assert.equal(r.status, 400, `${field}=${value} must be rejected, not remapped`);
    const body = await r.json();
    assert.match(body.error.message, new RegExp(value), `error must name the unsupported choice ${value}`);
  }
  // No draft was created under a remapped type for those attempts.
  const mine = await (await api('/api/properties/mine', { cookie: seller })).json();
  assert.equal(mine.pagination.total, 0);
});

test('wizard: category is persisted on create and patch; bad category rejected', async () => {
  const bad = await api('/api/properties', { method: 'POST', cookie: seller, body: { ...valid, category: 'bogus' } });
  assert.equal(bad.status, 400);
  const created = await api('/api/properties', { method: 'POST', cookie: seller, body: { ...valid, category: 'residential' } });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(draft.category, 'residential');
  const patched = await api(`/api/properties/${draft.id}`, { method: 'PATCH', cookie: seller, body: { category: 'commercial' } });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).category, 'commercial');
});

test('wizard: choice pages carry the real choice values and an honest note', async () => {
  const purpose = await (await fetch(`${base}/sections/post-property/select-purpose.html`)).text();
  assert.ok(purpose.includes('data-choice-value="lease"'));
  assert.ok(!purpose.includes('Lease</h3>') || purpose.includes('supported nahi hain'));
  const type = await (await fetch(`${base}/sections/post-property/select-property-type.html`)).text();
  assert.ok(type.includes('data-choice-value="PG"'));
  assert.ok(type.includes('data-choice-value="Office"'));
  assert.ok(type.includes('data-choice-value="Shop"'));
  assert.ok(type.includes('data-choice-value="Warehouse"'));
});
