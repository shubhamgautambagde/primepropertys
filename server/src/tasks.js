import { hasPermission } from './auth.js';

// Priority 2 — Staff Task Management. Visibility: creator, assignee,
// or tasks:view_any holders. Edits: creator, assignee (status and
// comments only — see below), or tasks:manage holders. Assignees may
// change status and comment, but not title, assignee, due date or
// priority; those are creator/manager edits.

function err(status, code, message) {
  return { status, error: { code, message } };
}
function parsePage(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}
function load(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM staff_tasks WHERE id = ?').get(id) || null;
}
function canSee(db, user, t) {
  if (!user) return false;
  if (hasPermission(db, user, 'tasks:view_any')) return true;
  return t.creator_id === user.id || t.assignee_id === user.id;
}
function canManage(db, user, t) {
  if (!user) return false;
  if (hasPermission(db, user, 'tasks:manage')) return true;
  return t.creator_id === user.id;
}
function activity(db, taskId, actorId, action, details) {
  db.prepare('INSERT INTO task_activity (task_id, actor_id, action, details) VALUES (?, ?, ?, ?)')
    .run(taskId, actorId || null, action, details || '');
}
const TRANSITIONS = {
  todo: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  done: ['todo'],
  cancelled: ['todo'],
};

export function createTask(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  // Creation is login-gated (no tasks:create permission exists in the
  // fixed matrix); the assignee must be an existing user, checked below.
  const b = body && typeof body === 'object' ? body : {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 300) return err(400, 'INVALID_PARAMETER', 'title is required (up to 300 characters)');
  const priority = b.priority || 'medium';
  if (!['low', 'medium', 'high', 'urgent'].includes(priority)) return err(400, 'INVALID_PARAMETER', 'priority must be low, medium, high or urgent');
  let assigneeId = null;
  if (b.assignee_id !== undefined && b.assignee_id !== null) {
    assigneeId = Number(b.assignee_id);
    if (!Number.isInteger(assigneeId) || !db.prepare('SELECT id FROM users WHERE id = ?').get(assigneeId)) {
      return err(400, 'INVALID_PARAMETER', 'assignee_id must be an existing user');
    }
  }
  const info = db.prepare(`INSERT INTO staff_tasks (title, description, creator_id, assignee_id, due_date, priority)
    VALUES (?, ?, ?, ?, ?, ?)`).run(title,
    typeof b.description === 'string' ? b.description.slice(0, 5000) : '', user.id, assigneeId,
    typeof b.due_date === 'string' ? b.due_date.slice(0, 30) : null, priority);
  const id = Number(info.lastInsertRowid);
  activity(db, id, user.id, 'created', title);
  return { status: 201, body: db.prepare('SELECT * FROM staff_tasks WHERE id = ?').get(id) };
}

