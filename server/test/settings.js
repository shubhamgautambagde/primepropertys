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
const tmp = mkdtempSync(join(tmpdir(), 'pp-set-'));
const dbPath = join(tmp, 'set.db');
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
    env: { ...process.env, PORT: '8956', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8956';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Set Admin')`)
    .run('adminset@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('settings: seeded defaults, staff-only access, allowlist refuses secrets, email validation', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'adminset@example.com', password: 'Secret123' } }));
  await api('/api/auth/register', { method: 'POST', body: { email: 'buyerset@example.com', password: 'Secret123', full_name: 'Set Buyer', role: 'Buyer' } });
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'buyerset@example.com', password: 'Secret123' } }));

  // Staff-only: buyer gets 403 on read and write; anonymous gets 401.
  assert.equal((await api('/api/settings')).status, 401);
  assert.equal((await api('/api/settings', { cookie: buyer })).status, 403);
  assert.equal((await api('/api/settings', { method: 'PUT', cookie: buyer, body: { site_name: 'X' } })).status, 403);

  // Seeded from the pages' own displayed defaults.
  const initial = await (await api('/api/settings', { cookie: admin })).json();
  assert.equal(initial.data.settings.site_name, 'PrimePropertys');
  assert.equal(initial.data.settings.support_email, 'support@primepropertys.com');
  assert.equal(initial.data.settings.contact_number, '+91 98765 43210');
  assert.equal(initial.data.settings.default_country, 'India');
  assert.equal(initial.data.providers.email_backend, 'not-configured');

  // Secrets can never be stored: every secret-looking key is refused.
  for (const key of ['smtp_password', 'api_key', 'payment_secret', 'otp_secret', 'webhook_secret', 'sms_api_key']) {
    const r = await api('/api/settings', { method: 'PUT', cookie: admin, body: { [key]: 'hunter2' } });
    assert.equal(r.status, 400, key);
  }
  // Invalid email refused; valid update applies and persists.
  assert.equal((await api('/api/settings', { method: 'PUT', cookie: admin, body: { support_email: 'not-an-email' } })).status, 400);
  const updated = await api('/api/settings', { method: 'PUT', cookie: admin, body: { site_name: 'PrimePropertys HQ', support_email: 'hello@primepropertys.com' } });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).data.settings.site_name, 'PrimePropertys HQ');
  const reread = await (await api('/api/settings', { cookie: admin })).json();
  assert.equal(reread.data.settings.site_name, 'PrimePropertys HQ');
  assert.equal(reread.data.settings.support_email, 'hello@primepropertys.com');
  // Untouched keys keep their values.
  assert.equal(reread.data.settings.default_country, 'India');
});
