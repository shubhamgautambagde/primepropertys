-- Home service requests (post-Stage-J slice): a logged-in
-- user requests a home service (plumbing, electrical, ...).
-- Statuses follow the tracking page's own timeline:
-- requested (raised) -> assigned -> scheduled (visit
-- scheduled) -> in_progress -> completed (resolved),
-- plus cancelled from any open state. Timestamps make
-- the timeline real: assigned_at, scheduled_at (the
-- staff-confirmed visit time; preferred_date + time_slot
-- are the user's ask, not the confirmation), completed_at.
-- services:manage (see all requests, assign, advance
-- status) goes to Super Admin, Admin, and Support.
CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  address TEXT NOT NULL,
  preferred_date TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested', 'assigned', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT,
  scheduled_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_requests_user ON service_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests (status);
CREATE INDEX IF NOT EXISTS idx_service_requests_assigned ON service_requests (assigned_to);

INSERT OR IGNORE INTO permissions (name) VALUES ('services:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'services:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'services:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Support', id FROM permissions WHERE name = 'services:manage';
