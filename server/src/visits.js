import { hasPermission } from './auth.js';

// Visit-booking core (post-Stage-J slice). A visit is a scheduled
// viewing of a published property, requested by a logged-in user.
// Visibility mirrors leads: the requester, the property owner,
// and visits:manage holders (Admin, Super Admin) can see a visit.
// Status changes are owner/manage-only, except that a requester
// may cancel their own requested/confirmed visit. Feedback is
// only accepted once a visit is completed.
export const VISIT_STATUSES = ['requested', 'confirmed', 'rejected', 'completed', 'cancelled'];

const TRANSITIONS = {
  requested: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  cancelled: [],
};

function err(status, code, message) {
  return { status, error: { code, message } };
}

function parsePage(url, maxLimit = 100) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit ||
      !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

function loadVisit(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare(`SELECT v.*, u.full_name AS requester_name,
    u.email AS requester_email, p.title AS property_title,
    p.city AS property_city, p.owner_id AS property_owner_id
    FROM site_visits v
    JOIN users u ON u.id = v.user_id
    JOIN properties p ON p.id = v.property_id
    WHERE v.id = ?`).get(id) || null;
}

function canSee(db, user, visit) {
  if (!user) return false;
  if (hasPermission(db, user, 'visits:manage')) return true;
  if (visit.user_id === user.id) return true;
  if (visit.assigned_to === user.id) return true;
  return visit.property_owner_id === user.id;
}

/* Visibility filter shared by list/stats/analytics: managers see
   everything; everyone else sees their own requests, visits on
   their own properties, and visits assigned to them. */
function visibilityClause(db, user) {
  if (hasPermission(db, user, 'visits:manage')) return { clause: '', params: [] };
  return {
    clause: 'WHERE (v.user_id = ? OR p.owner_id = ? OR v.assigned_to = ?)',
    params: [user.id, user.id, user.id],
  };
}

function canManage(db, user, visit) {
  if (!user) return false;
  if (hasPermission(db, user, 'visits:manage')) return true;
  return visit.property_owner_id === user.id;
}

export function requestVisit(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const propertyId = Number(b.property_id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return err(400, 'INVALID_PARAMETER', 'property_id is required');
  const prop = db.prepare(`SELECT * FROM properties WHERE id = ? AND status = 'published' AND deleted_at IS NULL`).get(propertyId);
  if (!prop) return err(404, 'NOT_FOUND', 'Property not found or not published');
  const scheduled = typeof b.scheduled_at === 'string' ? b.scheduled_at.trim() : '';
  if (!scheduled || Number.isNaN(Date.parse(scheduled))) return err(400, 'INVALID_PARAMETER', 'scheduled_at must be a valid date/time');
  if (Date.parse(scheduled) < Date.now()) return err(400, 'INVALID_PARAMETER', 'scheduled_at must be in the future');
  const notes = typeof b.notes === 'string' ? b.notes : '';
  if (notes.length > 1000) return err(400, 'INVALID_PARAMETER', 'notes must be up to 1000 characters');
  const info = db.prepare(`INSERT INTO site_visits
    (property_id, user_id, scheduled_at, notes, status)
    VALUES (?, ?, ?, ?, 'requested')`).run(propertyId, user.id, scheduled, notes);
  return { status: 201, body: loadVisit(db, info.lastInsertRowid) };
}

export function listVisits(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const q = url.searchParams;
  const vis = visibilityClause(db, user);
  const where = [];
  const params = [...vis.params];
  if (vis.clause) where.push(vis.clause.replace(/^WHERE /, ''));
  const status = q.get('status');
  if (status) {
    if (!VISIT_STATUSES.includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('v.status = ?');
    params.push(status);
  }
  const propertyId = q.get('property_id');
  if (propertyId !== null) {
    const n = Number(propertyId);
    if (!Number.isInteger(n)) return err(400, 'INVALID_PARAMETER', 'property_id must be an integer');
    where.push('v.property_id = ?');
    params.push(n);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM site_visits v
    JOIN users u ON u.id = v.user_id
    JOIN properties p ON p.id = v.property_id`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT v.*, u.full_name AS requester_name,
    u.email AS requester_email, p.title AS property_title,
    p.city AS property_city, p.owner_id AS property_owner_id
    ${from} ${clause} ORDER BY v.scheduled_at ASC, v.id ASC
    LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getVisit(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const visit = loadVisit(db, idText);
  if (!visit || !canSee(db, user, visit)) return err(404, 'NOT_FOUND', 'Visit not found');
  return { status: 200, body: visit };
}

export function updateVisit(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const visit = loadVisit(db, idText);
  if (!visit || !canSee(db, user, visit)) return err(404, 'NOT_FOUND', 'Visit not found');
  const b = body && typeof body === 'object' ? body : {};
  const sets = [];
  const params = [];
  const isManager = canManage(db, user, visit);
  const isOwn = visit.user_id === user.id;

  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !VISIT_STATUSES.includes(b.status)) {
      return err(400, 'INVALID_PARAMETER', 'Invalid status');
    }
    const cancellingOwn = b.status === 'cancelled' && isOwn &&
      (visit.status === 'requested' || visit.status === 'confirmed');
    if (!isManager && !cancellingOwn) {
      return err(403, 'FORBIDDEN', 'You cannot change this visit\'s status');
    }
    if (!TRANSITIONS[visit.status].includes(b.status)) {
      return err(400, 'INVALID_STATE', `Cannot move a ${visit.status} visit to ${b.status}`);
    }
    sets.push('status = ?');
    params.push(b.status);
  }
  if (b.scheduled_at !== undefined) {
    if (!isManager && !isOwn) return err(403, 'FORBIDDEN', 'You cannot reschedule this visit');
    if (visit.status !== 'requested' && visit.status !== 'confirmed') {
      return err(400, 'INVALID_STATE', `Cannot reschedule a ${visit.status} visit`);
    }
    const s = typeof b.scheduled_at === 'string' ? b.scheduled_at.trim() : '';
    if (!s || Number.isNaN(Date.parse(s))) return err(400, 'INVALID_PARAMETER', 'scheduled_at must be a valid date/time');
    if (Date.parse(s) < Date.now()) return err(400, 'INVALID_PARAMETER', 'scheduled_at must be in the future');
    sets.push('scheduled_at = ?', 'rescheduled_at = datetime(\'now\')');
    params.push(s);
  }
  if (b.feedback !== undefined || b.rating !== undefined) {
    if (visit.status !== 'completed') {
      return err(400, 'INVALID_STATE', 'Feedback is only accepted on completed visits');
    }
    if (b.feedback !== undefined) {
      if (typeof b.feedback !== 'string' || b.feedback.length > 1000) {
        return err(400, 'INVALID_PARAMETER', 'feedback must be up to 1000 characters');
      }
      sets.push('feedback = ?');
      params.push(b.feedback);
    }
    if (b.rating !== undefined) {
      const r = Number(b.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return err(400, 'INVALID_PARAMETER', 'rating must be an integer from 1 to 5');
      }
      sets.push('rating = ?');
      params.push(r);
    }
  }
  if (!sets.length) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  sets.push('updated_at = datetime(\'now\')');
  db.prepare(`UPDATE site_visits SET ${sets.join(', ')} WHERE id = ?`).run(...params, visit.id);
  return { status: 200, body: loadVisit(db, visit.id) };
}

export function visitStats(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const vis = visibilityClause(db, user);
  const from = `FROM site_visits v JOIN properties p ON p.id = v.property_id`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${vis.clause}`).get(...vis.params).n;
  const rows = db.prepare(`SELECT v.status, COUNT(*) AS n ${from} ${vis.clause} GROUP BY v.status`).all(...vis.params);
  const byStatus = {};
  for (const s of VISIT_STATUSES) byStatus[s] = 0;
  for (const r of rows) byStatus[r.status] = r.n;
  return { status: 200, body: { total, by_status: byStatus } };
}

export function assignVisit(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'visits:manage')) return err(403, 'FORBIDDEN', 'Missing permission: visits:manage');
  const visit = loadVisit(db, idText);
  if (!visit) return err(404, 'NOT_FOUND', 'Visit not found');
  const assigneeId = Number(body.assigned_to);
  if (!Number.isInteger(assigneeId)) return err(400, 'INVALID_PARAMETER', 'assigned_to is required');
  const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assigneeId);
  if (!assignee) return err(400, 'INVALID_PARAMETER', 'Assigned user does not exist');
  db.prepare(`UPDATE site_visits SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?`).run(assigneeId, visit.id);
  return { status: 200, body: loadVisit(db, idText) };
}

