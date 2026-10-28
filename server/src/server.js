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

const here = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = resolve(process.env.STATIC_ROOT || join(here, '..', '..'));
const DB_PATH = process.env.DATABASE_PATH || join(here, '..', 'data', 'primepropertys.db');
const PORT = Number(process.env.PORT || 8902);
const EMAIL_BACKEND = process.env.EMAIL_BACKEND || 'console';

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
  sendBody(res, res._ppReq, status, 'application/json; charset=utf-8', JSON.stringify(obj), extraHeaders);
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
  if (q.get('property_type')) { where.push('property_type = ?'); params.push(q.get('property_type')); }
  if (q.get('listing_type')) { where.push('listing_type = ?'); params.push(q.get('listing_type')); }
  if (minPrice !== null) { where.push('price_inr >= ?'); params.push(minPrice); }
  if (maxPrice !== null) { where.push('price_inr <= ?'); params.push(maxPrice); }
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
      { 'Set-Cookie': sessionCookieHeader(session, 604800) });
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
      { 'Set-Cookie': sessionCookieHeader(session, 604800) });
  }
  if (path === '/api/auth/logout' && req.method === 'POST') {
    deleteSession(db, token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookieHeader() });
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
    if (EMAIL_BACKEND !== 'console') {
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
    if (EMAIL_BACKEND !== 'console') {
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
    return sendJson(res, 200, r.body);
  }
  if (path === '/api/properties/mine' && m === 'GET') return respond(res, P.listMine(db, user, url));
  if (path === '/api/saved' && m === 'GET') return respond(res, P.listSaved(db, user, url));
  if (path === '/api/recently-viewed' && m === 'GET') return respond(res, P.listRecent(db, user, url));
  const similar = path.match(/^\/api\/properties\/([^/]+)\/similar$/);
  if (similar && m === 'GET') return respond(res, P.similarProperties(db, user, similar[1]));
  const pub = path.match(/^\/api\/properties\/([^/]+)\/publish$/);
  if (pub && m === 'POST') return respond(res, P.publishProperty(db, user, pub[1]));
  const unpub = path.match(/^\/api\/properties\/([^/]+)\/unpublish$/);
  if (unpub && m === 'POST') return respond(res, P.unpublishProperty(db, user, unpub[1]));
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

function handleApi(req, res, url, body, user, token) {
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
  let rel = decodeURIComponent(url.pathname);
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
  if (req.method === 'HEAD') {
    // Same headers a GET would send (including Content-Encoding when
    // the body would be gzipped), but no body.
    const headers = { 'Content-Type': contentType, ...SECURITY_HEADERS };
    const compressible = /^(text\/|application\/(json|javascript)|image\/svg\+xml)/.test(contentType);
    if (compressible && data.length >= 1024 && acceptsGzip(req)) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
    }
    res.writeHead(200, headers);
    return res.end();
  }
  return sendBody(res, req, 200, contentType, data);
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
      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
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
