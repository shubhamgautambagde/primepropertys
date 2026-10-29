import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../src/auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-p3-'));
const dbPath = join(tmp, 'p3.db');
let proc;
let base;
let stub;
let stubPort;

function cookieOf(res) {
  const set = res.headers.get('set-cookie');
  return set ? set.split(';')[0] : '';
}
async function api(path, { method = 'GET', body, cookie, baseUrl = base } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function register(email, role) {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'Secret123', full_name: 'Test ' + role, role } });
  const body = await r.json();
  return { cookie: cookieOf(r), user: body.user, status: r.status };
}
async function login(email, password, baseUrl) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password }, baseUrl });
  return { cookie: cookieOf(r), body: await r.json(), status: r.status };
}
function db() { return new DatabaseSync(dbPath); }
async function waitHealthy(url) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server at ${url} did not become healthy`);
}

before(async () => {
  // Local stub provider: proves the provider abstraction actually calls
  // a chat-completions endpoint and records its reported usage. It is
  // a test double, never a real paid provider and never a production key.
  stub = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const parsed = JSON.parse(raw);
      assert.equal(req.headers.authorization, 'Bearer test-key');
      assert.ok(parsed.model);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: 'Stub-generated listing copy for the test property.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }));
    });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  stubPort = stub.address().port;
  proc = spawn('node', [serverEntry], {
    env: {
      ...process.env, PORT: '8974', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot,
      AI_PROVIDER: 'test-stub', AI_API_KEY: 'test-key', AI_MODEL: 'test-model',
      AI_BASE_URL: `http://127.0.0.1:${stubPort}`,
    },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8974';
  await waitHealthy(base);
  const d = db();
  d.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run('admin3@example.com', hashPassword('Admin1234'), 'Admin', 'Super Admin');
  d.close();
});

after(() => {
  proc.kill();
  stub.close();
  rmSync(tmp, { recursive: true, force: true });
});

let adminCookie;
let seller;
let buyer;
let propId;

test('setup: admin login + seller property published', async () => {
  const l = await login('admin3@example.com', 'Admin1234');
  assert.equal(l.status, 200);
  adminCookie = l.cookie;
  assert.ok(l.body.permissions.includes('ai:use'));
  assert.ok(l.body.permissions.includes('analytics:view'));
  assert.ok(l.body.permissions.includes('seo:manage'));
  seller = await register('seller3@example.com', 'Seller');
  buyer = await register('buyer3@example.com', 'Buyer');
  const create = await api('/api/properties', { method: 'POST', cookie: seller.cookie,
    body: { title: 'Nagpur Test Apartment', description: 'A spacious apartment with two bedrooms and a balcony in Nagpur for testing.', property_type: 'Apartment', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur', locality: 'Katol Road', area_sqft: 1200, bedrooms: 2, bathrooms: 2 } });
  assert.equal(create.status, 201);
  propId = (await create.json()).id;
  const pub = await api(`/api/properties/${propId}/publish`, { method: 'POST', cookie: adminCookie });
  assert.equal(pub.status, 200);
  assert.equal((await pub.json()).status, 'published');
});

test('AI: unconfigured server answers 503 AI_NOT_CONFIGURED, never fake text', async () => {
  const tmpDb = join(tmp, 'plain.db');
  const plain = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8975', DATABASE_PATH: tmpDb, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  try {
    await waitHealthy('http://127.0.0.1:8975');
    // The plain server has its own database, so the main server's
    // session cookie cannot authenticate there: register on it instead.
    const reg = await api('/api/auth/register', { method: 'POST', baseUrl: 'http://127.0.0.1:8975', body: { email: 'plain@example.com', password: 'Secret123', full_name: 'Plain', role: 'Buyer' } });
    assert.equal(reg.status, 201);
    const plainCookie = cookieOf(reg);
    const r = await api('/api/ai/generate', { method: 'POST', cookie: plainCookie, baseUrl: 'http://127.0.0.1:8975', body: { kind: 'title', facts: 'A flat in Nagpur' } });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.code, 'AI_NOT_CONFIGURED');
  } finally { plain.kill(); }
});

test('AI: generate via stub provider, approve, apply; unapproved apply refused', async () => {
  const anon = await api('/api/ai/generate', { method: 'POST', body: { kind: 'title', facts: 'x' } });
  assert.equal(anon.status, 401);
  const noFacts = await api('/api/ai/generate', { method: 'POST', cookie: seller.cookie, body: { kind: 'title' } });
  assert.equal(noFacts.status, 400);
  const gen = await api('/api/ai/generate', { method: 'POST', cookie: seller.cookie,
    body: { kind: 'title', property_id: propId } });
  assert.equal(gen.status, 201);
  const row = await gen.json();
  assert.equal(row.status, 'generated');
  assert.equal(row.provider, 'test-stub');
  assert.equal(row.tokens_in, 10);
  assert.equal(row.tokens_out, 20);
  assert.match(row.output_text, /Stub-generated/);
  const early = await api(`/api/ai/generations/${row.id}/apply`, { method: 'POST', cookie: seller.cookie });
  assert.equal(early.status, 400);
  const review = await api(`/api/ai/generations/${row.id}/review`, { method: 'POST', cookie: seller.cookie, body: { approve: true } });
  assert.equal((await review.json()).status, 'approved');
  const applied = await api(`/api/ai/generations/${row.id}/apply`, { method: 'POST', cookie: seller.cookie });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).title, 'Stub-generated listing copy for the test property.');
  const again = await api(`/api/ai/generations/${row.id}/apply`, { method: 'POST', cookie: seller.cookie });
  assert.equal(again.status, 400);
});

