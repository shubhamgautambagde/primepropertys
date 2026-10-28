-- Support tickets (post-Stage-J slice): user-raised issues,
-- worked by support staff. Statuses mirror the ticket tables'
-- own language: open, in_progress, resolved, closed. Replies
-- are a simple thread on the ticket (no separate chat model).
-- tickets:manage (see all tickets, assign, change status)
-- goes to Super Admin, Admin, and the Support role, whose
-- job this is (see 002's Support grant).
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets (assigned_to);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON ticket_replies (ticket_id);

INSERT OR IGNORE INTO permissions (name) VALUES ('tickets:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'tickets:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'tickets:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Support', id FROM permissions WHERE name = 'tickets:manage';
