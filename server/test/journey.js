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
const tmp = mkdtempSync(join(tmpdir(), 'pp-journey-'));
const dbPath = join(tmp, 'journey.db');
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
    env: { ...process.env, PORT: '8940', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8940';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')`)
    .run('adminj@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('Stage J journey: publish -> enquire -> assign -> work -> report -> export', async () => {
  const adminLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'adminj@example.com', password: 'Secret123' } });
  assert.equal(adminLogin.status, 200);
  const admin = cookieOf(adminLogin);

  const reg = await api('/api/auth/register', { method: 'POST', body: { email: 'jbuyer@example.com', password: 'Secret123', full_name: 'Journey Buyer', role: 'Buyer' } });
  assert.equal(reg.status, 201);
  const regBody = await reg.json();
  const buyerId = regBody.user.id;
  const buyerLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'jbuyer@example.com', password: 'Secret123' } });
  const buyer = cookieOf(buyerLogin);

  // Draft is invisible to the public list (published-only rule).
  const created = await api('/api/properties', { method: 'POST', cookie: admin, body: { title: 'Journey 2BHK', property_type: 'Apartment', listing_type: 'sale', price_inr: 5500000, city: 'Nagpur', locality: 'Wardha Road', bedrooms: 2 } });
  assert.equal(created.status, 201);
  const prop = await created.json();
  assert.equal(prop.status, 'draft');
  const listBefore = await (await api('/api/properties?city=Nagpur')).json();
  assert.ok(!listBefore.data.some((p) => p.id === prop.id));

  // Publish -> visible.
  const pub = await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: admin });
  assert.equal(pub.status, 200);
  const listAfter = await (await api('/api/properties?city=Nagpur')).json();
  assert.ok(listAfter.data.some((p) => p.id === prop.id));

  // Buyer enquires -> lead in 'new'.
  const inq = await api('/api/inquiries', { method: 'POST', cookie: buyer, body: { property_id: prop.id, full_name: 'Journey Buyer', phone: '9876543210', email: 'jbuyer@example.com', message: 'Interested, please call.' } });
  assert.equal(inq.status, 201);
  const lead = await inq.json();
  assert.equal(lead.status, 'new');
  assert.equal(lead.is_duplicate, false);

  // Admin works the lead through the enforced transition map.
  const leads = await (await api('/api/leads', { cookie: admin })).json();
  assert.ok(leads.data.some((l) => l.id === lead.id));
  const assigned = await api(`/api/leads/${lead.id}/assign`, { method: 'POST', cookie: admin, body: { assigned_to: buyerId } });
  assert.equal(assigned.status, 200);
  for (const status of ['contacted', 'interested']) {
    const r = await api(`/api/leads/${lead.id}`, { method: 'PATCH', cookie: admin, body: { status } });
    assert.equal(r.status, 200);
  }
  const note = await api(`/api/leads/${lead.id}/notes`, { method: 'POST', cookie: admin, body: { note: 'Called, wants a site visit next week.' } });
  assert.equal(note.status, 201);
  const fu = await api(`/api/leads/${lead.id}/followups`, { method: 'POST', cookie: admin, body: { due_at: new Date(Date.now() + 86400000).toISOString(), note: 'Site visit call' } });
  assert.equal(fu.status, 201);
  const fuBody = await fu.json();
  const done = await api(`/api/leads/${lead.id}/followups/${fuBody.id}/done`, { method: 'PATCH', cookie: admin });
  assert.equal(done.status, 200);
  const tag = await api(`/api/leads/${lead.id}/tags`, { method: 'POST', cookie: admin, body: { name: 'Hot' } });
  assert.equal(tag.status, 201);

  // Scoring / SLA / stats reflect the worked lead.
  const scores = await (await api('/api/leads/scores', { cookie: admin })).json();
  const mine = scores.data.find((s) => s.id === lead.id);
  assert.ok(mine, 'lead present in scores');
  assert.equal(mine.score, 60); // interested 50 + note 5 + completed follow-up 5
  assert.equal(mine.band, 'Warm');
  const sla = await (await api('/api/leads/sla', { cookie: admin })).json();
  assert.ok(sla.data.some((s) => s.id === lead.id));
  const stats = await (await api('/api/leads/stats', { cookie: admin })).json();
  assert.equal(stats.total, 1);
  assert.equal(stats.by_status.interested, 1);

  // Export, contact, saved, my-enquiries.
  const csv = await api('/api/leads/export', { cookie: admin });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Journey Buyer/);
  const contact = await api('/api/contact', { method: 'POST', body: { full_name: 'Journey Buyer', email: 'jbuyer@example.com', phone: '9876543210', subject: 'Buying a property', message: 'Hello, I need help.' } });
  assert.equal(contact.status, 201);
  const contacts = await (await api('/api/contact', { cookie: admin })).json();
  assert.equal(contacts.pagination.total, 1);
  const saved = await api(`/api/properties/${prop.id}/save`, { method: 'POST', cookie: buyer });
  assert.equal(saved.status, 201);
  const savedList = await (await api('/api/saved', { cookie: buyer })).json();
  assert.ok(savedList.data.some((p) => p.id === prop.id));
  const mine2 = await (await api('/api/inquiries/mine', { cookie: buyer })).json();
  assert.ok(mine2.data.some((q) => q.id === lead.id));

  // Static surface: homepage, sitemap, robots.
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /rel="canonical"/);
  const sm = await fetch(`${base}/sitemap.xml`);
  assert.equal(sm.status, 200);
  assert.match(await sm.text(), /<url>/);
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow/);
});
