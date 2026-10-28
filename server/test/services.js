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
const tmp = mkdtempSync(join(tmpdir(), 'pp-services-'));
const dbPath = join(tmp, 'services.db');
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
    env: { ...process.env, PORT: '8947', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8947';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Service Admin')`)
    .run('admins@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

const REQ = {
  category: 'Plumbing', issue_type: 'Water Leakage',
  address: 'A-1203, Green Heights, Noida', preferred_date: '2999-05-01',
  time_slot: '10:00 AM – 12:00 PM', urgency: 'high',
  description: 'Water leakage in the kitchen sink pipe.',
};

test('service request lifecycle: create -> assign -> schedule -> progress -> complete, with stats + visibility', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'admins@example.com', password: 'Secret123' } }));
  const buyerReg = await api('/api/auth/register', { method: 'POST', body: { email: 'sbuyer@example.com', password: 'Secret123', full_name: 'Service Buyer', role: 'Buyer' } });
  const buyerBody = await buyerReg.json();
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'sbuyer@example.com', password: 'Secret123' } }));
  assert.ok(buyerBody.user.id);

  // Anonymous cannot create; missing fields + bad urgency are rejected.
  assert.equal((await api('/api/service-requests', { method: 'POST', body: REQ })).status, 401);
  assert.equal((await api('/api/service-requests', { method: 'POST', cookie: buyer, body: { ...REQ, address: '' } })).status, 400);
  assert.equal((await api('/api/service-requests', { method: 'POST', cookie: buyer, body: { ...REQ, urgency: 'urgent' } })).status, 400);
  const created = await api('/api/service-requests', { method: 'POST', cookie: buyer, body: REQ });
  assert.equal(created.status, 201);
  const req = await created.json();
  assert.equal(req.status, 'requested');

  // Stranger cannot see it; requester cannot assign; unknown assignee rejected.
  const strangerReg = await api('/api/auth/register', { method: 'POST', body: { email: 'sother@example.com', password: 'Secret123', full_name: 'Other', role: 'Buyer' } });
  assert.ok(strangerReg.ok);
  const stranger = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'sother@example.com', password: 'Secret123' } }));
  assert.equal((await api(`/api/service-requests/${req.id}`, { cookie: stranger })).status, 404);
  assert.equal((await api(`/api/service-requests/${req.id}/assign`, { method: 'POST', cookie: buyer, body: { assigned_to: 1 } })).status, 403);
  assert.equal((await api(`/api/service-requests/${req.id}/assign`, { method: 'POST', cookie: admin, body: { assigned_to: 999999 } })).status, 400);

  // Assign moves requested -> assigned and stamps assigned_at.
  const adminId = (await (await api('/api/auth/me', { cookie: admin })).json()).user.id;
  const assigned = await api(`/api/service-requests/${req.id}/assign`, { method: 'POST', cookie: admin, body: { assigned_to: adminId } });
  assert.equal(assigned.status, 200);
  const afterAssign = await assigned.json();
  assert.equal(afterAssign.status, 'assigned');
  assert.ok(afterAssign.assigned_at);

  // Illegal transition refused; schedule moves assigned -> scheduled.
  assert.equal((await api(`/api/service-requests/${req.id}`, { method: 'PATCH', cookie: admin, body: { status: 'completed' } })).status, 400);
  const scheduled = await api(`/api/service-requests/${req.id}`, { method: 'PATCH', cookie: admin, body: { scheduled_at: '2999-05-02T10:00' } });
  assert.equal(scheduled.status, 200);
  assert.equal((await scheduled.json()).status, 'scheduled');

  // Progress -> complete stamps completed_at; cancelling a completed
  // request is refused — 403 for the requester (not their action),
  // 400 for staff (invalid transition), matching the visits/tickets gate order.
  assert.equal((await api(`/api/service-requests/${req.id}`, { method: 'PATCH', cookie: admin, body: { status: 'in_progress' } })).status, 200);
  const done = await api(`/api/service-requests/${req.id}`, { method: 'PATCH', cookie: admin, body: { status: 'completed' } });
  assert.equal(done.status, 200);
  assert.ok((await done.json()).completed_at);
  assert.equal((await api(`/api/service-requests/${req.id}`, { method: 'PATCH', cookie: buyer, body: { status: 'cancelled' } })).status, 403);
  assert.equal((await api(`/api/service-requests/${req.id}`, { method: 'PATCH', cookie: admin, body: { status: 'cancelled' } })).status, 400);

  // Second request, cancelled by its requester; stats use the card mapping.
  const req2 = await (await api('/api/service-requests', { method: 'POST', cookie: buyer, body: { ...REQ, category: 'Electrical' } })).json();
  assert.equal((await api(`/api/service-requests/${req2.id}`, { method: 'PATCH', cookie: buyer, body: { status: 'cancelled' } })).status, 200);
  const stats = await (await api('/api/service-requests/stats', { cookie: admin })).json();
  assert.equal(stats.total, 2);
  assert.equal(stats.in_progress, 0);
  assert.equal(stats.resolved, 1);
  assert.equal(stats.closed, 1);
  const mine = await (await api('/api/service-requests', { cookie: buyer })).json();
  assert.equal(mine.pagination.total, 2);
  const completed = await (await api('/api/service-requests?status=completed', { cookie: admin })).json();
  assert.equal(completed.pagination.total, 1);
});
