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
const tmp = mkdtempSync(join(tmpdir(), 'pp-pay-'));
const dbPath = join(tmp, 'pay.db');
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
    env: { ...process.env, PORT: '8953', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8953';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Pay Admin')`)
    .run('adminpay@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('payments: create pending -> verify -> refund request -> refund, with visibility + billing profile', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'adminpay@example.com', password: 'Secret123' } }));
  await api('/api/auth/register', { method: 'POST', body: { email: 'buyerpay@example.com', password: 'Secret123', full_name: 'Pay Buyer', role: 'Buyer' } });
  await api('/api/auth/register', { method: 'POST', body: { email: 'otherpay@example.com', password: 'Secret123', full_name: 'Other', role: 'Buyer' } });
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'buyerpay@example.com', password: 'Secret123' } }));
  const stranger = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'otherpay@example.com', password: 'Secret123' } }));

  // Anonymous cannot create; bad method and non-positive amounts are rejected.
  assert.equal((await api('/api/payments', { method: 'POST', body: { description: 'PRO plan', amount_paise: 1123900, method: 'upi' } })).status, 401);
  assert.equal((await api('/api/payments', { method: 'POST', cookie: buyer, body: { description: 'PRO plan', amount_paise: 1123900, method: 'cash' } })).status, 400);
  assert.equal((await api('/api/payments', { method: 'POST', cookie: buyer, body: { description: 'PRO plan', amount_paise: 0, method: 'upi' } })).status, 400);
  const created = await api('/api/payments', { method: 'POST', cookie: buyer, body: {
    description: 'PRO plan — yearly', amount_paise: 1123900, method: 'upi',
    billing: { full_name: 'Pay Buyer', company: '', address: 'Wardha Road', city: 'Nagpur', pincode: '440001', gstin: '' },
  } });
  assert.equal(created.status, 201);
  const pay = await created.json();
  assert.equal(pay.data.status, 'pending');

  // Checkout also saved the billing profile in the same transaction.
  const profile = await (await api('/api/billing-profile', { cookie: buyer })).json();
  assert.equal(profile.data.city, 'Nagpur');
  const strangerProfile = await (await api('/api/billing-profile', { cookie: stranger })).json();
  assert.equal(strangerProfile.data, null);

  // Stranger cannot see the payment; payer cannot verify their own.
  assert.equal((await api(`/api/payments/${pay.data.id}`, { cookie: stranger })).status, 404);
  assert.equal((await api(`/api/payments/${pay.data.id}`, { method: 'PATCH', cookie: buyer, body: { status: 'verified' } })).status, 403);
  const verified = await api(`/api/payments/${pay.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'verified' } });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).data.status, 'verified');
  // Illegal transition refused (verified cannot go back to pending).
  assert.equal((await api(`/api/payments/${pay.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'pending' } })).status, 400);

  // Refund request: over-amount refused; valid request moves to refund_requested.
  assert.equal((await api(`/api/payments/${pay.data.id}/refund-request`, { method: 'POST', cookie: buyer, body: { reason: 'Too much', refund_amount_paise: 99999999, refund_to: 'UPI' } })).status, 400);
  const refunded = await api(`/api/payments/${pay.data.id}/refund-request`, { method: 'POST', cookie: buyer, body: { reason: 'Service issue', refund_amount_paise: 1123900, refund_to: 'Original UPI' } });
  assert.equal(refunded.status, 200);
  assert.equal((await refunded.json()).data.status, 'refund_requested');
  // Staff approves the refund.
  const done = await api(`/api/payments/${pay.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'refunded' } });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).data.status, 'refunded');

  // Second payment: refund requested then declined returns to verified.
  const pay2 = await (await api('/api/payments', { method: 'POST', cookie: buyer, body: { description: 'Extra leads', amount_paise: 199900, method: 'card' } })).json();
  await api(`/api/payments/${pay2.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'verified' } });
  await api(`/api/payments/${pay2.data.id}/refund-request`, { method: 'POST', cookie: buyer, body: { reason: 'Changed mind', refund_amount_paise: 199900, refund_to: 'Card' } });
  const declined = await api(`/api/payments/${pay2.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'rejected' } });
  assert.equal(declined.status, 200);
  assert.equal((await declined.json()).data.status, 'verified');

  // Lists are visibility-scoped.
  const mine = await (await api('/api/payments', { cookie: buyer })).json();
  assert.equal(mine.pagination.total, 2);
  const theirs = await (await api('/api/payments', { cookie: stranger })).json();
  assert.equal(theirs.pagination.total, 0);
  const all = await (await api('/api/payments', { cookie: admin })).json();
  assert.equal(all.pagination.total, 2);
});
