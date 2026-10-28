import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, createPasswordResetToken, createEmailVerificationToken } from '../src/auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-stage-e-'));
const dbPath = join(tmp, 'auth.db');
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

async function register(email, password = 'Secret123', extra = {}) {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password, full_name: 'Test User', ...extra } });
  return { r, cookie: cookieOf(r), body: await r.json() };
}

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { r, cookie: cookieOf(r), body: await r.json() };
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8933', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8933';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('register + me: user returned without password hash, with permissions', async () => {
  const { r, cookie, body } = await register('buyer1@example.com');
  assert.equal(r.status, 201);
  assert.equal(body.user.email, 'buyer1@example.com');
  assert.equal(body.user.role, 'Buyer');
  assert.ok(!('password_hash' in body.user));
  assert.ok(body.permissions.includes('leads:view_own'));
  const me = await api('/api/auth/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'buyer1@example.com');
  const anon = await api('/api/auth/me');
  assert.equal(anon.status, 401);
});

test('register validation: duplicate, weak password, bad email, admin role', async () => {
  await register('dup@example.com');
  const dup = await register('dup@example.com');
  assert.equal(dup.r.status, 409);
  const weak = await register('weak@example.com', 'short');
  assert.equal(weak.r.status, 400);
  const bad = await register('not-an-email', 'Secret123');
  assert.equal(bad.r.status, 400);
  const admin = await register('adminx@example.com', 'Secret123', { role: 'Super Admin' });
  assert.equal(admin.r.status, 400);
  const support = await register('sup@example.com', 'Secret123', { role: 'Support' });
  assert.equal(support.r.status, 400);
});

test('login success, wrong password 401, suspended 403', async () => {
  await register('login1@example.com');
  const ok = await login('login1@example.com', 'Secret123');
  assert.equal(ok.r.status, 200);
  const bad = await login('login1@example.com', 'Wrong1234');
  assert.equal(bad.r.status, 401);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'Buyer', 'suspended')`)
    .run('susp@example.com', hashPassword('Secret123'));
  db.close();
  const susp = await login('susp@example.com', 'Secret123');
  assert.equal(susp.r.status, 403);
});

test('login throttling: 5 failures then 429', async () => {
  await register('throttle@example.com');
  for (let i = 0; i < 5; i++) {
    assert.equal((await login('throttle@example.com', 'Wrong1234')).r.status, 401);
  }
  const blocked = await login('throttle@example.com', 'Wrong1234');
  assert.equal(blocked.r.status, 429);
});

test('change password revokes other sessions', async () => {
  await register('chg@example.com');
  const s1 = await login('chg@example.com', 'Secret123');
  const s2 = await login('chg@example.com', 'Secret123');
  const changed = await api('/api/auth/change-password', {
    method: 'POST', cookie: s1.cookie,
    body: { current_password: 'Secret123', new_password: 'Newpass456' },
  });
  assert.equal(changed.status, 200);
  assert.equal((await api('/api/auth/me', { cookie: s2.cookie })).status, 401);
  assert.equal((await api('/api/auth/me', { cookie: s1.cookie })).status, 200);
  assert.equal((await login('chg@example.com', 'Secret123')).r.status, 401);
  assert.equal((await login('chg@example.com', 'Newpass456')).r.status, 200);
});

test('password reset flow via token, single use', async () => {
  const { body } = await register('reset@example.com');
  const db = new DatabaseSync(dbPath);
  const token = createPasswordResetToken(db, body.user.id);
  db.close();
  const reset = await api('/api/auth/reset-password', { method: 'POST', body: { token, new_password: 'Reset7890' } });
  assert.equal(reset.status, 200);
  assert.equal((await login('reset@example.com', 'Reset7890')).r.status, 200);
  const reuse = await api('/api/auth/reset-password', { method: 'POST', body: { token, new_password: 'Again1234' } });
  assert.equal(reuse.status, 400);
});

test('email verification marks the account verified', async () => {
  const { body } = await register('verify@example.com');
  assert.equal(body.user.email_verified_at, null);
  const db = new DatabaseSync(dbPath);
  const token = createEmailVerificationToken(db, body.user.id);
  db.close();
  const v = await api('/api/auth/verify-email', { method: 'POST', body: { token } });
  assert.equal(v.status, 200);
  const me = await api('/api/auth/me', { cookie: (await login('verify@example.com', 'Secret123')).cookie });
  assert.ok((await me.json()).user.email_verified_at);
});

test('IDOR: owner sees own draft, others and anonymous get 404', async () => {
  const a = await register('owner-a@example.com', 'Secret123', { role: 'Owner' });
  const b = await register('owner-b@example.com', 'Secret123', { role: 'Owner' });
  const db = new DatabaseSync(dbPath);
  const draftId = Number(db.prepare(`INSERT INTO properties
    (owner_id, title, property_type, listing_type, price_inr, city, status)
    VALUES (?, 'My Draft House', 'House', 'sale', 9000000, 'Pune', 'draft')`).run(a.body.user.id).lastInsertRowid);
  db.close();
  assert.equal((await api(`/api/properties/${draftId}`, { cookie: a.cookie })).status, 200);
  assert.equal((await api(`/api/properties/${draftId}`, { cookie: b.cookie })).status, 404);
  assert.equal((await api(`/api/properties/${draftId}`)).status, 404);
});

test('logout invalidates the session; admin permissions include users:manage', async () => {
  const { cookie } = await register('logout@example.com');
  assert.equal((await api('/api/auth/me', { cookie })).status, 200);
  const out = await api('/api/auth/logout', { method: 'POST', cookie });
  assert.equal(out.status, 200);
  assert.equal((await api('/api/auth/me', { cookie })).status, 401);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('admin1@example.com', hashPassword('Secret123'));
  db.close();
  const admin = await login('admin1@example.com', 'Secret123');
  assert.ok(admin.body.permissions.includes('users:manage'));
  assert.ok(admin.body.permissions.includes('properties:view_any'));
  const buyer = await login('buyer1@example.com', 'Secret123');
  assert.ok(!buyer.body.permissions.includes('users:manage'));
});
