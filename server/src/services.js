import { hasPermission } from './auth.js';

// Home service requests (post-Stage-J slice). Visibility
// mirrors tickets: the requester, the assignee, and
// services:manage holders (Admin, Super Admin, Support).
// Status changes are manage/assignee-only, except that a
// requester may cancel their own request from any open
// state. Scheduling sets the staff-confirmed visit time;
// the preferred date/slot stay the user's original ask.
export const SERVICE_STATUSES = ['requested', 'assigned', 'scheduled', 'in_progress', 'completed', 'cancelled'];
export const SERVICE_URGENCIES = ['low', 'normal', 'high'];

const TRANSITIONS = {
  requested: ['assigned', 'cancelled'],
  assigned: ['scheduled', 'cancelled'],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
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

function loadRequest(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare(`SELECT s.*, u.full_name AS requester_name,
    u.email AS requester_email, a.full_name AS assignee_name
    FROM service_requests s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users a ON a.id = s.assigned_to
    WHERE s.id = ?`).get(id) || null;
}

function canSee(db, user, req) {
  if (!user) return false;
  if (hasPermission(db, user, 'services:manage')) return true;
  if (req.user_id === user.id) return true;
  return req.assigned_to === user.id;
}

function canManage(db, user, req) {
  if (!user) return false;
  if (hasPermission(db, user, 'services:manage')) return true;
  return req.assigned_to === user.id;
}

function visibilityClause(db, user) {
  if (hasPermission(db, user, 'services:manage')) return { clause: '', params: [] };
  return {
    clause: 'WHERE (s.user_id = ? OR s.assigned_to = ?)',
    params: [user.id, user.id],
  };
}

function reqString(b, field, max, required) {
  const v = typeof b[field] === 'string' ? b[field].trim() : '';
  if (required && !v) return null;
  if (v.length > max) return null;
  return v;
}

export function createServiceRequest(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const category = reqString(b, 'category', 100, true);
  const issueType = reqString(b, 'issue_type', 100, true);
  const address = reqString(b, 'address', 500, true);
  const preferredDate = reqString(b, 'preferred_date', 20, true);
  const timeSlot = reqString(b, 'time_slot', 50, true);
  const description = reqString(b, 'description', 2000, true);
  if (!category || !issueType || !address || !preferredDate || !timeSlot || !description) {
    return err(400, 'INVALID_PARAMETER', 'category, issue_type, address, preferred_date, time_slot, and description are required');
  }
  if (Number.isNaN(Date.parse(preferredDate))) return err(400, 'INVALID_PARAMETER', 'preferred_date must be a valid date');
  const urgency = typeof b.urgency === 'string' ? b.urgency : 'normal';
  if (!SERVICE_URGENCIES.includes(urgency)) return err(400, 'INVALID_PARAMETER', 'urgency must be low, normal, or high');
  const info = db.prepare(`INSERT INTO service_requests
    (user_id, category, issue_type, address, preferred_date, time_slot, urgency, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested')`)
    .run(user.id, category, issueType, address, preferredDate, timeSlot, urgency, description);
  return { status: 201, body: loadRequest(db, info.lastInsertRowid) };
}

export function listServiceRequests(db, user, url) {
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
    if (!SERVICE_STATUSES.includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('s.status = ?');
    params.push(status);
  }
  const category = q.get('category');
  if (category) {
    where.push('s.category = ?');
    params.push(category);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM service_requests s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users a ON a.id = s.assigned_to`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT s.*, u.full_name AS requester_name,
    u.email AS requester_email, a.full_name AS assignee_name
    ${from} ${clause} ORDER BY s.id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getServiceRequest(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const req = loadRequest(db, idText);
  if (!req || !canSee(db, user, req)) return err(404, 'NOT_FOUND', 'Service request not found');
  return { status: 200, body: req };
}

export function updateServiceRequest(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const req = loadRequest(db, idText);
  if (!req || !canSee(db, user, req)) return err(404, 'NOT_FOUND', 'Service request not found');
  const b = body && typeof body === 'object' ? body : {};
  const sets = [];
  const params = [];
  const isManager = canManage(db, user, req);
  const isOwn = req.user_id === user.id;

  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !SERVICE_STATUSES.includes(b.status)) {
      return err(400, 'INVALID_PARAMETER', 'Invalid status');
    }
    const cancellingOwn = b.status === 'cancelled' && isOwn && req.status !== 'completed' && req.status !== 'cancelled';
    if (!isManager && !cancellingOwn) {
      return err(403, 'FORBIDDEN', 'You cannot change this request\'s status');
    }
    if (!TRANSITIONS[req.status].includes(b.status)) {
      return err(400, 'INVALID_STATE', `Cannot move a ${req.status} request to ${b.status}`);
    }
    sets.push('status = ?');
    params.push(b.status);
    if (b.status === 'completed') sets.push('completed_at = datetime(\'now\')');
  }
  if (b.scheduled_at !== undefined) {
    if (!isManager) return err(403, 'FORBIDDEN', 'You cannot schedule this request');
    if (req.status !== 'assigned' && req.status !== 'scheduled') {
      return err(400, 'INVALID_STATE', `Cannot schedule a ${req.status} request`);
    }
    const s = typeof b.scheduled_at === 'string' ? b.scheduled_at.trim() : '';
    if (!s || Number.isNaN(Date.parse(s))) return err(400, 'INVALID_PARAMETER', 'scheduled_at must be a valid date/time');
    if (Date.parse(s) < Date.now()) return err(400, 'INVALID_PARAMETER', 'scheduled_at must be in the future');
    sets.push('scheduled_at = ?');
    params.push(s);
    if (req.status === 'assigned') {
      sets.push('status = \'scheduled\'');
    }
  }
  if (!sets.length) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  sets.push('updated_at = datetime(\'now\')');
  db.prepare(`UPDATE service_requests SET ${sets.join(', ')} WHERE id = ?`).run(...params, req.id);
  return { status: 200, body: loadRequest(db, idText) };
}

export function assignServiceRequest(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'services:manage')) return err(403, 'FORBIDDEN', 'Missing permission: services:manage');
  const req = loadRequest(db, idText);
  if (!req) return err(404, 'NOT_FOUND', 'Service request not found');
  const assigneeId = Number(body.assigned_to);
  if (!Number.isInteger(assigneeId)) return err(400, 'INVALID_PARAMETER', 'assigned_to is required');
  const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assigneeId);
  if (!assignee) return err(400, 'INVALID_PARAMETER', 'Assigned user does not exist');
  const sets = ['assigned_to = ?', 'assigned_at = datetime(\'now\')'];
  if (req.status === 'requested') sets.push('status = \'assigned\'');
  db.prepare(`UPDATE service_requests SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(assigneeId, req.id);
  return { status: 200, body: loadRequest(db, idText) };
}

/* Stats use the list page's own card language: In Progress
   covers assigned + scheduled + in_progress; Resolved is
   completed; Closed is cancelled. */
export function serviceRequestStats(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const vis = visibilityClause(db, user);
  const from = `FROM service_requests s`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${vis.clause}`).get(...vis.params).n;
  const rows = db.prepare(`SELECT s.status, COUNT(*) AS n ${from} ${vis.clause} GROUP BY s.status`).all(...vis.params);
  const byStatus = {};
  for (const s of SERVICE_STATUSES) byStatus[s] = 0;
  for (const r of rows) byStatus[r.status] = r.n;
  return {
    status: 200,
    body: {
      total,
      by_status: byStatus,
      in_progress: byStatus.assigned + byStatus.scheduled + byStatus.in_progress,
      resolved: byStatus.completed,
      closed: byStatus.cancelled,
    },
  };
}
