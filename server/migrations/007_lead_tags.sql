-- CRM Stage, Phase 5: free-form tags for segmenting leads (BHK, budget,
-- location, intent). Tag names are unique; SQLite UNIQUE is
-- case-sensitive, so the application dedupes case-insensitively
-- (adding "Hot" when "hot" exists reuses the existing tag).
-- The link table enforces one tag per lead.
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id INTEGER NOT NULL REFERENCES inquiries(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lead_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag_id);
