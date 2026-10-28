-- Newsletter subscriptions (brief Phase C). A subscription is a stored
-- consent record only: no email provider is configured, so subscribing
-- never claims a confirmation email was sent. Unsubscribe is by email
-- with a neutral response (no enumeration of whether the address was
-- subscribed). When an email provider is configured, add a token-based
-- confirm/unsubscribe flow; do not retrofit tokens onto this table
-- without that provider, since tokens cannot be delivered.
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'subscribed'
    CHECK (status IN ('subscribed', 'unsubscribed')),
  consent_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscriptions (status);
