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
const tmp = mkdtempSync(join(tmpdir(), 'pp-camp-'));
const dbPath = join(tmp, 'camp.db');
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
    env: { ...process.env, PORT: '8955', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8955';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Camp Admin')`)
    .run('admincamp@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('campaigns: create draft -> status flow -> edit; templates; queued messages', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'admincamp@example.com', password: 'Secret123' } }));
  await api('/api/auth/register', { method: 'POST', body: { email: 'buyercamp@example.com', password: 'Secret123', full_name: 'Camp Buyer', role: 'Buyer' } });
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'buyercamp@example.com', password: 'Secret123' } }));

  // Campaigns are staff-only: a buyer gets 403 on list and create.
  assert.equal((await api('/api/campaigns', { cookie: buyer })).status, 403);
  assert.equal((await api('/api/campaigns', { method: 'POST', cookie: buyer, body: { name: 'X' } })).status, 403);
  // Bad channel and negative budget are refused.
  assert.equal((await api('/api/campaigns', { method: 'POST', cookie: admin, body: { name: 'X', channels: 'TV' } })).status, 400);
  assert.equal((await api('/api/campaigns', { method: 'POST', cookie: admin, body: { name: 'X', total_budget_rupees: -5 } })).status, 400);
  const created = await api('/api/campaigns', { method: 'POST', cookie: admin, body: {
    name: 'Luxury Homes Campaign', objective: 'Generate Leads', type: 'Property Promotion',
    description: 'Premium 3 & 4 BHK', daily_budget_rupees: 2500, total_budget_rupees: 75000,
    channels: 'Facebook + Instagram',
  } });
  assert.equal(created.status, 201);
  const camp = await created.json();
  assert.equal(camp.data.status, 'draft');
  assert.equal(camp.data.total_budget_paise, 7500000);

  // Illegal transition refused (draft cannot jump to completed).
  assert.equal((await api(`/api/campaigns/${camp.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'completed' } })).status, 400);
  const active = await api(`/api/campaigns/${camp.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'active' } });
  assert.equal(active.status, 200);
  assert.equal((await active.json()).data.status, 'active');
  const paused = await api(`/api/campaigns/${camp.data.id}`, { method: 'PATCH', cookie: admin, body: { status: 'paused' } });
  assert.equal((await paused.json()).data.status, 'paused');
  // Edit works alongside status moves.
  const edited = await api(`/api/campaigns/${camp.data.id}`, { method: 'PATCH', cookie: admin, body: { name: 'Luxury Homes Campaign v2' } });
  assert.equal((await edited.json()).data.name, 'Luxury Homes Campaign v2');
  // Status filter + detail.
  const filtered = await (await api('/api/campaigns?status=paused', { cookie: admin })).json();
  assert.equal(filtered.pagination.total, 1);
  const empty = await (await api('/api/campaigns?status=active', { cookie: admin })).json();
  assert.equal(empty.pagination.total, 0);

  // Templates: invalid channel refused; create + list by channel.
  assert.equal((await api('/api/message-templates', { method: 'POST', cookie: admin, body: { channel: 'pigeon', name: 'X' } })).status, 400);
  const tpl = await api('/api/message-templates', { method: 'POST', cookie: admin, body: {
    channel: 'sms', name: 'Site Visit Reminder', subject: '', body: 'Reminder: your site visit is tomorrow at 11:00 AM.',
  } });
  assert.equal(tpl.status, 201);
  const tplId = (await tpl.json()).data.id;
  const smsList = await (await api('/api/message-templates?channel=sms', { cookie: admin })).json();
  assert.equal(smsList.pagination.total, 1);
  const emailList = await (await api('/api/message-templates?channel=email', { cookie: admin })).json();
  assert.equal(emailList.pagination.total, 0);

  // Queued messages: no provider, so status stays queued; bad
  // template reference and missing recipient are refused.
  assert.equal((await api('/api/queued-messages', { method: 'POST', cookie: admin, body: { channel: 'sms', recipient: '9876543210', body: 'Hi', template_id: 99999 } })).status, 400);
  assert.equal((await api('/api/queued-messages', { method: 'POST', cookie: admin, body: { channel: 'sms', recipient: '', body: 'Hi' } })).status, 400);
  const queued = await api('/api/queued-messages', { method: 'POST', cookie: admin, body: {
    channel: 'sms', recipient: '9876543210', body: 'Reminder: your site visit is tomorrow at 11:00 AM.', template_id: tplId,
  } });
  assert.equal(queued.status, 201);
  assert.equal((await queued.json()).data.status, 'queued');
  const logs = await (await api('/api/queued-messages', { cookie: admin })).json();
  assert.equal(logs.pagination.total, 1);
  assert.equal(logs.data[0].template_id, tplId);
});
