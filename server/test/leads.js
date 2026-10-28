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
const tmp = mkdtempSync(join(tmpdir(), 'pp-stage-g-'));
const dbPath = join(tmp, 'leads.db');
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

async function register(email, role = 'Owner') {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'Secret123', full_name: 'T', role } });
  return { cookie: cookieOf(r), body: await r.json() };
}

async function adminCookie() {
  const r = await api('/api/auth/login', { method: 'POST', body: { email: 'adming@example.com', password: 'Secret123' } });
  return cookieOf(r);
}

async function publishedProperty(ownerCookie, over = {}) {
  const c = await (await api('/api/properties', {
    method: 'POST', cookie: ownerCookie,
    body: { title: 'Lead House', property_type: 'House', listing_type: 'sale', price_inr: 9000000, city: 'Pune', ...over },
  })).json();
  await api(`/api/properties/${c.id}/publish`, { method: 'POST', cookie: await adminCookie() });
  return c;
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8935', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8935';
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

test('public inquiry capture, validation, and duplicate flagging', async () => {
  const owner = await register('leadown@example.com');
  const prop = await publishedProperty(owner.cookie);
  const ok = await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Rahul', phone: '+91 98765 43210', email: 'rahul@example.com', message: 'Interested' },
  });
  assert.equal(ok.status, 201);
  const first = await ok.json();
  assert.equal(first.status, 'new');
  assert.equal(first.duplicate_of, null);
  const dup = await api('/api/inquiries', {
    method: 'POST',
    body: { property_id: prop.id, full_name: 'Rahul Again', phone: '9876543210', message: 'Again' },
  });
  assert.equal(dup.status, 201);
  const second = await dup.json();
  assert.equal(second.duplicate_of, first.id);
  assert.equal(second.is_duplicate, true);
  const badPhone = await api('/api/inquiries', {
    method: 'POST', body: { property_id: prop.id, full_name: 'X', phone: '123', message: 'hi' },
  });
  assert.equal(badPhone.status, 400);
  const ghost = await api('/api/inquiries', {
    method: 'POST', body: { property_id: 999999, full_name: 'X', phone: '9876543210' },
  });
  assert.equal(ghost.status, 404);
});

test('lead visibility: owner sees own, stranger sees none, admin sees all', async () => {
  const owner = await register('visown@example.com');
  const stranger = await register('visstr@example.com', 'Buyer');
  const prop = await publishedProperty(owner.cookie);
  await api('/api/inquiries', { method: 'POST', body: { property_id: prop.id, full_name: 'Lead One', phone: '9876543210' } });
  const mine = await (await api('/api/leads', { cookie: owner.cookie })).json();
  assert.ok(mine.data.some((l) => l.full_name === 'Lead One'));
  const theirs = await (await api('/api/leads', { cookie: stranger.cookie })).json();
  assert.ok(!theirs.data.some((l) => l.full_name === 'Lead One'));
  const all = await (await api('/api/leads', { cookie: await adminCookie() })).json();
  assert.ok(all.data.some((l) => l.full_name === 'Lead One'));
  const strangerGet = await api(`/api/leads/${mine.data.find((l) => l.full_name === 'Lead One').id}`, { cookie: stranger.cookie });
  assert.equal(strangerGet.status, 404);
});

test('pipeline transitions enforced, terminal states locked, activity logged', async () => {
  const owner = await register('pipeown@example.com');
  const prop = await publishedProperty(owner.cookie);
  const lead = await (await api('/api/inquiries', { method: 'POST', body: { property_id: prop.id, full_name: 'Pipe', phone: '9876543210' } })).json();
  const bad = await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'closed' } });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_TRANSITION');
  const good = await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'contacted' } });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).status, 'contacted');
  const acts = await (await api(`/api/leads/${lead.id}/activities`, { cookie: owner.cookie })).json();
  assert.ok(acts.data.some((a) => a.action === 'status_change'));
  // Walk to terminal and confirm it locks.
  for (const s of ['interested', 'site_visit', 'negotiation', 'closed']) {
    const r = await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: s } });
    assert.equal(r.status, 200);
  }
  const locked = await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'lost' } });
  assert.equal(locked.status, 400);
});

test('assignment needs permission, notifies assignee; notes and follow-ups work', async () => {
  const owner = await register('asgown@example.com');
  const agent = await register('asgagent@example.com', 'Agent');
  const buyer = await register('asgbuyer@example.com', 'Buyer');
  const prop = await publishedProperty(owner.cookie);
  const lead = await (await api('/api/inquiries', { method: 'POST', body: { property_id: prop.id, full_name: 'Asg', phone: '9876543210' } })).json();
  const denied = await api(`/api/leads/${lead.id}/assign`, { method: 'POST', cookie: buyer.cookie, body: { assigned_to: agent.body.user.id } });
  assert.equal(denied.status, 403);
  const assigned = await api(`/api/leads/${lead.id}/assign`, { method: 'POST', cookie: await adminCookie(), body: { assigned_to: agent.body.user.id } });
  assert.equal(assigned.status, 200);
  assert.equal((await assigned.json()).assigned_to, agent.body.user.id);
  const agentLeads = await (await api('/api/leads', { cookie: agent.cookie })).json();
  assert.ok(agentLeads.data.some((l) => l.id === lead.id));
  const notifs = await (await api('/api/notifications', { cookie: agent.cookie })).json();
  assert.ok(notifs.unread_count >= 1);
  assert.ok(notifs.data.some((n) => n.type === 'lead_assigned'));
  const note = await api(`/api/leads/${lead.id}/notes`, { method: 'POST', cookie: agent.cookie, body: { note: 'Called, interested' } });
  assert.equal(note.status, 201);
  const fu = await api(`/api/leads/${lead.id}/followups`, { method: 'POST', cookie: agent.cookie, body: { due_at: '2026-11-05T10:00:00Z', note: 'Site visit' } });
  assert.equal(fu.status, 201);
  const fid = (await fu.json()).id;
  const done = await api(`/api/leads/${lead.id}/followups/${fid}/done`, { method: 'PATCH', cookie: agent.cookie });
  assert.equal(done.status, 200);
  const list = await (await api(`/api/leads/${lead.id}/followups`, { cookie: agent.cookie })).json();
  assert.ok(list.data.find((f) => f.id === fid).done_at);
  const read = await api(`/api/notifications/${notifs.data[0].id}/read`, { method: 'POST', cookie: agent.cookie });
  assert.equal(read.status, 200);
});

test('CSV export: admin ok, buyer forbidden; notification read is owner-only', async () => {
  const admin = await adminCookie();
  const exp = await api('/api/leads/export', { cookie: admin });
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-type'), /text\/csv/);
  const csv = await exp.text();
  assert.ok(csv.startsWith('id,property_id,property_title,full_name,phone,email,message,status,assigned_to,source,duplicate_of,created_at'));
  const buyer = await register('expbuyer@example.com', 'Buyer');
  assert.equal((await api('/api/leads/export', { cookie: buyer.cookie })).status, 403);
  const owner = await register('expown@example.com');
  const prop = await publishedProperty(owner.cookie);
  await api('/api/inquiries', { method: 'POST', body: { property_id: prop.id, full_name: 'N', phone: '9876543210' } });
  const ownerNotifs = await (await api('/api/notifications', { cookie: owner.cookie })).json();
  assert.ok(ownerNotifs.data.length >= 1);
  const foreignRead = await api(`/api/notifications/${ownerNotifs.data[0].id}/read`, { method: 'POST', cookie: buyer.cookie });
  assert.equal(foreignRead.status, 404);
});
