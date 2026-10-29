import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadProperty, canViewProperty, canEditProperty } from './properties.js';
import { hasPermission } from './auth.js';

// Priority 1 binary upload (Phase E, scoped). One file per request.
// Safety rules, all enforced server-side:
//  - Only JPEG / PNG / WEBP / GIF / PDF, identified by file signature
//    (magic bytes), never by extension or by the client-declared MIME
//    alone; the declared MIME must match the signature.
//  - Max 10 MB per file. Larger, empty, or unsigned files are rejected.
//  - Storage filename is random (32 hex chars + validated extension);
//    the user-supplied name is stored only for display and is never
//    used as a filesystem path, so traversal and executable names
//    cannot occur. Files are never served as executable content:
//    images are served inline with their validated MIME, documents
//    as attachments, both through the controlled /api/uploads/:id
//    route with X-Content-Type-Options: nosniff.
//  - Storage must be OUTSIDE the static root: uploads are refused
//    with 500 if UPLOAD_DIR resolves inside STATIC_ROOT, because
//    anything under the static root could be fetched directly and
//    bypass the access checks below. Tests set UPLOAD_DIR to a tmp
//    directory; operators must do the same on a real host.
//  - Images become property_images rows pointing at /api/uploads/:id,
//    so the detail page shows them; they are public only when the
//    property is published. Documents are private: owner or
//    properties:view_any only, even on published listings.
//  - No malware scanner is available in this environment, so none is
//    claimed: signature + MIME + size + permission checks are the
//    controls. Do not add a scanner claim without a real scanner.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

function err(status, code, message) {
  return { status, error: { code, message } };
}

export function detectFileType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return { mime: 'image/gif', ext: 'gif' };
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

