# PRIME CMS — Database Audit

Date: 2026-10-30. Engine: SQLite (`node:sqlite`
`DatabaseSync`), foreign keys ON. Migrations run once each,
in filename order, tracked in `schema_migrations`. Never
modify an applied migration — CMS tables arrive as new
files (`019` onward).

## 1. Migration history

| File | Adds |
| --- | --- |
| 001_init.sql | users, permissions, role_permissions, sessions, properties, property_images, saved_properties |
| 002_auth.sql | password_reset_tokens, email_verification_tokens |
| 003_properties.sql | property fields / views support |
| 004_leads.sql | inquiries, lead_activities, lead_followups, notifications |
| 005_contact.sql | contact_messages |
| 006_inquiries_user.sql | inquiry → user link |
| 007_lead_tags.sql | tags, lead_tags |
| 008_perf_indexes.sql | performance indexes |
| 009_site_visits.sql | site_visits |
| 010_visit_assignment.sql | visit assignment columns |
| 011_support_tickets.sql | support_tickets, ticket_replies |
| 012_service_requests.sql | service_requests |
| 013_newsletter.sql | newsletter_subscriptions |
| 014_payments.sql | payments, billing_profiles |
| 015_campaigns.sql | campaigns, message_templates, queued_messages |
| 016_site_settings.sql | site_settings |
| 017_wizard_fields.sql | 51 post-property wizard columns on properties |
| 018_uploads.sql | uploads |

## 2. Tables (28)

### Identity & access

- **users** — id, email (unique), password_hash (scrypt),
  full_name, phone, role (CHECK over the 9 roles), status,
  created_at, updated_at. No soft delete; no deletion
  workflow (a CMS gap — see plan §16).
- **permissions** — id, name. **role_permissions** — role,
  permission_id. Grants are checked by join in auth code.
- **sessions** — id, user_id, token_hash (SHA-256),
  ip_address, user_agent, created_at, expires_at (7 days).
  No revocation UI yet.
- **password_reset_tokens** — token_hash, expires_at (1h),
  used_at. **email_verification_tokens** — token_hash,
  expires_at (24h).

### Real estate

- **properties** — id, owner_id → users, title, description,
  property_type, listing_type, price_inr, city, locality,
  area_sqft, bedrooms, bathrooms, status (draft/published…),
  deleted_at (soft delete), + 51 wizard columns (017).
  No coordinates column — map search must never invent
  coordinates.
- **property_images** — property_id, url, alt_text,
  sort_order (URL references only in Node; binary files
  live in `uploads`).
- **saved_properties** — user_id + property_id.
- **property_views** — user_id, property_id, viewed_at
  (counted views; no event pipeline yet).

### CRM

- **inquiries** — property_id, contact fields, status,
  timestamps. The lead workflow lives here.
- **lead_activities** — inquiry_id, actor_id, action, note.
- **lead_followups** — inquiry_id, created_by, due_at,
  note, done_at.
- **tags / lead_tags** — tag names + lead assignments.
- **notifications** — user_id, type, title, body, link,
  read_at. In-app rows only; no preferences store, no
  mark-all-read endpoint.

### Visits, tickets, services

- **site_visits** — property_id, user_id, scheduled_at,
  status, notes, feedback, rating, rescheduled_at.
- **support_tickets** — user_id, subject, message,
  priority, status, assigned_to. **ticket_replies** —
  ticket_id, user_id, message.
- **service_requests** — user_id, category, issue_type,
  address, preferred_date, time_slot, urgency,
  description, status, assigned_to, assigned_at,
  scheduled_at, completed_at.

### Commercial & messaging

- **payments** — user_id, description, amount_paise,
  method, reference, status, refund fields, verified_by/at.
  Offline records only; no gateway columns, no webhook
  state.
- **billing_profiles** — user_id, name/company/address/
  city/pincode/gstin.
- **campaigns** — name, objective, type, description,
  daily/total budget (paise), channels, status, created_by.
- **message_templates** — channel, name, subject, body.
- **queued_messages** — channel, recipient, body,
  template_id, status (QUEUED; never sent by this system).
- **contact_messages** — full_name, email, phone, subject
  (fixed set), message.
- **newsletter_subscriptions** — email, status, consent_at,
  unsubscribed_at.

### Settings & uploads

- **site_settings** — key, value, updated_by, updated_at.
  Only a 4-key allowlist is API-writable; secrets refused.
- **uploads** — uploader_id, property_id, kind, original
  and stored filenames, mime_type, size_bytes, is_private,
  sort_order. Server-side magic-byte sniffing; JPEG/PNG/
  WebP/GIF/PDF only; 10 MB images / 25 MB docs.

## 3. Integrity notes

- Foreign keys are enforced at runtime (`PRAGMA
  foreign_keys = ON` in `openDb`).
- Pagination fidelity quirk (documented, must be kept):
  some list modules treat an empty `?limit=` as 0 → 400,
  others fall back to 20. A CMS list API must pick one
  rule and document it; it must not silently change the
  existing modules' behaviour.
- Money is integer paise everywhere; never floats.
- Timestamps are UTC; display conversion is a frontend
  concern.
- No CMS tables exist yet. The brief's suggested names
  (`cms_pages`, `cms_page_revisions`, `cms_menus`, …)
  do not collide with any existing table.

## 4. What must not be duplicated

Do not recreate users, properties, leads, or CRM tables
for the CMS. CMS content references them: page authors are
`users`, property-linked pages reference `properties`,
CRM-linked content references `inquiries`. New tables use
foreign keys into existing tables where they relate, and
stand alone where they do not (pages, menus, media,
forms, SEO, plugins, themes, settings, logs).

## 5. Divergence to close (honest note)

The PHP deployment line (live on primepropertys.in) has
additional MySQL tables for the Priority 2/3 domains
(projects, reviews, tasks, custom roles, chat, price
history, analytics, AI status) that do **not** exist in
this Node tree's migrations. The CMS plan ports those
domains back into Node migrations (019+) so the Node
tree is again the single source of truth, before building
new CMS tables on top. Building CMS tables on a diverged
base would bake the split in permanently.
