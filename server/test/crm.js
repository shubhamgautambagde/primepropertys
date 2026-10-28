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
const tmp = mkdtempSync(join(tmpdir(), 'pp-crm-'));
const dbPath = join(tmp, 'crm.db');
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

async function register(email, role = 'Buyer') {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'Secret123', full_name: 'T', role } });
  return { cookie: cookieOf(r), body: await r.json() };
}

async function adminCookie() {
  const r = await api('/api/auth/login', { method: 'POST', body: { email: 'adming@example.com', password: 'Secret123' } });
  return cookieOf(r);
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8938', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8938';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('adming@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('users directory: gated on users:manage, never leaks password hashes', async () => {
  const buyer = await register('crmbuyer@example.com', 'Buyer');
  assert.equal((await api('/api/users')).status, 401);
  assert.equal((await api('/api/users', { cookie: buyer.cookie })).status, 403);
  const admin = await api('/api/users', { cookie: await adminCookie() });
  assert.equal(admin.status, 200);
  const body = await admin.json();
  assert.ok(body.data.some((u) => u.email === 'adming@example.com'));
  assert.ok(body.data.every((u) => !('password_hash' in u)));
});

test('followups endpoint: visibility-scoped, assign flow works', async () => {
  const owner = await register('crmown@example.com', 'Owner');
  const agent = await register('crmagent@example.com', 'Agent');
  const stranger = await register('crmstr@example.com', 'Buyer');
  const prop = await (await api('/api/properties', {
    method: 'POST', cookie: owner.cookie,
    body: { title: 'CRM House', property_type: 'House', listing_type: 'sale', price_inr: 7000000, city: 'Pune' },
  })).json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: await adminCookie() });
  const lead = await (await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'CRM Lead', phone: '9876543210' },
  })).json();
  const fu = await api(`/api/leads/${lead.id}/followups`, {
    method: 'POST', cookie: owner.cookie,
    body: { due_at: '2030-01-02T10:00', note: 'Call back' },
  });
  assert.equal(fu.status, 201);

  assert.equal((await api('/api/followups')).status, 401);
  const own = await (await api('/api/followups', { cookie: owner.cookie })).json();
  assert.equal(own.data.length, 1);
  assert.equal(own.data[0].lead_name, 'CRM Lead');
  const str = await (await api('/api/followups', { cookie: stranger.cookie })).json();
  assert.equal(str.data.length, 0);
  const adm = await (await api('/api/followups', { cookie: await adminCookie() })).json();
  assert.equal(adm.data.length, 1);

  // Admin assigns the lead to the agent; the agent then sees the follow-up.
  const assigned = await api(`/api/leads/${lead.id}/assign`, {
    method: 'POST', cookie: await adminCookie(), body: { assigned_to: agent.body.user.id },
  });
  assert.equal(assigned.status, 200);
  const ag = await (await api('/api/followups', { cookie: agent.cookie })).json();
  assert.equal(ag.data.length, 1);
});

test('leads stats: scoped totals, funnel sums to total, anonymous blocked', async () => {
  const owner = await register('statown@example.com', 'Owner');
  const stranger = await register('statstr@example.com', 'Buyer');
  const prop = await (await api('/api/properties', {
    method: 'POST', cookie: owner.cookie,
    body: { title: 'Stats House', property_type: 'House', listing_type: 'sale', price_inr: 6000000, city: 'Nagpur' },
  })).json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: await adminCookie() });
  await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Stats Lead', phone: '9876543210' },
  });

  assert.equal((await api('/api/leads/stats')).status, 401);
  const own = await (await api('/api/leads/stats', { cookie: owner.cookie })).json();
  assert.equal(own.total, 1);
  assert.equal(own.by_status.new, 1);
  const str = await (await api('/api/leads/stats', { cookie: stranger.cookie })).json();
  assert.equal(str.total, 0);
  const adm = await (await api('/api/leads/stats', { cookie: await adminCookie() })).json();
  assert.ok(adm.total >= 1);
  assert.equal(adm.funnel.reduce((sum, f) => sum + f.count, 0), adm.total);
  assert.ok(adm.by_property.some((p) => p.property_title === 'Stats House'));
});

test('lead tags: add/list/dedupe/remove, visibility-scoped', async () => {
  const owner = await register('tagown@example.com', 'Owner');
  const stranger = await register('tagstr@example.com', 'Buyer');
  const prop = await (await api('/api/properties', {
    method: 'POST', cookie: owner.cookie,
    body: { title: 'Tag House', property_type: 'House', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' },
  })).json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: await adminCookie() });
  const lead = await (await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Tag Lead', phone: '9876543210' },
  })).json();

  assert.equal((await api(`/api/leads/${lead.id}/tags`)).status, 401);
  assert.equal((await api(`/api/leads/${lead.id}/tags`, { cookie: stranger.cookie })).status, 404);
  const added = await api(`/api/leads/${lead.id}/tags`, {
    method: 'POST', cookie: owner.cookie, body: { name: 'Hot Lead' },
  });
  assert.equal(added.status, 201);
  // Case-insensitive duplicate reuses the tag and stays a single link.
  const dup = await api(`/api/leads/${lead.id}/tags`, {
    method: 'POST', cookie: owner.cookie, body: { name: 'hot lead' },
  });
  assert.equal(dup.status, 200);
  assert.equal((await dup.json()).id, (await added.json()).id);
  const list = await (await api(`/api/leads/${lead.id}/tags`, { cookie: owner.cookie })).json();
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].name, 'Hot Lead');
  const all = await (await api('/api/tags', { cookie: owner.cookie })).json();
  assert.ok(all.data.some((t) => t.name === 'Hot Lead'));
  assert.equal((await api(`/api/leads/${lead.id}/tags`, {
    method: 'POST', cookie: owner.cookie, body: { name: '' },
  })).status, 400);
  const removed = await api(`/api/leads/${lead.id}/tags/${list.data[0].id}`, {
    method: 'DELETE', cookie: owner.cookie,
  });
  assert.equal(removed.status, 200);
  assert.equal((await api(`/api/leads/${lead.id}/tags/${list.data[0].id}`, {
    method: 'DELETE', cookie: owner.cookie,
  })).status, 404);
  const after = await (await api(`/api/leads/${lead.id}/tags`, { cookie: owner.cookie })).json();
  assert.equal(after.data.length, 0);
});

