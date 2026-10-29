import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasPermission } from './auth.js';

// Phase E: binary image/document uploads. Validation is by magic
// bytes, never by the client-supplied MIME type or extension alone:
// an .exe renamed to .png fails the sniff and is rejected. SVG is
// never allowed (it can carry script). Documents are PDF only in
// this version; other document types need their own sniffers.
// Files live under UPLOAD_DIR (default server/data/uploads), which
// the static handler refuses to serve (see handleStatic); only the
// gated /api/uploads/:id/file route serves them.

const here = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(here, '..', 'data', 'uploads');
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 50 * 1024 * 1024;

const TYPES = {
  'image/jpeg': { ext: 'jpg', kind: 'image', max: MAX_IMAGE_BYTES },
  'image/png': { ext: 'png', kind: 'image', max: MAX_IMAGE_BYTES },
  'image/webp': { ext: 'webp', kind: 'image', max: MAX_IMAGE_BYTES },
  'image/gif': { ext: 'gif', kind: 'image', max: MAX_IMAGE_BYTES },
  'application/pdf': { ext: 'pdf', kind: 'document', max: MAX_DOCUMENT_BYTES },
};
const EXT_TO_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

function err(status, code, message) {
  return { status, error: { code, message } };
}

function ensureDir() {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Magic-byte sniffing. Returns the detected MIME type or null.
export function sniff(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

// Minimal multipart/form-data parser (single request, Buffer-safe).
// Returns { fields, files } or throws Error('MALFORMED').
export function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!m) throw new Error('MALFORMED');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const fields = {};
  const files = [];
  let pos = buffer.indexOf(boundary);
  if (pos < 0) throw new Error('MALFORMED');
  pos += boundary.length;
  while (pos < buffer.length) {
    if (buffer.subarray(pos, pos + 2).toString('ascii') === '--') break;
    if (buffer.subarray(pos, pos + 2).toString('ascii') === '\r\n') pos += 2;
    const headerEnd = buffer.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) throw new Error('MALFORMED');
    const headers = buffer.subarray(pos, headerEnd).toString('utf8');
    let bodyStart = headerEnd + 4;
    let next = buffer.indexOf(boundary, bodyStart);
    if (next < 0) throw new Error('MALFORMED');
    let bodyEnd = next;
    if (buffer.subarray(bodyEnd - 2, bodyEnd).toString('ascii') === '\r\n') bodyEnd -= 2;
    const disp = /Content-Disposition:\s*form-data;\s*name="([^"]*)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
    if (!disp) throw new Error('MALFORMED');
    const data = buffer.subarray(bodyStart, bodyEnd);
    if (disp[2] !== undefined) files.push({ field: disp[1], filename: disp[2], data: Buffer.from(data) });
    else fields[disp[1]] = data.toString('utf8');
    pos = next + boundary.length;
  }
  return { fields, files };
}

function loadProperty(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id) || null;
}

function canView(db, user, prop) {
  if (prop.status === 'published') return true;
  if (!user) return false;
  return prop.owner_id === user.id || hasPermission(db, user, 'properties:view_any');
}

function canEdit(db, user, prop) {
  if (!user) return false;
  if (prop.owner_id === user.id && hasPermission(db, user, 'properties:edit_own')) return true;
  return hasPermission(db, user, 'properties:edit_any');
}

function canManageUpload(db, user, row, prop) {
  if (!user) return false;
  if (row.uploader_id === user.id) return true;
  if (prop && canEdit(db, user, prop)) return true;
  return hasPermission(db, user, 'properties:edit_any');
}

function publicRow(row) {
  return {
    id: row.id,
    property_id: row.property_id,
    kind: row.kind,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    is_private: row.is_private,
    sort_order: row.sort_order,
    created_at: row.created_at,
    file_url: '/api/uploads/' + row.id + '/file',
  };
}

