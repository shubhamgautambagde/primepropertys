import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../src/auth.js';
import { sniff } from '../src/uploads.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, '..', 'src', 'server.js');
const siteRoot = join(here, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'pp-up-'));
const dbPath = join(tmp, 'up.db');
const uploadDir = join(tmp, 'uploads');
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

function multipart(fields, file) {
  const boundary = '----pp-test-' + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(file.data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(propId, fields, file, cookie) {
  const mp = multipart(fields, file);
  return fetch(`${base}/api/properties/${propId}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': mp.contentType, ...(cookie ? { Cookie: cookie } : {}) },
    body: mp.body,
  });
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 0)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100, 0)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0)]);

before(async () => {
  proc = spawn('node', [serverEntry], {
    env: { ...process.env, PORT: '8954', DATABASE_PATH: dbPath, STATIC_ROOT: siteRoot, UPLOAD_DIR: uploadDir },
    stdio: 'ignore',
  });
  base = 'http://127.0.0.1:8954';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Seller', 'Up Seller')`)
    .run('sellerup@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Admin', 'Up Admin')`)
    .run('adminup@example.com', hashPassword('Secret123'));
  db.prepare(`INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'Buyer', 'Up Buyer')`)
    .run('buyerup@example.com', hashPassword('Secret123'));
  db.close();
});

after(() => {
  proc.kill();
  rmSync(tmp, { recursive: true, force: true });
});

test('uploads: static handler never serves the server tree or .db files', async () => {
  assert.equal((await fetch(`${base}/server/src/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/server/data/primepropertys.db`)).status, 404);
  assert.equal((await fetch(`${base}/anything.db`)).status, 404);
});

test('uploads: sniffing rejects executables by content, not by name', () => {
  assert.equal(sniff(EXE), null);
  assert.equal(sniff(PNG), 'image/png');
  assert.equal(sniff(PDF), 'application/pdf');
});

test('uploads: image happy path, publish visibility, detail integration, delete, reorder, replace', async () => {
  const seller = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'sellerup@example.com', password: 'Secret123' } }));
  const admin = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'adminup@example.com', password: 'Secret123' } }));
  const buyer = cookieOf(await api('/api/auth/login', { method: 'POST', body: { email: 'buyerup@example.com', password: 'Secret123' } }));

  const created = await api('/api/properties', { method: 'POST', cookie: seller, body: {
    title: 'Upload Test House', property_type: 'House', listing_type: 'sale',
    price_inr: 5000000, city: 'Nagpur', bedrooms: 2,
  } });
  assert.equal(created.status, 201);
  const prop = await created.json();

  // Anonymous upload -> 401; non-owner upload -> 403 (property is a
  // draft the stranger cannot see? draft -> 404 for strangers; use
  // the published state for the 403 check below).
  assert.equal((await upload(prop.id, {}, { filename: 'a.png', data: PNG })).status, 401);
  assert.equal((await upload(prop.id, {}, { filename: 'a.png', data: PNG }, buyer)).status, 404);

  // Invalid content: exe bytes named .png, png bytes named .exe, empty file.
  assert.equal((await upload(prop.id, {}, { filename: 'evil.png', data: EXE }, seller)).status, 415);
  assert.equal((await upload(prop.id, {}, { filename: 'evil.exe', data: PNG }, seller)).status, 415);
  assert.equal((await upload(prop.id, {}, { filename: 'empty.png', data: Buffer.alloc(0) }, seller)).status, 400);

  // Oversized image (> 10 MB).
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(11 * 1024 * 1024, 0)]);
  assert.equal((await upload(prop.id, {}, { filename: 'big.png', data: big }, seller)).status, 413);

  // Happy path: image on the draft, then a private document.
  const imgRes = await upload(prop.id, { kind: 'image' }, { filename: 'front.png', data: PNG }, seller);
  assert.equal(imgRes.status, 201);
  const img = await imgRes.json();
  assert.equal(img.mime_type, 'image/png');
  assert.equal(img.is_private, 0);
  assert.ok(img.file_url.startsWith('/api/uploads/'));

  const docRes = await upload(prop.id, { kind: 'document' }, { filename: 'deed.pdf', data: PDF }, seller);
  assert.equal(docRes.status, 201);
  const doc = await docRes.json();
  assert.equal(doc.is_private, 1);

  // Draft images are not public yet.
  assert.equal((await fetch(`${base}${img.file_url}`)).status, 404);
  // Private document: stranger gets 404 even after publish; owner gets it.
  assert.equal((await api(`/api/properties/${prop.id}/publish`, { method: 'POST', cookie: admin })).status, 200);
  const pubImg = await fetch(`${base}${img.file_url}`);
  assert.equal(pubImg.status, 200);
  assert.equal(pubImg.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await pubImg.arrayBuffer()).length, PNG.length);
  assert.equal((await fetch(`${base}${doc.file_url}`, { headers: { Cookie: buyer } })).status, 404);
  const ownDoc = await fetch(`${base}${doc.file_url}`, { headers: { Cookie: seller } });
  assert.equal(ownDoc.status, 200);
  assert.ok((ownDoc.headers.get('content-disposition') || '').startsWith('attachment'));

  // Non-owner upload to a published property -> 403 (visible, not editable).
  assert.equal((await upload(prop.id, {}, { filename: 'x.png', data: PNG }, buyer)).status, 403);

  // Lists: stranger sees images only; owner sees documents too.
  const strangerList = await (await api(`/api/properties/${prop.id}/uploads`, { cookie: buyer })).json();
  assert.equal(strangerList.data.length, 1);
  const ownerList = await (await api(`/api/properties/${prop.id}/uploads`, { cookie: seller })).json();
  assert.equal(ownerList.data.length, 2);

  // Detail response carries the uploaded image URL.
  const detail = await (await api(`/api/properties/${prop.id}`)).json();
  assert.ok(detail.images.some((i) => i.url === img.file_url));

  // Reorder: push the image after the document (both started at
  // 0/1, so moving the document to 0 would tie with the image).
  assert.equal((await api(`/api/uploads/${img.id}`, { method: 'PATCH', cookie: seller, body: { sort_order: 5 } })).status, 200);
  const reordered = await (await api(`/api/properties/${prop.id}/uploads`, { cookie: seller })).json();
  assert.equal(reordered.data[0].id, doc.id);
  const repRes = await upload(prop.id, { kind: 'image', replaces_id: String(img.id) }, { filename: 'front2.png', data: PNG }, seller);
  assert.equal(repRes.status, 201);
  const rep = await repRes.json();
  assert.equal((await fetch(`${base}${img.file_url}`)).status, 404);
  const afterReplace = await (await api(`/api/properties/${prop.id}/uploads`, { cookie: seller })).json();
  assert.ok(afterReplace.data.some((u) => u.id === rep.id));
  assert.ok(!afterReplace.data.some((u) => u.id === img.id));

  // Delete the document: file + row gone.
  assert.equal((await api(`/api/uploads/${doc.id}`, { method: 'DELETE', cookie: seller })).status, 200);
  assert.equal((await fetch(`${base}${doc.file_url}`, { headers: { Cookie: seller } })).status, 404);
});
