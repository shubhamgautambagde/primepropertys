import { isValidEmail } from './auth.js';

// Newsletter subscriptions (brief Phase C). Subscribing stores a consent
// record; it never claims an email was sent, because no email provider
// is configured. Unsubscribe answers neutrally so it cannot be used to
// probe whether an address is subscribed.

function err(status, code, message) {
  return { status, error: { code, message } };
}

// Public-submit rate limit: 20 attempts/hour per IP (same window style
// as the contact and inquiry limiters).
const attempts = new Map();
export function newsletterRateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 3600_000);
  attempts.set(ip, list);
  return list.length >= 20;
}
export function recordNewsletterAttempt(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

export function subscribe(db, body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || !isValidEmail(email)) return err(400, 'INVALID_PARAMETER', 'email is required and must be valid');
  const existing = db.prepare('SELECT * FROM newsletter_subscriptions WHERE email = ?').get(email);
  if (existing && existing.status === 'subscribed') {
    return { status: 200, body: { ok: true, already_subscribed: true } };
  }
  if (existing) {
    db.prepare(`UPDATE newsletter_subscriptions
      SET status = 'subscribed', consent_at = datetime('now'), unsubscribed_at = NULL,
          updated_at = datetime('now') WHERE id = ?`).run(existing.id);
    return { status: 200, body: { ok: true, resubscribed: true } };
  }
  const r = db.prepare(`INSERT INTO newsletter_subscriptions (email, status)
    VALUES (?, 'subscribed')`).run(email);
  const row = db.prepare('SELECT id, email, status, consent_at FROM newsletter_subscriptions WHERE id = ?')
    .get(Number(r.lastInsertRowid));
  return { status: 201, body: { ok: true, data: row } };
}

export function unsubscribe(db, body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || !isValidEmail(email)) return err(400, 'INVALID_PARAMETER', 'email is required and must be valid');
  db.prepare(`UPDATE newsletter_subscriptions
    SET status = 'unsubscribed', unsubscribed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE email = ? AND status = 'subscribed'`).run(email);
  // Neutral on purpose: the same response whether or not the address
  // was subscribed, so the endpoint cannot enumerate subscribers.
  return { status: 200, body: { ok: true, message: 'If this email was subscribed, it has been unsubscribed.' } };
}