export function listTasks(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const q = url.searchParams;
  const where = [];
  const params = [];
  if (!hasPermission(db, user, 'tasks:view_any')) {
    where.push('(creator_id = ? OR assignee_id = ?)'); params.push(user.id, user.id);
  }
  if (q.get('status')) {
    if (!['todo', 'in_progress', 'blocked', 'done', 'cancelled'].includes(q.get('status'))) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('status = ?'); params.push(q.get('status'));
  }
  if (q.get('priority')) { where.push('priority = ?'); params.push(q.get('priority')); }
  if (q.get('assignee_id')) { where.push('assignee_id = ?'); params.push(Number(q.get('assignee_id'))); }
  if (q.get('overdue') === '1') {
    where.push("due_date IS NOT NULL AND due_date < date('now') AND status NOT IN ('done','cancelled')");
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM staff_tasks ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM staff_tasks ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getTask(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const t = load(db, idText);
  if (!t || !canSee(db, user, t)) return err(404, 'NOT_FOUND', 'Task not found');
  t.comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY id').all(t.id);
  t.activity = db.prepare('SELECT * FROM task_activity WHERE task_id = ? ORDER BY id').all(t.id);
  return { status: 200, body: t };
}

export function updateTask(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const t = load(db, idText);
  if (!t || !canSee(db, user, t)) return err(404, 'NOT_FOUND', 'Task not found');
  const manager = canManage(db, user, t);
  const isAssignee = t.assignee_id === user.id;
  if (!manager && !isAssignee) return err(403, 'FORBIDDEN', 'You cannot modify this task');
  const b = body && typeof body === 'object' ? body : {};
  const updates = {};
  if (b.status !== undefined) {
    if (!TRANSITIONS[t.status].includes(b.status)) {
      return err(400, 'INVALID_PARAMETER', `Cannot move task from ${t.status} to ${b.status}`);
    }
    if ((t.status === 'done' || t.status === 'cancelled') && b.status === 'todo' && !manager) {
      return err(403, 'FORBIDDEN', 'Only a manager or the creator can reopen a task');
    }
    updates.status = b.status;
    updates.completed_at = b.status === 'done' ? "datetime('now')" : null;
  }
  if (manager) {
    if (b.title !== undefined) updates.title = typeof b.title === 'string' ? b.title.slice(0, 300) : '';
    if (b.description !== undefined) updates.description = typeof b.description === 'string' ? b.description.slice(0, 5000) : '';
    if (b.priority !== undefined) {
      if (!['low', 'medium', 'high', 'urgent'].includes(b.priority)) return err(400, 'INVALID_PARAMETER', 'priority must be low, medium, high or urgent');
      updates.priority = b.priority;
    }
    if (b.due_date !== undefined) updates.due_date = typeof b.due_date === 'string' ? b.due_date.slice(0, 30) : null;
    if (b.assignee_id !== undefined) {
      if (b.assignee_id !== null && !db.prepare('SELECT id FROM users WHERE id = ?').get(Number(b.assignee_id))) {
        return err(400, 'INVALID_PARAMETER', 'assignee_id must be an existing user');
      }
      updates.assignee_id = b.assignee_id === null ? null : Number(b.assignee_id);
    }
  } else if (b.title !== undefined || b.assignee_id !== undefined || b.due_date !== undefined || b.priority !== undefined) {
    return err(403, 'FORBIDDEN', 'Assignees may change status and comment only');
  }
  if (!Object.keys(updates).length) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  const sets = Object.keys(updates).map((k) => (k === 'completed_at' && updates[k] === "datetime('now')" ? 'completed_at = datetime(\'now\')' : `${k} = ?`)).join(', ');
  const values = Object.entries(updates).filter(([k]) => !(k === 'completed_at' && updates[k] === "datetime('now')")).map(([, v]) => v);
  db.prepare(`UPDATE staff_tasks SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, t.id);
  activity(db, t.id, user.id, 'updated', JSON.stringify(Object.keys(updates)));
  return getTask(db, user, idText);
}

export function addComment(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const t = load(db, idText);
  if (!t || !canSee(db, user, t)) return err(404, 'NOT_FOUND', 'Task not found');
  const b = body && typeof body === 'object' ? body : {};
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (!text || text.length > 5000) return err(400, 'INVALID_PARAMETER', 'body is required (up to 5000 characters)');
  const info = db.prepare('INSERT INTO task_comments (task_id, author_id, body) VALUES (?, ?, ?)').run(t.id, user.id, text);
  activity(db, t.id, user.id, 'commented', '');
  return { status: 201, body: db.prepare('SELECT * FROM task_comments WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function taskStats(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const scope = hasPermission(db, user, 'tasks:view_any') ? { clause: '', params: [] }
    : { clause: 'WHERE (creator_id = ? OR assignee_id = ?)', params: [user.id, user.id] };
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS n FROM staff_tasks ${scope.clause} GROUP BY status`).all(...scope.params);
  const overdue = db.prepare(`SELECT COUNT(*) AS n FROM staff_tasks ${scope.clause ? `${scope.clause} AND ` : 'WHERE '}due_date IS NOT NULL AND due_date < date('now') AND status NOT IN ('done','cancelled')`).get(...scope.params).n;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM staff_tasks ${scope.clause}`).get(...scope.params).n;
  return { status: 200, body: { total, overdue, by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) } };
}
