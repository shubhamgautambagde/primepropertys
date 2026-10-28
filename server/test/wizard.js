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
const tmp = mkdtempSync(join(tmpdir(), 'pp-wiz-'));
const dbPath = join(tmp, 'wiz.db');
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
    env: { ...process.env, PORT: '8958', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8958';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Wiz Seller')`)
    .run('sellerwiz@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Wiz Admin')`)
    .run('adminwiz@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('wizard: create with wizard fields, PATCH steps accumulate, draft stays draft, admin publishes', async () => {
  const seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'sellerwiz@example.com', password: 'Secret123' } }));
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'adminwiz@example.com', password: 'Secret123' } }));

  // Create: the description-step payload carries every earlier step.
  const created = await api('/api/properties', {
    method: 'POST', cookie: seller,
    body: {
      title: '3 BHK Wizard Apartment', description: 'Wizard journey listing',
      property_type: 'Apartment', listing_type: 'sale', price_inr: 12500000,
      city: 'Hyderabad', locality: 'Hitech City', area_sqft: 1600, bedrooms: 3, bathrooms: 2,
      facing: 'East', furnishing_status: 'Furnished', possession_status: 'Ready to Move',
      floor_number: 5, total_floors: 12, balconies: 2, is_corner: 1, has_lift: 1,
      super_builtup_area_sqft: 1750, carpet_area_sqft: 1250, price_per_sqft_inr: 7812,
      price_negotiable: 'Slightly Negotiable', ownership: 'Freehold', transaction_type: 'Resale',
      amenities: ['Swimming Pool', 'Lift', 'Power Backup'],
      pincode: '500081', project_name: 'Lodha Eternis',
    },
  });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(draft.status, 'draft');
  assert.equal(draft.facing, 'East');
  assert.equal(draft.amenities, JSON.stringify(['Swimming Pool', 'Lift', 'Power Backup']));

  // Later steps PATCH the same draft and accumulate.
  const patched = await api(`/api/properties/${draft.id}`, {
    method: 'PATCH', cookie: seller,
    body: { video_url: 'https://example.com/v.mp4', tour_360_url: 'https://example.com/360',
      owner_name: 'Wiz Seller', owner_phone: '9876543210', contact_whatsapp: 1, contact_time: '10 AM – 7 PM' },
  });
  assert.equal(patched.status, 200);
  const afterPatch = await patched.json();
  assert.equal(afterPatch.video_url, 'https://example.com/v.mp4');
  assert.equal(afterPatch.facing, 'East', 'earlier step values survive later PATCHes');
  assert.equal(afterPatch.contact_whatsapp, 1);

  // Drafts list shows it; the seller cannot publish (admin-only).
  const mine = await (await api('/api/properties/mine?status=draft', { cookie: seller })).json();
  assert.ok(mine.data.some((p) => p.id === draft.id));
  assert.equal((await api(`/api/properties/${draft.id}/publish`, { method: 'POST', cookie: seller })).status, 403);
  const published = await api(`/api/properties/${draft.id}/publish`, { method: 'POST', cookie: admin });
  assert.equal(published.status, 200);
  assert.equal((await published.json()).status, 'published');

  // Validation: bad flag, bad amenities, bad email are refused, not stored.
  assert.equal((await api(`/api/properties/${draft.id}`, { method: 'PATCH', cookie: admin, body: { is_corner: 2 } })).status, 400);
  assert.equal((await api(`/api/properties/${draft.id}`, { method: 'PATCH', cookie: admin, body: { amenities: 'not-an-array' } })).status, 400);
  assert.equal((await api(`/api/properties/${draft.id}`, { method: 'PATCH', cookie: admin, body: { owner_email: 'nope' } })).status, 400);
  const reread = await (await api(`/api/properties/${draft.id}`, { cookie: admin })).json();
  assert.equal(reread.is_corner, 1, 'rejected PATCHes changed nothing');
});
