-- 003_properties: recently-viewed tracking + owner lookup index (Stage F).
-- A view row is upserted per (user, property): re-viewing refreshes
-- viewed_at instead of duplicating rows.

CREATE TABLE IF NOT EXISTS property_views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, property_id)
);
CREATE INDEX IF NOT EXISTS idx_property_views_user
  ON property_views (user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON properties (owner_id, status);
