# FEATURE GAP ANALYSIS — PrimePropertys (2026-10-28)

Method: every brief phase (A–V) checked against the shipped code
(migrations 001–017, 59 tests, audit 187). Status: DONE (shipped and
tested), PARTIAL (some endpoints/pages live, some missing),
MISSING (no domain), BLOCKED (needs a credential, provider, or
product decision — never invented).

## DONE

- Audit + bug fixing (Stages A–C): shared CSS/JS, build.py, 1,495 →
  187 audit entries, 0 broken links.
- Auth + RBAC (Stage E): 9 roles, 15+ permissions, scrypt, throttling,
  token-hash sessions, reset (1h) + verification (24h) tokens.
- Property management core (Stage F + wizard): create/edit/draft/
  publish/unpublish/soft-delete, save, recently viewed, similar,
  sort, wizard draft flow (51 columns), duplicate check, completeness
  score. Missing pieces are listed under PARTIAL, not here.
- Leads + CRM (Stage G + phases 1–6): inquiries, transitions, assign,
  notes, follow-ups, CSV export, tags, scoring, SLA, stats, timeline.
- Site visits, tickets, services, portal lists, newsletter,
  payments (offline records), campaigns + templates + queued
  messages, settings (4-key allowlist), admin user tables + user edit.
- SEO basics (Stage I): sitemap (105 URLs), robots, canonical + OG.
- Performance + security basics (Stage I): gzip, security headers,
  indexes, DOM-based rendering (no user-data innerHTML).
- Accessibility basics (Stage I): aria labels, skip links,
  focus-visible, AA-passing brand contrast (measured, not changed).

## PARTIAL (shipped part works; rest is a gap)

- **Property detail rendering:** search-results cards link to the
  wired enquiry flow, and saved/recently-viewed render live — but
  no live property-detail page renderer exists, so demo-card View
  Details links cannot point at real records yet.
- **Property search:** city/type/listing_type/price + client-side
  bedrooms/possession/area filters work; amenities, possession-date,
  verified-only, builder-project, saved-search and alert filters do
  not exist as data filters.
- **Payments:** full offline/manual record domain (pending → verified
  / rejected / refund flow, billing profiles, invoices derived from
  records). No gateway, no webhooks, no entitlement activation.
- **Campaigns:** ad-campaign CRUD + status flow + templates + queued
  SMS/WhatsApp. No ad-platform metrics (no platform connected) and
  no delivery.
- **Notifications:** in-app DB rows only. No preferences store, no
  mark-all-read write endpoint, no email/SMS/WhatsApp/push delivery.
- **Settings:** the 4-field settings row only; per-page titles
  (SMTP, API, OTP, 2FA…) have no fields and no provider backing.
- **Visits analytics:** computed from visits only (no by-source).
- **SEO:** static sitemap/robots/meta only; no metadata records,
  redirects store, crawler, or audit history.

## MISSING (no domain — brief Phases E–V, Priority 2–3)

- **Phase E (Priority 1):** binary image/document upload — the
  single largest Priority-1 gap. URL references only today.
- **Phase F:** builder projects, towers, units, milestones, offers,
  project enquiries/CRM.
- **Phase G:** reviews + moderation + reporting + aggregation.
- **Phase H:** staff tasks (creation, assignment, comments,
  reminders, overdue alerts, reporting).
- **Phase I:** subscription catalog, plans, credits, renewals,
  upgrade/downgrade, expiration, entitlement checks.
- **Phase J:** coupons, discount rules, boosts, featured packages,
  promotion purchase history.
- **Phase K:** AI assistants (all 12 listed) — no provider, no
  abstraction yet. Must ship with an honest unavailable state.
- **Phase L:** analytics from real events — property views are
  counted (property_views table) but no event pipeline, exports,
  scheduled reports, or revenue/promotion reporting.
- **Phase M:** user-to-user chat (dedicated model), conversation
  lists, unread counts, visit/follow-up reminders, delivery status.
- **Phase N:** custom roles, permission matrix/overrides/scope,
  temporary permissions, admin audit log, login activity, session
  revocation UI, 2FA, suspicious-login alerts, account-deletion
  workflow, privacy preferences. (Account suspension exists as a
  user status; the rest does not.)
- **Phase O:** SEO management system (metadata records, redirects,
  crawler/analyzer, audit history, indexing status).
- **Phase P:** saved searches, search alerts, recommendations
  engine, map search (no coordinates exist — never invent them).
- **Phase Q:** beyond gzip/headers/indexes: no asset versioning,
  lazy loading, responsive images, or measured before/after
  performance report.
- **Phase R:** all external providers (email, SMS, WhatsApp, payment
  gateway, AI) — configuration documented, none connected.
- **Phase S:** beyond the automated checks: no manual screen-reader
  or keyboard walkthrough, no device testing record.
- **Phase T:** no browser-automation (Playwright) journeys yet;
  journeys 1–12 are partially covered by API tests, not browser runs.
- **Phase U/V:** this document + PRODUCTION_READINESS.md close the
  documentation gap; production verification itself is blocked on
  the hosting decision.

## BLOCKED (needs a decision or credential — do not invent)

- Live payment gateway (provider + keys + webhook secret).
- Email/SMS/WhatsApp providers (keys + sender identities).
- AI provider (key + model choice).
- WhatsApp per-listing number policy (privacy decision).
- Hosting: Node vs PHP-only port.
- Account deletion policy (confirmation + retention rules).
- Plan catalog prices/rules (subscription domain input).

## Priority order (brief §26, applied)

1. Remaining critical forms + detail rendering + browser journeys,
   then binary uploads (Phase E).
2. Projects, reviews, tasks, custom roles, subscriptions, coupons,
   notification preferences, chat.
3. AI, analytics, SEO management, search alerts, price history,
   reminders, reports.
4. Performance, accessibility, provider integrations, backup/
   recovery, production verification.

Detail per remaining form/link: TRIAGE.md. Counts: audit 187
(132 form files, 52 link files), not-connected occurrences 138,
href="#" occurrences 186, tests 59/59 — all recounted 2026-10-28.
