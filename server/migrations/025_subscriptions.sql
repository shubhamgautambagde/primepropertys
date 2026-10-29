-- Priority 2: Subscriptions + Coupons + Promotions.
-- Prices below are NOT invented: they are the public prices on
-- pricing.html (FREE Rs 0, BASIC Rs 499/mo, PRO Rs 1,199/mo,
-- PREMIUM Rs 2,499/mo, with the listing/photo/featured limits
-- printed on the same cards). Admins may edit them via the API.
-- No gateway is configured: a paid subscription stays 'pending'
-- until staff activate it against a VERIFIED payment record.
ALTER TABLE properties ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  yearly_price_paise INTEGER CHECK (yearly_price_paise IS NULL OR yearly_price_paise >= 0),
  listing_limit INTEGER CHECK (listing_limit IS NULL OR listing_limit >= 0),
  photos_per_listing INTEGER CHECK (photos_per_listing IS NULL OR photos_per_listing >= 0),
  featured_credits INTEGER NOT NULL DEFAULT 0 CHECK (featured_credits >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO subscription_plans (name, description, price_paise, yearly_price_paise, listing_limit, photos_per_listing, featured_credits) VALUES
  ('FREE', 'Get started for free (pricing.html)', 0, 0, 1, 5, 0),
  ('BASIC', 'Perfect for individuals (pricing.html)', 49900, 598800, 5, 20, 0),
  ('PRO', 'Grow your property presence (pricing.html)', 119900, 1438800, 20, 50, 1),
  ('PREMIUM', 'Maximum visibility & leads (pricing.html)', 249900, 2998800, NULL, 100, 5);
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','expired')),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions (user_id, status);
ALTER TABLE payments ADD COLUMN subscription_id INTEGER REFERENCES user_subscriptions(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS property_promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  package TEXT NOT NULL DEFAULT 'featured' CHECK (package IN ('featured','boost')),
  starts_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  starts_at TEXT,
  ends_at TEXT,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  eligible_plan_ids TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  discount_applied_paise INTEGER NOT NULL CHECK (discount_applied_paise >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions ON coupon_redemptions (coupon_id, user_id);
INSERT OR IGNORE INTO permissions (name) VALUES ('subscriptions:manage'), ('coupons:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name IN ('subscriptions:manage','coupons:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name IN ('subscriptions:manage','coupons:manage');
