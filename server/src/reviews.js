import { hasPermission } from './auth.js';
import { logAudit } from './rbac.js';

// Priority 2 — Property Reviews. Reviews start 'pending' and are
// invisible to the public until a moderator approves them.
// Aggregation (count/average) uses APPROVED reviews only.
// 'verified' is set only when a completed site visit for that
// user+property exists (and the reviewer is not the owner); it is
// never claimed from an enquiry or a lead alone.

function err(status, code, message) {
  return { status, error: { code, message } };
}
function parsePage(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}
function loadProperty(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL').get(id) || null;
}

export function createReview(db, user, propertyIdText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const prop = loadProperty(db, propertyIdText);
  if (!prop || prop.status !== 'published') return err(404, 'NOT_FOUND', 'Property not found');
  if (prop.owner_id === user.id) return err(403, 'FORBIDDEN', 'You cannot review your own property');
  const b = body && typeof body === 'object' ? body : {};
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err(400, 'INVALID_PARAMETER', 'rating must be an integer 1-5');
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text || text.length > 5000) return err(400, 'INVALID_PARAMETER', 'text is required (up to 5000 characters)');
  const verified = db.prepare(`SELECT id FROM site_visits WHERE property_id = ? AND user_id = ? AND status = 'completed'`)
    .get(prop.id, user.id) ? 1 : 0;
  try {
    const info = db.prepare(`INSERT INTO property_reviews (property_id, user_id, rating, text, verified)
      VALUES (?, ?, ?, ?, ?)`).run(prop.id, user.id, rating, text, verified);
    return { status: 201, body: db.prepare('SELECT * FROM property_reviews WHERE id = ?').get(Number(info.lastInsertRowid)) };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err(409, 'REVIEW_EXISTS', 'You already have a review for this property');
    throw e;
  }
}

export function listReviews(db, user, propertyIdText, url) {
  const prop = loadProperty(db, propertyIdText);
  if (!prop || prop.status !== 'published') return err(404, 'NOT_FOUND', 'Property not found');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const moderator = !!user && hasPermission(db, user, 'reviews:moderate');
  const status = url.searchParams.get('status');
  let where = 'property_id = ?';
  const params = [prop.id];
  if (status) {
    if (!moderator) return err(403, 'FORBIDDEN', 'Review status filtering is moderator-only');
    if (!['pending', 'approved', 'rejected'].includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where += ' AND status = ?'; params.push(status);
  } else if (!moderator) {
    where += " AND status = 'approved'";
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM property_reviews WHERE ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM property_reviews WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  const agg = db.prepare(`SELECT COUNT(*) AS count, AVG(rating) AS average FROM property_reviews
    WHERE property_id = ? AND status = 'approved'`).get(prop.id);
  return { status: 200, body: { data: rows, pagination: { ...page, total },
    aggregation: { approved_count: agg.count, average_rating: agg.average === null ? null : Math.round(agg.average * 100) / 100 } } };
}

export function moderateReview(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'reviews:moderate')) return err(403, 'FORBIDDEN', 'Missing permission: reviews:moderate');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Review not found');
  const row = db.prepare('SELECT * FROM property_reviews WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Review not found');
  const status = body && body.status;
  if (!['approved', 'rejected'].includes(status)) return err(400, 'INVALID_PARAMETER', 'status must be approved or rejected');
  if (row.status !== 'pending') return err(400, 'INVALID_PARAMETER', `Cannot moderate a review in status ${row.status}`);
  db.prepare(`UPDATE property_reviews SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  logAudit(db, user.id, `review.${status}`, 'property_review', id, `property:${row.property_id}`);
  return { status: 200, body: db.prepare('SELECT * FROM property_reviews WHERE id = ?').get(id) };
}

export function reportReview(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Review not found');
  const row = db.prepare('SELECT * FROM property_reviews WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Review not found');
  const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 500) return err(400, 'INVALID_PARAMETER', 'reason is required (up to 500 characters)');
  try {
    db.prepare('INSERT INTO review_reports (review_id, reporter_id, reason) VALUES (?, ?, ?)').run(id, user.id, reason);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err(409, 'REPORT_EXISTS', 'You have already reported this review');
    throw e;
  }
  return { status: 201, body: { ok: true } };
}

export function deleteReview(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Review not found');
  const row = db.prepare('SELECT * FROM property_reviews WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Review not found');
  if (row.user_id !== user.id && !hasPermission(db, user, 'reviews:moderate')) {
    return err(403, 'FORBIDDEN', 'You cannot delete this review');
  }
  db.prepare('DELETE FROM property_reviews WHERE id = ?').run(id);
  return { status: 200, body: { ok: true } };
}
