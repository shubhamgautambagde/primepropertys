-- Priority 2: Advanced RBAC — custom roles on top of fixed roles,
-- plus an admin audit log. Built-in roles are untouched.
CREATE TABLE IF NOT EXISTS custom_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS custom_role_permissions (
  custom_role_id INTEGER NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (custom_role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS user_custom_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  custom_role_id INTEGER NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, custom_role_id)
);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id INTEGER,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_log (actor_id, created_at);
INSERT OR IGNORE INTO permissions (name) VALUES ('roles:manage'), ('audit:view');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name IN ('roles:manage','audit:view');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name IN ('roles:manage','audit:view');
