-- Priority 2: Property Reviews. Approved-only aggregation; verified only
-- where a completed site visit for that user+property exists.
CREATE TABLE IF NOT EXISTS property_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_active
  ON property_reviews (property_id, user_id) WHERE status != 'rejected';
CREATE INDEX IF NOT EXISTS idx_reviews_property ON property_reviews (property_id, status);
CREATE TABLE IF NOT EXISTS review_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES property_reviews(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (review_id, reporter_id)
);
INSERT OR IGNORE INTO permissions (name) VALUES ('reviews:moderate');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'reviews:moderate';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'reviews:moderate';
