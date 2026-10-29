-- 020_property_uploads: binary upload records (Priority 1, Phase E scoped).
-- The file bytes live on disk under UPLOAD_DIR (outside the static
-- root); this table holds only metadata plus the random server-side
-- filename. Images also get a property_images row pointing at the
-- controlled /api/uploads/:id route; documents do not, and are
-- private (owner / properties:view_any only).
CREATE TABLE IF NOT EXISTS property_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_property_uploads_property
  ON property_uploads (property_id, kind, sort_order);
