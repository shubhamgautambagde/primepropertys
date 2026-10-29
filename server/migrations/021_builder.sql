-- Priority 2: Builder Projects + Units.
-- Builders manage only their own projects (enforced in server/src/builder.js).
CREATE TABLE IF NOT EXISTS builder_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  builder_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_type TEXT NOT NULL DEFAULT 'residential' CHECK (project_type IN ('residential','commercial','mixed','land')),
  city TEXT NOT NULL,
  locality TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  rera_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','published','archived')),
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_builder_projects_builder ON builder_projects (builder_id, status);
CREATE INDEX IF NOT EXISTS idx_builder_projects_search ON builder_projects (city, project_type, status);
CREATE TABLE IF NOT EXISTS project_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  pincode TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_towers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floors INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  tower_id INTEGER REFERENCES project_towers(id) ON DELETE SET NULL,
  unit_number TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT '',
  price_inr INTEGER CHECK (price_inr IS NULL OR price_inr > 0),
  area_sqft INTEGER CHECK (area_sqft IS NULL OR area_sqft > 0),
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_units_project ON project_units (project_id, status);
CREATE TABLE IF NOT EXISTS project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_amenities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_crm_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES builder_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_text TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO permissions (name) VALUES
  ('projects:create'), ('projects:manage_own'), ('projects:view_any'), ('projects:verify');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name IN ('projects:create','projects:manage_own','projects:view_any','projects:verify');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name IN ('projects:create','projects:manage_own','projects:view_any','projects:verify');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Builder', id FROM permissions WHERE name IN ('projects:create','projects:manage_own');
