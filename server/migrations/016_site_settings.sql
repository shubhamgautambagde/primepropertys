-- Site settings (autopilot slice 3).
--
-- All 28 system-settings forms contain the SAME four fields (site
-- name, support email, contact number, default country) — the page
-- titles differ, but no page-specific field (SMTP host, API key,
-- payment secret, OTP secret, ...) exists anywhere in the markup.
-- This table therefore stores exactly those four keys, and the
-- API enforces that allowlist: any other key is refused with 400,
-- so a secret can never be smuggled into this store through a
-- form, an API call, or a future page edit. Secrets belong in
-- environment variables on the server, never in this table.
--
-- The four rows are seeded with the values the pages themselves
-- already display as current values (value="..." attributes, not
-- placeholders): they are the site's own identity, not sample
-- user data.
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES users (id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('site_name', 'PrimePropertys'),
  ('support_email', 'support@primepropertys.com'),
  ('contact_number', '+91 98765 43210'),
  ('default_country', 'India');

INSERT OR IGNORE INTO permissions (name) VALUES ('settings:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'settings:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'settings:manage';
