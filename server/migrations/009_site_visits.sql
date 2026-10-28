-- Visit-booking core (post-Stage-J slice): a visit is a scheduled
-- viewing of a published property, requested by a logged-in user.
-- Statuses mirror the site-visit section's pages: requested
-- (pending), confirmed (approved), rejected, completed,
-- cancelled. Rescheduling keeps the status and stamps
-- rescheduled_at, which is how the rescheduled-visits page
-- finds its rows. Feedback (text + 1-5 rating) is only accepted
-- once a visit is completed. Agent assignment is NOT in this
-- slice (assign-agent.html stays demo until then).
CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested', 'confirmed', 'rejected', 'completed', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  feedback TEXT,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  rescheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_visits_property ON site_visits (property_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_user ON site_visits (user_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_status ON site_visits (status);
CREATE INDEX IF NOT EXISTS idx_site_visits_scheduled ON site_visits (scheduled_at);

-- visits:manage (see all visits, change any visit's status) goes
-- to Super Admin and Admin only, mirroring 002's grants.
-- Property owners see visits on their own properties and
-- requesters see their own visits without any permission.
INSERT OR IGNORE INTO permissions (name) VALUES ('visits:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'visits:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'visits:manage';
