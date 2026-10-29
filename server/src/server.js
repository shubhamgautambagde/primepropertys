import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import {
  SELF_SERVICE_ROLES, SESSION_COOKIE, hashPassword, verifyPassword,
  isValidEmail, isStrongPassword, publicUser, createSession, getSessionUser,
  deleteSession, revokeOtherSessions, createPasswordResetToken,
  consumePasswordResetToken, createEmailVerificationToken, verifyEmailToken,
  listPermissions, listUsers, hasPermission, parseCookies, sessionCookieHeader,
  clearSessionCookieHeader, isLoginBlocked, recordFailedLogin, clearFailedLogins,
  writeRateLimited, recordWriteAttempt,
} from './auth.js';
import * as P from './properties.js';
import * as L from './leads.js';
import * as C from './contact.js';
import * as N from './newsletter.js';
import * as V from './visits.js';
import * as T from './tickets.js';
import * as S from './services.js';
import * as PAY from './payments.js';
import * as CAMP from './campaigns.js';
import * as SET from './settings.js';
import * as U from './uploads.js';
import * as B from './builder.js';
import * as REV from './reviews.js';
import * as TASK from './tasks.js';
import * as RBAC from './rbac.js';
import * as SUB from './subscriptions.js';
import * as CHAT from './chat.js';
import * as AI from './ai.js';
import * as P3 from './priority3.js';
import { readFileSync as readUploadFile, readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(process.env.STATIC_ROOT || join(here, '..', '..'));
const DB_PATH = process.env.DATABASE_PATH || join(here, '..', 'data', 'primepropertys.db');
const PORT = Number(process.env.PORT || 8902);
const EMAIL_BACKEND = process.env.EMAIL_BACKEND || 'console';
/* Priority 1 upload storage: outside the static root by default
   (a sibling directory), so uploaded files can only be fetched
   through the controlled /api/uploads/:id route. Set UPLOAD_DIR
   explicitly on a real host. */
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(dirname(STATIC_ROOT), 'primepropertys-uploads');
/* Priority 1: console-email is dev-only. Tokens are printed to the
   server log ONLY when EMAIL_BACKEND=console AND an explicit dev
   flag is set (NODE_ENV=development or PP_DEV_CONSOLE_EMAIL=1).
   In every other mode the reset/verification handlers answer 503
   EMAIL_NOT_CONFIGURED and issue no token to any log. */
const DEV_CONSOLE_EMAIL = EMAIL_BACKEND === 'console' &&
  (process.env.NODE_ENV === 'development' || process.env.PP_DEV_CONSOLE_EMAIL === '1');

/* Priority 1: a session cookie is Secure when this request arrived
   over TLS, when the trusted proxy says so (X-Forwarded-Proto),
   or when SESSION_COOKIE_SECURE=1 / FORCE_HTTPS=1 is set. Plain-HTTP
   local development keeps working (no Secure flag). */
function sessionSecureFor(req) {
  return Boolean(req && (req.socket?.encrypted ||
    req.headers?.['x-forwarded-proto'] === 'https' ||
    process.env.SESSION_COOKIE_SECURE === '1' || process.env.FORCE_HTTPS === '1'));
}

/* Priority 1 CSRF: strict Origin/Referer check for cookie-authenticated
   state-changing requests. Same-origin browsers always send Origin
   (fetch) or Referer on POST/PATCH/PUT/DELETE, so legitimate users are
   unaffected. Requests with neither header (curl, server-to-server,
   the existing test clients) are allowed: this check is a browser
   CSRF defence, not an API-key scheme. GET is excluded on purpose:
   the email-verification link is a GET clicked from an inbox. */
function csrfBlocked(req) {
  const host = (req.headers.host || '').toLowerCase();
  const origin = req.headers.origin;
  if (origin) {
    try { return new URL(origin).host.toLowerCase() !== host; } catch { return true; }
  }
  const referer = req.headers.referer;
  if (referer) {
    try { return new URL(referer).host.toLowerCase() !== host; } catch { return true; }
  }
  return false;
}

/* Priority 1 write rate limits (in-memory, single-instance only).
   Routes with their own limiter (login, inquiries, contact,
   newsletter subscribe) keep that limiter and skip this one. */
function writeLimitFor(req, user, body) {
  const path = new URL(req.url, 'http://localhost').pathname;
  const ip = req.socket.remoteAddress || '';
  const group = path.split('/').slice(0, 3).join('/');
  if (path === '/api/auth/register') return { key: `register:${ip}`, max: 30 };
  if (path === '/api/auth/request-password-reset') {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return { key: `reset:${ip}:${email}`, max: 10 };
  }
  if (path === '/api/auth/request-verification') {
    return { key: user ? `verify:u${user.id}` : `verify:${ip}`, max: 30 };
  }
  if (path === '/api/newsletter/unsubscribe') return { key: `unsub:${ip}`, max: 30 };
  if (user) return { key: `write:u${user.id}:${group}`, max: 300 };
  return { key: `write:${ip}:${group}`, max: 300 };
}


const db = openDb(DB_PATH);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* Stage I (performance + security): response hardening + compression.
   Security headers go on every response. gzip applies to compressible
   text bodies >= 1 KB when the client accepts it (small bodies and
   images are left alone: gzipping them gains nothing or grows them).
   CSP allows the inline scripts/styles the pages genuinely use
   ('unsafe-inline' is required by the single-file build) and restricts
   everything else to same-origin plus Unsplash images; it does not
   replace the DOM-construction discipline for user data. */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://images.unsplash.com data:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

function acceptsGzip(req) {
  const h = (req && req.headers && req.headers['accept-encoding']) || '';
  return /(^|,)\s*gzip(\s|,|;|$)/.test(h);
}

function sendBody(res, req, status, contentType, body, extraHeaders) {
  const headers = { 'Content-Type': contentType, ...SECURITY_HEADERS, ...(extraHeaders || {}) };
  let out = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const compressible = /^(text\/|application\/(json|javascript)|image\/svg\+xml)/.test(contentType);
  if (compressible && out.length >= 1024 && acceptsGzip(req)) {
    out = gzipSync(out);
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  res.writeHead(status, headers);
  res.end(out);
}

function sendJson(res, status, obj, extraHeaders) {
  // The request object is stashed on the per-request response object by
  // the server handler below, so gzip negotiation needs no signature
  // changes across the 50+ sendJson/respond call sites.
  // Priority 4: API responses carry user-specific data, so they must
  // never sit in a shared cache. A caller-supplied Cache-Control wins.
  sendBody(res, res._ppReq, status, 'application/json; charset=utf-8', JSON.stringify(obj), { 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
}

function apiError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function parseIntParam(value, fallback, min, max) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readBodyBuffer(req, maxBytes) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function listProperties(url) {
  const q = url.searchParams;
  const limit = parseIntParam(q.get('limit'), 20, 1, 100);
  const offset = parseIntParam(q.get('offset'), 0, 0, 1_000_000);
  const minPrice = q.get('min_price') === null ? null : Number(q.get('min_price'));
  const maxPrice = q.get('max_price') === null ? null : Number(q.get('max_price'));
  if (limit === null || offset === null) return { status: 400, code: 'INVALID_PARAMETER', message: 'limit must be 1-100 and offset must be >= 0' };
  if ((minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0))) {
    return { status: 400, code: 'INVALID_PARAMETER', message: 'min_price/max_price must be numbers >= 0' };
  }
  // Stage D/E rule: the public list shows published listings only.
  const where = ['status = ?', 'deleted_at IS NULL'];
  const params = ['published'];
  if (q.get('city')) { where.push('city = ?'); params.push(q.get('city')); }
  if (q.get('locality')) { where.push('locality = ?'); params.push(q.get('locality')); }
  if (q.get('property_type')) { where.push('property_type = ?'); params.push(q.get('property_type')); }
  if (q.get('listing_type')) { where.push('listing_type = ?'); params.push(q.get('listing_type')); }
  if (minPrice !== null) { where.push('price_inr >= ?'); params.push(minPrice); }
  if (maxPrice !== null) { where.push('price_inr <= ?'); params.push(maxPrice); }
  /* Priority 1: server-side filters the frontend already sends
     (bedrooms, bedrooms_min, area_min, area_max, possession_status).
     Previously these were applied client-side over at most 100
     fetched rows, so pagination.total described the fetched subset,
     not the filtered set (BUG-009/BUG-028). Invalid values are 400,
     not silently ignored. */
  const bedrooms = parseIntParam(q.get('bedrooms'), null, 0, 50);
  const bedroomsMin = parseIntParam(q.get('bedrooms_min'), null, 0, 50);
  const areaMin = parseIntParam(q.get('area_min'), null, 0, 1000000);
  const areaMax = parseIntParam(q.get('area_max'), null, 0, 1000000);
  if ((q.get('bedrooms') !== null && bedrooms === null) ||
      (q.get('bedrooms_min') !== null && bedroomsMin === null) ||
      (q.get('area_min') !== null && areaMin === null) ||
      (q.get('area_max') !== null && areaMax === null)) {
    return { status: 400, code: 'INVALID_PARAMETER', message: 'bedrooms/bedrooms_min must be integers 0-50 and area_min/area_max integers 0-1000000' };
  }
  if (bedrooms !== null) { where.push('bedrooms = ?'); params.push(bedrooms); }
  if (bedroomsMin !== null) { where.push('bedrooms >= ?'); params.push(bedroomsMin); }
  if (areaMin !== null) { where.push('area_sqft >= ?'); params.push(areaMin); }
  if (areaMax !== null) { where.push('area_sqft <= ?'); params.push(areaMax); }
  if (q.get('possession_status')) { where.push('possession_status = ?'); params.push(q.get('possession_status')); }
  const sort = q.get('sort') || 'newest';
  const sorts = {
    newest: 'id DESC',
    price_asc: 'price_inr ASC, id DESC',
    price_desc: 'price_inr DESC, id DESC',
    area_desc: '(area_sqft IS NULL), area_sqft DESC, id DESC',
  };
  if (!sorts[sort]) return { status: 400, code: 'INVALID_PARAMETER', message: 'sort must be newest, price_asc, price_desc or area_desc' };
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM properties ${clause}`).get(...params).n;
  const rows = db.prepare(
    `SELECT * FROM properties ${clause} ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset);
  return { status: 200, body: { data: rows, pagination: { limit, offset, total } } };
}

function getProperty(idText, user) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return { status: 404, code: 'NOT_FOUND', message: 'Property not found' };
  let row = db.prepare(
    'SELECT * FROM properties WHERE id = ? AND status = ? AND deleted_at IS NULL',
  ).get(id, 'published');
  if (!row && user) {
    // Owner (or a user with properties:view_any) may see their own draft.
    // Everyone else gets 404, not 403, so draft existence is not leaked.
    const own = db.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id);
    if (own && (own.owner_id === user.id || hasPermission(db, user, 'properties:view_any'))) row = own;
  }
  if (!row) return { status: 404, code: 'NOT_FOUND', message: 'Property not found' };
  row.images = db.prepare(
    'SELECT id, url, alt_text, sort_order FROM property_images WHERE property_id = ? ORDER BY sort_order, id',
  ).all(id);
  return { status: 200, body: row };
}

