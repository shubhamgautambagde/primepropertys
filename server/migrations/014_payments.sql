-- Payments (autopilot slice 1). OFFLINE/manual payment records only:
-- there is no payment gateway configured, so no record here claims a
-- card, UPI or bank charge ever happened. A record means "the user
-- reports having paid (or started checkout) for this description";
-- status becomes 'verified' only when staff with payments:manage
-- confirm it. A future gateway integration must add its own provider
-- fields and webhook handling; it must not reinterpret these rows as
-- gateway charges.
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id),
  description TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL DEFAULT 'upi'
    CHECK (method IN ('card', 'upi', 'netbanking', 'wallet', 'emi', 'other')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'refund_requested', 'refunded')),
  refund_reason TEXT,
  refund_amount_paise INTEGER,
  refund_to TEXT,
  refunded_at TEXT,
  verified_by INTEGER REFERENCES users (id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- Billing profile: one row per user, upserted from checkout/billing forms.
CREATE TABLE IF NOT EXISTS billing_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users (id),
  full_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO permissions (name) VALUES ('payments:manage');
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Super Admin', id FROM permissions WHERE name = 'payments:manage';
INSERT OR IGNORE INTO role_permissions (role, permission_id)
  SELECT 'Admin', id FROM permissions WHERE name = 'payments:manage';
