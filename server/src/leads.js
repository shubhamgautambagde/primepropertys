import { hasPermission } from './auth.js';
import { isValidEmail } from './auth.js';

// Leads + CRM (Stage G). Inquiries ARE leads: website submissions land in
// the inquiries table and are worked through the pipeline there.
// Notifications are in-app rows (no email/SMS provider is configured —
// see server/README.md). Nothing here sends an external message.

export const LEAD_STATUSES = ['new', 'contacted', 'interested', 'site_visit', 'negotiation', 'closed', 'lost'];
const TRANSITIONS = {
  new: ['contacted', 'lost'],
  contacted: ['interested', 'lost'],
  interested: ['site_visit', 'lost'],
  site_visit: ['negotiation', 'lost'],
  negotiation: ['closed', 'lost'],
  closed: [],
  lost: [],
};

function err(status, code, message) {
  return { status, error: { code, message } };
}

function loadLead(db, idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare(`SELECT i.*, p.title AS property_title, p.city AS property_city,
      p.owner_id AS property_owner_id
    FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id
    WHERE i.id = ?`).get(id) || null;
}

function canSee(db, user, lead) {
  if (!user) return false;
  if (hasPermission(db, user, 'leads:view_any')) return true;
  return lead.property_owner_id === user.id || lead.assigned_to === user.id;
}

function logActivity(db, inquiryId, actorId, action, note) {
  db.prepare('INSERT INTO lead_activities (inquiry_id, actor_id, action, note) VALUES (?, ?, ?, ?)')
    .run(inquiryId, actorId, action, note || '');
}

function notify(db, userId, type, title, body, link) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, title, body || '', link || null);
}

