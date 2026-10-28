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
const tmp = mkdtempSync(join(tmpdir(), 'pp-tickets-'));
const dbPath = join(tmp, 'tickets.db');
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
    env: { ...process.env, PORT: '8944', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8944';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('admint@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Support', 'Support Staff')`)
    .run('supportt@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('ticket lifecycle: create -> assign -> progress -> reply -> resolve -> close, with visibility rules', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'admint@example.com', password: 'Secret123' } }));
  const support = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'supportt@example.com', password: 'Secret123' } }));
  const buyerReg = await api('/api/auth/register', { method: 'POST', body: { email: 'tbuyer@example.com', password: 'Secret123', full_name: 'Ticket Buyer', role: 'Buyer' } });
  const buyerBody = await buyerReg.json();
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'tbuyer@example.com', password: 'Secret123' } }));
  assert.ok(buyerBody.user.id);

  // Anonymous cannot create; invalid priority is rejected.
  assert.equal((await api('/api/tickets', { method: 'POST', body: { subject: 'X', message: 'Y' } })).status, 401);
  assert.equal((await api('/api/tickets', { method: 'POST', cookie: buyer, body: { subject: 'X', message: 'Y', priority: 'urgent' } })).status, 400);
  const created = await api('/api/tickets', { method: 'POST', cookie: buyer, body: { subject: 'Payment not reflecting', message: 'Paid yesterday, still pending.', priority: 'high' } });
  assert.equal(created.status, 201);
  const ticket = await created.json();
  assert.equal(ticket.status, 'open');
  assert.equal(ticket.priority, 'high');

  // A stranger (not requester, assignee, or manage) cannot see it.
  const strangerReg = await api('/api/auth/register', { method: 'POST', body: { email: 'tother@example.com', password: 'Secret123', full_name: 'Other', role: 'Buyer' } });
  assert.ok(strangerReg.ok);
  const stranger = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'tother@example.com', password: 'Secret123' } }));
  assert.equal((await api(`/api/tickets/${ticket.id}`, { cookie: stranger })).status, 404);
  assert.equal((await api(`/api/tickets/${ticket.id}/replies`, { method: 'POST', cookie: stranger, body: { message: 'Hi' } })).status, 404);

  // Requester cannot assign; support staff can; unknown assignee rejected.
  assert.equal((await api(`/api/tickets/${ticket.id}/assign`, { method: 'POST', cookie: buyer, body: { assigned_to: 1 } })).status, 403);
  assert.equal((await api(`/api/tickets/${ticket.id}/assign`, { method: 'POST', cookie: support, body: { assigned_to: 999999 } })).status, 400);
  const supportId = (await (await api('/api/auth/me', { cookie: support })).json()).user.id;
  assert.equal((await api(`/api/tickets/${ticket.id}/assign`, { method: 'POST', cookie: support, body: { assigned_to: supportId } })).status, 200);

  // Illegal transition refused; assignee works it through.
  assert.equal((await api(`/api/tickets/${ticket.id}`, { method: 'PATCH', cookie: support, body: { status: 'resolved' } })).status, 400);
  assert.equal((await api(`/api/tickets/${ticket.id}`, { method: 'PATCH', cookie: support, body: { status: 'in_progress' } })).status, 200);
  const reply = await api(`/api/tickets/${ticket.id}/replies`, { method: 'POST', cookie: support, body: { message: 'Looking into it.' } });
  assert.equal(reply.status, 201);
  const buyerReply = await api(`/api/tickets/${ticket.id}/replies`, { method: 'POST', cookie: buyer, body: { message: 'Thanks, waiting.' } });
  assert.equal(buyerReply.status, 201);
  assert.equal((await api(`/api/tickets/${ticket.id}`, { method: 'PATCH', cookie: support, body: { status: 'resolved' } })).status, 200);

  // Requester closes their own resolved ticket; detail shows the thread.
  assert.equal((await api(`/api/tickets/${ticket.id}`, { method: 'PATCH', cookie: buyer, body: { status: 'closed' } })).status, 200);
  const detail = await (await api(`/api/tickets/${ticket.id}`, { cookie: buyer })).json();
  assert.equal(detail.status, 'closed');
  assert.equal(detail.replies.length, 2);
  assert.equal(detail.assignee_name, 'Support Staff');

  // Lists: buyer sees only their own; support sees all.
  const mine = await (await api('/api/tickets', { cookie: buyer })).json();
  assert.equal(mine.pagination.total, 1);
  const all = await (await api('/api/tickets', { cookie: support })).json();
  assert.equal(all.pagination.total, 1);
  const closed = await (await api('/api/tickets?status=closed', { cookie: support })).json();
  assert.equal(closed.pagination.total, 1);
  const open = await (await api('/api/tickets?status=open', { cookie: support })).json();
  assert.equal(open.pagination.total, 0);
});
