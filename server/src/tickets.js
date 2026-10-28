import { hasPermission } from './auth.js';

// Support tickets (post-Stage-J slice). Visibility mirrors
// visits: the requester, the assignee, and tickets:manage
// holders (Admin, Super Admin, Support) can see a ticket.
// Status changes are manage/assignee-only, except that a
// requester may close their own open/in-progress ticket.
// Replies are open to anyone who can see the ticket.
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES = ['low', 'medium', 'high'];

const TRANSITIONS = {
  open: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: [],
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

function loadTicket(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare(`SELECT t.*, u.full_name AS requester_name,
    u.email AS requester_email, a.full_name AS assignee_name
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN users a ON a.id = t.assigned_to
    WHERE t.id = ?`).get(id) || null;
}

function canSee(db, user, ticket) {
  if (!user) return false;
  if (hasPermission(db, user, 'tickets:manage')) return true;
  if (ticket.user_id === user.id) return true;
  return ticket.assigned_to === user.id;
}

function canManage(db, user, ticket) {
  if (!user) return false;
  if (hasPermission(db, user, 'tickets:manage')) return true;
  return ticket.assigned_to === user.id;
}

function visibilityClause(db, user) {
  if (hasPermission(db, user, 'tickets:manage')) return { clause: '', params: [] };
  return {
    clause: 'WHERE (t.user_id = ? OR t.assigned_to = ?)',
    params: [user.id, user.id],
  };
}

export function createTicket(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  if (!subject || subject.length > 200) return err(400, 'INVALID_PARAMETER', 'subject is required (up to 200 characters)');
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message || message.length > 2000) return err(400, 'INVALID_PARAMETER', 'message is required (up to 2000 characters)');
  const priority = typeof b.priority === 'string' ? b.priority : 'medium';
  if (!TICKET_PRIORITIES.includes(priority)) return err(400, 'INVALID_PARAMETER', 'priority must be low, medium, or high');
  const info = db.prepare(`INSERT INTO support_tickets
    (user_id, subject, message, priority, status)
    VALUES (?, ?, ?, ?, 'open')`).run(user.id, subject, message, priority);
  return { status: 201, body: loadTicket(db, info.lastInsertRowid) };
}

export function listTickets(db, user, url) {
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
    if (!TICKET_STATUSES.includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('t.status = ?');
    params.push(status);
  }
  const priority = q.get('priority');
  if (priority) {
    if (!TICKET_PRIORITIES.includes(priority)) return err(400, 'INVALID_PARAMETER', 'Invalid priority filter');
    where.push('t.priority = ?');
    params.push(priority);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN users a ON a.id = t.assigned_to`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT t.*, u.full_name AS requester_name,
    u.email AS requester_email, a.full_name AS assignee_name
    ${from} ${clause} ORDER BY t.id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getTicket(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const ticket = loadTicket(db, idText);
  if (!ticket || !canSee(db, user, ticket)) return err(404, 'NOT_FOUND', 'Ticket not found');
  const replies = db.prepare(`SELECT r.*, u.full_name AS author_name
    FROM ticket_replies r JOIN users u ON u.id = r.user_id
    WHERE r.ticket_id = ? ORDER BY r.id ASC`).all(ticket.id);
  return { status: 200, body: { ...ticket, replies } };
}

export function updateTicketStatus(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const ticket = loadTicket(db, idText);
  if (!ticket || !canSee(db, user, ticket)) return err(404, 'NOT_FOUND', 'Ticket not found');
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.status !== 'string' || !TICKET_STATUSES.includes(b.status)) {
    return err(400, 'INVALID_PARAMETER', 'Invalid status');
  }
  /* Requesters may close their own ticket from any open state,
     including resolved (accepting the resolution). Reopening
     stays staff-only. */
  const closingOwn = b.status === 'closed' && ticket.user_id === user.id &&
    ticket.status !== 'closed';
  if (!canManage(db, user, ticket) && !closingOwn) {
    return err(403, 'FORBIDDEN', 'You cannot change this ticket\'s status');
  }
  if (!TRANSITIONS[ticket.status].includes(b.status)) {
    return err(400, 'INVALID_STATE', `Cannot move an ${ticket.status} ticket to ${b.status}`);
  }
  db.prepare(`UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(b.status, ticket.id);
  return { status: 200, body: loadTicket(db, idText) };
}

export function assignTicket(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'tickets:manage')) return err(403, 'FORBIDDEN', 'Missing permission: tickets:manage');
  const ticket = loadTicket(db, idText);
  if (!ticket) return err(404, 'NOT_FOUND', 'Ticket not found');
  const assigneeId = Number(body.assigned_to);
  if (!Number.isInteger(assigneeId)) return err(400, 'INVALID_PARAMETER', 'assigned_to is required');
  const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assigneeId);
  if (!assignee) return err(400, 'INVALID_PARAMETER', 'Assigned user does not exist');
  db.prepare(`UPDATE support_tickets SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?`).run(assigneeId, ticket.id);
  return { status: 200, body: loadTicket(db, idText) };
}

export function addReply(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const ticket = loadTicket(db, idText);
  if (!ticket || !canSee(db, user, ticket)) return err(404, 'NOT_FOUND', 'Ticket not found');
  const b = body && typeof body === 'object' ? body : {};
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message || message.length > 2000) return err(400, 'INVALID_PARAMETER', 'message is required (up to 2000 characters)');
  const info = db.prepare(`INSERT INTO ticket_replies (ticket_id, user_id, message) VALUES (?, ?, ?)`).run(ticket.id, user.id, message);
  return { status: 201, body: db.prepare(`SELECT r.*, u.full_name AS author_name
    FROM ticket_replies r JOIN users u ON u.id = r.user_id WHERE r.id = ?`).get(Number(info.lastInsertRowid)) };
}
