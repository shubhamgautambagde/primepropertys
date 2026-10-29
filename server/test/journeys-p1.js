import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../src/auth.js';

// Priority 1, Module 7: Playwright is NOT available in this environment
// (no playwright package, no browser binaries, no global install), so
// browser tests were NOT run. These are the equivalent API-level
// journeys, exercising the same server endpoints a browser journey
// would hit, in the same order. Do not report these as browser tests.
const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-journey-p1-'));
const dbPath = join(tmp, 'journey.db');
const uploadDir = join(tmp, 'uploads');
let proc;
let base;

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
    env: { ...process.env, PORT: '8972', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot, UPLOAD_DIR: uploadDir },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8972';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Journey Admin')`)
    .run('admin-journey@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('journey 1: registration -> login -> dashboard (me) -> logout -> me is 401', async () => {
  const reg = await api('/api/auth/register', { method: 'POST', body: { email: 'buyer-journey@example.com', password: 'Secret123', full_name: 'Journey Buyer', role: 'Buyer' } });
  assert.equal(reg.status, 201);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'buyer-journey@example.com', password: 'Secret123' } });
  assert.equal(login.status, 200);
  const cookie = cookieOf(login);
  const me = await api('/api/auth/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'buyer-journey@example.com');
  assert.equal((await api('/api/auth/logout', { method: 'POST', cookie })).status, 200);
  assert.equal((await api('/api/auth/me', { cookie })).status, 401);
});

test('journey 2: property draft -> admin publish -> public search/detail; journey 3: search -> detail -> enquiry', async () => {
  const sellerReg = await api('/api/auth/register', { method: 'POST', body: { email: 'seller-journey@example.com', password: 'Secret123', full_name: 'Journey Seller', role: 'Seller' } });
  const seller = cookieOf(sellerReg);
  const created = await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Journey Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 7000000, city: 'Nagpur', locality: 'Katol Road', bedrooms: 2 },
  });
  assert.equal(created.status, 201);
  const prop = await created.json();
  assert.equal(prop.status, 'draft');
  // Public search must not show the draft; the wizard "submit" step
  // keeps it a draft (review), so publish is the admin step.
  assert.equal((await (await api('/api/properties?city=Nagpur')).json()).pagination.total, 0);
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'admin-journey@example.com', password: 'Secret123' } }));
  assert.equal((await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: admin })).status, 200);
  const search = await (await api('/api/properties?city=Nagpur&bedrooms=2')).json();
  assert.equal(search.pagination.total, 1);
  assert.equal(search.data[0].id, prop.id);
  const detail = await api(`/api/properties/${prop.id}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).title, 'Journey Flat');
  const enquiry = await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Journey Buyer', phone: '9876543210', message: 'Interested, please call.' },
  });
  assert.equal(enquiry.status, 201);
  const leads = await (await api('/api/leads', { cookie: admin })).json();
  assert.ok(leads.data.some((l) => l.property_id === prop.id));
});

test('journey 4: unauthorised access is denied (401/403/404, no leak)', async () => {
  const strangerReg = await api('/api/auth/register', { method: 'POST', body: { email: 'stranger-journey@example.com', password: 'Secret123', full_name: 'Journey Stranger', role: 'Buyer' } });
  const stranger = cookieOf(strangerReg);
  // Anonymous create is 401; stranger cannot edit/publish the seller's listing.
  assert.equal((await api('/api/properties', { method: 'POST', body: { title: 'X', property_type: 'Apartment', listing_type: 'sale', price_inr: 1000, city: 'Nagpur' } })).status, 401);
  const seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'seller-journey@example.com', password: 'Secret123' } }));
  const draft = await (await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Private Draft', property_type: 'Apartment', listing_type: 'sale', price_inr: 1000000, city: 'Nagpur' },
  })).json();
  assert.equal((await api(`/api/properties/${draft.id}`, { cookie: stranger })).status, 404, 'draft must 404, not 403, to a stranger');
  assert.equal((await api(`/api/properties/${draft.id}`, { method: 'PATCH', cookie: stranger, body: { title: 'Hijack' } })).status, 404);
  assert.equal((await api(`/api/properties/${draft.id}/publish`, { method: 'POST', cookie: stranger })).status, 404, 'draft is invisible to a stranger, so publish 404s');
  assert.equal((await api(`/api/properties/${draft.id}/publish`, { method: 'POST', cookie: seller })).status, 403, 'owner without publish permission gets 403');
});

test('journey 5: invalid upload is rejected through the same upload API', async () => {
  const seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'seller-journey@example.com', password: 'Secret123' } }));
  const draft = await (await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Upload Journey Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 1000000, city: 'Nagpur' },
  })).json();
  const fd = new FormData();
  fd.append('kind', 'image');
  fd.append('file', new Blob([Buffer.from('not an image at all')], { type: 'text/plain' }), 'x.txt');
  const r = await fetch(`${base}/api/properties/${draft.id}/uploads`, { method: 'POST', headers: { Cookie: seller }, body: fd });
  assert.equal(r.status, 400);
});