test('lead scores: stage + notes + completed follow-ups, visibility-scoped', async () => {
  const owner = await register('scoreown@example.com', 'Owner');
  const stranger = await register('scorestr@example.com', 'Buyer');
  const prop = await (await api('/api/properties', {
    method: 'POST', cookie: owner.cookie,
    body: { title: 'Score House', property_type: 'House', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' },
  })).json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: await adminCookie() });
  const lead = await (await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Score Lead', phone: '9876543210' },
  })).json();

  assert.equal((await api('/api/leads/scores')).status, 401);
  const fresh = await (await api('/api/leads/scores', { cookie: owner.cookie })).json();
  assert.equal(fresh.data.length, 1);
  assert.equal(fresh.data[0].score, 10);
  assert.equal(fresh.data[0].band, 'Cool');
  const str = await (await api('/api/leads/scores', { cookie: stranger.cookie })).json();
  assert.equal(str.data.length, 0);

  await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'contacted' } });
  await api(`/api/leads/${lead.id}/notes`, { method: 'POST', cookie: owner.cookie, body: { note: 'Called once' } });
  const fu = await (await api(`/api/leads/${lead.id}/followups`, {
    method: 'POST', cookie: owner.cookie, body: { due_at: '2030-01-02T10:00', note: 'Follow up' },
  })).json();
  await api(`/api/leads/${lead.id}/followups/${fu.id}/done`, { method: 'PATCH', cookie: owner.cookie });
  const after = await (await api('/api/leads/scores', { cookie: owner.cookie })).json();
  assert.equal(after.data[0].score, 35); // contacted 25 + note 5 + done follow-up 5
  assert.equal(after.data[0].band, 'Cool');
});

test('lead SLA: 1h first response, 24h follow-up, breach and closed states', async () => {
  const owner = await register('slaown@example.com', 'Owner');
  const prop = await (await api('/api/properties', {
    method: 'POST', cookie: owner.cookie,
    body: { title: 'SLA House', property_type: 'House', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur' },
  })).json();
  await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: await adminCookie() });
  const lead = await (await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'SLA Lead', phone: '9876543210' },
  })).json();
  const lead2 = await (await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'SLA Late Lead', phone: '9876543211' },
  })).json();

  assert.equal((await api('/api/leads/sla')).status, 401);
  let rows = await (await api('/api/leads/sla', { cookie: owner.cookie })).json();
  let row = rows.data.find((l) => l.id === lead.id);
  assert.equal(row.sla_status, 'pending'); // no response yet, inside the 1h window
  assert.equal(row.first_response_hours, null);

  await api(`/api/leads/${lead.id}/notes`, { method: 'POST', cookie: owner.cookie, body: { note: 'First contact' } });
  await api(`/api/leads/${lead.id}/followups`, {
    method: 'POST', cookie: owner.cookie, body: { due_at: '2030-01-02T10:00', note: 'Next step' },
  });
  rows = await (await api('/api/leads/sla', { cookie: owner.cookie })).json();
  row = rows.data.find((l) => l.id === lead.id);
  assert.equal(row.sla_status, 'met');
  assert.ok(row.first_response_hours < 1);

  // Backdate the second lead: first response 3 days after creation = breach.
  const db = new DatabaseSync(dbPath);
  db.prepare(`UPDATE inquiries SET created_at = datetime('now', '-3 days') WHERE id = ?`).run(lead2.id);
  db.close();
  await api(`/api/leads/${lead2.id}/notes`, { method: 'POST', cookie: owner.cookie, body: { note: 'Late contact' } });
  rows = await (await api('/api/leads/sla', { cookie: owner.cookie })).json();
  row = rows.data.find((l) => l.id === lead2.id);
  assert.equal(row.sla_status, 'breached');
  assert.ok(row.first_response_hours >= 71);

  // Overdue follow-up also breaches.
  const fu = await (await api(`/api/leads/${lead.id}/followups`, {
    method: 'POST', cookie: owner.cookie, body: { due_at: '2020-01-01T10:00', note: 'Overdue one' },
  })).json();
  assert.ok(fu.id);
  rows = await (await api('/api/leads/sla', { cookie: owner.cookie })).json();
  row = rows.data.find((l) => l.id === lead.id);
  assert.equal(row.sla_status, 'breached');
  assert.equal(row.overdue_followups, 1);

  // Closed leads stop SLA tracking.
  for (const st of ['contacted', 'interested', 'site_visit', 'negotiation', 'closed']) {
    const r = await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: st } });
    assert.equal(r.status, 200);
  }
  rows = await (await api('/api/leads/sla', { cookie: owner.cookie })).json();
  row = rows.data.find((l) => l.id === lead.id);
  assert.equal(row.sla_status, 'closed');
});
