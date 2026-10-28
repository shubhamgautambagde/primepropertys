import { hasPermission, isValidEmail } from './auth.js';

// General contact messages (Stage H, Phase 1). Unlike property inquiries
// (Stage G), these are not tied to a published property, so they live in
// their own table. Nothing here sends an external message.

export const CONTACT_SUBJECTS = [
  'Buying a property',
  'Selling / renting a property',
  'Payments & plans',
  'Technical issue',
  'Other',
];

function err(status, code, message) {
  return { status, error: { code, message } };
}

// Public-submit rate limit: 20 messages/hour per IP (same window style as
// the inquiry limiter in leads.js).
const attempts = new Map();
export function contactRateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 3600_000);
  attempts.set(ip, list);
  return list.length >= 20;
}
export function recordContactAttempt(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

export function createContactMessage(db, body) {
  const b = body && typeof body === 'object' ? body : {};
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  const digits = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '') : '';
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!fullName || fullName.length > 100) return err(400, 'INVALID_PARAMETER', 'full_name is required (up to 100 characters)');
  if (!email || !isValidEmail(email)) return err(400, 'INVALID_PARAMETER', 'email is required and must be valid');
  if (digits.length < 10 || digits.length > 15) return err(400, 'INVALID_PARAMETER', 'phone must contain 10-15 digits');
  if (!CONTACT_SUBJECTS.includes(subject)) return err(400, 'INVALID_PARAMETER', 'subject must be selected from the list');
  if (!message || message.length > 2000) return err(400, 'INVALID_PARAMETER', 'message is required (up to 2000 characters)');
  const r = db.prepare(`INSERT INTO contact_messages
    (full_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`)
    .run(fullName, email, digits, subject, message);
  const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(Number(r.lastInsertRowid));
  return { status: 201, body: { ok: true, data: row } };
}

export function listContactMessages(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'contact:view')) return err(403, 'FORBIDDEN', 'You do not have permission to view contact messages');
  const q = url.searchParams;
  const limit = Number(q.get('limit') || 20);
  const offset = Number(q.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get().n;
  const data = db.prepare(`SELECT * FROM contact_messages
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  return { status: 200, body: { data, pagination: { limit, offset, total } } };
}
