import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-perf4-'));
const dbPath = join(tmp, 'perf4.db');
let proc;
let base;

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8976', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8976';
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('Priority 4: API responses are no-store, static non-HTML assets are public-cached, HTML is not', async () => {
  const api = await fetch(`${base}/api/health`);
  assert.equal(api.headers.get('cache-control'), 'no-store');
  const css = await fetch(`${base}/assets/css/base.css`);
  assert.equal(css.headers.get('cache-control'), 'public, max-age=3600');
  const html = await fetch(`${base}/`);
  assert.ok(!html.headers.get('cache-control')?.includes('public'), 'HTML must not get a public cache header');
});

test('Priority 4: migration 028 index exists and the newest list plan avoids a temp b-tree', () => {
  const db = new DatabaseSync(dbPath);
  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name));
  assert.ok(names.has('idx_properties_newest'), 'idx_properties_newest missing');
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM properties WHERE status = 'published' AND deleted_at IS NULL ORDER BY id DESC LIMIT 20 OFFSET 0").all();
  const detail = plan.map((r) => r.detail).join(' | ');
  assert.ok(detail.includes('idx_properties_newest'), `newest plan does not use the new index: ${detail}`);
  assert.ok(!detail.includes('TEMP B-TREE'), `newest plan still sorts in a temp b-tree: ${detail}`);
  db.close();
});

test('Priority 4 accessibility: form messages announce, nav toggle exposes state, tables scroll on mobile', () => {
  const forms = readFileSync(join(siteRoot, 'assets', 'js', 'forms.js'), 'utf-8');
  assert.match(forms, /setAttribute\('role', isError \? 'alert' : 'status'\)/);
  assert.match(forms, /#B91C1C/);
  assert.match(forms, /#166534/);
  const nav = readFileSync(join(siteRoot, 'assets', 'js', 'navigation.js'), 'utf-8');
  assert.match(nav, /aria-expanded/);
  assert.match(nav, /aria-controls/);
  const css = readFileSync(join(siteRoot, 'assets', 'css', 'responsive.css'), 'utf-8');
  assert.match(css, /\.tbl\{display:block;overflow-x:auto/);
});

test('Priority 4 performance: article images are lazy-loaded (fixed 150px height, so no layout shift)', () => {
  let lazy = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'tools' || e.name === 'server') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) {
        const t = readFileSync(p, 'utf-8');
        lazy += (t.match(/article-img[^>]*loading="lazy"/g) || []).length;
      }
    }
  };
  walk(siteRoot);
  assert.ok(lazy >= 140, `expected >=140 lazy article images, got ${lazy}`);
});
