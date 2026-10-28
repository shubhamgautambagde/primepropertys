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
const tmp = mkdtempSync(join(tmpdir(), 'pp-stage-h5-'));
const dbPath = join(tmp, 'mine.db');
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

async function register(email, role = 'Buyer') {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'Secret123', full_name: 'T', role } });
  return { cookie: cookieOf(r), body: await r.json() };
}

async function adminCookie() {
  const r = await api('/api/auth/login', { method: 'POST', body: { email: 'adming@example.com', password: 'Secret123' } });
  return cookieOf(r);
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8937', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8937';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('adming@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('my enquiries: own logged-in inquiry listed, anonymous and others excluded', async () => {
  const owner = await register('mineown@example.com', 'Owner');
  const prop = await (await api('/api/properties', {
    method: 'POST', cookie: owner.cookie,
    body: { title: 'Mine House', property_type: 'House', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' },
  })).json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: await adminCookie() });

  const buyer = await register('minebuyer@example.com', 'Buyer');
  const other = await register('mineother@example.com', 'Buyer');

  // Logged-in inquiry is linked to the buyer.
  const sent = await api('/api/inquiries', {
    method: 'POST', cookie: buyer.cookie,
    body: { property_id: prop.id, full_name: 'Mine Buyer', phone: '9876543210', email: 'minebuyer@example.com', message: 'Hello' },
  });
  assert.equal(sent.status, 201);

  // Anonymous inquiry — even with the buyer's own email — must NOT appear
  // in anyone's mine list (no email matching, only explicit user_id links).
  const anon = await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Anon', phone: '9876543211', email: 'minebuyer@example.com', message: 'Anon msg' },
  });
  assert.equal(anon.status, 201);

  const mine = await (await api('/api/inquiries/mine', { cookie: buyer.cookie })).json();
  assert.equal(mine.data.length, 1);
  assert.equal(mine.data[0].full_name, 'Mine Buyer');
  assert.equal(mine.data[0].property_title, 'Mine House');
  assert.equal(mine.pagination.total, 1);

  const others = await (await api('/api/inquiries/mine', { cookie: other.cookie })).json();
  assert.equal(others.data.length, 0);

  const anonMine = await api('/api/inquiries/mine');
  assert.equal(anonMine.status, 401);
});
