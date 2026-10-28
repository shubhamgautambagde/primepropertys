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
const tmp = mkdtempSync(join(tmpdir(), 'pp-usr-'));
const dbPath = join(tmp, 'usr.db');
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
    env: { ...process.env, PORT: '8960', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8960';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Usr Admin')`)
    .run('adminusr@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Buyer', 'Usr Buyer')`)
    .run('buyerusr@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name, email_verified_at) VALUES (?, ?, 'Agent', 'Usr Agent', datetime('now'))`)
    .run('agentusr@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('users admin: list gated with verified field, detail, patch validation, self-role guard', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'adminusr@example.com', password: 'Secret123' } }));
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'buyerusr@example.com', password: 'Secret123' } }));

  assert.equal((await api('/api/users')).status, 401);
  assert.equal((await api('/api/users', { cookie: buyer })).status, 403);
  const list = await (await api('/api/users', { cookie: admin })).json();
  assert.equal(list.data.length, 3);
  assert.ok('email_verified_at' in list.data[0], 'list exposes verification state for the admin tables');
  const agent = list.data.find((u) => u.email === 'agentusr@example.com');
  assert.ok(agent.email_verified_at, 'verified agent shows a timestamp');
  const buyerRow = list.data.find((u) => u.email === 'buyerusr@example.com');
  assert.equal(buyerRow.email_verified_at, null, 'unverified buyer shows null');

  // Detail: 404 for unknown, no password hash ever.
  assert.equal((await api('/api/users/99999', { cookie: admin })).status, 404);
  const detail = await (await api(`/api/users/${agent.id}`, { cookie: admin })).json();
  assert.equal(detail.email, 'agentusr@example.com');
  assert.ok(!('password_hash' in detail));

  // Patch validation.
  assert.equal((await api(`/api/users/${agent.id}`, { method: 'PATCH', cookie: buyer, body: { status: 'suspended' } })).status, 403);
  assert.equal((await api(`/api/users/${agent.id}`, { method: 'PATCH', cookie: admin, body: { role: 'Wizard' } })).status, 400);
  assert.equal((await api(`/api/users/${agent.id}`, { method: 'PATCH', cookie: admin, body: { status: 'banned' } })).status, 400);
  assert.equal((await api(`/api/users/${agent.id}`, { method: 'PATCH', cookie: admin, body: {} })).status, 400);
  const adminRow = list.data.find((u) => u.email === 'adminusr@example.com');
  assert.equal((await api(`/api/users/${adminRow.id}`, { method: 'PATCH', cookie: admin, body: { role: 'Buyer' } })).status, 400);

  // Real patch + reread.
  const patched = await api(`/api/users/${agent.id}`, { method: 'PATCH', cookie: admin, body: { status: 'suspended' } });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).status, 'suspended');
  const reread = await (await api(`/api/users/${agent.id}`, { cookie: admin })).json();
  assert.equal(reread.status, 'suspended');
  assert.equal(reread.role, 'Agent', 'untouched fields keep their values');
});
