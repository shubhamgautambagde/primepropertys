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
const tmp = mkdtempSync(join(tmpdir(), 'pp-portal-'));
const dbPath = join(tmp, 'portal.db');
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
    env: { ...process.env, PORT: '8949', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8949';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Portal Admin')`)
    .run('adminp@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('portal lists: assigned_to lead filter + properties/mine status filter', async () => {
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'adminp@example.com', password: 'Secret123' } }));
  const adminId = (await (await api('/api/auth/me', { cookie: admin })).json()).user.id;
  await api('/api/auth/register', { method: 'POST', body: { email: 'ownerp@example.com', password: 'Secret123', full_name: 'Portal Owner', role: 'Owner' } });
  await api('/api/auth/register', { method: 'POST', body: { email: 'agentp@example.com', password: 'Secret123', full_name: 'Portal Agent', role: 'Agent' } });
  await api('/api/auth/register', { method: 'POST', body: { email: 'buyerp@example.com', password: 'Secret123', full_name: 'Portal Buyer', role: 'Buyer' } });
  const owner = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'ownerp@example.com', password: 'Secret123' } }));
  const agent = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'agentp@example.com', password: 'Secret123' } }));
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'buyerp@example.com', password: 'Secret123' } }));
  const agentId = (await (await api('/api/auth/me', { cookie: agent })).json()).user.id;

  // Owner drafts one property, publishes another; buyer enquires on the published one.
  const draftRes = await api('/api/properties', { method: 'POST', cookie: owner, body: {
    title: 'Draft Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 5000000, city: 'Nagpur', locality: 'Wardha Road',
  } });
  assert.equal(draftRes.status, 201);
  const draft = await draftRes.json();
  const liveRes = await api('/api/properties', { method: 'POST', cookie: owner, body: {
    title: 'Live Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 6000000, city: 'Nagpur', locality: 'Wardha Road',
  } });
  assert.equal(liveRes.status, 201);
  const live = await liveRes.json();
  assert.equal((await api(`/api/properties/${live.id}/publish`, { method: 'POST', cookie: admin })).status, 200);
  assert.equal((await api('/api/inquiries', { method: 'POST', cookie: buyer, body: { property_id: live.id, full_name: 'Portal Buyer', phone: '9876543210', message: 'Interested' } })).status, 201);

  // properties/mine filters by status (owner's my-properties page).
  const mineAll = await (await api('/api/properties/mine', { cookie: owner })).json();
  assert.equal(mineAll.pagination.total, 2);
  const mineDraft = await (await api('/api/properties/mine?status=draft', { cookie: owner })).json();
  assert.equal(mineDraft.pagination.total, 1);
  assert.equal(mineDraft.data[0].id, draft.id);
  const minePub = await (await api('/api/properties/mine?status=published', { cookie: owner })).json();
  assert.equal(minePub.pagination.total, 1);
  assert.equal(minePub.data[0].id, live.id);

  // Admin assigns the enquiry's lead to the agent; the agent's
  // assigned_to filter returns it, and an unassigned filter does not.
  const leads = await (await api('/api/leads', { cookie: admin })).json();
  assert.equal(leads.pagination.total, 1);
  const leadId = leads.data[0].id;
  assert.equal((await api(`/api/leads/${leadId}/assign`, { method: 'POST', cookie: admin, body: { assigned_to: agentId } })).status, 200);
  const assigned = await (await api(`/api/leads?assigned_to=${agentId}`, { cookie: agent })).json();
  assert.equal(assigned.pagination.total, 1);
  assert.equal(assigned.data[0].id, leadId);
  const notAssigned = await (await api(`/api/leads?assigned_to=${adminId}`, { cookie: agent })).json();
  assert.equal(notAssigned.pagination.total, 0);
});
