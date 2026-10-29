-- Priority 2: Staff Task Management.
CREATE TABLE IF NOT EXISTS staff_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  creator_id INTEGER NOT NULL REFERENCES users(id),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done','cancelled')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_assignee ON staff_tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_creator ON staff_tasks (creator_id, status);
CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES staff_tasks(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS task_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES staff_tasks(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO permissions (name) VALUES ('tasks:manage'), ('tasks:view_any');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name IN ('tasks:manage','tasks:view_any');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name IN ('tasks:manage','tasks:view_any');