export function uploadPropertyFile(db, user, idText, rawBuffer, contentType) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = loadProperty(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  if (!canEdit(db, user, prop)) return err(403, 'FORBIDDEN', 'You cannot add files to this property');
  let parts;
  try {
    parts = parseMultipart(rawBuffer, contentType);
  } catch {
    return err(400, 'INVALID_UPLOAD', 'Request body must be multipart/form-data with a file part');
  }
  const file = parts.files.find((f) => f.field === 'file');
  if (!file || !file.data.length) return err(400, 'INVALID_UPLOAD', 'A file is required');
  const kind = (parts.fields.kind || 'image').trim();
  if (kind !== 'image' && kind !== 'document') return err(400, 'INVALID_PARAMETER', 'kind must be image or document');
  const original = (file.filename || 'upload').split(/[\\/]/).pop() || 'upload';
  const ext = original.includes('.') ? original.split('.').pop().toLowerCase() : '';
  const sniffed = sniff(file.data);
  if (!sniffed) return err(415, 'UNSUPPORTED_FILE', 'File type not recognized — only JPEG, PNG, WebP, GIF images and PDF documents are accepted');
  const spec = TYPES[sniffed];
  if (spec.kind !== kind) return err(415, 'UNSUPPORTED_FILE', 'File type does not match the requested kind');
  if (EXT_TO_MIME[ext] !== sniffed) return err(415, 'UNSUPPORTED_FILE', 'File extension does not match the file contents');
  if (file.data.length > spec.max) return err(413, 'FILE_TOO_LARGE', 'File exceeds the ' + Math.round(spec.max / 1024 / 1024) + ' MB limit for ' + kind + 's');
  let replaces = null;
  if (parts.fields.replaces_id) {
    const rid = Number(parts.fields.replaces_id);
    replaces = Number.isInteger(rid) ? db.prepare('SELECT * FROM uploads WHERE id = ? AND property_id = ?').get(rid, prop.id) : null;
    if (!replaces) return err(400, 'INVALID_PARAMETER', 'replaces_id does not name an upload of this property');
    if (!canManageUpload(db, user, replaces, prop)) return err(403, 'FORBIDDEN', 'You cannot replace this file');
  }
  ensureDir();
  const stored = randomBytes(16).toString('hex') + '.' + spec.ext;
  try {
    writeFileSync(join(UPLOAD_DIR, stored), file.data);
  } catch {
    return err(500, 'STORAGE_ERROR', 'File could not be stored');
  }
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM uploads WHERE property_id = ?').get(prop.id).m;
  const info = db.prepare(`INSERT INTO uploads
    (uploader_id, property_id, kind, original_filename, stored_filename, mime_type, size_bytes, is_private, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    user.id, prop.id, kind, original, stored, sniffed, file.data.length,
    kind === 'document' ? 1 : 0, max === null ? 0 : max + 1);
  if (replaces) {
    try { unlinkSync(join(UPLOAD_DIR, replaces.stored_filename)); } catch { /* already gone */ }
    db.prepare('DELETE FROM uploads WHERE id = ?').run(replaces.id);
  }
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(Number(info.lastInsertRowid));
  return { status: 201, body: publicRow(row) };
}

export function listPropertyUploads(db, user, idText) {
  const prop = loadProperty(db, idText);
  if (!prop || !canView(db, user, prop)) return err(404, 'NOT_FOUND', 'Property not found');
  const privileged = user && (prop.owner_id === user.id || canEdit(db, user, prop));
  const rows = db.prepare('SELECT * FROM uploads WHERE property_id = ? ORDER BY sort_order, id').all(prop.id);
  const visible = rows.filter((r) => privileged || (r.kind === 'image' && prop.status === 'published'));
  return { status: 200, body: { data: visible.map(publicRow) } };
}

export function serveUpload(db, user, idText) {
  const id = Number(idText);
  const row = Number.isInteger(id) && id > 0 ? db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) : null;
  if (!row) return err(404, 'NOT_FOUND', 'File not found');
  const prop = row.property_id ? loadProperty(db, row.property_id) : null;
  const privileged = user && (row.uploader_id === user.id || (prop && canEdit(db, user, prop)));
  if (row.kind === 'document') {
    if (!privileged) return err(404, 'NOT_FOUND', 'File not found');
  } else if (prop && prop.status !== 'published' && !privileged) {
    return err(404, 'NOT_FOUND', 'File not found');
  }
  const path = join(UPLOAD_DIR, row.stored_filename);
  if (!existsSync(path)) return err(500, 'FILE_MISSING', 'Stored file is missing');
  return { status: 200, file: { path, mime: row.mime_type, kind: row.kind, original: row.original_filename, data: readFileSync(path) } };
}

export function deleteUpload(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  const row = Number.isInteger(id) && id > 0 ? db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) : null;
  if (!row) return err(404, 'NOT_FOUND', 'File not found');
  const prop = row.property_id ? loadProperty(db, row.property_id) : null;
  if (!canManageUpload(db, user, row, prop)) return err(403, 'FORBIDDEN', 'You cannot delete this file');
  try { unlinkSync(join(UPLOAD_DIR, row.stored_filename)); } catch { /* already gone */ }
  db.prepare('DELETE FROM uploads WHERE id = ?').run(row.id);
  return { status: 200, body: { ok: true } };
}

export function updateUpload(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  const row = Number.isInteger(id) && id > 0 ? db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) : null;
  if (!row) return err(404, 'NOT_FOUND', 'File not found');
  const prop = row.property_id ? loadProperty(db, row.property_id) : null;
  if (!canManageUpload(db, user, row, prop)) return err(403, 'FORBIDDEN', 'You cannot change this file');
  const order = Number(body.sort_order);
  if (!Number.isInteger(order) || order < 0 || order > 10000) return err(400, 'INVALID_PARAMETER', 'sort_order must be an integer 0-10000');
  db.prepare('UPDATE uploads SET sort_order = ? WHERE id = ?').run(order, row.id);
  return { status: 200, body: publicRow(db.prepare('SELECT * FROM uploads WHERE id = ?').get(row.id)) };
}
