-- REQUIRES_FK_OFF
-- 029_wizard_enums: extend the properties enums chosen by the user
-- (2026-10-29, canonical + wizard decisions): extend via a properties
-- table rebuild, NOT by restricting the wizard choice cards.
--
-- Old CHECKs (migration 001):
--   property_type IN ('Apartment', 'Villa', 'Plot', 'Builder Floor', 'House', 'Commercial')
--   listing_type  IN ('sale', 'rent')
-- New CHECKs (this migration):
--   property_type IN ('Apartment', 'Villa', 'Plot', 'Builder Floor', 'House', 'Commercial',
--                     'PG', 'Office', 'Shop', 'Warehouse')
--   listing_type  IN ('sale', 'rent', 'lease')
-- These are exactly the values on the wizard choice cards:
-- select-purpose.html carries listing_type 'lease'; select-property-type.html
-- carries property_type 'PG', 'Office', 'Shop', 'Warehouse'. No other
-- value is added here; 'Independent House' on the card is value 'House',
-- which already existed. Genuinely unsupported values are still rejected
-- by validate.js and by these CHECKs.
--
-- Why a rebuild: SQLite cannot ALTER a CHECK constraint, so the table
-- must be recreated (the documented 12-step procedure). Every column
-- below is copied verbatim from the post-001..028 schema (70 columns,
-- same types, defaults and other CHECKs); only the two enum CHECKs
-- change. All rows are copied with their ids, so ids, foreign keys
-- (property_images, inquiries, saved_properties, property_views,
-- site_visits, property_uploads, property_reviews, property_promotions,
-- ai_generations, analytics_events, search_alerts, property_price_history)
-- and the AUTOINCREMENT sequence (explicit-id inserts advance it) are
-- preserved. The 6 indexes on properties are dropped with the old table
-- and recreated here with their original definitions. There are no
-- triggers on properties. The migration runner wraps this file in a
-- transaction, so a failure anywhere rolls the whole rebuild back.
-- Re-running the file by hand (not via the runner) is also safe in
-- effect: it rebuilds the same table and copies the same rows.

CREATE TABLE properties_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  property_type TEXT NOT NULL CHECK (property_type IN (
    'Apartment', 'Villa', 'Plot', 'Builder Floor', 'House', 'Commercial',
    'PG', 'Office', 'Shop', 'Warehouse')),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('sale', 'rent', 'lease')),
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
  deleted_at TEXT,
  facing TEXT,
  property_age TEXT,
  possession_status TEXT,
  furnishing_status TEXT,
  floor_number INTEGER,
  total_floors INTEGER,
  unit_number TEXT,
  approval_by TEXT,
  balconies INTEGER,
  servant_room INTEGER,
  is_corner INTEGER NOT NULL DEFAULT 0,
  is_gated INTEGER NOT NULL DEFAULT 0,
  has_lift INTEGER NOT NULL DEFAULT 0,
  has_reserved_parking INTEGER NOT NULL DEFAULT 0,
  open_parking INTEGER,
  covered_parking INTEGER,
  builtup_area_sqft INTEGER,
  carpet_area_sqft INTEGER,
  plot_area_sqft INTEGER,
  area_unit TEXT,
  price_per_sqft_inr INTEGER,
  price_negotiable TEXT,
  maintenance_monthly_inr INTEGER,
  deposit TEXT,
  ownership TEXT,
  transaction_type TEXT,
  amenities TEXT,
  video_url TEXT,
  video_url_2 TEXT,
  tour_360_url TEXT,
  floor_plan_title TEXT,
  floor_plan_title_2 TEXT,
  owner_name TEXT,
  owner_type TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  contact_phone_calls INTEGER NOT NULL DEFAULT 0,
  contact_whatsapp INTEGER NOT NULL DEFAULT 0,
  contact_email INTEGER NOT NULL DEFAULT 0,
  contact_site_visits INTEGER NOT NULL DEFAULT 0,
  contact_time TEXT,
  response_language TEXT,
  hide_number INTEGER NOT NULL DEFAULT 0,
  pincode TEXT,
  address_line TEXT,
  project_name TEXT,
  super_builtup_area_sqft INTEGER,
  terrace_area_sqft INTEGER,
  garden_area_sqft INTEGER,
  dimensions TEXT,
  area_notes TEXT,
  availability TEXT,
  category TEXT,
  featured INTEGER NOT NULL DEFAULT 0
);

INSERT INTO properties_new (
  id, owner_id, title, description, property_type, listing_type, price_inr,
  city, locality, area_sqft, bedrooms, bathrooms, status, created_at,
  updated_at, deleted_at, facing, property_age, possession_status,
  furnishing_status, floor_number, total_floors, unit_number, approval_by,
  balconies, servant_room, is_corner, is_gated, has_lift,
  has_reserved_parking, open_parking, covered_parking, builtup_area_sqft,
  carpet_area_sqft, plot_area_sqft, area_unit, price_per_sqft_inr,
  price_negotiable, maintenance_monthly_inr, deposit, ownership,
  transaction_type, amenities, video_url, video_url_2, tour_360_url,
  floor_plan_title, floor_plan_title_2, owner_name, owner_type,
  owner_phone, owner_email, contact_phone_calls, contact_whatsapp,
  contact_email, contact_site_visits, contact_time, response_language,
  hide_number, pincode, address_line, project_name,
  super_builtup_area_sqft, terrace_area_sqft, garden_area_sqft,
  dimensions, area_notes, availability, category, featured
) SELECT
  id, owner_id, title, description, property_type, listing_type, price_inr,
  city, locality, area_sqft, bedrooms, bathrooms, status, created_at,
  updated_at, deleted_at, facing, property_age, possession_status,
  furnishing_status, floor_number, total_floors, unit_number, approval_by,
  balconies, servant_room, is_corner, is_gated, has_lift,
  has_reserved_parking, open_parking, covered_parking, builtup_area_sqft,
  carpet_area_sqft, plot_area_sqft, area_unit, price_per_sqft_inr,
  price_negotiable, maintenance_monthly_inr, deposit, ownership,
  transaction_type, amenities, video_url, video_url_2, tour_360_url,
  floor_plan_title, floor_plan_title_2, owner_name, owner_type,
  owner_phone, owner_email, contact_phone_calls, contact_whatsapp,
  contact_email, contact_site_visits, contact_time, response_language,
  hide_number, pincode, address_line, project_name,
  super_builtup_area_sqft, terrace_area_sqft, garden_area_sqft,
  dimensions, area_notes, availability, category, featured
FROM properties;

DROP TABLE properties;

ALTER TABLE properties_new RENAME TO properties;

CREATE INDEX IF NOT EXISTS idx_properties_search
  ON properties (city, property_type, listing_type, status);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties (price_inr);
CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON properties (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_properties_status
  ON properties (status, city, property_type, listing_type);
CREATE INDEX IF NOT EXISTS idx_properties_search_filters
  ON properties (status, bedrooms, area_sqft, possession_status);
CREATE INDEX IF NOT EXISTS idx_properties_newest
  ON properties (status, id DESC);