export function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const parts = [];
  let start = buffer.indexOf(boundary);
  while (start !== -1) {
    const after = start + boundary.length;
    if (buffer.slice(after, after + 2).toString() === '--') break;
    let headerEnd = buffer.indexOf('\r\n\r\n', after);
    if (headerEnd === -1) break;
    const headers = buffer.slice(after + 2, headerEnd).toString('utf8');
    const next = buffer.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;
    const body = buffer.slice(headerEnd + 4, next - 2); // strip trailing CRLF
    const disp = /Content-Disposition:\s*form-data;\s*(.*)/i.exec(headers);
    const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(headers);
    const attrs = {};
    if (disp) {
      for (const [, k, v] of disp[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[k] = v;
    }
    parts.push({ name: attrs.name || '', filename: attrs.filename, contentType: typeM ? typeM[1].trim() : '', data: body });
    start = next;
  }
  return parts;
}

function canDownload(db, user, prop, upload) {
  if (upload.kind === 'image' && prop.status === 'published') return true;
  if (!user) return false;
  return prop.owner_id === user.id || hasPermission(db, user, 'properties:view_any');
}

export function uploadFile(db, uploadDir, staticRoot, user, propertyIdText, rawBuffer, contentType) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = loadProperty(db, propertyIdText);
  if (!prop || !canViewProperty(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEditProperty(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot add files to this property');
  const dir = resolve(uploadDir);
  const root = resolve(staticRoot);
  if (dir === root || dir.startsWith(root + '/')) {
    return err(500, 'UPLOAD_DIR_UNSAFE', 'UPLOAD_DIR must be outside the static root; upload refused');
  }
  const parts = parseMultipart(rawBuffer, contentType);
  if (!parts) return err(400, 'INVALID_PARAMETER', 'Request must be multipart/form-data with a boundary');
  const files = parts.filter((p) => p.filename !== undefined);
  if (files.length !== 1) return err(400, 'INVALID_PARAMETER', 'Exactly one file per upload request');
  const file = files[0];
  const kindPart = parts.find((p) => p.name === 'kind');
  const kind = kindPart ? kindPart.data.toString('utf8').trim() : '';
  if (kind !== 'image' && kind !== 'document') return err(400, 'INVALID_PARAMETER', "kind must be 'image' or 'document'");
  if (file.data.length === 0) return err(400, 'INVALID_PARAMETER', 'Uploaded file is empty');
  if (file.data.length > MAX_FILE_BYTES) return err(413, 'FILE_TOO_LARGE', 'File must be at most 10 MB');
  const detected = detectFileType(file.data);
  if (!detected) return err(400, 'INVALID_PARAMETER', 'File type is not allowed (JPEG, PNG, WEBP, GIF or PDF only, by file signature)');
  const declared = (file.contentType || '').toLowerCase();
  if (declared !== detected.mime && !(detected.mime === 'image/jpeg' && declared === 'image/jpg')) {
    return err(400, 'INVALID_PARAMETER', 'Declared MIME type does not match the file contents');
  }
  const replacePart = parts.find((p) => p.name === 'replace_id');
  const replaceId = replacePart ? Number(replacePart.data.toString('utf8').trim()) : NaN;
  let sortOrder = 0;
  let replaced = null;
  if (Number.isInteger(replaceId) && replaceId > 0) {
    replaced = db.prepare('SELECT * FROM property_uploads WHERE id = ? AND property_id = ?').get(replaceId, prop.id);
    if (!replaced) return err(404, 'NOT_FOUND', 'File to replace not found');
    sortOrder = replaced.sort_order;
  } else {
    const max = db.prepare('SELECT MAX(sort_order) AS m FROM property_uploads WHERE property_id = ? AND kind = ?').get(prop.id, kind).m;
    sortOrder = max === null ? 0 : max + 1;
  }
  const filename = `${randomBytes(16).toString('hex')}.${detected.ext}`;
  const original = (file.filename || '').split(/[\\/]/).pop().slice(0, 200);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), file.data, { mode: 0o600 });
  } catch {
    return err(500, 'UPLOAD_FAILED', 'Could not store the uploaded file');
  }
  try {
    if (replaced) {
      try { unlinkSync(join(dir, replaced.filename)); } catch { /* already gone */ }
      db.prepare('DELETE FROM property_uploads WHERE id = ?').run(replaced.id);
      db.prepare('DELETE FROM property_images WHERE url = ?').run(`/api/uploads/${replaced.id}`);
    }
    const info = db.prepare(`INSERT INTO property_uploads
      (property_id, kind, filename, original_name, mime, size_bytes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(prop.id, kind, filename, original, detected.mime, file.data.length, sortOrder);
    const row = db.prepare('SELECT * FROM property_uploads WHERE id = ?').get(Number(info.lastInsertRowid));
    if (kind === 'image') {
      const altPart = parts.find((p) => p.name === 'alt_text');
      const alt = altPart ? altPart.data.toString('utf8').trim().slice(0, 200) : '';
      db.prepare('INSERT INTO property_images (property_id, url, alt_text, sort_order) VALUES (?, ?, ?, ?)')
        .run(prop.id, `/api/uploads/${row.id}`, alt, sortOrder);
    }
    const { filename: _f, ...publicRow } = row;
    return { status: 201, body: { ...publicRow, url: `/api/uploads/${row.id}` } };
  } catch {
    try { unlinkSync(join(dir, filename)); } catch { /* ignore */ }
    return err(500, 'UPLOAD_FAILED', 'Could not record the uploaded file');
  }
}

export function listUploads(db, user, propertyIdText) {
  const prop = loadProperty(db, propertyIdText);
  if (!prop || !canViewProperty(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const isOwnerOrStaff = user && (prop.owner_id === user.id || hasPermission(db, user, 'properties:view_any'));
  const rows = db.prepare(`SELECT id, property_id, kind, original_name, mime, size_bytes, sort_order, created_at
    FROM property_uploads WHERE property_id = ? ORDER BY kind, sort_order, id`).all(prop.id);
  const visible = rows.filter((r) => r.kind === 'image' || isOwnerOrStaff);
  return { status: 200, body: { data: visible.map((r) => ({ ...r, url: `/api/uploads/${r.id}` })) } };
}

export function reorderUpload(db, user, propertyIdText, uploadIdText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = loadProperty(db, propertyIdText);
  if (!prop || !canViewProperty(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEditProperty(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot reorder files of this property');
  const sortOrder = body && body.sort_order;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) return err(400, 'INVALID_PARAMETER', 'sort_order must be an integer 0-10000');
  const row = db.prepare('SELECT * FROM property_uploads WHERE id = ? AND property_id = ?').get(Number(uploadIdText), prop.id);
  if (!row) return err(404, 'NOT_FOUND', 'File not found');
  db.prepare('UPDATE property_uploads SET sort_order = ? WHERE id = ?').run(sortOrder, row.id);
  if (row.kind === 'image') db.prepare('UPDATE property_images SET sort_order = ? WHERE url = ?').run(sortOrder, `/api/uploads/${row.id}`);
  const { filename: _f, ...publicRow } = db.prepare('SELECT * FROM property_uploads WHERE id = ?').get(row.id);
  return { status: 200, body: { ...publicRow, url: `/api/uploads/${row.id}` } };
}

export function deleteUpload(db, uploadDir, user, propertyIdText, uploadIdText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = loadProperty(db, propertyIdText);
  if (!prop || !canViewProperty(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEditProperty(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot delete files of this property');
  const row = db.prepare('SELECT * FROM property_uploads WHERE id = ? AND property_id = ?').get(Number(uploadIdText), prop.id);
  if (!row) return err(404, 'NOT_FOUND', 'File not found');
  try { unlinkSync(join(resolve(uploadDir), row.filename)); } catch { /* already gone */ }
  db.prepare('DELETE FROM property_uploads WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM property_images WHERE url = ?').run(`/api/uploads/${row.id}`);
  return { status: 200, body: { ok: true } };
}

export function downloadUpload(db, uploadDir, user, uploadIdText) {
  const row = db.prepare('SELECT * FROM property_uploads WHERE id = ?').get(Number(uploadIdText));
  if (!row) return err(404, 'NOT_FOUND', 'File not found');
  const prop = loadProperty(db, row.property_id);
  if (!prop || prop.deleted_at) return err(404, 'NOT_FOUND', 'File not found');
  if (!canDownload(db, user, prop, row)) return err(404, 'NOT_FOUND', 'File not found');
  const filePath = join(resolve(uploadDir), row.filename);
  if (!existsSync(filePath)) return err(404, 'NOT_FOUND', 'File not found');
  return { status: 200, file: filePath, mime: row.mime, kind: row.kind, id: row.id, ext: row.filename.split('.').pop() };
}

export { loadProperty, canViewProperty };
