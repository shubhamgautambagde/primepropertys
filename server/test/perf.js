import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-perf-'));
const dbPath = join(tmp, 'perf.db');
let proc;
let base;

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8939', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8939';
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

test('gzip: homepage compresses when accepted, identical when decoded', async () => {
  // Raw node:http, not fetch: fetch sends Accept-Encoding: gzip by
  // default and transparently decompresses, which hides exactly the
  // headers this test must observe.
  const { get: httpGet } = await import('node:http');
  const rawGet = (path, headers) => new Promise((resolve, reject) => {
    httpGet(`${base}${path}`, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
  const plain = await rawGet('/', {});
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.ok(plain.body.length >= 1024);
  const gz = await rawGet('/', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.ok(gz.body.length < plain.body.length);
  assert.deepEqual(gunzipSync(gz.body), plain.body);
});

test('security headers present on static and API responses', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  const api = await fetch(`${base}/api/health`);
  assert.equal(api.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(api.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('migration 008 indexes exist', async () => {
  const db = new DatabaseSync(dbPath);
  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name));
  db.close();
  for (const idx of ['idx_properties_status', 'idx_inquiries_assigned', 'idx_inquiries_status', 'idx_inquiries_source', 'idx_lead_followups_due']) {
    assert.ok(names.has(idx), `missing index ${idx}`);
  }
});

test('no innerHTML assignment in shipped section/group JavaScript', () => {
  // Match actual assignments (el.innerHTML = ...) — a comment merely
  // mentioning the pattern must not fail the test.
  const dirs = [join(siteRoot, 'assets', 'js', 'groups'), join(siteRoot, 'assets', 'js', 'components')];
  const offenders = [];
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), 'utf-8');
      if (/\.innerHTML\s*\+?=/.test(text)) offenders.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(offenders, []);
});
