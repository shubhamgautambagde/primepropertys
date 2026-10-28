-- 001_init: core tables for PrimePropertys (Stage D).
-- Conventions: INTEGER PRIMARY KEY AUTOINCREMENT (SQLite dev).
-- Production PostgreSQL will need SERIAL/BIGSERIAL equivalents — see
-- server/README.md "PostgreSQL path". created_at/updated_at on every table.
-- Soft delete for properties (deleted_at) so listings are never destroyed
-- by accident. Passwords are hashes only, never plain text (Stage E fills
-- this table via registration; Stage D creates no users).

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Buyer' CHECK (role IN (
    'Super Admin', 'Admin', 'Owner', 'Agent', 'Builder',
    'Buyer', 'Seller', 'Investor', 'Support')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  property_type TEXT NOT NULL CHECK (property_type IN (
    'Apartment', 'Villa', 'Plot', 'Builder Floor', 'House', 'Commercial')),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('sale', 'rent')),
  price_inr INTEGER NOT NULL CHECK (price_inr > 0),
  city TEXT NOT NULL,
  locality TEXT NOT NULL DEFAULT '',
  area_sqft INTEGER CHECK (area_sqft IS NULL OR area_sqft > 0),
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'published', 'sold', 'rented')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_properties_search
  ON properties (city, property_type, listing_type, status);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties (price_inr);

CREATE TABLE IF NOT EXISTS property_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_property_images_property
  ON property_images (property_id, sort_order);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER REFERENCES properties(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'contacted', 'interested', 'site_visit', 'negotiation',
    'closed', 'lost')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiries_property ON inquiries (property_id);

CREATE TABLE IF NOT EXISTS saved_properties (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, property_id)
);
