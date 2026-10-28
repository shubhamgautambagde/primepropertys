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
const tmp = mkdtempSync(join(tmpdir(), 'pp-stage-f-'));
const dbPath = join(tmp, 'props.db');
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

async function register(email, role = 'Owner') {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'Secret123', full_name: 'T', role } });
  return { cookie: cookieOf(r), body: await r.json() };
}

const good = {
  title: 'Test 3 BHK', property_type: 'Apartment', listing_type: 'sale',
  price_inr: 8500000, city: 'Hyderabad', locality: 'Hitech City',
  area_sqft: 1600, bedrooms: 3, bathrooms: 3,
};

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8934', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8934';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('adminf@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

async function adminCookie() {
  const r = await api('/api/auth/login', { method: 'POST', body: { email: 'adminf@example.com', password: 'Secret123' } });
  return cookieOf(r);
}

test('create requires login and valid fields; new listings start as drafts', async () => {
  assert.equal((await api('/api/properties', { method: 'POST', body: good })).status, 401);
  const owner = await register('own1@example.com');
  const bad = await api('/api/properties', { method: 'POST', cookie: owner.cookie, body: { ...good, price_inr: -5 } });
  assert.equal(bad.status, 400);
  const missing = await api('/api/properties', { method: 'POST', cookie: owner.cookie, body: { ...good, title: '' } });
  assert.equal(missing.status, 400);
  const created = await api('/api/properties', { method: 'POST', cookie: owner.cookie, body: good });
  assert.equal(created.status, 201);
  const prop = await created.json();
  assert.equal(prop.status, 'draft');
  assert.equal(prop.owner_id, owner.body.user.id);
  const pub = await api('/api/properties');
  assert.equal((await pub.json()).pagination.total, 0); // draft not public
  const mine = await api('/api/properties/mine', { cookie: owner.cookie });
  assert.equal((await mine.json()).pagination.total, 1);
});

test('publish needs approval permission; owner publish is 403, admin publish works', async () => {
  const owner = await register('own2@example.com');
  const created = await (await api('/api/properties', { method: 'POST', cookie: owner.cookie, body: good })).json();
  assert.equal((await api(`/api/properties/${created.id}/publish`, { method: 'POST', cookie: owner.cookie })).status, 403);
  const admin = await adminCookie();
  const pub = await api(`/api/properties/${created.id}/publish`, { method: 'POST', cookie: admin });
  assert.equal(pub.status, 200);
  assert.equal((await pub.json()).status, 'published');
  const list = await (await api('/api/properties')).json();
  assert.ok(list.data.some((p) => p.id === created.id));
});

test('ownership: other owner cannot edit/delete; owner edit of published reverts to draft', async () => {
  const a = await register('own3a@example.com');
  const b = await register('own3b@example.com');
  const admin = await adminCookie();
  const created = await (await api('/api/properties', { method: 'POST', cookie: a.cookie, body: good })).json();
  await api(`/api/properties/${created.id}/publish`, { method: 'POST', cookie: admin });
  assert.equal((await api(`/api/properties/${created.id}`, { method: 'PATCH', cookie: b.cookie, body: { title: 'Hijacked' } })).status, 403);
  assert.equal((await api(`/api/properties/${created.id}`, { method: 'DELETE', cookie: b.cookie })).status, 403);
  const edited = await api(`/api/properties/${created.id}`, { method: 'PATCH', cookie: a.cookie, body: { title: 'Edited Title' } });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).status, 'draft'); // back for re-approval
  const gone = await (await api('/api/properties')).json();
  assert.ok(!gone.data.some((p) => p.id === created.id));
  const del = await api(`/api/properties/${created.id}`, { method: 'DELETE', cookie: a.cookie });
  assert.equal(del.status, 200);
  assert.equal((await api(`/api/properties/${created.id}`, { cookie: a.cookie })).status, 404);
});

test('images: valid URL ok, dangerous schemes rejected, non-owner rejected', async () => {
  const a = await register('own4a@example.com');
  const b = await register('own4b@example.com');
  const created = await (await api('/api/properties', { method: 'POST', cookie: a.cookie, body: good })).json();
  const ok = await api(`/api/properties/${created.id}/images`, {
    method: 'POST', cookie: a.cookie,
    body: { url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c', alt_text: 'Front' },
  });
  assert.equal(ok.status, 201);
  const bad = await api(`/api/properties/${created.id}/images`, {
    method: 'POST', cookie: a.cookie, body: { url: 'javascript:alert(1)' },
  });
  assert.equal(bad.status, 400);
  const creds = await api(`/api/properties/${created.id}/images`, {
    method: 'POST', cookie: a.cookie, body: { url: 'https://user:pass@example.com/x.jpg' },
  });
  assert.equal(creds.status, 400);
  const other = await api(`/api/properties/${created.id}/images`, {
    method: 'POST', cookie: b.cookie, body: { url: 'https://example.com/x.jpg' },
  });
  assert.equal(other.status, 404); // draft hidden from non-owner
  const imgId = (await ok.json()).id;
  const del = await api(`/api/properties/${created.id}/images/${imgId}`, { method: 'DELETE', cookie: a.cookie });
  assert.equal(del.status, 200);
});

test('save/unsave, recently viewed order, similar properties, sort', async () => {
  const owner = await register('own5@example.com');
  const admin = await adminCookie();
  const mk = async (over) => {
    const c = await (await api('/api/properties', { method: 'POST', cookie: owner.cookie, body: { ...good, ...over } })).json();
    await api(`/api/properties/${c.id}/publish`, { method: 'POST', cookie: admin });
    return c;
  };
  const p1 = await mk({ title: 'Cheap Flat', price_inr: 5000000 });
  const p2 = await mk({ title: 'Costly Flat', price_inr: 15000000 });
  await mk({ title: 'Mumbai Flat', city: 'Mumbai' });
  const buyer = await register('buyer5@example.com', 'Buyer');
  const saved = await api(`/api/properties/${p1.id}/save`, { method: 'POST', cookie: buyer.cookie });
  assert.equal(saved.status, 201);
  const list = await (await api('/api/saved', { cookie: buyer.cookie })).json();
  assert.equal(list.pagination.total, 1);
  await api(`/api/properties/${p1.id}/save`, { method: 'DELETE', cookie: buyer.cookie });
  assert.equal((await (await api('/api/saved', { cookie: buyer.cookie })).json()).pagination.total, 0);
  await api(`/api/properties/${p1.id}`, { cookie: buyer.cookie });
  await api(`/api/properties/${p2.id}`, { cookie: buyer.cookie });
  const recent = await (await api('/api/recently-viewed', { cookie: buyer.cookie })).json();
  assert.equal(recent.data[0].id, p2.id); // most recent first
  const similar = await (await api(`/api/properties/${p1.id}/similar`)).json();
  assert.ok(similar.data.some((p) => p.id === p2.id));
  assert.ok(!similar.data.some((p) => p.id === p1.id));
  assert.ok(!similar.data.some((p) => p.city === 'Mumbai'));
  const sorted = await (await api('/api/properties?sort=price_asc&limit=100')).json();
  const prices = sorted.data.map((p) => p.price_inr);
  assert.deepEqual(prices, [...prices].sort((x, y) => x - y));
});