test('AI quality check is rule-based and reports stored facts only', async () => {
  const r = await api(`/api/properties/${propId}/quality-check`, { cookie: buyer.cookie });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.method, 'rule_based');
  assert.ok(body.total > 0);
  assert.ok(body.checks.some((c) => c.name === 'title_present' && c.pass));
});

test('price history: only real changes recorded, with actor', async () => {
  const patch = await api(`/api/properties/${propId}`, { method: 'PATCH', cookie: seller.cookie, body: { price_inr: 5500000 } });
  assert.equal(patch.status, 200);
  const same = await api(`/api/properties/${propId}`, { method: 'PATCH', cookie: seller.cookie, body: { price_inr: 5500000 } });
  assert.equal(same.status, 200);
  // The price edit reverted the listing to draft (see republish below),
  // so history must be fetched as the owner, not anonymously.
  const hist = await api(`/api/properties/${propId}/price-history`, { cookie: seller.cookie });
  assert.equal(hist.status, 200);
  const body = await hist.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].old_price_inr, 5000000);
  assert.equal(body.data[0].new_price_inr, 5500000);
  assert.equal(body.data[0].actor_name, 'Test Seller');
  assert.equal(body.current_price_inr, 5500000);
  // The seller's price edit correctly reverted the listing to draft
  // (non-publisher edits need re-approval); re-publish for later tests.
  const repub = await api(`/api/properties/${propId}/publish`, { method: 'POST', cookie: adminCookie });
  assert.equal(repub.status, 200);
});

test('analytics: real view/search events counted, buyer forbidden, CSV works', async () => {
  const view = await api(`/api/properties/${propId}`);
  assert.equal(view.status, 200);
  const search = await api('/api/properties?city=Nagpur');
  assert.equal(search.status, 200);
  const forbidden = await api('/api/analytics/summary', { cookie: buyer.cookie });
  assert.equal(forbidden.status, 403);
  const summary = await api('/api/analytics/summary', { cookie: adminCookie });
  assert.equal(summary.status, 200);
  const body = await summary.json();
  assert.ok(body.property_views.events >= 1);
  assert.ok(body.searches.events >= 1);
  assert.ok(body.formulas.conversion_closed_rate !== undefined);
  assert.ok(body.revenue.note.includes('verified'));
  const csv = await api('/api/analytics/export', { cookie: adminCookie });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /property_view_events/);
  const badRange = await api('/api/analytics/summary?from=2026-13-01', { cookie: adminCookie });
  assert.equal(badRange.status, 400);
});

test('saved searches: match is server-filtered, publish triggers in-app alert only', async () => {
  const saved = await api('/api/saved-searches', { method: 'POST', cookie: buyer.cookie,
    body: { name: 'Nagpur flats', filters: { city: 'Nagpur', property_type: 'Apartment' } } });
  assert.equal(saved.status, 201);
  const savedId = (await saved.json()).id;
  const bad = await api('/api/saved-searches', { method: 'POST', cookie: buyer.cookie,
    body: { filters: { city: 'Nagpur', bogus: 1 } } });
  assert.equal(bad.status, 400);
  const match = await api(`/api/saved-searches/${savedId}/match`, { cookie: buyer.cookie });
  assert.equal(match.status, 200);
  assert.ok((await match.json()).pagination.total >= 1);
  // A second matching property published now must alert the buyer.
  const create = await api('/api/properties', { method: 'POST', cookie: seller.cookie,
    body: { title: 'Second Nagpur Apartment', description: 'Another Nagpur apartment for alert testing with enough description text.', property_type: 'Apartment', listing_type: 'sale', price_inr: 6000000, city: 'Nagpur', locality: 'Dharampeth', area_sqft: 1100, bedrooms: 2 } });
  const secondId = (await create.json()).id;
  const pub = await api(`/api/properties/${secondId}/publish`, { method: 'POST', cookie: adminCookie });
  assert.equal(pub.status, 200);
  const alerts = await api('/api/search-alerts', { cookie: buyer.cookie });
  assert.equal(alerts.status, 200);
  const alertBody = await alerts.json();
  assert.ok(alertBody.data.some((a) => a.property_id === secondId));
  // A non-matching city must not alert.
  const other = await api('/api/properties', { method: 'POST', cookie: seller.cookie,
    body: { title: 'Mumbai Apartment', description: 'A Mumbai apartment that must not match the Nagpur saved search.', property_type: 'Apartment', listing_type: 'sale', price_inr: 9000000, city: 'Mumbai', area_sqft: 900, bedrooms: 1 } });
  const otherId = (await other.json()).id;
  await api(`/api/properties/${otherId}/publish`, { method: 'POST', cookie: adminCookie });
  const alerts2 = await api('/api/search-alerts', { cookie: buyer.cookie });
  const alertBody2 = await alerts2.json();
  assert.ok(!alertBody2.data.some((a) => a.property_id === otherId));
});

