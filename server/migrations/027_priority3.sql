-- Priority 3: AI generations, analytics events, saved searches/alerts,
-- price history, SEO records/redirects/link checks.
--
-- Honesty rules baked into the schema:
-- * ai_generations stores only provider-reported token counts (NULL when
--   the provider reports none). Nothing here invents usage or cost.
-- * analytics_events are recorded from Priority 3 onward only. Rows
--   before this migration do not exist and are never backfilled.
-- * property_price_history is append-only: edits insert a row, nothing
--   ever rewrites history, and no history is fabricated for edits that
--   happened before this table existed.
-- * SEO "indexing" is NOT stored: no search engine reports indexing
--   status to this app, so no column claims it. last_checked_at records
--   only the app's own internal link check.

CREATE TABLE IF NOT EXISTS ai_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('title', 'description', 'seo')),
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  input_summary TEXT NOT NULL DEFAULT '',
  output_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'approved', 'rejected', 'applied')),
  tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_generations_user
  ON ai_generations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('property_view', 'property_search')),
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type
  ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_property
  ON analytics_events (property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  notify_in_app INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);

CREATE TABLE IF NOT EXISTS search_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_search_id INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (saved_search_id, property_id)
);
CREATE INDEX IF NOT EXISTS idx_search_alerts_user ON search_alerts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS property_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  old_price_inr INTEGER NOT NULL,
  new_price_inr INTEGER NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_history_property
  ON property_price_history (property_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS seo_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  robots TEXT NOT NULL DEFAULT 'index,follow'
    CHECK (robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow')),
  last_checked_at TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seo_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seo_link_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  checked_links INTEGER NOT NULL DEFAULT 0,
  broken_count INTEGER NOT NULL DEFAULT 0,
  broken_json TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seo_link_checks_path ON seo_link_checks (path, checked_at DESC);

CREATE TABLE IF NOT EXISTS seo_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO permissions (name) VALUES
  ('ai:use'), ('analytics:view'), ('seo:manage');
-- AI generation: any logged-in role may generate (usage-limited, and
-- generated text is never published without human approval).
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT r.role, p.id FROM permissions p
  CROSS JOIN (SELECT 'Super Admin' AS role UNION ALL SELECT 'Admin' UNION ALL SELECT 'Owner' UNION ALL
              SELECT 'Agent' UNION ALL SELECT 'Builder' UNION ALL SELECT 'Buyer' UNION ALL
              SELECT 'Seller' UNION ALL SELECT 'Investor' UNION ALL SELECT 'Support') r
  WHERE p.name = 'ai:use';
-- Analytics: staff plus property-side roles; scoping is enforced in
-- code (staff see all, others see only their own rows).
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT r.role, p.id FROM permissions p
  CROSS JOIN (SELECT 'Super Admin' AS role UNION ALL SELECT 'Admin' UNION ALL SELECT 'Owner' UNION ALL
              SELECT 'Agent' UNION ALL SELECT 'Builder' UNION ALL SELECT 'Support') r
  WHERE p.name = 'analytics:view';
-- SEO records: Super Admin and Admin only.
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT r.role, p.id FROM permissions p
  CROSS JOIN (SELECT 'Super Admin' AS role UNION ALL SELECT 'Admin' AS role) r
  WHERE p.name = 'seo:manage';
