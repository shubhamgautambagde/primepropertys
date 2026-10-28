-- Stage H: general contact enquiries (contact.html main form). Kept separate
-- from property inquiries (inquiries table, Stage G) because a general
-- enquiry is not tied to one published property.
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

-- Admin-side read permission for contact messages (mirrors 002_auth seeds).
INSERT OR IGNORE INTO permissions (name) VALUES ('contact:view');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'contact:view';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'contact:view';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Support', id FROM permissions WHERE name = 'contact:view';
