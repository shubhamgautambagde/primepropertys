import { hasPermission } from './auth.js';

// Offline/manual payment records (autopilot slice 1). No gateway is
// configured: creating a payment records a PENDING claim, and only
// staff with payments:manage can verify it. Nothing here charges a
// card, UPI id or bank account, and no status claims otherwise.

export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'wallet', 'emi', 'other'];

function err(status, code, message) {
  return { status, error: { code, message } };
}

function canManage(db, user) {
  return !!user && hasPermission(db, user, 'payments:manage');
}

function load(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id) || null;
}

function visible(db, user, p) {
  return !!user && (p.user_id === user.id || canManage(db, user));
}

function parsePage(url) {
  const q = url.searchParams;
  const limit = q.get('limit') === null ? 20 : Number(q.get('limit'));
  const offset = q.get('offset') === null ? 0 : Number(q.get('offset'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

export function createPayment(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const description = typeof b.description === 'string' ? b.description.trim() : '';
  const amountPaise = Number(b.amount_paise);
  const method = typeof b.method === 'string' ? b.method.trim() : 'upi';
  if (!description || description.length > 200) return err(400, 'INVALID_PARAMETER', 'description is required (up to 200 characters)');
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) return err(400, 'INVALID_PARAMETER', 'amount_paise must be a positive integer (paise, not rupees)');
  if (!PAYMENT_METHODS.includes(method)) return err(400, 'INVALID_PARAMETER', 'method must be one of: ' + PAYMENT_METHODS.join(', '));
  const reference = typeof b.reference === 'string' && b.reference.trim() ? b.reference.trim().slice(0, 100) : null;
  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO payments
      (user_id, description, amount_paise, method, reference)
      VALUES (?, ?, ?, ?, ?)`).run(user.id, description, amountPaise, method, reference);
    // Checkout also carries billing fields: save them as the user's
    // billing profile in the same transaction.
    if (b.billing && typeof b.billing === 'object') {
      const g = (k) => (typeof b.billing[k] === 'string' ? b.billing[k].trim().slice(0, 200) : '');
      db.prepare(`INSERT INTO billing_profiles
        (user_id, full_name, company, address, city, pincode, gstin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          full_name = excluded.full_name, company = excluded.company,
          address = excluded.address, city = excluded.city,
          pincode = excluded.pincode, gstin = excluded.gstin,
          updated_at = datetime('now')`)
        .run(user.id, g('full_name'), g('company'), g('address'), g('city'), g('pincode'), g('gstin'));
    }
    db.exec('COMMIT');
    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(r.lastInsertRowid));
    return { status: 201, body: { ok: true, data: row } };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function listPayments(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const status = url.searchParams.get('status');
  const where = [];
  const params = [];
  if (!canManage(db, user)) { where.push('user_id = ?'); params.push(user.id); }
  if (status) {
    if (!['pending', 'verified', 'rejected', 'refund_requested', 'refunded'].includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('status = ?'); params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM payments ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM payments ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getPayment(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || !visible(db, user, p)) return err(404, 'NOT_FOUND', 'Payment not found');
  return { status: 200, body: { ok: true, data: p } };
}

// Staff verification / refund decisions. Payer actions live in
// requestRefund; staff never verify their way around it.
export function updatePayment(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: payments:manage');
  const p = load(db, idText);
  if (!p) return err(404, 'NOT_FOUND', 'Payment not found');
  const b = body && typeof body === 'object' ? body : {};
  const next = typeof b.status === 'string' ? b.status.trim() : '';
  const allowed = {
    pending: ['verified', 'rejected'],
    refund_requested: ['refunded', 'rejected'],
  }[p.status] || [];
  if (!allowed.includes(next)) return err(400, 'INVALID_PARAMETER', `Cannot move payment from ${p.status} to ${next || '(none)'}`);
  // Rejecting a refund request returns the payment to verified (the
  // refund was declined, the original payment stands).
  const finalStatus = (p.status === 'refund_requested' && next === 'rejected') ? 'verified' : next;
  const extra = finalStatus === 'refunded' ? ", refunded_at = datetime('now')" : '';
  db.prepare(`UPDATE payments SET status = ?, verified_by = ?, verified_at = datetime('now'),
    updated_at = datetime('now') ${extra} WHERE id = ?`).run(finalStatus, user.id, p.id);
  return { status: 200, body: { ok: true, data: db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id) } };
}

export function requestRefund(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const p = load(db, idText);
  if (!p || p.user_id !== user.id) return err(404, 'NOT_FOUND', 'Payment not found');
  if (!['pending', 'verified'].includes(p.status)) return err(400, 'INVALID_PARAMETER', `Cannot request a refund for a ${p.status} payment`);
  const b = body && typeof body === 'object' ? body : {};
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  const refundPaise = Number(b.refund_amount_paise);
  const refundTo = typeof b.refund_to === 'string' ? b.refund_to.trim() : '';
  if (!reason || reason.length > 500) return err(400, 'INVALID_PARAMETER', 'reason is required (up to 500 characters)');
  if (!Number.isInteger(refundPaise) || refundPaise <= 0 || refundPaise > p.amount_paise) return err(400, 'INVALID_PARAMETER', 'refund_amount_paise must be positive and no more than the payment amount');
  if (!refundTo || refundTo.length > 200) return err(400, 'INVALID_PARAMETER', 'refund_to is required (up to 200 characters)');
  db.prepare(`UPDATE payments SET status = 'refund_requested', refund_reason = ?,
    refund_amount_paise = ?, refund_to = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(reason, refundPaise, refundTo, p.id);
  return { status: 200, body: { ok: true, data: db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id) } };
}

export function getBillingProfile(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const row = db.prepare('SELECT * FROM billing_profiles WHERE user_id = ?').get(user.id);
  return { status: 200, body: { ok: true, data: row || null } };
}

export function putBillingProfile(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const g = (k) => (typeof b[k] === 'string' ? b[k].trim().slice(0, 200) : '');
  if (!g('full_name')) return err(400, 'INVALID_PARAMETER', 'full_name is required');
  db.prepare(`INSERT INTO billing_profiles
    (user_id, full_name, company, address, city, pincode, gstin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name, company = excluded.company,
      address = excluded.address, city = excluded.city,
      pincode = excluded.pincode, gstin = excluded.gstin,
      updated_at = datetime('now')`)
    .run(user.id, g('full_name'), g('company'), g('address'), g('city'), g('pincode'), g('gstin'));
  return { status: 200, body: { ok: true, data: db.prepare('SELECT * FROM billing_profiles WHERE user_id = ?').get(user.id) } };
}