/* Analytics, computed from existing visits only (no product
   decisions, like the CRM reports slice). Rates are shares of
   the visible total, rounded to one decimal. Visits carry no
   source field, so no by-source breakdown is claimed. */
export function visitAnalytics(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const vis = visibilityClause(db, user);
  const from = `FROM site_visits v JOIN properties p ON p.id = v.property_id`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${vis.clause}`).get(...vis.params).n;
  const rows = db.prepare(`SELECT v.status, COUNT(*) AS n ${from} ${vis.clause} GROUP BY v.status`).all(...vis.params);
  const byStatus = {};
  for (const s of VISIT_STATUSES) byStatus[s] = 0;
  for (const r of rows) byStatus[r.status] = r.n;
  const rate = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const byProperty = db.prepare(`SELECT p.title AS property_title, p.city AS property_city,
    COUNT(*) AS n ${from} ${vis.clause} GROUP BY v.property_id ORDER BY n DESC LIMIT 5`).all(...vis.params);
  const byAssignee = db.prepare(`SELECT u.full_name AS name, u.email AS email,
    COUNT(*) AS total, SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) AS completed
    ${from} JOIN users u ON u.id = v.assigned_to
    ${vis.clause ? `${vis.clause} AND v.assigned_to IS NOT NULL` : 'WHERE v.assigned_to IS NOT NULL'}
    GROUP BY v.assigned_to ORDER BY total DESC`).all(...vis.params);
  const now = Date.now();
  const week = now + 7 * 24 * 3600 * 1000;
  const upcomingRows = db.prepare(`SELECT v.scheduled_at ${from} ${vis.clause}`).all(...vis.params);
  const upcoming7d = upcomingRows.filter((r) => {
    const t = Date.parse(r.scheduled_at);
    return t >= now && t <= week;
  }).length;
  return {
    status: 200,
    body: {
      total,
      by_status: byStatus,
      approved_rate: rate(byStatus.confirmed),
      completed_rate: rate(byStatus.completed),
      cancelled_rate: rate(byStatus.cancelled),
      upcoming_7d: upcoming7d,
      by_property: byProperty,
      by_assignee: byAssignee,
    },
  };
}
