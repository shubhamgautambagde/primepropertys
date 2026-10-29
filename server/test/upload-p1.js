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
const tmp = mkdtempSync(join(tmpdir(), 'pp-upload-'));
const uploadDir = join(tmp, 'uploads');
const dbPath = join(tmp, 'upload.db');
const unsafeDb = join(tmp, 'unsafe.db');
let proc;
let unsafeProc;
let base;
let unsafeBase;
let seller;
let admin;
let stranger;
let propId;

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n%test\n1 0 obj\n<<>>\nendobj\n', 'utf8');

function cookieOf(res) {
  const set = res.headers.get('set-cookie');
  return set ? set.split(';')[0] : '';
}
async function api(b, path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${b}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function upload(b, propertyId, { kind, buf, type, name, cookie, extra = {} }) {
  const fd = new FormData();
  fd.append('kind', kind);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  fd.append('file', new Blob([buf], { type }), name);
  return fetch(`${b}/api/properties/${propertyId}/uploads`, {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : {},
    body: fd,
  });
}

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8970', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot, UPLOAD_DIR: uploadDir },
    stdio: 'ignore',
  });
  unsafeProc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8971', DATABASE_PATH: unsafeDb, STATIC_ROOT: siteRoot, UPLOAD_DIR: siteRoot },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8970';
  unsafeBase = 'http://127.0.0.1:8971';
  for (const b of [base, unsafeBase]) {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${b}/api/health`)).ok) break; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const unsafeDbConn = new DatabaseSync(unsafeDb);
  unsafeDbConn.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Unsafe Seller')`)
    .run('seller-unsafe@example.com', hashPassword('Secret123'));
  unsafeDbConn.close();
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Up Seller')`)
    .run('seller-up@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Up Admin')`)
    .run('admin-up@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Buyer', 'Up Stranger')`)
    .run('stranger-up@example.com', hashPassword('Secret123'));
  db.close();
  seller = cookieOf(await api(base, '/api/auth/login', { method: 'POST', body: { email: 'seller-up@example.com', password: 'Secret123' } }));
  admin = cookieOf(await api(base, '/api/auth/login', { method: 'POST', body: { email: 'admin-up@example.com', password: 'Secret123' } }));
  stranger = cookieOf(await api(base, '/api/auth/login', { method: 'POST', body: { email: 'stranger-up@example.com', password: 'Secret123' } }));
  const created = await api(base, '/api/properties', {
    method: 'POST', cookie: seller,
    body: { title: 'Upload Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 6000000, city: 'Nagpur' },
  });
  propId = (await created.json()).id;
  await api(base, `/api/properties/${propId}/publish`, { method: 'POST', cookie: admin });
});

after(() => {
  proc.kill();
  unsafeProc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('upload: valid image is stored, served publicly once published, and listed', async () => {
  const r = await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/png', name: 'evil.exe.png', cookie: seller });
  assert.equal(r.status, 201);
  const row = await r.json();
  assert.equal(row.kind, 'image');
  assert.equal(row.mime, 'image/png');
  assert.ok(!('filename' in row), 'server-side filename must not leak');
  assert.ok(row.url.startsWith('/api/uploads/'));
  const anon = await fetch(`${base}${row.url}`);
  assert.equal(anon.status, 200);
  assert.equal(anon.headers.get('content-type'), 'image/png');
  const list = await (await api(base, `/api/properties/${propId}/uploads`, { cookie: seller })).json();
  assert.ok(list.data.some((u) => u.id === row.id));
  // Detail API shows the uploaded image.
  const detail = await (await api(base, `/api/properties/${propId}`)).json();
  assert.ok(detail.images.some((im) => im.url === row.url));
});

test('upload: invalid, MIME-mismatched, oversized and unauthorised files are rejected', async () => {
  const text = await upload(base, propId, { kind: 'image', buf: Buffer.from('hello, not an image'), type: 'text/plain', name: 'x.txt', cookie: seller });
  assert.equal(text.status, 400);
  const mismatch = await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/jpeg', name: 'x.jpg', cookie: seller });
  assert.equal(mismatch.status, 400);
  const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024, 0)]);
  const oversized = await upload(base, propId, { kind: 'image', buf: big, type: 'image/png', name: 'big.png', cookie: seller });
  assert.equal(oversized.status, 413);
  const exe = await upload(base, propId, { kind: 'image', buf: Buffer.from('MZ' + 'x'.repeat(100)), type: 'application/octet-stream', name: 'evil.exe', cookie: seller });
  assert.equal(exe.status, 400);
  const strangerUpload = await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/png', name: 's.png', cookie: stranger });
  assert.equal(strangerUpload.status, 403);
  const anonUpload = await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/png', name: 'a.png' });
  assert.equal(anonUpload.status, 401);
});

test('upload: documents stay private even on a published listing; reorder, replace, delete work', async () => {
  const doc = await upload(base, propId, { kind: 'document', buf: PDF, type: 'application/pdf', name: 'deed.pdf', cookie: seller });
  assert.equal(doc.status, 201);
  const docRow = await doc.json();
  assert.equal((await fetch(`${base}${docRow.url}`)).status, 404, 'anonymous must not fetch a private document');
  assert.equal((await fetch(`${base}${docRow.url}`, { headers: { Cookie: stranger } })).status, 404, 'stranger must not fetch a private document');
  const ownerDoc = await fetch(`${base}${docRow.url}`, { headers: { Cookie: seller } });
  assert.equal(ownerDoc.status, 200);
  assert.equal(ownerDoc.headers.get('content-type'), 'application/pdf');

  const img1 = await (await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/png', name: 'one.png', cookie: seller })).json();
  const img2 = await (await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/png', name: 'two.png', cookie: seller })).json();
  const reordered = await api(base, `/api/properties/${propId}/uploads/${img1.id}`, { method: 'PATCH', cookie: seller, body: { sort_order: 99 } });
  assert.equal(reordered.status, 200);
  assert.equal((await reordered.json()).sort_order, 99);
  const replaced = await upload(base, propId, { kind: 'image', buf: PNG, type: 'image/png', name: 'new.png', cookie: seller, extra: { replace_id: String(img2.id) } });
  assert.equal(replaced.status, 201);
  assert.equal((await fetch(`${base}/api/uploads/${img2.id}`)).status, 404, 'replaced file must be gone');
  const deleted = await api(base, `/api/properties/${propId}/uploads/${img1.id}`, { method: 'DELETE', cookie: seller });
  assert.equal(deleted.status, 200);
  assert.equal((await fetch(`${base}/api/uploads/${img1.id}`)).status, 404);
});

test('upload: UPLOAD_DIR inside the static root is refused; server tree is not served statically', async () => {
  const unsafeSeller = cookieOf(await api(unsafeBase, '/api/auth/login', { method: 'POST', body: { email: 'seller-unsafe@example.com', password: 'Secret123' } }));
  const created = await api(unsafeBase, '/api/properties', {
    method: 'POST', cookie: unsafeSeller,
    body: { title: 'Unsafe Flat', property_type: 'Apartment', listing_type: 'sale', price_inr: 1000000, city: 'Nagpur' },
  });
  const unsafeProp = (await created.json()).id;
  const r = await upload(unsafeBase, unsafeProp, { kind: 'image', buf: PNG, type: 'image/png', name: 'x.png', cookie: unsafeSeller });
  assert.equal(r.status, 500);
  assert.equal((await r.json()).error.code, 'UPLOAD_DIR_UNSAFE');
  const staticServer = await fetch(`${base}/server/src/server.js`);
  assert.equal(staticServer.status, 404);
});
