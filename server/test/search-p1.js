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
const tmp = mkdtempSync(join(tmpdir(), 'pp-search-'));
const dbPath = join(tmp, 'search.db');
let proc;
let base;

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8968', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8968';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  const ins = db.prepare(`INSERT INTO properties
    (title, property_type, listing_type, price_inr, city, locality, area_sqft, bedrooms, bathrooms, status, possession_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`);
  // 3 in Nagpur/Katol Road with distinct bedrooms/area/possession, 1 elsewhere.
  ins.run('Nagpur 2BHK Ready', 'Apartment', 'sale', 5000000, 'Nagpur', 'Katol Road', 1100, 2, 2, 'Ready to Move');
  ins.run('Nagpur 3BHK Under Construction', 'Apartment', 'sale', 8000000, 'Nagpur', 'Katol Road', 1600, 3, 3, 'Under Construction');
  ins.run('Nagpur 3BHK Ready Big', 'Villa', 'sale', 15000000, 'Nagpur', 'Manish Nagar', 3000, 3, 4, 'Ready to Move');
  ins.run('Hyderabad 3BHK Ready', 'Apartment', 'sale', 9000000, 'Hyderabad', 'Hitech City', 1700, 3, 3, 'Ready to Move');
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

async function list(q) {
  const r = await fetch(`${base}/api/properties${q}`);
  const body = await r.json();
  return { status: r.status, body };
}

test('search filters: bedrooms, bedrooms_min, area range, possession, locality', async () => {
  assert.equal((await list('?bedrooms=3')).body.pagination.total, 3);
  assert.equal((await list('?bedrooms=2')).body.pagination.total, 1);
  assert.equal((await list('?bedrooms_min=3')).body.pagination.total, 3);
  assert.equal((await list('?bedrooms_min=4')).body.pagination.total, 0);
  assert.equal((await list('?area_min=1500&area_max=2000')).body.pagination.total, 2);
  assert.equal((await list('?area_min=2500')).body.pagination.total, 1);
  assert.equal((await list('?possession_status=Ready%20to%20Move')).body.pagination.total, 3);
  assert.equal((await list('?locality=Katol%20Road')).body.pagination.total, 2);
  assert.equal((await list('?city=Nagpur&bedrooms=3&possession_status=Ready%20to%20Move')).body.pagination.total, 1);
});

test('search pagination totals are filtered totals, not page size; invalid filters are 400', async () => {
  const page = await list('?city=Nagpur&limit=1&offset=0');
  assert.equal(page.body.data.length, 1);
  assert.equal(page.body.pagination.total, 3, 'total must be the full filtered count, not the page size');
  const page2 = await list('?city=Nagpur&limit=1&offset=1');
  assert.equal(page2.body.data.length, 1);
  assert.notEqual(page2.body.data[0].id, page.body.data[0].id);
  assert.equal((await list('?bedrooms=abc')).status, 400);
  assert.equal((await list('?bedrooms=-1')).status, 400);
  assert.equal((await list('?area_min=1.5')).status, 400);
  // Existing behaviour unchanged: city/type/price still work.
  assert.equal((await list('?city=Hyderabad')).body.pagination.total, 1);
  assert.equal((await list('?min_price=10000000')).body.pagination.total, 1);
});

test('search page no longer client-filters: served script passes filters to the API', async () => {
  const html = await (await fetch(`${base}/sections/property-search/search-results.html`)).text();
  assert.ok(html.includes('possession_status'), 'search-results script must pass possession_status to the API');
  assert.ok(!html.includes('hasClientFilter'), 'client-side filter fallback must be gone');
});