function parsePage(url, maxLimit = 100) {
  const q = url.searchParams;
  const limit = q.get('limit') === null ? 20 : Number(q.get('limit'));
  const offset = q.get('offset') === null ? 0 : Number(q.get('offset'));
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit ||
      !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

function digitsOf(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// Normalize for duplicate comparison: +91 98765 43210 and 98765 43210 are
// the same number. Strips the Indian country code / trunk 0 when present.
function normalizedPhone(phone) {
  let d = digitsOf(phone);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// Public inquiry rate limit: 10 submissions per IP per hour (in-memory).
const attempts = new Map();
export function inquiryRateLimited(ip) {
  const b = attempts.get(ip);
  if (!b) return false;
  if (Date.now() - b.firstAt > 60 * 60 * 1000) { attempts.delete(ip); return false; }
  return b.count >= 10;
}
export function recordInquiryAttempt(ip) {
  const b = attempts.get(ip);
  if (!b || Date.now() - b.firstAt > 60 * 60 * 1000) attempts.set(ip, { count: 1, firstAt: Date.now() });
  else b.count += 1;
}

export function listMyInquiries(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const total = db.prepare('SELECT COUNT(*) AS n FROM inquiries WHERE user_id = ?').get(user.id).n;
  const rows = db.prepare(`SELECT i.*, p.title AS property_title FROM inquiries i
    LEFT JOIN properties p ON p.id = i.property_id
    WHERE i.user_id = ? ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`).all(user.id, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function createInquiry(db, body, userId = null) {
  const b = body && typeof body === 'object' ? body : {};
  const propertyId = Number(b.property_id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return err(400, 'INVALID_PARAMETER', 'property_id is required');
  const prop = db.prepare(`SELECT * FROM properties WHERE id = ? AND status = 'published' AND deleted_at IS NULL`).get(propertyId);
  if (!prop) return err(404, 'NOT_FOUND', 'Property not found');
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  if (!fullName || fullName.length > 100) return err(400, 'INVALID_PARAMETER', 'full_name is required (up to 100 characters)');
  const digits = digitsOf(b.phone);
  if (digits.length < 10 || digits.length > 15) return err(400, 'INVALID_PARAMETER', 'phone must contain 10-15 digits');
  const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : null;
  if (email && !isValidEmail(email)) return err(400, 'INVALID_PARAMETER', 'email is invalid');
  const message = typeof b.message === 'string' ? b.message : '';
  if (message.length > 2000) return err(400, 'INVALID_PARAMETER', 'message must be up to 2000 characters');
  // Duplicate detection: same property + same phone (digits) or same email
  // within the last 30 days. Duplicates are flagged, not rejected — a
  // customer may legitimately enquire twice.
  const recent = db.prepare(`SELECT id, phone, email FROM inquiries
    WHERE property_id = ? AND created_at > datetime('now', '-30 days') ORDER BY id DESC LIMIT 500`).all(propertyId);
  const norm = normalizedPhone(b.phone);
  let duplicateOf = null;
  for (const r of recent) {
    if (normalizedPhone(r.phone) === norm || (email && r.email && r.email.toLowerCase() === email)) {
      duplicateOf = r.id;
      break;
    }
  }
  const info = db.prepare(`INSERT INTO inquiries
    (property_id, user_id, full_name, phone, email, message, status, source, duplicate_of)
    VALUES (?, ?, ?, ?, ?, ?, 'new', 'website', ?)`).run(propertyId, userId, fullName, b.phone, email, message, duplicateOf);
  const id = Number(info.lastInsertRowid);
  logActivity(db, id, null, 'created', duplicateOf ? `Flagged as duplicate of inquiry ${duplicateOf}` : 'Inquiry received');
  notify(db, prop.owner_id, 'lead_new', `New inquiry for ${prop.title}`,
    `${fullName} enquired about ${prop.title} (${prop.city}).`, `/api/leads/${id}`);
  const lead = loadLead(db, id);
  return { status: 201, body: { ...lead, is_duplicate: duplicateOf !== null } };
}

export function listLeads(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const q = url.searchParams;
  const where = [];
  const params = [];
  if (!hasPermission(db, user, 'leads:view_any')) {
    where.push('(p.owner_id = ? OR i.assigned_to = ?)');
    params.push(user.id, user.id);
  }
  const status = q.get('status');
  if (status) {
    if (!LEAD_STATUSES.includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('i.status = ?');
    params.push(status);
  }
  const assignedTo = q.get('assigned_to');
  if (assignedTo !== null) {
    const n = Number(assignedTo);
    if (!Number.isInteger(n)) return err(400, 'INVALID_PARAMETER', 'assigned_to must be an integer');
    where.push('i.assigned_to = ?');
    params.push(n);
  }
  const propertyId = q.get('property_id');
  if (propertyId !== null) {
    const n = Number(propertyId);
    if (!Number.isInteger(n)) return err(400, 'INVALID_PARAMETER', 'property_id must be an integer');
    where.push('i.property_id = ?');
    params.push(n);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id';
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT i.*, p.title AS property_title, p.city AS property_city, p.owner_id AS property_owner_id
    ${from} ${clause} ORDER BY i.id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getLead(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  return { status: 200, body: lead };
}

export function updateLeadStatus(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const next = body.status;
  if (!LEAD_STATUSES.includes(next)) return err(400, 'INVALID_PARAMETER', 'Invalid status');
  if (next === lead.status) return { status: 200, body: lead };
  if (!TRANSITIONS[lead.status].includes(next)) {
    return err(400, 'INVALID_TRANSITION', `Cannot move a lead from ${lead.status} to ${next}`);
  }
  db.prepare(`UPDATE inquiries SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(next, lead.id);
  logActivity(db, lead.id, user.id, 'status_change', `Status: ${lead.status} -> ${next}`);
  return { status: 200, body: loadLead(db, idText) };
}

export function assignLead(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'leads:assign')) return err(403, 'FORBIDDEN', 'Missing permission: leads:assign');
  const lead = loadLead(db, idText);
  if (!lead) return err(404, 'NOT_FOUND', 'Lead not found');
  const assigneeId = Number(body.assigned_to);
  if (!Number.isInteger(assigneeId)) return err(400, 'INVALID_PARAMETER', 'assigned_to is required');
  const assignee = db.prepare('SELECT id FROM users WHERE id = ?').get(assigneeId);
  if (!assignee) return err(400, 'INVALID_PARAMETER', 'Assigned user does not exist');
  db.prepare(`UPDATE inquiries SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?`).run(assigneeId, lead.id);
  logActivity(db, lead.id, user.id, 'assigned', `Assigned to user ${assigneeId}`);
  notify(db, assigneeId, 'lead_assigned', 'A lead was assigned to you',
    `Lead ${lead.id} (${lead.property_title || 'property'}) was assigned to you.`, `/api/leads/${lead.id}`);
  return { status: 200, body: loadLead(db, idText) };
}

export function addNote(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!note || note.length > 2000) return err(400, 'INVALID_PARAMETER', 'note is required (up to 2000 characters)');
  logActivity(db, lead.id, user.id, 'note', note);
  return { status: 201, body: { ok: true } };
}

export function listActivities(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const rows = db.prepare('SELECT * FROM lead_activities WHERE inquiry_id = ? ORDER BY created_at DESC, id DESC').all(lead.id);
  return { status: 200, body: { data: rows } };
}

export function createFollowup(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const due = typeof body.due_at === 'string' ? body.due_at : '';
  if (!due || Number.isNaN(Date.parse(due))) return err(400, 'INVALID_PARAMETER', 'due_at must be a valid date/time');
  const note = typeof body.note === 'string' ? body.note : '';
  if (note.length > 1000) return err(400, 'INVALID_PARAMETER', 'note must be up to 1000 characters');
  const info = db.prepare('INSERT INTO lead_followups (inquiry_id, created_by, due_at, note) VALUES (?, ?, ?, ?)')
    .run(lead.id, user.id, due, note);
  logActivity(db, lead.id, user.id, 'followup_created', `Follow-up due ${due}`);
  return { status: 201, body: db.prepare('SELECT * FROM lead_followups WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function listFollowups(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const rows = db.prepare('SELECT * FROM lead_followups WHERE inquiry_id = ? ORDER BY due_at ASC, id ASC').all(lead.id);
  return { status: 200, body: { data: rows } };
}

export function completeFollowup(db, user, idText, followupIdText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const fid = Number(followupIdText);
  const f = db.prepare('SELECT * FROM lead_followups WHERE id = ? AND inquiry_id = ?').get(fid, lead.id);
  if (!f) return err(404, 'NOT_FOUND', 'Follow-up not found');
  db.prepare(`UPDATE lead_followups SET done_at = datetime('now') WHERE id = ?`).run(fid);
  logActivity(db, lead.id, user.id, 'followup_done', `Follow-up ${fid} completed`);
  return { status: 200, body: { ok: true } };
}

/* CRM Stage, Phase 5: lead tags. Same visibility rule as notes and
   follow-ups: anyone who can see the lead can tag it. Tag names are
   free-form and deduped case-insensitively; re-adding an attached
   tag is a no-op success (200), not an error. */
export function listTags(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const rows = db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC').all();
  return { status: 200, body: { data: rows } };
}

export function listLeadTags(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const rows = db.prepare(`SELECT t.id, t.name, lt.created_at FROM lead_tags lt
    JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = ?
    ORDER BY t.name COLLATE NOCASE ASC`).all(lead.id);
  return { status: 200, body: { data: rows } };
}

export function addLeadTag(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 50) return err(400, 'INVALID_PARAMETER', 'name is required (up to 50 characters)');
  let tag = db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE').get(name);
  if (!tag) {
    const info = db.prepare('INSERT INTO tags (name) VALUES (?)').run(name);
    tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(Number(info.lastInsertRowid));
  }
  const existing = db.prepare('SELECT 1 FROM lead_tags WHERE lead_id = ? AND tag_id = ?').get(lead.id, tag.id);
  if (existing) return { status: 200, body: tag };
  db.prepare('INSERT INTO lead_tags (lead_id, tag_id, created_by) VALUES (?, ?, ?)').run(lead.id, tag.id, user.id);
  logActivity(db, lead.id, user.id, 'tag_added', `Tag: ${tag.name}`);
  return { status: 201, body: tag };
}

export function removeLeadTag(db, user, idText, tagIdText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const lead = loadLead(db, idText);
  if (!lead || !canSee(db, user, lead)) return err(404, 'NOT_FOUND', 'Lead not found');
  const tid = Number(tagIdText);
  if (!Number.isInteger(tid)) return err(400, 'INVALID_PARAMETER', 'Invalid tag id');
  const link = db.prepare(`SELECT t.name FROM lead_tags lt
    JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = ? AND lt.tag_id = ?`).get(lead.id, tid);
  if (!link) return err(404, 'NOT_FOUND', 'Tag not attached to this lead');
  db.prepare('DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?').run(lead.id, tid);
  logActivity(db, lead.id, user.id, 'tag_removed', `Tag removed: ${link.name}`);
  return { status: 200, body: { ok: true } };
}

/* CRM Stage, Phase 6: lead scoring + SLA, computed from existing data
   (no stored score — always derived, so it can never go stale).
   Scoring defaults (documented here; change the constants to retune):
   stage points new 10 / contacted 25 / interested 50 / site_visit 70 /
   negotiation 85; +5 per note (max 15); +5 per completed follow-up
   (max 15); capped at 100 (a negative "capped" entry keeps the
   breakdown summing to the score). Closed leads score 100 (Won),
   lost leads 0 (Lost). Profile/budget-match signals are NOT in the
   data yet (inquiries carry no buyer budget/profile fields), so the
   score uses stage + engagement + activity only.
   SLA targets come from the lead-sla page's own copy: first contact
   within 1 hour, follow-up within 24 hours. Follow-up SLA is
   measured two ways: a follow-up created within 24h of the inquiry,
   and open follow-ups past their due time. */
const STAGE_POINTS = { new: 10, contacted: 25, interested: 50, site_visit: 70, negotiation: 85 };
const SLA_FIRST_RESPONSE_HOURS = 1;
const SLA_FOLLOWUP_HOURS = 24;

function scoreLead(db, lead) {
  if (lead.status === 'lost') return { score: 0, band: 'Lost', breakdown: [{ reason: 'Lead lost', points: 0 }] };
  if (lead.status === 'closed') return { score: 100, band: 'Won', breakdown: [{ reason: 'Lead closed', points: 100 }] };
  const breakdown = [{ reason: `Stage: ${lead.status}`, points: STAGE_POINTS[lead.status] || 0 }];
  const notes = db.prepare(`SELECT COUNT(*) AS n FROM lead_activities WHERE inquiry_id = ? AND action = 'note'`).get(lead.id).n;
  breakdown.push({ reason: `${notes} note(s)`, points: Math.min(notes * 5, 15) });
  const done = db.prepare(`SELECT COUNT(*) AS n FROM lead_followups WHERE inquiry_id = ? AND done_at IS NOT NULL`).get(lead.id).n;
  breakdown.push({ reason: `${done} completed follow-up(s)`, points: Math.min(done * 5, 15) });
  const raw = breakdown.reduce((s, b) => s + b.points, 0);
  if (raw > 100) breakdown.push({ reason: 'Capped at 100', points: 100 - raw });
  const score = Math.min(raw, 100);
  const band = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cool';
  return { score, band, breakdown };
}

export function listLeadScores(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const where = [];
  const params = [];
  if (!hasPermission(db, user, 'leads:view_any')) {
    where.push('(p.owner_id = ? OR i.assigned_to = ?)');
    params.push(user.id, user.id);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id';
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT i.*, p.title AS property_title ${from} ${clause}
    ORDER BY i.id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  const data = rows.map((lead) => ({ ...lead, ...scoreLead(db, lead) }));
  return { status: 200, body: { data, pagination: { ...page, total } } };
}

function slaForLead(db, lead) {
  const base = { id: lead.id, full_name: lead.full_name, property_title: lead.property_title, status: lead.status };
  const first = db.prepare(`SELECT created_at FROM lead_activities
    WHERE inquiry_id = ? AND actor_id IS NOT NULL ORDER BY created_at ASC, id ASC LIMIT 1`).get(lead.id);
  const hours = (a, b) => db.prepare('SELECT (julianday(?) - julianday(?)) * 24 AS h').get(a, b).h;
  const firstHours = first ? Math.round(hours(first.created_at, lead.created_at) * 10) / 10 : null;
  const ageHours = hours('now', lead.created_at);
  const fuIn24 = db.prepare(`SELECT 1 FROM lead_followups WHERE inquiry_id = ?
    AND (julianday(created_at) - julianday(?)) * 24 <= ?`).get(lead.id, lead.created_at, SLA_FOLLOWUP_HOURS);
  const overdue = db.prepare(`SELECT COUNT(*) AS n FROM lead_followups
    WHERE inquiry_id = ? AND done_at IS NULL AND julianday(due_at) < julianday('now')`).get(lead.id).n;
  /* Closed/lost leads keep their real signals but stop SLA tracking. */
  let sla = 'met';
  if (lead.status === 'closed' || lead.status === 'lost') sla = 'closed';
  else if ((firstHours !== null && firstHours > SLA_FIRST_RESPONSE_HOURS) || (ageHours > SLA_FOLLOWUP_HOURS && !fuIn24) || overdue > 0) sla = 'breached';
  else if (!first || !fuIn24) sla = 'pending';
  return { ...base, sla_status: sla, first_response_at: first ? first.created_at : null, first_response_hours: firstHours, followup_within_24h: !!fuIn24, overdue_followups: overdue };
}

export function listLeadSla(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const where = [];
  const params = [];
  if (!hasPermission(db, user, 'leads:view_any')) {
    where.push('(p.owner_id = ? OR i.assigned_to = ?)');
    params.push(user.id, user.id);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = 'FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id';
  const rows = db.prepare(`SELECT i.*, p.title AS property_title ${from} ${clause} ORDER BY i.id DESC`).all(...params);
  return { status: 200, body: { data: rows.map((lead) => slaForLead(db, lead)) } };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* Stage CRM: follow-ups across all leads the user can see (leads:view_any
   sees everything; others see follow-ups on their own properties or leads
   assigned to them). Done follow-ups are included with done_at set, so
   the frontend can separate due from completed. */
export function listFollowupsVisible(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const canSeeAll = hasPermission(db, user, 'leads:view_any');
  const where = canSeeAll ? '' : 'WHERE (p.owner_id = ? OR i.assigned_to = ?)';
  const params = canSeeAll ? [] : [user.id, user.id];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM lead_followups f
    JOIN inquiries i ON i.id = f.inquiry_id
    LEFT JOIN properties p ON p.id = i.property_id ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT f.*, i.full_name AS lead_name, i.status AS lead_status,
      p.title AS property_title FROM lead_followups f
    JOIN inquiries i ON i.id = f.inquiry_id
    LEFT JOIN properties p ON p.id = i.property_id ${where}
    ORDER BY f.due_at ASC, f.id ASC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

/* Stage CRM, Phase 3: aggregate stats over the leads the caller can see
   (leads:view_any sees all; others see only their own properties' leads
   or leads assigned to them). No new data is collected — every number
   is computed from existing inquiries. */
export function leadStats(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const canSeeAll = hasPermission(db, user, 'leads:view_any');
  const where = canSeeAll ? '' : 'WHERE (p.owner_id = ? OR i.assigned_to = ?)';
  const params = canSeeAll ? [] : [user.id, user.id];
  const from = 'FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id';
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).get(...params).n;
  const byStatus = {};
  LEAD_STATUSES.forEach((s) => { byStatus[s] = 0; });
  db.prepare(`SELECT i.status, COUNT(*) AS n ${from} ${where} GROUP BY i.status`).all(...params)
    .forEach((r) => { byStatus[r.status] = r.n; });
  const bySource = db.prepare(`SELECT COALESCE(i.source, 'unknown') AS source, COUNT(*) AS n ${from} ${where} GROUP BY i.source ORDER BY n DESC`).all(...params);
  const byProperty = db.prepare(`SELECT i.property_id, p.title AS property_title, COUNT(*) AS n ${from} ${where} GROUP BY i.property_id, p.title ORDER BY n DESC LIMIT 10`).all(...params);
  const byAssignee = db.prepare(`SELECT i.assigned_to, COALESCE(u.full_name, u.email, 'Unassigned') AS name, COUNT(*) AS n ${from} LEFT JOIN users u ON u.id = i.assigned_to ${where} GROUP BY i.assigned_to, name ORDER BY n DESC LIMIT 10`).all(...params);
  const closedWhere = where ? `${where} AND i.status = 'closed'` : `WHERE i.status = 'closed'`;
  const closedParams = canSeeAll ? [] : [user.id, user.id];
  const byAssigneeClosed = db.prepare(`SELECT i.assigned_to, COALESCE(u.full_name, u.email, 'Unassigned') AS name, COUNT(*) AS closed ${from} LEFT JOIN users u ON u.id = i.assigned_to ${closedWhere} GROUP BY i.assigned_to, name ORDER BY closed DESC LIMIT 10`).all(...closedParams);
  return { status: 200, body: {
    total,
    by_status: byStatus,
    funnel: LEAD_STATUSES.map((s) => ({ status: s, count: byStatus[s] })),
    by_source: bySource,
    by_property: byProperty,
    by_assignee: byAssignee,
    by_assignee_closed: byAssigneeClosed,
  } };
}

export function exportLeads(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'leads:export')) return err(403, 'FORBIDDEN', 'Missing permission: leads:export');
  const rows = db.prepare(`SELECT i.*, p.title AS property_title
    FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id ORDER BY i.id ASC`).all();
  const header = ['id', 'property_id', 'property_title', 'full_name', 'phone', 'email', 'message', 'status', 'assigned_to', 'source', 'duplicate_of', 'created_at'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(','));
  return { status: 200, csv: lines.join('\r\n') + '\r\n' };
}

export function listNotifications(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const page = parsePage(url, 50);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-50 and offset must be >= 0');
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(user.id).n;
  const rows = db.prepare(`SELECT * FROM notifications WHERE user_id = ?
    ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`).all(user.id, page.limit, page.offset);
  return { status: 200, body: { data: rows, unread_count: unread, pagination: { ...page, total: unread + db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NOT NULL').get(user.id).n } } };
}

export function markNotificationRead(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  const n = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!n) return err(404, 'NOT_FOUND', 'Notification not found');
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`).run(id);
  return { status: 200, body: { ok: true } };
}
