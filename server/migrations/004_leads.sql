-- 004_leads: CRM fields on inquiries + activities, follow-ups, notifications (Stage G).
-- Inquiries ARE leads: the same rows captured from the website are worked
-- through the pipeline. No separate leads table, so nothing can drift apart.

ALTER TABLE inquiries ADD COLUMN assigned_to INTEGER REFERENCES users(id);
ALTER TABLE inquiries ADD COLUMN source TEXT NOT NULL DEFAULT 'website';
ALTER TABLE inquiries ADD COLUMN duplicate_of INTEGER REFERENCES inquiries(id);

CREATE TABLE IF NOT EXISTS lead_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_inquiry
  ON lead_activities (inquiry_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS lead_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id),
  due_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lead_followups_inquiry
  ON lead_followups (inquiry_id, due_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, read_at, created_at DESC, id DESC);