function handleAuth(req, res, url, body, user, token) {
  const path = url.pathname;
  if (path === '/api/auth/register' && req.method === 'POST') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body.role || 'Buyer';
    if (!isValidEmail(email)) return apiError(res, 400, 'INVALID_PARAMETER', 'A valid email is required');
    if (!isStrongPassword(body.password)) return apiError(res, 400, 'INVALID_PARAMETER', 'Password must be at least 8 characters with letters and digits');
    if (!SELF_SERVICE_ROLES.includes(role)) return apiError(res, 400, 'INVALID_PARAMETER', 'That role cannot self-register');
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return apiError(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists');
    const info = db.prepare(`INSERT INTO users (email, password_hash, full_name, phone, role)
      VALUES (?, ?, ?, ?, ?)`).run(email, hashPassword(body.password), body.full_name || null, body.phone || null, role);
    const created = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)));
    const session = createSession(db, created.id, req.socket.remoteAddress, req.headers['user-agent']);
    return sendJson(res, 201, { user: created, permissions: listPermissions(db, created) },
      { 'Set-Cookie': sessionCookieHeader(session, 604800, { secure: sessionSecureFor(req) }) });
  }
  if (path === '/api/auth/login' && req.method === 'POST') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const ip = req.socket.remoteAddress || '';
    if (isLoginBlocked(ip, email)) return apiError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Try again later.');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(body.password || '', row.password_hash)) {
      recordFailedLogin(ip, email);
      return apiError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (row.status !== 'active') return apiError(res, 403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    clearFailedLogins(ip, email);
    const userRow = publicUser(row);
    const session = createSession(db, userRow.id, ip, req.headers['user-agent']);
    return sendJson(res, 200, { user: userRow, permissions: listPermissions(db, userRow) },
      { 'Set-Cookie': sessionCookieHeader(session, 604800, { secure: sessionSecureFor(req) }) });
  }
  if (path === '/api/auth/logout' && req.method === 'POST') {
    deleteSession(db, token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookieHeader({ secure: sessionSecureFor(req) }) });
  }
  if (path === '/api/auth/me' && req.method === 'GET') {
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
    return sendJson(res, 200, { user, permissions: listPermissions(db, user) });
  }
  if (path === '/api/auth/change-password' && req.method === 'POST') {
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(body.current_password || '', row.password_hash)) {
      return apiError(res, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    if (!isStrongPassword(body.new_password)) return apiError(res, 400, 'INVALID_PARAMETER', 'New password must be at least 8 characters with letters and digits');
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(hashPassword(body.new_password), user.id);
    revokeOtherSessions(db, user.id, token);
    return sendJson(res, 200, { ok: true });
  }
  if (path === '/api/auth/request-password-reset' && req.method === 'POST') {
    if (!DEV_CONSOLE_EMAIL) {
      return apiError(res, 503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured yet; password reset by email is unavailable');
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (row) {
      const resetToken = createPasswordResetToken(db, row.id);
      console.log(`[dev-console-email] password reset for ${email}: /api/auth/reset-password token=${resetToken}`);
    }
    return sendJson(res, 200, { ok: true, message: 'If an account exists for this email, reset instructions have been issued.' });
  }
  if (path === '/api/auth/reset-password' && req.method === 'POST') {
    if (!isStrongPassword(body.new_password)) return apiError(res, 400, 'INVALID_PARAMETER', 'New password must be at least 8 characters with letters and digits');
    const userId = consumePasswordResetToken(db, body.token);
    if (!userId) return apiError(res, 400, 'INVALID_TOKEN', 'Reset token is invalid or expired');
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(hashPassword(body.new_password), userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return sendJson(res, 200, { ok: true });
  }
  if (path === '/api/auth/request-verification' && req.method === 'POST') {
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
    if (!DEV_CONSOLE_EMAIL) {
      return apiError(res, 503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured yet; verification email is unavailable');
    }
    const vToken = createEmailVerificationToken(db, user.id);
    console.log(`[dev-console-email] email verification for ${user.email}: token=${vToken}`);
    return sendJson(res, 200, { ok: true });
  }
  if (path === '/api/auth/verify-email' && (req.method === 'POST' || req.method === 'GET')) {
    const vToken = req.method === 'POST' ? body.token : url.searchParams.get('token');
    const userId = verifyEmailToken(db, vToken);
    if (!userId) return apiError(res, 400, 'INVALID_TOKEN', 'Verification token is invalid or expired');
    return sendJson(res, 200, { ok: true });
  }
  return null; // not an auth route (or wrong method for a known route)
}

function respond(res, r) {
  if (r.error) return apiError(res, r.status, r.error.code, r.error.message);
  return sendJson(res, r.status, r.body);
}

function handlePropertyRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/properties' && m === 'POST') return respond(res, P.createProperty(db, user, body));
  if (path === '/api/properties' && m === 'GET') {
    const r = listProperties(url);
    if (r.status !== 200) return apiError(res, r.status, r.code, r.message);
    // Priority 3: record a real search event (filters only, no PII) so
    // analytics counts searches that actually happened.
    const meta = {};
    for (const k of ['city', 'locality', 'property_type', 'listing_type', 'sort']) {
      if (url.searchParams.get(k)) meta[k] = url.searchParams.get(k);
    }
    P3.recordEvent(db, 'property_search', null, user ? user.id : null, meta);
    return sendJson(res, 200, r.body);
  }
  if (path === '/api/properties/mine' && m === 'GET') return respond(res, P.listMine(db, user, url));
  if (path === '/api/saved' && m === 'GET') return respond(res, P.listSaved(db, user, url));
  if (path === '/api/recently-viewed' && m === 'GET') return respond(res, P.listRecent(db, user, url));
  const similar = path.match(/^\/api\/properties\/([^/]+)\/similar$/);
  if (similar && m === 'GET') return respond(res, P.similarProperties(db, user, similar[1]));
  const pub = path.match(/^\/api\/properties\/([^/]+)\/publish$/);
  if (pub && m === 'POST') {
    const r = P.publishProperty(db, user, pub[1]);
    // Priority 3: a newly published property triggers in-app alerts
    // for matching saved searches (deduplicated; no external delivery).
    if (!r.error) P3.createAlertsForProperty(db, r.body);
    return respond(res, r);
  }
  const unpub = path.match(/^\/api\/properties\/([^/]+)\/unpublish$/);
  if (unpub && m === 'POST') return respond(res, P.unpublishProperty(db, user, unpub[1]));
  const uploads = path.match(/^\/api\/properties\/([^/]+)\/uploads$/);
  if (uploads) {
    if (m === 'GET') return respond(res, U.listUploads(db, user, uploads[1]));
    if (m === 'POST') {
      if (!req._ppUpload) return apiError(res, 400, 'INVALID_PARAMETER', 'Upload must be multipart/form-data');
      return respond(res, U.uploadFile(db, UPLOAD_DIR, STATIC_ROOT, user, uploads[1], req._ppUpload.buffer, req._ppUpload.contentType));
    }
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this upload route');
  }
  const uploadOne = path.match(/^\/api\/properties\/([^/]+)\/uploads\/([^/]+)$/);
  if (uploadOne) {
    if (m === 'PATCH') return respond(res, U.reorderUpload(db, user, uploadOne[1], uploadOne[2], body));
    if (m === 'DELETE') return respond(res, U.deleteUpload(db, UPLOAD_DIR, user, uploadOne[1], uploadOne[2]));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this upload route');
  }
  const img = path.match(/^\/api\/properties\/([^/]+)\/images$/);
  if (img && m === 'POST') return respond(res, P.addImage(db, user, img[1], body));
  const imgDel = path.match(/^\/api\/properties\/([^/]+)\/images\/([^/]+)$/);
  if (imgDel && m === 'DELETE') return respond(res, P.deleteImage(db, user, imgDel[1], imgDel[2]));
  const save = path.match(/^\/api\/properties\/([^/]+)\/save$/);
  if (save && m === 'POST') return respond(res, P.saveProperty(db, user, save[1]));
  if (save && m === 'DELETE') return respond(res, P.unsaveProperty(db, user, save[1]));
  const detail = path.match(/^\/api\/properties\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') {
      const r = getProperty(detail[1], user);
      if (r.status !== 200) return apiError(res, r.status, r.code, r.message);
      P.recordView(db, user, Number(detail[1]));
      // Priority 3: record a real view event, including anonymous
      // views (user_id NULL), so analytics counts actual detail loads.
      P3.recordEvent(db, 'property_view', Number(detail[1]), user ? user.id : null, {});
      return sendJson(res, 200, r.body);
    }
    if (m === 'PATCH') return respond(res, P.updateProperty(db, user, detail[1], body));
    if (m === 'DELETE') return respond(res, P.deleteProperty(db, user, detail[1]));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this property route');
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleVisitRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  /* Stats must precede the visit-detail route, or 'stats' would match
     :id and 404 (same catch as leads/stats). */
  if (path === '/api/site-visits/stats' && m === 'GET') return respond(res, V.visitStats(db, user));
  if (path === '/api/site-visits/analytics' && m === 'GET') return respond(res, V.visitAnalytics(db, user));
  if (path === '/api/site-visits' && m === 'POST') return respond(res, V.requestVisit(db, user, body));
  if (path === '/api/site-visits' && m === 'GET') return respond(res, V.listVisits(db, user, url));
  const assign = path.match(/^\/api\/site-visits\/([^/]+)\/assign$/);
  if (assign && m === 'POST') return respond(res, V.assignVisit(db, user, assign[1], body));
  const detail = path.match(/^\/api\/site-visits\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, V.getVisit(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, V.updateVisit(db, user, detail[1], body));
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleTicketRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/tickets' && m === 'POST') return respond(res, T.createTicket(db, user, body));
  if (path === '/api/tickets' && m === 'GET') return respond(res, T.listTickets(db, user, url));
  const assign = path.match(/^\/api\/tickets\/([^/]+)\/assign$/);
  if (assign && m === 'POST') return respond(res, T.assignTicket(db, user, assign[1], body));
  const replies = path.match(/^\/api\/tickets\/([^/]+)\/replies$/);
  if (replies && m === 'POST') return respond(res, T.addReply(db, user, replies[1], body));
  const detail = path.match(/^\/api\/tickets\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, T.getTicket(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, T.updateTicketStatus(db, user, detail[1], body));
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleServiceRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  /* Stats must precede the detail route, or 'stats' would match
     :id and 404 (same catch as leads/stats). */
  if (path === '/api/service-requests/stats' && m === 'GET') return respond(res, S.serviceRequestStats(db, user));
  if (path === '/api/service-requests' && m === 'POST') return respond(res, S.createServiceRequest(db, user, body));
  if (path === '/api/service-requests' && m === 'GET') return respond(res, S.listServiceRequests(db, user, url));
  const assign = path.match(/^\/api\/service-requests\/([^/]+)\/assign$/);
  if (assign && m === 'POST') return respond(res, S.assignServiceRequest(db, user, assign[1], body));
  const detail = path.match(/^\/api\/service-requests\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, S.getServiceRequest(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, S.updateServiceRequest(db, user, detail[1], body));
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handlePaymentRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/billing-profile') {
    if (m === 'GET') return respond(res, PAY.getBillingProfile(db, user));
    if (m === 'PUT') return respond(res, PAY.putBillingProfile(db, user, body));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this route');
  }
  if (path === '/api/payments' && m === 'POST') return respond(res, PAY.createPayment(db, user, body));
  if (path === '/api/payments' && m === 'GET') return respond(res, PAY.listPayments(db, user, url));
  const refund = path.match(/^\/api\/payments\/([^/]+)\/refund-request$/);
  if (refund && m === 'POST') return respond(res, PAY.requestRefund(db, user, refund[1], body));
  const detail = path.match(/^\/api\/payments\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, PAY.getPayment(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, PAY.updatePayment(db, user, detail[1], body));
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleCampaignRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/campaigns' && m === 'POST') return respond(res, CAMP.createCampaign(db, user, body));
  if (path === '/api/campaigns' && m === 'GET') return respond(res, CAMP.listCampaigns(db, user, url));
  const campaign = path.match(/^\/api\/campaigns\/([^/]+)$/);
  if (campaign) {
    if (m === 'GET') return respond(res, CAMP.getCampaign(db, user, campaign[1]));
    if (m === 'PATCH') return respond(res, CAMP.updateCampaign(db, user, campaign[1], body));
  }
  if (path === '/api/message-templates' && m === 'POST') return respond(res, CAMP.createTemplate(db, user, body));
  if (path === '/api/message-templates' && m === 'GET') return respond(res, CAMP.listTemplates(db, user, url));
  const template = path.match(/^\/api\/message-templates\/([^/]+)$/);
  if (template && m === 'GET') return respond(res, CAMP.getTemplate(db, user, template[1]));
  if (path === '/api/queued-messages' && m === 'POST') return respond(res, CAMP.createQueuedMessage(db, user, body));
  if (path === '/api/queued-messages' && m === 'GET') return respond(res, CAMP.listQueuedMessages(db, user, url));
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleLeadRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/inquiries/mine' && m === 'GET') return respond(res, L.listMyInquiries(db, user, url));
  if (path === '/api/inquiries' && m === 'POST') {
    const ip = req.socket.remoteAddress || '';
    if (L.inquiryRateLimited(ip)) return apiError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many inquiries from this address. Try again later.');
    L.recordInquiryAttempt(ip);
    return respond(res, L.createInquiry(db, body, user ? user.id : null));
  }
  if (path === '/api/leads' && m === 'GET') return respond(res, L.listLeads(db, user, url));
  if (path === '/api/leads/export' && m === 'GET') {
    const r = L.exportLeads(db, user);
    if (r.error) return apiError(res, r.status, r.error.code, r.error.message);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads.csv"', ...SECURITY_HEADERS });
    return res.end(r.csv);
  }
  if (path === '/api/notifications' && m === 'GET') return respond(res, L.listNotifications(db, user, url));
  const notifRead = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notifRead && m === 'POST') return respond(res, L.markNotificationRead(db, user, notifRead[1]));
  const followDone = path.match(/^\/api\/leads\/([^/]+)\/followups\/([^/]+)\/done$/);
  if (followDone && m === 'PATCH') return respond(res, L.completeFollowup(db, user, followDone[1], followDone[2]));
  const follow = path.match(/^\/api\/leads\/([^/]+)\/followups$/);
  if (follow && m === 'POST') return respond(res, L.createFollowup(db, user, follow[1], body));
  if (follow && m === 'GET') return respond(res, L.listFollowups(db, user, follow[1]));
  const acts = path.match(/^\/api\/leads\/([^/]+)\/activities$/);
  if (acts && m === 'GET') return respond(res, L.listActivities(db, user, acts[1]));
  const assign = path.match(/^\/api\/leads\/([^/]+)\/assign$/);
  if (assign && m === 'POST') return respond(res, L.assignLead(db, user, assign[1], body));
  const notes = path.match(/^\/api\/leads\/([^/]+)\/notes$/);
  if (notes && m === 'POST') return respond(res, L.addNote(db, user, notes[1], body));
  if (path === '/api/tags' && m === 'GET') return respond(res, L.listTags(db, user));
  const leadTags = path.match(/^\/api\/leads\/([^/]+)\/tags$/);
  if (leadTags && m === 'GET') return respond(res, L.listLeadTags(db, user, leadTags[1]));
  if (leadTags && m === 'POST') return respond(res, L.addLeadTag(db, user, leadTags[1], body));
  const leadTagOne = path.match(/^\/api\/leads\/([^/]+)\/tags\/([^/]+)$/);
  if (leadTagOne && m === 'DELETE') return respond(res, L.removeLeadTag(db, user, leadTagOne[1], leadTagOne[2]));
  /* Scores/SLA must precede the lead-detail route, or 'scores'/'sla'
     would match the :id route and 404 (same catch as stats). */
  if (path === '/api/leads/scores' && m === 'GET') return respond(res, L.listLeadScores(db, user, url));
  if (path === '/api/leads/sla' && m === 'GET') return respond(res, L.listLeadSla(db, user));
  const detail = path.match(/^\/api\/leads\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, L.getLead(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, L.updateLeadStatus(db, user, detail[1], body));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this lead route');
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleBuilderRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/builder-projects' && m === 'POST') return respond(res, B.createProject(db, user, body));
  if (path === '/api/builder-projects' && m === 'GET') return respond(res, B.listProjects(db, user, url));
  const submit = path.match(/^\/api\/builder-projects\/([^/]+)\/submit$/);
  if (submit && m === 'POST') return respond(res, B.submitProject(db, user, submit[1]));
  const verify = path.match(/^\/api\/builder-projects\/([^/]+)\/verify$/);
  if (verify && m === 'POST') return respond(res, B.verifyProject(db, user, verify[1], body));
  const pub = path.match(/^\/api\/builder-projects\/([^/]+)\/publish$/);
  if (pub && m === 'POST') return respond(res, B.publishProject(db, user, pub[1]));
  const unpub = path.match(/^\/api\/builder-projects\/([^/]+)\/unpublish$/);
  if (unpub && m === 'POST') return respond(res, B.unpublishProject(db, user, unpub[1]));
  const arch = path.match(/^\/api\/builder-projects\/([^/]+)\/archive$/);
  if (arch && m === 'POST') return respond(res, B.archiveProject(db, user, arch[1]));
  const tower = path.match(/^\/api\/builder-projects\/([^/]+)\/towers$/);
  if (tower && m === 'POST') return respond(res, B.addTower(db, user, tower[1], body));
  const unit = path.match(/^\/api\/builder-projects\/([^/]+)\/units$/);
  if (unit && m === 'POST') return respond(res, B.addUnit(db, user, unit[1], body));
  const unitStatus = path.match(/^\/api\/builder-projects\/([^/]+)\/units\/([^/]+)\/status$/);
  if (unitStatus && m === 'PATCH') return respond(res, B.setUnitStatus(db, user, unitStatus[1], unitStatus[2], body));
  const mile = path.match(/^\/api\/builder-projects\/([^/]+)\/milestones$/);
  if (mile && m === 'POST') return respond(res, B.addMilestone(db, user, mile[1], body));
  const amen = path.match(/^\/api\/builder-projects\/([^/]+)\/amenities$/);
  if (amen && m === 'POST') return respond(res, B.addAmenity(db, user, amen[1], body));
  const doc = path.match(/^\/api\/builder-projects\/([^/]+)\/documents$/);
  if (doc && m === 'POST') return respond(res, B.addDocument(db, user, doc[1], body));
  const offer = path.match(/^\/api\/builder-projects\/([^/]+)\/offers$/);
  if (offer && m === 'POST') return respond(res, B.addOffer(db, user, offer[1], body));
  const enq = path.match(/^\/api\/builder-projects\/([^/]+)\/enquiries$/);
  if (enq && m === 'POST') return respond(res, B.createEnquiry(db, user, enq[1], body));
  if (enq && m === 'GET') return respond(res, B.listEnquiries(db, user, enq[1], url));
  const act = path.match(/^\/api\/builder-projects\/([^/]+)\/activities$/);
  if (act && m === 'POST') return respond(res, B.addActivity(db, user, act[1], body));
  const detail = path.match(/^\/api\/builder-projects\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, B.getProject(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, B.updateProject(db, user, detail[1], body));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this project route');
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleReviewRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  const propReviews = path.match(/^\/api\/properties\/([^/]+)\/reviews$/);
  if (propReviews && m === 'POST') return respond(res, REV.createReview(db, user, propReviews[1], body));
  if (propReviews && m === 'GET') return respond(res, REV.listReviews(db, user, propReviews[1], url));
  const report = path.match(/^\/api\/reviews\/([^/]+)\/report$/);
  if (report && m === 'POST') return respond(res, REV.reportReview(db, user, report[1], body));
  const detail = path.match(/^\/api\/reviews\/([^/]+)$/);
  if (detail) {
    if (m === 'PATCH') return respond(res, REV.moderateReview(db, user, detail[1], body));
    if (m === 'DELETE') return respond(res, REV.deleteReview(db, user, detail[1]));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this review route');
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleTaskRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/tasks/stats' && m === 'GET') return respond(res, TASK.taskStats(db, user));
  if (path === '/api/tasks' && m === 'POST') return respond(res, TASK.createTask(db, user, body));
  if (path === '/api/tasks' && m === 'GET') return respond(res, TASK.listTasks(db, user, url));
  const comment = path.match(/^\/api\/tasks\/([^/]+)\/comments$/);
  if (comment && m === 'POST') return respond(res, TASK.addComment(db, user, comment[1], body));
  const detail = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (detail) {
    if (m === 'GET') return respond(res, TASK.getTask(db, user, detail[1]));
    if (m === 'PATCH') return respond(res, TASK.updateTask(db, user, detail[1], body));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this task route');
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleRbacRoutes(req, res, url, body, user, token) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/auth/sessions' && m === 'GET') return respond(res, RBAC.listSessions(db, user));
  if (path === '/api/auth/revoke-other-sessions' && m === 'POST') {
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
    revokeOtherSessions(db, user.id, token);
    RBAC.logAudit(db, user.id, 'session.revoke_others', 'user', user.id, '');
    return sendJson(res, 200, { ok: true });
  }
  const sess = path.match(/^\/api\/auth\/sessions\/([^/]+)$/);
  if (sess && m === 'DELETE') return respond(res, RBAC.revokeSession(db, user, token, sess[1]));
  if (path === '/api/custom-roles' && m === 'POST') return respond(res, RBAC.createCustomRole(db, user, body));
  if (path === '/api/custom-roles' && m === 'GET') return respond(res, RBAC.listCustomRoles(db, user));
  if (path === '/api/custom-roles/assign' && m === 'POST') return respond(res, RBAC.assignCustomRole(db, user, body));
  if (path === '/api/custom-roles/unassign' && m === 'POST') return respond(res, RBAC.unassignCustomRole(db, user, body));
  const role = path.match(/^\/api\/custom-roles\/([^/]+)$/);
  if (role) {
    if (m === 'GET') return respond(res, RBAC.getCustomRole(db, user, role[1]));
    if (m === 'PATCH') return respond(res, RBAC.updateCustomRole(db, user, role[1], body));
    if (m === 'DELETE') return respond(res, RBAC.deleteCustomRole(db, user, role[1]));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this role route');
  }
  if (path === '/api/admin-audit-log' && m === 'GET') return respond(res, RBAC.listAuditLog(db, user, url));
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleSubscriptionRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/subscription-plans' && m === 'GET') return respond(res, SUB.listPlans(db, user, url));
  if (path === '/api/subscription-plans' && m === 'POST') return respond(res, SUB.createPlan(db, user, body));
  const plan = path.match(/^\/api\/subscription-plans\/([^/]+)$/);
  if (plan && m === 'PATCH') return respond(res, SUB.updatePlan(db, user, plan[1], body));
  if (path === '/api/subscriptions' && m === 'POST') return respond(res, SUB.createSubscription(db, user, body));
  if (path === '/api/subscriptions/mine' && m === 'GET') return respond(res, SUB.listMySubscriptions(db, user));
  if (path === '/api/subscriptions/entitlement' && m === 'GET') return respond(res, SUB.entitlement(db, user));
  const activate = path.match(/^\/api\/subscriptions\/([^/]+)\/activate$/);
  if (activate && m === 'POST') return respond(res, SUB.activateSubscription(db, user, activate[1], body));
  const change = path.match(/^\/api\/subscriptions\/([^/]+)\/change-plan$/);
  if (change && m === 'POST') return respond(res, SUB.changePlan(db, user, change[1], body));
  const cancel = path.match(/^\/api\/subscriptions\/([^/]+)\/cancel$/);
  if (cancel && m === 'POST') return respond(res, SUB.cancelSubscription(db, user, cancel[1]));
  const expire = path.match(/^\/api\/subscriptions\/([^/]+)\/expire$/);
  if (expire && m === 'POST') return respond(res, SUB.expireSubscription(db, user, expire[1]));
  const invoices = path.match(/^\/api\/subscriptions\/([^/]+)\/invoices$/);
  if (invoices && m === 'GET') return respond(res, SUB.subscriptionInvoices(db, user, invoices[1]));
  const subDetail = path.match(/^\/api\/subscriptions\/([^/]+)$/);
  if (subDetail && m === 'GET') return respond(res, SUB.getSubscription(db, user, subDetail[1]));
  if (path === '/api/coupons' && m === 'POST') return respond(res, SUB.createCoupon(db, user, body));
  if (path === '/api/coupons/apply' && m === 'POST') return respond(res, SUB.applyCoupon(db, user, body));
  if (path === '/api/coupons/redeem' && m === 'POST') return respond(res, SUB.redeemCoupon(db, user, body));
  const feature = path.match(/^\/api\/properties\/([^/]+)\/feature$/);
  if (feature && m === 'POST') return respond(res, SUB.featureProperty(db, user, feature[1]));
  if (feature && m === 'DELETE') return respond(res, SUB.unfeatureProperty(db, user, feature[1]));
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleChatRoutes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  if (path === '/api/notification-preferences' && m === 'GET') return respond(res, CHAT.getPreferences(db, user));
  if (path === '/api/notification-preferences' && m === 'PUT') return respond(res, CHAT.putPreferences(db, user, body));
  if (path === '/api/conversations' && m === 'POST') return respond(res, CHAT.createConversation(db, user, body));
  if (path === '/api/conversations' && m === 'GET') return respond(res, CHAT.listConversations(db, user));
  const msgs = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgs && m === 'POST') return respond(res, CHAT.sendMessage(db, user, msgs[1], body));
  if (msgs && m === 'GET') return respond(res, CHAT.listMessages(db, user, msgs[1], url));
  const read = path.match(/^\/api\/conversations\/([^/]+)\/read$/);
  if (read && m === 'POST') return respond(res, CHAT.markRead(db, user, read[1]));
  const detail = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (detail && m === 'GET') return respond(res, CHAT.getConversation(db, user, detail[1]));
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

/* Priority 3: sitemap + link check helpers. Both work only from files
   that actually exist under the static root and from published
   properties in the database. Nothing is claimed to be crawled from
   the web, and no search-engine indexing status is reported. */
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function walkHtmlFiles(dir, out) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'server') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkHtmlFiles(full, out);
    else if (e.isFile() && e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function generateSitemapXml() {
  const base = (process.env.SITE_BASE_URL || 'https://shubhamgautambagde.github.io/primepropertys').replace(/\/$/, '');
  const urls = [];
  for (const full of walkHtmlFiles(STATIC_ROOT, [])) {
    const rel = full.slice(STATIC_ROOT.length + 1).split(/[\\/]/).join('/');
    let loc;
    if (rel === 'index.html') loc = base + '/';
    else if (rel.endsWith('/index.html')) loc = base + '/' + rel.slice(0, -'index.html'.length);
    else loc = base + '/' + rel;
    let lastmod = '';
    try { lastmod = statSync(full).mtime.toISOString().slice(0, 10); } catch { /* omit */ }
    urls.push({ loc, lastmod });
  }
  const props = db.prepare(`SELECT id, updated_at FROM properties
    WHERE status = 'published' AND deleted_at IS NULL ORDER BY id`).all();
  for (const p of props) {
    urls.push({
      loc: `${base}/sections/property-engine/property-details.html?property_id=${p.id}`,
      lastmod: (p.updated_at || '').slice(0, 10),
    });
  }
  const body = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`),
    '</urlset>'].join('\n');
  return { body, count: urls.length, published_properties: props.length };
}

function checkPageLinks(pagePath) {
  // pagePath is an internal path like /sections/seo/broken-links.html.
  const rel = pagePath.replace(/^\/+/, '');
  if (rel.includes('..')) return { error: 'path must not contain ..' };
  const file = resolve(join(STATIC_ROOT, '.' + pagePath));
  if (!file.startsWith(STATIC_ROOT + '/')) return { error: 'path escapes the site root' };
  if (!existsSync(file) || !statSync(file).isFile()) return { error: 'page not found' };
  const html = readFileSync(file, 'utf8');
  const found = new Set();
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') ||
        raw.startsWith('javascript:') || raw.startsWith('data:') || /^https?:\/\//.test(raw)) continue;
    found.add(raw);
  }
  const broken = [];
  const pageDir = dirname(pagePath);
  for (const raw of found) {
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    let target = clean.startsWith('/') ? clean : join(pageDir, clean).split(/[\\/]/).join('/');
    if (target.endsWith('/')) target += 'index.html';
    const resolved = resolve(join(STATIC_ROOT, '.' + target));
    if (!resolved.startsWith(STATIC_ROOT + '/') || !existsSync(resolved) || !statSync(resolved).isFile()) {
      broken.push(raw);
    }
  }
  return { path: pagePath, checked_links: found.size, broken };
}

async function handlePriority3Routes(req, res, url, body, user) {
  const path = url.pathname;
  const m = req.method;
  try {
    if (path === '/api/ai/generate' && m === 'POST') return respond(res, await AI.generate(db, user, body));
    if (path === '/api/ai/generations' && m === 'GET') return respond(res, AI.listGenerations(db, user, url));
    const gen = path.match(/^\/api\/ai\/generations\/([^/]+)$/);
    if (gen && m === 'GET') return respond(res, AI.getGeneration(db, user, gen[1]));
    const review = path.match(/^\/api\/ai\/generations\/([^/]+)\/review$/);
    if (review && m === 'POST') return respond(res, AI.reviewGeneration(db, user, review[1], body));
    const apply = path.match(/^\/api\/ai\/generations\/([^/]+)\/apply$/);
    if (apply && m === 'POST') return respond(res, AI.applyGeneration(db, user, apply[1]));
    const quality = path.match(/^\/api\/properties\/([^/]+)\/quality-check$/);
    if (quality && m === 'GET') return respond(res, AI.qualityCheck(db, user, quality[1]));
    const priceHist = path.match(/^\/api\/properties\/([^/]+)\/price-history$/);
    if (priceHist && m === 'GET') return respond(res, P3.listPriceHistory(db, user, priceHist[1]));
    const recs = path.match(/^\/api\/properties\/([^/]+)\/recommendations$/);
    if (recs && m === 'GET') return respond(res, P3.recommendations(db, user, recs[1], url));
    if (path === '/api/analytics/summary' && m === 'GET') return respond(res, P3.analyticsSummary(db, user, url));
    if (path === '/api/analytics/export' && m === 'GET') {
      const r = P3.analyticsExportCsv(db, user, url);
      if (r.error) return apiError(res, r.status, r.error.code, r.error.message);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="analytics.csv"', ...SECURITY_HEADERS });
      return res.end(r.csv);
    }
    if (path === '/api/saved-searches' && m === 'POST') return respond(res, P3.createSavedSearch(db, user, body));
    if (path === '/api/saved-searches' && m === 'GET') return respond(res, P3.listSavedSearches(db, user));
    const match = path.match(/^\/api\/saved-searches\/([^/]+)\/match$/);
    if (match && m === 'GET') return respond(res, P3.matchSavedSearch(db, user, match[1], url));
    const savedOne = path.match(/^\/api\/saved-searches\/([^/]+)$/);
    if (savedOne && m === 'DELETE') return respond(res, P3.deleteSavedSearch(db, user, savedOne[1]));
    if (path === '/api/search-alerts' && m === 'GET') return respond(res, P3.listSearchAlerts(db, user, url));
    if (path === '/api/reminders' && m === 'GET') return respond(res, P3.listReminders(db, user));
    if (path === '/api/seo/metadata' && m === 'GET') return respond(res, P3.getSeoMetadata(db, user, url));
    if (path === '/api/seo/metadata' && m === 'POST') return respond(res, P3.saveSeoMetadata(db, user, body));
    if (path === '/api/seo/redirects' && m === 'GET') return respond(res, P3.listSeoRedirects(db, user));
    if (path === '/api/seo/redirects' && m === 'POST') return respond(res, P3.createSeoRedirect(db, user, body));
    const redirOne = path.match(/^\/api\/seo\/redirects\/([^/]+)$/);
    if (redirOne && m === 'DELETE') return respond(res, P3.deleteSeoRedirect(db, user, redirOne[1]));
    if (path === '/api/seo/duplicates' && m === 'GET') return respond(res, P3.seoDuplicates(db, user));
    if (path === '/api/seo/robots' && m === 'GET') return respond(res, P3.seoRobots(db, user, null));
    if (path === '/api/seo/robots' && m === 'PUT') return respond(res, P3.seoRobots(db, user, body));
    if (path === '/api/seo/sitemap' && m === 'GET') {
      const s = generateSitemapXml();
      return sendBody(res, req, 200, 'application/xml; charset=utf-8', s.body);
    }
    if (path === '/api/seo/link-check' && m === 'POST') {
      if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
      if (!hasPermission(db, user, 'seo:manage')) return apiError(res, 403, 'FORBIDDEN', 'Missing permission: seo:manage');
      const target = body && typeof body.path === 'string' ? body.path : '';
      if (!target.startsWith('/')) return apiError(res, 400, 'INVALID_PARAMETER', 'path must start with /');
      const r = checkPageLinks(target);
      if (r.error) return apiError(res, 404, 'NOT_FOUND', r.error);
      db.prepare(`INSERT INTO seo_link_checks (path, checked_links, broken_count, broken_json)
        VALUES (?, ?, ?, ?)`).run(target, r.checked_links, r.broken.length, JSON.stringify(r.broken));
      db.prepare(`UPDATE seo_metadata SET last_checked_at = datetime('now') WHERE path = ?`).run(target);
      return sendJson(res, 200, r);
    }
    if (path === '/api/seo/broken-links' && m === 'GET') {
      if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
      if (!hasPermission(db, user, 'seo:manage')) return apiError(res, 403, 'FORBIDDEN', 'Missing permission: seo:manage');
      const rows = db.prepare(`SELECT * FROM seo_link_checks WHERE broken_count > 0
        ORDER BY checked_at DESC, id DESC LIMIT 100`).all();
      return sendJson(res, 200, { data: rows });
    }
    return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
  } catch {
    if (!res.headersSent) return apiError(res, 500, 'SERVER_ERROR', 'Priority 3 route failed');
    return res.end();
  }
}

function isPriority3Path(path) {
  return path === '/api/ai/generate' || path === '/api/ai/generations' ||
    /^\/api\/ai\/generations\/[^/]+(\/(review|apply))?$/.test(path) ||
    /^\/api\/properties\/[^/]+\/(quality-check|price-history|recommendations)$/.test(path) ||
    path === '/api/analytics/summary' || path === '/api/analytics/export' ||
    path === '/api/saved-searches' || /^\/api\/saved-searches\/[^/]+(\/match)?$/.test(path) ||
    path === '/api/search-alerts' || path === '/api/reminders' ||
    path === '/api/seo/metadata' || path === '/api/seo/redirects' ||
    /^\/api\/seo\/redirects\/[^/]+$/.test(path) || path === '/api/seo/duplicates' ||
    path === '/api/seo/robots' || path === '/api/seo/sitemap' ||
    path === '/api/seo/link-check' || path === '/api/seo/broken-links';
}

function handleApi(req, res, url, body, user, token) {
  /* Priority 3 routes (async: AI provider calls). */
  if (isPriority3Path(url.pathname)) {
    handlePriority3Routes(req, res, url, body, user);
    return;
  }
  /* Priority 2: payment webhook stub — no provider is configured, so
     this always answers 501 and never activates any entitlement. */
  if (url.pathname === '/api/webhooks/payment' && req.method === 'POST') {
    return apiError(res, 501, 'WEBHOOK_NOT_CONFIGURED', 'No payment provider is configured; webhooks are not accepted');
  }
  if (url.pathname === '/api/auth/sessions' || url.pathname === '/api/auth/revoke-other-sessions' ||
      url.pathname.startsWith('/api/auth/sessions/')) {
    return handleRbacRoutes(req, res, url, body, user, token);
  }
  if (url.pathname === '/api/custom-roles' || url.pathname.startsWith('/api/custom-roles/') ||
      url.pathname === '/api/admin-audit-log') {
    return handleRbacRoutes(req, res, url, body, user, token);
  }
  if (url.pathname === '/api/builder-projects' || url.pathname.startsWith('/api/builder-projects/')) {
    return handleBuilderRoutes(req, res, url, body, user);
  }
  if (/^\/api\/properties\/[^/]+\/reviews$/.test(url.pathname) || url.pathname.startsWith('/api/reviews/')) {
    return handleReviewRoutes(req, res, url, body, user);
  }
  if (/^\/api\/properties\/[^/]+\/feature$/.test(url.pathname)) {
    return handleSubscriptionRoutes(req, res, url, body, user);
  }
  if (url.pathname === '/api/tasks' || url.pathname.startsWith('/api/tasks/')) {
    return handleTaskRoutes(req, res, url, body, user);
  }
  if (url.pathname === '/api/subscription-plans' || url.pathname.startsWith('/api/subscription-plans/') ||
      url.pathname === '/api/subscriptions' || url.pathname.startsWith('/api/subscriptions/') ||
      url.pathname === '/api/coupons' || url.pathname.startsWith('/api/coupons/')) {
    return handleSubscriptionRoutes(req, res, url, body, user);
  }
  if (url.pathname === '/api/conversations' || url.pathname.startsWith('/api/conversations/') ||
      url.pathname === '/api/notification-preferences') {
    return handleChatRoutes(req, res, url, body, user);
  }
  if (url.pathname.startsWith('/api/auth/')) {
    const handled = handleAuth(req, res, url, body, user, token);
    if (handled !== null) return handled;
    if (req.method !== 'GET' && req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    return apiError(res, 404, 'NOT_FOUND', 'Unknown auth route');
  }
  const path = url.pathname;
  /* Stats must precede the /api/leads/ branch: without this, 'stats'
     would match the lead-detail route and 404. */
  if (path === '/api/leads/stats' && req.method === 'GET') return respond(res, L.leadStats(db, user));
  if (path === '/api/inquiries' || path === '/api/inquiries/mine' || path === '/api/leads' || path.startsWith('/api/leads/') || path === '/api/tags' ||
      path === '/api/notifications' || path.startsWith('/api/notifications/')) {
    return handleLeadRoutes(req, res, url, body, user);
  }
  if (path === '/api/site-visits' || path.startsWith('/api/site-visits/')) {
    return handleVisitRoutes(req, res, url, body, user);
  }
  if (path === '/api/tickets' || path.startsWith('/api/tickets/')) {
    return handleTicketRoutes(req, res, url, body, user);
  }
  if (path === '/api/service-requests' || path.startsWith('/api/service-requests/')) {
    return handleServiceRoutes(req, res, url, body, user);
  }
  if (path === '/api/payments' || path.startsWith('/api/payments/') || path === '/api/billing-profile') {
    return handlePaymentRoutes(req, res, url, body, user);
  }
  if (path === '/api/campaigns' || path.startsWith('/api/campaigns/') ||
      path === '/api/message-templates' || path.startsWith('/api/message-templates/') ||
      path === '/api/queued-messages' || path.startsWith('/api/queued-messages/')) {
    return handleCampaignRoutes(req, res, url, body, user);
  }
  if (path === '/api/settings') {
    if (req.method === 'GET') return respond(res, SET.getSettings(db, user));
    if (req.method === 'PUT') return respond(res, SET.putSettings(db, user, body));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this route');
  }
  const download = path.match(/^\/api\/uploads\/([^/]+)$/);
  if (download && req.method === 'GET') {
    const r = U.downloadUpload(db, UPLOAD_DIR, user, download[1]);
    if (r.error) return apiError(res, r.status, r.error.code, r.error.message);
    const data = readUploadFile(r.file);
    return sendBody(res, req, 200, r.mime, data, {
      'Content-Disposition': r.kind === 'document' ? `attachment; filename="upload-${r.id}.${r.ext}"` : `inline; filename="upload-${r.id}.${r.ext}"`,
      // Priority 4: downloads can be private documents, so never cache them.
      'Cache-Control': 'no-store',
    });
  }
  if (path === '/api/properties' || path.startsWith('/api/properties/') ||
      path === '/api/saved' || path === '/api/recently-viewed') {
    return handlePropertyRoutes(req, res, url, body, user);
  }
  if (path === '/api/contact') {
    if (req.method === 'POST') {
      const ip = req.socket.remoteAddress || '';
      if (C.contactRateLimited(ip)) return apiError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many messages from this address. Try again later.');
      C.recordContactAttempt(ip);
      return respond(res, C.createContactMessage(db, body));
    }
    if (req.method === 'GET') return respond(res, C.listContactMessages(db, user, url));
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this route');
  }
  if (path === '/api/newsletter/subscribe' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || '';
    if (N.newsletterRateLimited(ip)) return apiError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many subscription attempts from this address. Try again later.');
    N.recordNewsletterAttempt(ip);
    return respond(res, N.subscribe(db, body));
  }
  if (path === '/api/newsletter/unsubscribe' && req.method === 'POST') {
    return respond(res, N.unsubscribe(db, body));
  }
  if (path === '/api/users' && req.method === 'GET') return respond(res, listUsers(db, user));
  const userDetail = path.match(/^\/api\/users\/(\d+)$/);
  if (userDetail) {
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Login required');
    if (!hasPermission(db, user, 'users:manage')) return apiError(res, 403, 'FORBIDDEN', 'Missing permission: users:manage');
    const row = db.prepare(`SELECT id, email, full_name, role, status, email_verified_at, created_at
      FROM users WHERE id = ?`).get(Number(userDetail[1]));
    if (!row) return apiError(res, 404, 'NOT_FOUND', 'User not found');
    if (req.method === 'GET') return sendJson(res, 200, row);
    if (req.method === 'PATCH') {
      const b = body && typeof body === 'object' ? body : {};
      const updates = {};
      if (b.role !== undefined) {
        if (!SELF_SERVICE_ROLES.includes(b.role) && !['Admin', 'Super Admin', 'Support'].includes(b.role)) {
          return apiError(res, 400, 'INVALID_PARAMETER', 'role must be one of the 9 platform roles');
        }
        if (Number(userDetail[1]) === user.id && b.role !== row.role) {
          return apiError(res, 400, 'INVALID_PARAMETER', 'Cannot change your own role');
        }
        updates.role = b.role;
      }
      if (b.status !== undefined) {
        if (!['active', 'suspended'].includes(b.status)) {
          return apiError(res, 400, 'INVALID_PARAMETER', "status must be 'active' or 'suspended'");
        }
        updates.status = b.status;
      }
      if (!Object.keys(updates).length) return apiError(res, 400, 'INVALID_PARAMETER', 'No updatable fields provided');
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .run(...Object.values(updates), Number(userDetail[1]));
      /* Priority 2: suspension is a sensitive admin action — audit it. */
      if (updates.status === 'suspended') RBAC.logAudit(db, user.id, 'user.suspend', 'user', Number(userDetail[1]), row.email);
      if (updates.role) RBAC.logAudit(db, user.id, 'user.role_change', 'user', Number(userDetail[1]), `${row.role} -> ${updates.role}`);
      const updated = db.prepare(`SELECT id, email, full_name, role, status, email_verified_at, created_at
        FROM users WHERE id = ?`).get(Number(userDetail[1]));
      return sendJson(res, 200, updated);
    }
    return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this user route');
  }
  if (path === '/api/followups' && req.method === 'GET') return respond(res, L.listFollowupsVisible(db, user, url));
  if (req.method !== 'GET') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  if (path === '/api/health') {
    try {
      db.prepare('SELECT 1').get();
      return sendJson(res, 200, { status: 'ok', db: 'ok', version: 'stage-h' });
    } catch {
      return apiError(res, 500, 'DB_ERROR', 'Database unavailable');
    }
  }
  return apiError(res, 404, 'NOT_FOUND', 'Unknown API route');
}

function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Method not allowed');
  }
  /* Priority 3: stored SEO redirects are honoured for real requests
     (301/302 from the seo_redirects table, not from page markup). */
  try {
    const redir = db.prepare('SELECT * FROM seo_redirects WHERE from_path = ?').get(url.pathname);
    if (redir) {
      res.writeHead(redir.status_code, { Location: redir.to_path, ...SECURITY_HEADERS });
      return res.end();
    }
  } catch { /* no redirect table yet: serve normally */ }
  let rel = decodeURIComponent(url.pathname);
  /* Priority 1: never serve the server tree as static files (source,
     data directory, or anything an operator places under server/). */
  if (rel === '/server' || rel.startsWith('/server/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Not found');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolve(join(STATIC_ROOT, '.' + rel));
  if (!file.startsWith(STATIC_ROOT + '/') && file !== STATIC_ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Forbidden');
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    return res.end('Not found');
  }
  const ext = extname(file).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const data = readFileSync(file);
  // Priority 4: only non-HTML static assets get a public cache header.
  // HTML pages are deliberately left uncached: they are regenerated by
  // tools/build.py and can carry login-dependent client rendering, so a
  // stale cached page would be worse than a fresh fetch. 3600s (not
  // immutable) because assets share a path across builds.
  const staticCache = ext !== '.html' ? { 'Cache-Control': 'public, max-age=3600' } : {};
  if (req.method === 'HEAD') {
    // Same headers a GET would send (including Content-Encoding when
    // the body would be gzipped), but no body.
    const headers = { 'Content-Type': contentType, ...SECURITY_HEADERS, ...staticCache };
    const compressible = /^(text\/|application\/(json|javascript)|image\/svg\+xml)/.test(contentType);
    if (compressible && data.length >= 1024 && acceptsGzip(req)) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
    }
    res.writeHead(200, headers);
    return res.end();
  }
  return sendBody(res, req, 200, contentType, data, staticCache);
}

const server = createServer(async (req, res) => {
  // Stash the request on its own response object so sendJson can
  // negotiate gzip without changing 50+ call sites. Each request
  // gets its own response object, so this cannot leak across requests.
  res._ppReq = req;
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      const user = getSessionUser(db, token);
      let body = {};
      const isUpload = req.method === 'POST' && /^\/api\/properties\/[^/]+\/uploads$/.test(url.pathname) &&
        (req.headers['content-type'] || '').startsWith('multipart/form-data');
      if (isUpload) {
        try {
          const buf = await readBodyBuffer(req, 11 * 1024 * 1024);
          req._ppUpload = { buffer: buf, contentType: req.headers['content-type'] };
        } catch {
          return apiError(res, 413, 'BODY_TOO_LARGE', 'Upload too large (max 10 MB per file)');
        }
      } else if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
        let raw;
        try {
          raw = await readBody(req);
        } catch {
          return apiError(res, 413, 'BODY_TOO_LARGE', 'Request body too large');
        }
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            return apiError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON');
          }
        }
      }
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && token) {
        if (csrfBlocked(req)) return apiError(res, 403, 'CSRF_FORBIDDEN', 'Request origin does not match this site');
      }
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
          !['/api/auth/login', '/api/inquiries', '/api/contact', '/api/newsletter/subscribe'].includes(url.pathname)) {
        const lim = writeLimitFor(req, user, body);
        if (writeRateLimited(lim.key, lim.max)) return apiError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many requests. Try again later.');
        recordWriteAttempt(lim.key);
      }
      return handleApi(req, res, url, body, user, token);
    }
    return handleStatic(req, res, url);
  } catch {
    if (!res.headersSent) return apiError(res, 400, 'BAD_REQUEST', 'Malformed request');
    return res.end();
  }
});

server.listen(PORT, () => {
  console.log(`PrimePropertys server on http://127.0.0.1:${PORT} db=${DB_PATH}`);
});
