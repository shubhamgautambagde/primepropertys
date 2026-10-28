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
const tmp = mkdtempSync(join(tmpdir(), 'pp-stage-h-'));
const dbPath = join(tmp, 'contact.db');
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

const valid = {
  full_name: 'Test Person',
  email: 'test@example.com',
  phone: '+91 98765 43210',
  subject: 'Buying a property',
  message: 'I want to know more about your listings.',
};

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8936', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8936';
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

test('valid contact message is stored and returned with 201', async () => {
  const r = await api('/api/contact', { method: 'POST', body: valid });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.equal(b.ok, true);
  assert.equal(typeof b.data.id, 'number');
  const db = new DatabaseSync(dbPath);
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(b.data.id);
  db.close();
  assert.equal(row.email, 'test@example.com');
  assert.equal(row.subject, 'Buying a property');
});

test('invalid contact payloads are rejected with 400', async () => {
  const cases = [
    [{ ...valid, full_name: '' }, 'full_name'],
    [{ ...valid, email: 'not-an-email' }, 'email'],
    [{ ...valid, phone: '123' }, 'phone'],
    [{ ...valid, subject: 'Select a subject' }, 'subject'],
    [{ ...valid, message: 'x'.repeat(2001) }, 'message'],
  ];
  for (const [body] of cases) {
    const r = await api('/api/contact', { method: 'POST', body });
    assert.equal(r.status, 400);
    const b = await r.json();
    assert.equal(typeof b.error.code, 'string');
  }
});

test('contact list requires login and contact:view permission', async () => {
  const anon = await api('/api/contact');
  assert.equal(anon.status, 401);
  // Register a Buyer (no contact:view) and confirm 403.
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { email: 'buyer@example.com', password: 'Secret123', full_name: 'Buyer', role: 'Buyer' },
  });
  assert.equal(reg.status, 201);
  const buyerCookie = cookieOf(reg);
  const denied = await api('/api/contact', { cookie: buyerCookie });
  assert.equal(denied.status, 403);
  // Seed an Admin directly (Admin cannot self-register) and confirm 200.
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, full_name, role, status)
    VALUES (?, ?, ?, 'Admin', 'active')`).run('admin@example.com', hashPassword('Secret123'), 'Admin');
  db.close();
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'Secret123' } });
  assert.equal(login.status, 200);
  const adminCookie = cookieOf(login);
  const ok = await api('/api/contact', { cookie: adminCookie });
  assert.equal(ok.status, 200);
  const b = await ok.json();
  assert.equal(b.pagination.total >= 1, true);
  assert.equal(b.data[0].email, 'test@example.com');
});

test('contact rate limit trips after 20 messages/hour from one IP', async () => {
  // Attempts so far from this IP in this server: 1 valid + 5 invalid = 6.
  // 14 more valid submits reach exactly 20; the next one must be 429.
  for (let i = 0; i < 14; i++) {
    const r = await api('/api/contact', { method: 'POST', body: { ...valid, email: `rate${i}@example.com` } });
    assert.equal(r.status, 201);
  }
  const r = await api('/api/contact', { method: 'POST', body: valid });
  assert.equal(r.status, 429);
});
