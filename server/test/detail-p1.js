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
const tmp = mkdtempSync(join(tmpdir(), 'pp-detail-'));
const dbPath = join(tmp, 'detail.db');
let proc;
let base;
let pubId;
let draftId;

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
    env: { ...process.env, PORT: '8967', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8967';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Detail Seller')`)
    .run('seller-detail@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Detail Admin')`)
    .run('admin-detail@example.com', hashPassword('Secret123'));
  db.close();
  const seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'seller-detail@example.com', password: 'Secret123' } }));
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'admin-detail@example.com', password: 'Secret123' } }));
  const created = await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Detail Live Flat', description: 'A real listing for the detail page', property_type: 'Apartment', listing_type: 'sale', price_inr: 7500000, city: 'Nagpur', locality: 'Katol Road', area_sqft: 1200, bedrooms: 2, bathrooms: 2 },
  });
  pubId = (await created.json()).id;
  await api(`/api/properties/${pubId}/publish`, { method: 'POST', cookie: admin });
  const created2 = await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Detail Draft Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' },
  });
  draftId = (await created2.json()).id;
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('detail: published property is public, draft 404s anonymously, missing id 404s', async () => {
  const pub = await api(`/api/properties/${pubId}`);
  assert.equal(pub.status, 200);
  assert.equal((await pub.json()).title, 'Detail Live Flat');
  assert.equal((await api(`/api/properties/${draftId}`)).status, 404);
  assert.equal((await api('/api/properties/999999')).status, 404);
  assert.equal((await api('/api/properties/abc')).status, 404);
});

test('detail page: live container present, search + saved pages link View Details to real ids', async () => {
  const detailHtml = await (await fetch(`${base}/sections/property-engine/property-details.html`)).text();
  assert.ok(detailHtml.includes('id="pp-live-detail"'), 'property-details.html must carry the live container');
  assert.ok(detailHtml.includes('pp-live-detail-notice'));
  const searchHtml = await (await fetch(`${base}/sections/property-search/search-results.html`)).text();
  assert.ok(searchHtml.includes('property-details.html?property_id='), 'search live cards must link View Details by id');
  const savedHtml = await (await fetch(`${base}/sections/buyer-portal/saved-properties.html`)).text();
  assert.ok(savedHtml.includes('property-details.html?property_id='), 'saved live cards must link View Details by id');
});
