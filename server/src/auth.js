import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

// Roles that may self-register. Admin-class roles are never self-assignable:
// creating an Admin/Super Admin/Support account must happen through an
// existing privileged account (Stage E admin tooling) or direct DB setup.
export const SELF_SERVICE_ROLES = ['Buyer', 'Seller', 'Owner', 'Agent', 'Builder', 'Investor'];
export const SESSION_COOKIE = 'pp_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [, saltHex, keyHex] = stored.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function isoIn(ms) {
  return new Date(Date.now() + ms).toISOString();
}

export function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

export function createSession(db, userId, ip, userAgent) {
  const token = randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)`).run(userId, sha256(token), ip || null, userAgent || null, isoIn(SESSION_TTL_MS));
  return token;
}

export function getSessionUser(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')`).get(sha256(token));
  if (!row || row.status !== 'active') return null;
  return publicUser(row);
}

export function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function revokeOtherSessions(db, userId, currentToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
    .run(userId, sha256(currentToken || ''));
}

export function createPasswordResetToken(db, userId) {
  db.prepare('UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE user_id = ? AND used_at IS NULL').run(userId);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, sha256(token), isoIn(RESET_TTL_MS));
  return token;
}

export function consumePasswordResetToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT * FROM password_reset_tokens
    WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`).get(sha256(token));
  if (!row) return null;
  db.prepare('UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE id = ?').run(row.id);
  return row.user_id;
}

export function createEmailVerificationToken(db, userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, sha256(token), isoIn(VERIFY_TTL_MS));
  return token;
}

export function verifyEmailToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT * FROM email_verification_tokens
    WHERE token_hash = ? AND expires_at > datetime('now')`).get(sha256(token));
  if (!row) return null;
  db.prepare(`UPDATE users SET email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(row.user_id);
  db.prepare('DELETE FROM email_verification_tokens WHERE id = ?').run(row.id);
  return row.user_id;
}

export function listPermissions(db, user) {
  if (!user) return [];
  return db.prepare(`SELECT p.name FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role = ? ORDER BY p.name`).all(user.role).map((r) => r.name);
}

export function hasPermission(db, user, permission) {
  return listPermissions(db, user).includes(permission);
}

/* Stage CRM: user directory for assignment UIs. Gated on users:manage
   (Admin / Super Admin) — never returns password hashes. */
export function listUsers(db, user) {
  if (!user) return { status: 401, error: { code: 'UNAUTHORIZED', message: 'Login required' } };
  if (!hasPermission(db, user, 'users:manage')) return { status: 403, error: { code: 'FORBIDDEN', message: 'Missing permission: users:manage' } };
  const rows = db.prepare(`SELECT id, email, full_name, role, status, email_verified_at, created_at
    FROM users ORDER BY role, full_name, id`).all();
  return { status: 200, body: { data: rows } };
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookieHeader(token, maxAgeSeconds) {
  const secure = process.env.SESSION_COOKIE_SECURE === '1' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

// Login throttling (in-memory, per IP+email): 5 failed attempts in 10
// minutes blocks further attempts with 429. Success clears the bucket.
const failures = new Map();
const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export function isLoginBlocked(ip, email) {
  const bucket = failures.get(`${ip}:${email}`);
  if (!bucket) return false;
  if (Date.now() - bucket.firstAt > WINDOW_MS) { failures.delete(`${ip}:${email}`); return false; }
  return bucket.count >= MAX_FAILS;
}

export function recordFailedLogin(ip, email) {
  const key = `${ip}:${email}`;
  const bucket = failures.get(key);
  if (!bucket || Date.now() - bucket.firstAt > WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: Date.now() });
  } else {
    bucket.count += 1;
  }
}

export function clearFailedLogins(ip, email) {
  failures.delete(`${ip}:${email}`);
}