test('recommendations: attribute matches only, paginated server-side', async () => {
  const r = await api(`/api/properties/${propId}/recommendations?limit=5`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.data.length >= 1);
  assert.ok(body.data.every((d) => d.match_attributes >= 1));
  assert.ok(!body.data.some((d) => d.id === propId));
  const bad = await api(`/api/properties/${propId}/recommendations?limit=99`);
  assert.equal(bad.status, 400);
});

test('reminders: tasks and visits computed from real rows, no delivery claimed', async () => {
  const task = await api('/api/tasks', { method: 'POST', cookie: adminCookie,
    body: { title: 'Overdue reminder task', assignee_id: buyer.user.id, due_date: '2020-01-01', priority: 'high' } });
  assert.equal(task.status, 201);
  const d = db();
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  d.prepare('INSERT INTO site_visits (property_id, user_id, scheduled_at, status) VALUES (?, ?, ?, ?)')
    .run(propId, buyer.user.id, tomorrow, 'requested');
  d.close();
  const rem = await api('/api/reminders', { cookie: buyer.cookie });
  assert.equal(rem.status, 200);
  const body = await rem.json();
  assert.match(body.note, /not configured/);
  assert.ok(body.tasks.data.some((t) => t.title === 'Overdue reminder task'));
  assert.ok(body.visits.data.some((v) => v.property_id === propId));
});

test('SEO: metadata, duplicates, redirect honoured, sitemap only published, link check real', async () => {
  const buyerMeta = await api('/api/seo/metadata', { method: 'POST', cookie: buyer.cookie, body: { path: '/x', title: 'X' } });
  assert.equal(buyerMeta.status, 403);
  const m1 = await api('/api/seo/metadata', { method: 'POST', cookie: adminCookie, body: { path: '/dup-a', title: 'Same Title', description: 'D' } });
  assert.equal(m1.status, 200);
  const m2 = await api('/api/seo/metadata', { method: 'POST', cookie: adminCookie, body: { path: '/dup-b', title: 'Same Title', description: 'E' } });
  assert.equal(m2.status, 200);
  const dup = await api('/api/seo/duplicates', { cookie: adminCookie });
  assert.ok((await dup.json()).duplicate_titles.some((t) => t.title === 'Same Title'));
  const redir = await api('/api/seo/redirects', { method: 'POST', cookie: adminCookie, body: { from_path: '/old-p3', to_path: '/about.html', status_code: 301 } });
  assert.equal(redir.status, 201);
  const hit = await fetch(`${base}/old-p3`, { redirect: 'manual' });
  assert.equal(hit.status, 301);
  assert.equal(hit.headers.get('location'), '/about.html');
  const sitemap = await api('/api/seo/sitemap');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /application\/xml/);
  const xml = await sitemap.text();
  assert.ok(xml.includes(`property_id=${propId}`));
  // Draft properties must never appear in the sitemap.
  const draft = await api('/api/properties', { method: 'POST', cookie: seller.cookie,
    body: { title: 'Draft Never Listed', description: 'Draft property for sitemap exclusion testing.', property_type: 'Plot', listing_type: 'sale', price_inr: 1000000, city: 'Nagpur' } });
  const draftId = (await draft.json()).id;
  const xml2 = await (await api('/api/seo/sitemap')).text();
  assert.ok(!xml2.includes(`property_id=${draftId}`));
  const check = await api('/api/seo/link-check', { method: 'POST', cookie: adminCookie, body: { path: '/about.html' } });
  assert.equal(check.status, 200);
  const checkBody = await check.json();
  assert.equal(typeof checkBody.checked_links, 'number');
  assert.ok(Array.isArray(checkBody.broken));
  const broken = await api('/api/seo/broken-links', { cookie: adminCookie });
  assert.equal(broken.status, 200);
});
