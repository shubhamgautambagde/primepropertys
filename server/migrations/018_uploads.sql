-- 018: binary upload records (Phase E). Files live on disk under
-- UPLOAD_DIR (default server/data/uploads) and are NEVER served by
-- the static handler; only the gated /api/uploads/:id/file route
-- serves them. The stored filename is server-generated, never the
-- user-supplied name (which is kept for display only).
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  property_id INTEGER REFERENCES properties(id),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_property ON uploads(property_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_uploads_uploader ON uploads(uploader_id);
