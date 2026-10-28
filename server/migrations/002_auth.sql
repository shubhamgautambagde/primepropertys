-- 002_auth: sessions, reset/verification tokens, granular permissions (Stage E).
-- Tokens are stored as SHA-256 hashes, never raw. Sessions are server-side;
-- the cookie holds only a random token. Email delivery is NOT included:
-- see server/README.md ("Email" section) — with EMAIL_BACKEND=console the
-- reset/verification links are printed to the server log (dev only).

ALTER TABLE users ADD COLUMN email_verified_at TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

INSERT OR IGNORE INTO permissions (name) VALUES
  ('properties:create'), ('properties:edit_own'), ('properties:edit_any'),
  ('properties:publish_any'), ('properties:delete_own'), ('properties:delete_any'),
  ('properties:view_any'), ('leads:view_own'), ('leads:view_any'),
  ('leads:assign'), ('leads:export'), ('users:manage'),
  ('content:manage'), ('payments:view'), ('settings:manage');

-- Super Admin: everything.
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions;
-- Admin: everything except settings:manage.
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name != 'settings:manage';
-- Owner / Agent / Builder / Seller: manage their own properties, see own leads.
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT r.role, p.id FROM permissions p
  CROSS JOIN (SELECT 'Owner' AS role UNION ALL SELECT 'Agent' UNION ALL
              SELECT 'Builder' UNION ALL SELECT 'Seller') r
  WHERE p.name IN ('properties:create', 'properties:edit_own',
                   'properties:delete_own', 'leads:view_own');
-- Buyer / Investor: see only their own leads/inquiries.
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT r.role, p.id FROM permissions p
  CROSS JOIN (SELECT 'Buyer' AS role UNION ALL SELECT 'Investor') r
  WHERE p.name = 'leads:view_own';
-- Support: see all leads, manage content pages.
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Support', id FROM permissions
  WHERE name IN ('leads:view_any', 'content:manage');
