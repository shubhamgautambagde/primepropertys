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
const tmp = mkdtempSync(join(tmpdir(), 'pp-sec-p1-'));
const procs = [];
const logs = new Map();

async function startServer(port, extraEnv = {}, capture = false) {
  const dbPath = join(tmp, `sec-${port}.db`);
  const proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot, ...extraEnv },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'ignore',
  });
  procs.push(proc);
  if (capture) {
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    logs.set(port, () => out);
  }
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  // Seed one seller + one admin directly (avoids counting register rate limits).
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Sec Seller')`)
    .run('seller-sec@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Sec Admin')`)
    .run('admin-sec@example.com', hashPassword('Secret123'));
  db.close();
  return base;
}

function cookieOf(res) {
  const set = res.headers.get('set-cookie');
  return set ? set.split(';')[0] : '';
}
async function api(base, path, { method = 'GET', body, cookie, headers = {} } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let secureBase, plainBase, devBase, defaultBase, rateBase;

before(async () => {
  secureBase = await startServer(8962, { SESSION_COOKIE_SECURE: '1' });
  plainBase = await startServer(8963, {});
  devBase = await startServer(8964, { PP_DEV_CONSOLE_EMAIL: '1' }, true);
  defaultBase = await startServer(8965, {}, true);
  rateBase = await startServer(8966, {});
});

after(() => {
  for (const p of procs) p.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('secure cookie: Secure flag only when explicitly set, plain HTTP login still works', async () => {
  const sec = await api(secureBase, '/api/auth/login', { method: 'POST', body: { email: 'seller-sec@example.com', password: 'Secret123' } });
  assert.equal(sec.status, 200);
  assert.match(sec.headers.get('set-cookie') || '', /; Secure/);
  const plain = await api(plainBase, '/api/auth/login', { method: 'POST', body: { email: 'seller-sec@example.com', password: 'Secret123' } });
  assert.equal(plain.status, 200);
  assert.doesNotMatch(plain.headers.get('set-cookie') || '', /; Secure/);
  assert.ok(cookieOf(plain), 'plain-HTTP login still returns a usable session cookie');
});

test('csrf: cross-origin cookie request rejected, same-origin allowed, no-origin allowed', async () => {
  const login = await api(plainBase, '/api/auth/login', { method: 'POST', body: { email: 'seller-sec@example.com', password: 'Secret123' } });
  const cookie = cookieOf(login);
  const valid = { title: 'CSRF Test Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' };
  const evil = await api(plainBase, '/api/properties', { method: 'POST', cookie, body: valid, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  assert.equal((await evil.json()).error.code, 'CSRF_FORBIDDEN');
  const evilRef = await api(plainBase, '/api/properties', { method: 'POST', cookie, body: valid, headers: { Referer: 'https://evil.example/page' } });
  assert.equal(evilRef.status, 403);
  const same = await api(plainBase, '/api/properties', { method: 'POST', cookie, body: valid, headers: { Origin: 'http://127.0.0.1:8963' } });
  assert.equal(same.status, 201);
  const noOrigin = await api(plainBase, '/api/properties', { method: 'POST', cookie, body: { ...valid, title: 'CSRF No-Origin Flat' } });
  assert.equal(noOrigin.status, 201);
});

test('write rate limit: register trips at 31st attempt per IP per hour', async () => {
  let lastStatus = 0;
  for (let i = 0; i < 31; i++) {
    const r = await api(rateBase, '/api/auth/register', { method: 'POST', body: { email: `rate${i}@example.com`, password: 'Secret123', full_name: 'Rate', role: 'Buyer' } });
    lastStatus = r.status;
    if (i < 30) assert.notEqual(r.status, 429, `attempt ${i + 1} should not be rate-limited`);
  }
  assert.equal(lastStatus, 429);
});

test('token logging gated: default mode 503s and logs no token; dev mode logs a usable token', async () => {
  const def = await api(defaultBase, '/api/auth/request-password-reset', { method: 'POST', body: { email: 'seller-sec@example.com' } });
  assert.equal(def.status, 503);
  await sleep(300);
  const defLog = logs.get(8965)();
  assert.doesNotMatch(defLog, /password reset for/);
  assert.doesNotMatch(defLog, /token=/);

  const dev = await api(devBase, '/api/auth/request-password-reset', { method: 'POST', body: { email: 'seller-sec@example.com' } });
  assert.equal(dev.status, 200);
  await sleep(300);
  const devLog = logs.get(8964)();
  const m = devLog.match(/token=([0-9a-f]{64})/);
  assert.ok(m, 'dev-mode log should contain the reset token');
  const reset = await api(devBase, '/api/auth/reset-password', { method: 'POST', body: { token: m[1], new_password: 'Newpass123' } });
  assert.equal(reset.status, 200);
  const login = await api(devBase, '/api/auth/login', { method: 'POST', body: { email: 'seller-sec@example.com', password: 'Newpass123' } });
  assert.equal(login.status, 200);
});
