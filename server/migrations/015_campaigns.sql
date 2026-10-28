-- Campaigns + message templates + queued outbound messages
-- (autopilot slice 2).
--
-- Marketing campaigns here are AD campaigns (the create form's own
-- fields: objective, type, budgets, channels). Ad-platform metrics
-- (impressions, clicks, spend, platform leads/conversions) are NOT
-- tracked: no ad platform is connected, so those columns stay out
-- of this table rather than being filled with invented numbers.
--
-- Templates are reusable message content (name, subject, body) per
-- channel. Queued messages are compose-form submissions (SMS /
-- WhatsApp centers) stored as QUEUED: no SMS/WhatsApp provider is
-- configured, so nothing is actually sent. A future provider must
-- add its own send step and must not reinterpret queued rows as
-- delivered messages.
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  daily_budget_paise INTEGER NOT NULL DEFAULT 0,
  total_budget_paise INTEGER NOT NULL DEFAULT 0,
  channels TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'notification')),
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_channel ON message_templates (channel);

CREATE TABLE IF NOT EXISTS queued_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  template_id INTEGER REFERENCES message_templates (id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_queued_messages_channel ON queued_messages (channel);

INSERT OR IGNORE INTO permissions (name) VALUES ('campaigns:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'campaigns:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'campaigns:manage';
