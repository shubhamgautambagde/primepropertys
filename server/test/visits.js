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
const tmp = mkdtempSync(join(tmpdir(), 'pp-visits-'));
const dbPath = join(tmp, 'visits.db');
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
    env: { ...process.env, PORT: '8941', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8941';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('adminv@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('visit lifecycle: request -> confirm -> complete -> feedback, with visibility + transition rules', async () => {
  const adminLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'adminv@example.com', password: 'Secret123' } });
  const admin = cookieOf(adminLogin);
  const reg = await api('/api/auth/register', { method: 'POST', body: { email: 'vbuyer@example.com', password: 'Secret123', full_name: 'Visit Buyer', role: 'Buyer' } });
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'vbuyer@example.com', password: 'Secret123' } }));
  assert.ok(buyer, 'buyer session established');

  const created = await api('/api/properties', { method: 'POST', cookie: admin, body: { title: 'Visit 3BHK', property_type: 'Apartment', listing_type: 'sale', price_inr: 7500000, city: 'Nagpur' } });
  const prop = await created.json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: admin });

  // Anonymous cannot request; past dates are rejected.
  assert.equal((await api('/api/site-visits', { method: 'POST', body: { property_id: prop.id, scheduled_at: '2999-01-01T10:00' } })).status, 401);
  assert.equal((await api('/api/site-visits', { method: 'POST', cookie: buyer, body: { property_id: prop.id, scheduled_at: '2020-01-01T10:00' } })).status, 400);
  const req = await api('/api/site-visits', { method: 'POST', cookie: buyer, body: { property_id: prop.id, scheduled_at: '2999-01-01T10:00', notes: 'Evening preferred' } });
  assert.equal(req.status, 201);
  const visit = await req.json();
  assert.equal(visit.status, 'requested');

  // A stranger (not requester, owner, or admin) cannot see it.
  const other = await api('/api/auth/register', { method: 'POST', body: { email: 'vother@example.com', password: 'Secret123', full_name: 'Other', role: 'Buyer' } });
  const otherCookie = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'vother@example.com', password: 'Secret123' } }));
  assert.ok(other.ok);
  assert.equal((await api(`/api/site-visits/${visit.id}`, { cookie: otherCookie })).status, 404);

  // Illegal transition + feedback-before-completion are refused.
  assert.equal((await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: admin, body: { status: 'completed' } })).status, 400);
  assert.equal((await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: buyer, body: { feedback: 'Too early' } })).status, 400);

  // Requester may cancel their own visit; admin confirms this one instead.
  const req2 = await api('/api/site-visits', { method: 'POST', cookie: buyer, body: { property_id: prop.id, scheduled_at: '2999-01-02T10:00' } });
  const visit2 = await req2.json();
  assert.equal((await api(`/api/site-visits/${visit2.id}`, { method: 'PATCH', cookie: buyer, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: admin, body: { status: 'confirmed' } })).status, 200);

  // Reschedule stamps rescheduled_at and keeps the status.
  const resched = await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: buyer, body: { scheduled_at: '2999-01-03T11:00' } });
  assert.equal(resched.status, 200);
  const afterResched = await resched.json();
  assert.equal(afterResched.status, 'confirmed');
  assert.ok(afterResched.rescheduled_at);

  // Complete, then feedback with rating.
  assert.equal((await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: admin, body: { status: 'completed' } })).status, 200);
  assert.equal((await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: buyer, body: { feedback: 'Great visit', rating: 5 } })).status, 200);
  assert.equal((await api(`/api/site-visits/${visit.id}`, { method: 'PATCH', cookie: buyer, body: { rating: 9 } })).status, 400);

  // Lists + stats agree.
  const pending = await (await api('/api/site-visits?status=requested', { cookie: admin })).json();
  assert.equal(pending.pagination.total, 0);
  const completed = await (await api('/api/site-visits?status=completed', { cookie: admin })).json();
  assert.equal(completed.pagination.total, 1);
  const stats = await (await api('/api/site-visits/stats', { cookie: admin })).json();
  assert.equal(stats.total, 2);
  assert.equal(stats.by_status.completed, 1);
  assert.equal(stats.by_status.cancelled, 1);
  assert.equal((await api('/api/site-visits/stats', { cookie: buyer })).status, 200);
});
