import { hasPermission } from './auth.js';

// Marketing (ad) campaigns, message templates and queued outbound
// messages (autopilot slice 2). No ad platform, SMS or WhatsApp
// provider is configured: campaign platform metrics do not exist
// (and are never invented), and queued messages are stored as
// QUEUED — nothing is sent. A future provider adds its own send
// step; it must not reinterpret queued rows as delivered.

export const CAMPAIGN_CHANNELS = ['Facebook + Instagram', 'Google Ads', 'YouTube Ads', 'All Channels'];
export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'];
export const TEMPLATE_CHANNELS = ['email', 'sms', 'whatsapp', 'notification'];

const TRANSITIONS = {
  draft: ['scheduled', 'active', 'cancelled'],
  scheduled: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
};

function err(status, code, message) {
  return { status, error: { code, message } };
}

function canManage(db, user) {
  return !!user && hasPermission(db, user, 'campaigns:manage');
}

function parsePage(url) {
  const q = url.searchParams;
  const limit = q.get('limit') === null ? 20 : Number(q.get('limit'));
  const offset = q.get('offset') === null ? 0 : Number(q.get('offset'));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

function rupeesToPaise(v) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined) return 0;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// ---- Campaigns ----

export function createCampaign(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 200) return err(400, 'INVALID_PARAMETER', 'name is required (up to 200 characters)');
  const daily = rupeesToPaise(b.daily_budget_rupees);
  const total = rupeesToPaise(b.total_budget_rupees);
  if (daily === null || total === null) return err(400, 'INVALID_PARAMETER', 'Budgets must be non-negative rupee amounts');
  const channels = typeof b.channels === 'string' ? b.channels.trim() : '';
  if (channels && !CAMPAIGN_CHANNELS.includes(channels)) return err(400, 'INVALID_PARAMETER', 'channels must be one of: ' + CAMPAIGN_CHANNELS.join(', '));
  const g = (k) => (typeof b[k] === 'string' ? b[k].trim().slice(0, 500) : '');
  const r = db.prepare(`INSERT INTO campaigns
    (name, objective, type, description, daily_budget_paise, total_budget_paise, channels, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(name, g('objective'), g('type'), g('description'), daily, total, channels, user.id);
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(r.lastInsertRowid));
  return { status: 201, body: { ok: true, data: row } };
}

export function listCampaigns(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const status = url.searchParams.get('status');
  const where = [];
  const params = [];
  if (status) {
    if (!CAMPAIGN_STATUSES.includes(status)) return err(400, 'INVALID_PARAMETER', 'Invalid status filter');
    where.push('status = ?'); params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM campaigns ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM campaigns ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getCampaign(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Campaign not found');
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Campaign not found');
  return { status: 200, body: { ok: true, data: row } };
}

export function updateCampaign(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Campaign not found');
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Campaign not found');
  const b = body && typeof body === 'object' ? body : {};
  const updates = [];
  const params = [];
  const setText = (col, key, max) => {
    if (b[key] !== undefined) {
      const v = typeof b[key] === 'string' ? b[key].trim() : '';
      if (v.length > max) return false;
      updates.push(`${col} = ?`); params.push(v);
    }
    return true;
  };
  if (!setText('name', 'name', 200) || !setText('objective', 'objective', 500) ||
      !setText('type', 'type', 500) || !setText('description', 'description', 500)) {
    return err(400, 'INVALID_PARAMETER', 'A text field exceeds its length limit');
  }
  if (b.daily_budget_rupees !== undefined) {
    const v = rupeesToPaise(b.daily_budget_rupees);
    if (v === null) return err(400, 'INVALID_PARAMETER', 'daily_budget_rupees must be a non-negative rupee amount');
    updates.push('daily_budget_paise = ?'); params.push(v);
  }
  if (b.total_budget_rupees !== undefined) {
    const v = rupeesToPaise(b.total_budget_rupees);
    if (v === null) return err(400, 'INVALID_PARAMETER', 'total_budget_rupees must be a non-negative rupee amount');
    updates.push('total_budget_paise = ?'); params.push(v);
  }
  if (b.channels !== undefined) {
    const v = typeof b.channels === 'string' ? b.channels.trim() : '';
    if (v && !CAMPAIGN_CHANNELS.includes(v)) return err(400, 'INVALID_PARAMETER', 'channels must be one of: ' + CAMPAIGN_CHANNELS.join(', '));
    updates.push('channels = ?'); params.push(v);
  }
  if (b.status !== undefined) {
    const next = typeof b.status === 'string' ? b.status.trim() : '';
    if (!(TRANSITIONS[row.status] || []).includes(next)) {
      return err(400, 'INVALID_PARAMETER', `Cannot move campaign from ${row.status} to ${next || '(none)'}`);
    }
    updates.push('status = ?'); params.push(next);
  }
  if (!updates.length) return err(400, 'INVALID_PARAMETER', 'Nothing to update');
  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
  return { status: 200, body: { ok: true, data: db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) } };
}

// ---- Templates ----

export function createTemplate(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const b = body && typeof body === 'object' ? body : {};
  const channel = typeof b.channel === 'string' ? b.channel.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!TEMPLATE_CHANNELS.includes(channel)) return err(400, 'INVALID_PARAMETER', 'channel must be one of: ' + TEMPLATE_CHANNELS.join(', '));
  if (!name || name.length > 200) return err(400, 'INVALID_PARAMETER', 'name is required (up to 200 characters)');
  const subject = typeof b.subject === 'string' ? b.subject.trim().slice(0, 500) : '';
  const tplBody = typeof b.body === 'string' ? b.body.trim().slice(0, 5000) : '';
  const r = db.prepare(`INSERT INTO message_templates
    (channel, name, subject, body, created_by) VALUES (?, ?, ?, ?, ?)`).run(channel, name, subject, tplBody, user.id);
  const row = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(Number(r.lastInsertRowid));
  return { status: 201, body: { ok: true, data: row } };
}

export function listTemplates(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const channel = url.searchParams.get('channel');
  const where = [];
  const params = [];
  if (channel) {
    if (!TEMPLATE_CHANNELS.includes(channel)) return err(400, 'INVALID_PARAMETER', 'Invalid channel filter');
    where.push('channel = ?'); params.push(channel);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM message_templates ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM message_templates ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function getTemplate(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Template not found');
  const row = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
  if (!row) return err(404, 'NOT_FOUND', 'Template not found');
  return { status: 200, body: { ok: true, data: row } };
}

// ---- Queued messages (SMS / WhatsApp compose forms) ----

export function createQueuedMessage(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const b = body && typeof body === 'object' ? body : {};
  const channel = typeof b.channel === 'string' ? b.channel.trim() : '';
  const recipient = typeof b.recipient === 'string' ? b.recipient.trim() : '';
  const msgBody = typeof b.body === 'string' ? b.body.trim() : '';
  if (!['sms', 'whatsapp'].includes(channel)) return err(400, 'INVALID_PARAMETER', 'channel must be sms or whatsapp');
  if (!recipient || recipient.length > 200) return err(400, 'INVALID_PARAMETER', 'recipient is required (up to 200 characters)');
  if (!msgBody || msgBody.length > 5000) return err(400, 'INVALID_PARAMETER', 'body is required (up to 5000 characters)');
  let templateId = null;
  if (b.template_id !== undefined && b.template_id !== null && b.template_id !== '') {
    templateId = Number(b.template_id);
    if (!Number.isInteger(templateId) || templateId <= 0 ||
        !db.prepare('SELECT id FROM message_templates WHERE id = ?').get(templateId)) {
      return err(400, 'INVALID_PARAMETER', 'template_id does not match an existing template');
    }
  }
  const r = db.prepare(`INSERT INTO queued_messages
    (channel, recipient, body, template_id, created_by) VALUES (?, ?, ?, ?, ?)`).run(channel, recipient, msgBody, templateId, user.id);
  const row = db.prepare('SELECT * FROM queued_messages WHERE id = ?').get(Number(r.lastInsertRowid));
  return { status: 201, body: { ok: true, data: row } };
}

export function listQueuedMessages(db, user, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!canManage(db, user)) return err(403, 'FORBIDDEN', 'Missing permission: campaigns:manage');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const channel = url.searchParams.get('channel');
  const where = [];
  const params = [];
  if (channel) {
    if (!['sms', 'whatsapp'].includes(channel)) return err(400, 'INVALID_PARAMETER', 'Invalid channel filter');
    where.push('channel = ?'); params.push(channel);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM queued_messages ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM queued_messages ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}
