import { hasPermission } from './auth.js';

// Priority 2 — User-to-user Chat + Notification Preferences.
// Dedicated conversation model: NOT the SMS/WhatsApp queued-message
// system. Membership and ownership are enforced on every read and
// write; member listings expose id + full_name only — never phone
// numbers or emails. In-app notifications are created for recipients
// whose message_alerts preference is on (the existing notifications
// table, listed via /api/notifications). Email/SMS/WhatsApp/Push
// remain unconfigured and are never claimed as sent.

function err(status, code, message) {
  return { status, error: { code, message } };
}
function parsePage(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const offset = Number(url.searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}
function isMember(db, convId, userId) {
  return !!db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, userId);
}
function publicMember(db, userId) {
  const row = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(userId);
  return row || { id: userId, full_name: null };
}

export function createConversation(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  if (!hasPermission(db, user, 'chat:use')) return err(403, 'FORBIDDEN', 'Missing permission: chat:use');
  const b = body && typeof body === 'object' ? body : {};
  const ids = Array.isArray(b.member_ids) ? [...new Set(b.member_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (!ids.length) return err(400, 'INVALID_PARAMETER', 'member_ids must be a non-empty array of user ids');
  for (const id of ids) {
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) return err(400, 'INVALID_PARAMETER', `User ${id} does not exist`);
  }
  const memberSet = [...new Set([user.id, ...ids])].sort((a, b) => a - b);
  // Idempotency: an existing conversation with exactly this member
  // set is returned instead of creating a duplicate thread.
  const existing = db.prepare('SELECT conversation_id FROM conversation_members GROUP BY conversation_id HAVING COUNT(*) = ? AND SUM(user_id IN (' + memberSet.map(() => '?').join(',') + ')) = ?')
    .get(memberSet.length, ...memberSet, memberSet.length);
  if (existing) return { status: 200, body: db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.conversation_id) };
  const info = db.prepare('INSERT INTO conversations (created_by, title) VALUES (?, ?)')
    .run(user.id, typeof b.title === 'string' ? b.title.slice(0, 200) : '');
  const convId = Number(info.lastInsertRowid);
  for (const id of memberSet) db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, id);
  return { status: 201, body: db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) };
}

export function listConversations(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const rows = db.prepare(`SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
    WHERE m.user_id = ? ORDER BY c.updated_at DESC, c.id DESC`).all(user.id);
  for (const c of rows) {
    c.members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(c.id).map((r) => publicMember(db, r.user_id));
    c.last_message = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(c.id) || null;
    c.unread_count = db.prepare(`SELECT COUNT(*) AS n FROM chat_messages m
      WHERE m.conversation_id = ? AND m.sender_id != ? AND NOT EXISTS
        (SELECT 1 FROM message_reads r WHERE r.message_id = m.id AND r.user_id = ?)`).get(c.id, user.id, user.id).n;
  }
  return { status: 200, body: { data: rows } };
}

export function getConversation(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Conversation not found');
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv || !isMember(db, id, user.id)) return err(404, 'NOT_FOUND', 'Conversation not found');
  conv.members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(id).map((r) => publicMember(db, r.user_id));
  return { status: 200, body: conv };
}

export function listMessages(db, user, idText, url) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Conversation not found');
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv || !isMember(db, id, user.id)) return err(404, 'NOT_FOUND', 'Conversation not found');
  const page = parsePage(url);
  if (!page) return err(400, 'INVALID_PARAMETER', 'limit must be 1-100 and offset must be >= 0');
  const total = db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = ?').get(id).n;
  const rows = db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id LIMIT ? OFFSET ?').all(id, page.limit, page.offset);
  return { status: 200, body: { data: rows, pagination: { ...page, total } } };
}

export function sendMessage(db, user, idText, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Conversation not found');
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv || !isMember(db, id, user.id)) return err(404, 'NOT_FOUND', 'Conversation not found');
  const b = body && typeof body === 'object' ? body : {};
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (!text || text.length > 5000) return err(400, 'INVALID_PARAMETER', 'body is required (up to 5000 characters)');
  const info = db.prepare('INSERT INTO chat_messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(id, user.id, text);
  db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(id);
  // In-app notification for each other member whose preference allows it.
  const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(id, user.id);
  for (const m of members) {
    const pref = db.prepare('SELECT message_alerts, in_app_enabled FROM user_notification_preferences WHERE user_id = ?').get(m.user_id);
    if (pref && (!pref.in_app_enabled || !pref.message_alerts)) continue;
    db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
      .run(m.user_id, 'chat', 'New message', text.slice(0, 200), `/sections/communication/chat.html?conversation_id=${id}`);
  }
  return { status: 201, body: db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(Number(info.lastInsertRowid)) };
}

export function markRead(db, user, idText) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return err(404, 'NOT_FOUND', 'Conversation not found');
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv || !isMember(db, id, user.id)) return err(404, 'NOT_FOUND', 'Conversation not found');
  db.prepare(`INSERT OR IGNORE INTO message_reads (message_id, user_id)
    SELECT id, ? FROM chat_messages WHERE conversation_id = ? AND sender_id != ?`).run(user.id, id, user.id);
  return { status: 200, body: { ok: true } };
}

export function getPreferences(db, user) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  let row = db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').get(user.id);
  if (!row) {
    db.prepare('INSERT INTO user_notification_preferences (user_id) VALUES (?)').run(user.id);
    row = db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').get(user.id);
  }
  return { status: 200, body: { ...row, external_channels_note: 'Email, SMS, WhatsApp and Push are not configured; those toggles are stored but cannot deliver until a provider is configured.' } };
}

export function putPreferences(db, user, body) {
  if (!user) return err(401, 'UNAUTHORIZED', 'Login required');
  const b = body && typeof body === 'object' ? body : {};
  const fields = ['in_app_enabled', 'email_enabled', 'sms_enabled', 'whatsapp_enabled', 'push_enabled', 'lead_alerts', 'visit_reminders', 'message_alerts'];
  const updates = {};
  for (const f of fields) {
    if (b[f] !== undefined) updates[f] = b[f] ? 1 : 0;
  }
  if (!Object.keys(updates).length) return err(400, 'INVALID_PARAMETER', 'No updatable fields provided');
  db.prepare('INSERT OR IGNORE INTO user_notification_preferences (user_id) VALUES (?)').run(user.id);
  const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE user_notification_preferences SET ${sets}, updated_at = datetime('now') WHERE user_id = ?`).run(...Object.values(updates), user.id);
  return getPreferences(db, user);
}
