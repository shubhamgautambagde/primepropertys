-- Priority 2: User-to-user Chat (dedicated model, NOT the SMS/WhatsApp
-- queue) + notification preferences. External channels stay
-- unconfigured: only in-app notifications are created, and only
-- when the recipient's preference allows message alerts.
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS message_reads (
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages (conversation_id, id);
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  sms_enabled INTEGER NOT NULL DEFAULT 0,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
  push_enabled INTEGER NOT NULL DEFAULT 0,
  lead_alerts INTEGER NOT NULL DEFAULT 1,
  visit_reminders INTEGER NOT NULL DEFAULT 1,
  message_alerts INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO permissions (name) VALUES ('chat:use');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT r.role, p.id FROM permissions p
  CROSS JOIN (SELECT 'Super Admin' AS role UNION ALL SELECT 'Admin' UNION ALL SELECT 'Owner' UNION ALL
               SELECT 'Agent' UNION ALL SELECT 'Builder' UNION ALL SELECT 'Buyer' UNION ALL
               SELECT 'Seller' UNION ALL SELECT 'Investor' UNION ALL SELECT 'Support') r
  WHERE p.name = 'chat:use';
