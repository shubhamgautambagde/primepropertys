import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-news-'));
const dbPath = join(tmp, 'news.db');
let proc;
let base;

async function api(path, { method = 'POST', body } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8951', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8951';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('newsletter: subscribe, duplicate, invalid, unsubscribe, resubscribe, persistence', async () => {
  assert.equal((await api('/api/newsletter/subscribe', { body: { email: 'not-an-email' } })).status, 400);
  assert.equal((await api('/api/newsletter/subscribe', { body: { email: '' } })).status, 400);
  const first = await api('/api/newsletter/subscribe', { body: { email: 'Reader@Example.com' } });
  assert.equal(first.status, 201);
  const dup = await api('/api/newsletter/subscribe', { body: { email: 'reader@example.com' } });
  assert.equal(dup.status, 200);
  assert.equal((await dup.json()).already_subscribed, true);
  // Unsubscribe is neutral: same response for a subscribed and an unknown address.
  const un1 = await api('/api/newsletter/unsubscribe', { body: { email: 'reader@example.com' } });
  assert.equal(un1.status, 200);
  const un2 = await api('/api/newsletter/unsubscribe', { body: { email: 'nobody@example.com' } });
  assert.equal(un2.status, 200);
  assert.equal((await un1.json()).message, (await un2.json()).message);
  // Resubscribing a previously unsubscribed address works.
  const re = await api('/api/newsletter/subscribe', { body: { email: 'reader@example.com' } });
  assert.equal(re.status, 200);
  assert.equal((await re.json()).resubscribed, true);
  // The record is really in the database with the resubscribed status.
  const db = new DatabaseSync(dbPath);
  const row = db.prepare('SELECT email, status FROM newsletter_subscriptions WHERE email = ?').get('reader@example.com');
  db.close();
  assert.equal(row.status, 'subscribed');
});
