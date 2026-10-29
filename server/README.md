# PrimePropertys backend

Zero-dependency Node.js (>= 24) server + SQLite. It serves the static
site from the repository root and a full read/write JSON API under
`/api`. (This README replaces the old "Stage D / read-only API"
description: the API now covers auth, properties, leads/CRM, contact,
site visits, support tickets, service requests and newsletter
subscriptions.)

## Run

```sh
cd server
node src/server.js            # http://127.0.0.1:8902
PORT=8903 DATABASE_PATH=/tmp/app.db node src/server.js
```

No `npm install` is needed: the server uses only Node's standard library
(`node:http`, `node:sqlite`). The database file is created on first run
and migrations in `migrations/` are applied automatically, in filename
order, tracked in `schema_migrations`.

Environment variables: `PORT` (default 8902), `DATABASE_PATH`,
`STATIC_ROOT`, `EMAIL_BACKEND`, `SESSION_COOKIE_SECURE` (=`1` forces the
`Secure` cookie flag), `FORCE_HTTPS` (=`1`, same effect — use when TLS
is terminated at a trusted reverse proxy), `PP_DEV_CONSOLE_EMAIL`
(= `1` allows the console-email dev mode, see below), `UPLOAD_DIR`
(default: a `primepropertys-uploads` sibling of the static root;
MUST be outside the static root — uploads are refused with 500
if it is not, so files can only be fetched through the
controlled download route).

Email / console-email gating (Priority 1, 2026-10-28): password-reset
and verification tokens are printed to the server log ONLY when
`EMAIL_BACKEND=console` AND (`NODE_ENV=development` OR
`PP_DEV_CONSOLE_EMAIL=1`). In every other mode those endpoints answer
503 `EMAIL_NOT_CONFIGURED` and issue no token to any log. Never run
console-email mode in production.

Session cookie (Priority 1): `Secure` is set when the request arrived
over TLS, when `X-Forwarded-Proto: https` is present, or when
`SESSION_COOKIE_SECURE=1` / `FORCE_HTTPS=1` is set. Plain-HTTP local
development still works (no `Secure` flag there).

CSRF (Priority 1): cookie-authenticated POST/PATCH/PUT/DELETE requests
with an `Origin` or `Referer` whose host does not match the request
host are rejected with 403 `CSRF_FORBIDDEN`. Requests with neither
header (curl, server-to-server, test clients) are allowed. GET is
excluded: the email-verification link is a GET.

Write rate limits (Priority 1, in-memory, single-instance only):
register 30/hour/IP, password-reset requests 10/hour/IP+email,
verification requests 30/hour/user, newsletter unsubscribe 30/hour/IP,
all other writes 300/hour per user (or per IP when anonymous) per
route group. Login (5/10 min/IP+email), inquiries (10/hour/IP),
contact (20/hour/IP) and newsletter subscribe (20/hour/IP) keep their
own, stricter limiters. Buckets are lost on restart; a multi-process
deployment needs a shared store.

There is no default admin. Create the first admin directly against the
database (see `DEPLOYMENT.md` for the exact steps).

## Conventions (all routes)

- Errors are `{error:{code,message}}`. Never a stack trace.
- Invisible resources return **404, not 403**, so existence is never
  leaked (leads, visits, tickets, service requests, drafts).
- Auth is a session cookie `pp_session` (HttpOnly, SameSite=Lax).
  Every protected operation checks the session **and** the permission
  server-side; hiding a button is never the authorization mechanism.
- Login throttling: 5 failed attempts per IP + email per 10 minutes
  → 429.
- List endpoints are paginated (`?limit=` 1–100, `?offset=`).
- Gzip is applied to text responses >= 1 KB when the client accepts it.
- Security headers on every response, including CSV: nosniff,
  SAMEORIGIN, strict-origin-when-cross-origin, and a CSP that allows
  the build's genuine inline scripts/styles plus Unsplash images only.
  Session cookie: `Secure` on HTTPS / when `SESSION_COOKIE_SECURE=1` /
  `FORCE_HTTPS=1` is set (see Environment variables above); plain
  HTTP local development keeps working without it.

## Auth

Passwords are scrypt hashes; sessions store token hashes only (never
raw tokens). Password-reset tokens live 1 hour, email-verification
tokens 24 hours. Self-registration is limited to Buyer, Seller, Owner,
Agent, Builder and Investor. 9 roles, 15 permissions (see
`migrations/002_auth.sql`).

| Route | Description |
|---|---|
| `POST /api/auth/register` | Self-registration (6 roles only) |
| `POST /api/auth/login` | Sets the session cookie |
| `POST /api/auth/logout` | Invalidates the session |
| `GET /api/auth/me` | Current user |
| `POST /api/auth/change-password` | Logged-in password change |
| `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password` | Reset flow (503 unless console-email dev mode is explicitly enabled; see above) |
| `POST /api/auth/request-verification`, `POST /api/auth/verify-email` | Email verification (same dev-mode caveat) |
| `GET /api/users` | User list; needs `users:manage`; never returns password hashes |

## Properties

All writes require login; ownership or the matching `*_any` permission
is enforced on every write. Drafts are never visible to non-owners
(404). Creating always starts as `draft`; only
`properties:publish_any` (Admin/Super Admin) can publish — that is the
approval step. Editing a published listing as a non-publisher sends it
back to `draft` for re-approval. Delete is a soft delete
(`deleted_at`). Images can be URL references OR binary uploads (see Uploads below).

| Route | Description |
|---|---|
| `GET /api/properties` | Public list: published only, with filters/sort/pagination |
| `GET /api/properties/mine` | Own listings (`?status=` draft/published/sold/rented) |
| `POST /api/properties` | Create (needs `properties:create`); always starts `draft` |
| `GET /api/properties/:id` | Detail (with images) |
| `PATCH /api/properties/:id` | Edit own (`edit_own`) or any (`edit_any`); status cannot be set directly |
| `POST /api/properties/:id/publish`, `POST /api/properties/:id/unpublish` | Approval step (needs `properties:publish_any`) |
| `DELETE /api/properties/:id` | Soft delete |
| `POST /api/properties/:id/images`, `DELETE /api/properties/:id/images/:imageId` | Image URL references |
| `POST /api/properties/:id/uploads`, `GET /api/properties/:id/uploads`, `PATCH /api/properties/:id/uploads/:uploadId`, `DELETE /api/properties/:id/uploads/:uploadId`, `GET /api/uploads/:id` | Binary uploads (see below) |
| `POST /api/properties/:id/save`, `DELETE /api/properties/:id/save` | Save / unsave |
| `GET /api/saved`, `GET /api/recently-viewed` | Own saved properties and recent views |

## Uploads (Priority 1, Phase E scoped)

One file per request, multipart/form-data with fields `kind`
(`image` or `document`) and `file`, plus optional `alt_text`
(images) and `replace_id` (replace an existing upload, keeping its
sort order). Limits: JPEG/PNG/WEBP/GIF/PDF only, identified by file
signature with the declared MIME required to match, max 10 MB per
file. Storage filenames are random server-side names; the original
name is stored for display only and never used as a path. Images
become `property_images` rows served at `/api/uploads/:id` and are
public only when the property is published; documents are private
(owner or `properties:view_any` only, even on published listings)
and are served as attachments. Ordering, replacement and deletion
are supported. No malware scanner is available in this environment,
so none is claimed — signature, MIME, size and permission checks
are the controls. The wizard Photos / Documents pickers use this
API; floor-plan, 360°, verification and report-screenshot upload
buttons are still unwired and say so.

## Leads + CRM

Inquiries ARE leads: website submissions land in `inquiries` and are
worked through the pipeline there. Enforced transitions:
`new → contacted → interested → site_visit → negotiation → closed/lost`;
`closed`/`lost` are terminal. Visibility: `leads:view_any` sees all;
otherwise a user sees leads on their own properties or assigned to
them; invisible leads return 404.

| Route | Description |
|---|---|
| `POST /api/inquiries` | Public capture (rate-limited 10/hour per IP). Property must be published. Duplicates (same property + phone/email in 30 days) are flagged via `duplicate_of`, not rejected. Phone comparison normalizes +91/trunk-0 |
| `GET /api/inquiries/mine` | Own enquiries — matched by user_id only, never by email |
| `GET /api/leads`, `GET /api/leads/:id` | List (filters: status, assigned_to, property_id) + detail |
| `PATCH /api/leads/:id` | Status move (invalid transitions → 400); every move is logged as an activity |
| `POST /api/leads/:id/assign` | Needs `leads:assign`; logs activity + creates an in-app notification for the assignee |
| `POST /api/leads/:id/notes`, `GET /api/leads/:id/activities` | Notes + full activity log |
| `POST /api/leads/:id/followups`, `GET /api/leads/:id/followups`, `PATCH /api/leads/:id/followups/:fid/done` | Follow-ups with due dates and completion |
| `GET /api/followups` | Follow-ups visible to the caller |
| `GET /api/tags`, `GET/POST /api/leads/:id/tags`, `DELETE /api/leads/:id/tags/:tagId` | Free-form tags (max 50 chars, deduped case-insensitively); add/remove logged to the timeline |
| `GET /api/leads/scores` | Score = stage points (new 10 / contacted 25 / interested 50 / site_visit 70 / negotiation 85) + 5/note (max 15) + 5/completed follow-up (max 15), capped at 100; closed = 100 Won, lost = 0 Lost; bands Hot ≥70, Warm ≥40, else Cool. Profile/budget signals are NOT in the data and are not claimed |
| `GET /api/leads/sla` | Targets from the SLA page's own copy: first contact within 1 hour, follow-up within 24 hours; breach = first response >1h, no follow-up within 24h while older than 24h, or any past-due open follow-up; closed/lost stop tracking |
| `GET /api/leads/stats` | Total, by-status, funnel, by-source, top properties, by-assignee + conversion % |
| `GET /api/leads/export` | CSV download; needs `leads:export` (Admin/Super Admin) |
| `GET /api/notifications`, `POST /api/notifications/:id/read` | Own in-app notifications, unread first |

Notifications are in-app database rows only. No email/SMS/WhatsApp
sending is configured or claimed.

## Contact

| Route | Description |
|---|---|
| `POST /api/contact` | Public message (rate-limited 20/hour per IP); subject must be one of the listed subjects |
| `GET /api/contact` | Inbox; needs `contact:view` |

## Site visits

Statuses: requested → confirmed/rejected/cancelled;
confirmed → completed/cancelled; completed/rejected/cancelled terminal.
Visibility mirrors leads: requester, property owner, assignee, and
`visits:manage` holders (Admin, Super Admin). A requester may cancel
their own requested/confirmed visit. Feedback (text + 1–5 rating) only
on completed visits. Rescheduling keeps the status and stamps
`rescheduled_at`.

| Route | Description |
|---|---|
| `POST /api/site-visits` | Request (logged in, published property only, future date only) |
| `GET /api/site-visits`, `GET /api/site-visits/:id` | Visibility-scoped list (`?status=`, `?property_id=`) + detail |
| `PATCH /api/site-visits/:id` | Status / reschedule / feedback / rating per the rules above |
| `POST /api/site-visits/:id/assign` | Needs `visits:manage`; assignee gains visibility |
| `GET /api/site-visits/stats`, `GET /api/site-visits/analytics` | Counts; analytics = totals, rates, top properties, agent totals, upcoming 7 days (no by-source: visits carry no source field) |

## Support tickets

Statuses: open → in_progress → resolved → closed, plus open→closed
and resolved→in_progress (reopen); closed terminal. Visibility:
requester, assignee, `tickets:manage` holders (Admin, Super Admin,
Support). A requester may close their own ticket from any open state,
including resolved; reopening is staff-only.

| Route | Description |
|---|---|
| `POST /api/tickets` | Create (subject ≤200, message ≤2000, priority low/medium/high) |
| `GET /api/tickets`, `GET /api/tickets/:id` | Visibility-scoped list (`?status=`, `?priority=`) + detail with reply thread |
| `PATCH /api/tickets/:id` | Status change |
| `POST /api/tickets/:id/assign` | Needs `tickets:manage` |
| `POST /api/tickets/:id/replies` | Anyone who can see the ticket |

## Service requests

Statuses: requested → assigned → scheduled → in_progress → completed,
plus cancelled from any open state; completed/cancelled terminal.
Visibility mirrors tickets: requester, assignee, `services:manage`
holders (Admin, Super Admin, Support). A requester may cancel their own
request from any open state. `preferred_date` + `time_slot` are the
user's ask; `scheduled_at` is the staff-confirmed time.

| Route | Description |
|---|---|
| `POST /api/service-requests` | Create (all form fields required; urgency low/normal/high) |
| `GET /api/service-requests`, `GET /api/service-requests/:id` | Visibility-scoped list (`?status=`, `?category=`) + detail |
| `PATCH /api/service-requests/:id` | Status and/or `scheduled_at` (assigned→scheduled sets the status; scheduled→reschedule keeps it; must be a future date/time) |
| `POST /api/service-requests/:id/assign` | Needs `services:manage`; requested→assigned, stamps `assigned_at` |
| `GET /api/service-requests/stats` | Total, by-status, in_progress (= assigned + scheduled + in_progress), resolved (= completed), closed (= cancelled) |

## Newsletter

Subscription stores consent only and never claims an email was sent
(no provider is configured). Token-based confirm/unsubscribe waits for
a provider, since tokens cannot be delivered without one.

| Route | Description |
|---|---|
| `POST /api/newsletter/subscribe` | Subscribe (rate-limited 20/hour per IP); duplicate → 200 `already_subscribed` (case-insensitive); resubscribe → 200 `resubscribed` |
| `POST /api/newsletter/unsubscribe` | Always answers neutrally, so it cannot enumerate subscribers |

## Health

| Route | Description |
|---|---|
| `GET /api/health` | Version string + status (used by tests to wait for startup) |

## Migrations

| File | Contents |
|---|---|
| `001_init.sql` | users (9 roles), properties, property_images, inquiries, saved_properties |
| `002_auth.sql` | sessions (token hashes only), reset tokens (1h), verification tokens (24h), 15 permissions |
| `003_properties.sql` | property_views |
| `004_leads.sql` | Lead pipeline support (notes, follow-ups, activities, notifications) |
| `005_contact.sql` | contact_messages + `contact:view` |
| `006_inquiries_user.sql` | inquiries.user_id |
| `007_lead_tags.sql` | tags + lead_tags |
| `008_perf_indexes.sql` | Indexes (properties status-first; inquiries assigned/status/source; followups due_at) |
| `009_site_visits.sql` | site_visits + `visits:manage` |
| `010_visit_assignment.sql` | site_visits.assigned_to |
| `011_support_tickets.sql` | support_tickets + ticket_replies + `tickets:manage` |
| `012_service_requests.sql` | service_requests + `services:manage` |
| `013_newsletter.sql` | newsletter_subscriptions |
| `014_payments.sql` | payments + billing profiles (offline/manual records only) |
| `015_campaigns.sql` | campaigns, message templates, queued messages (queue only, no delivery) |
| `016_site_settings.sql` | site_settings (allowlisted keys only; secrets refused) |
| `017_wizard_fields.sql` | wizard fields on properties |
| `018_search_filters_index.sql` | Index for server-side search filters |
| `019_property_category.sql` | `properties.category` (wizard choice) |
| `020_property_uploads.sql` | `property_uploads` (binary upload metadata) |
| `021_builder.sql` | builder_projects, project_units, milestones, amenities |
| `022_reviews.sql` | property_reviews + moderation |
| `023_tasks.sql` | staff_tasks + comments/activity |
| `024_rbac.sql` | custom_roles, role grants, admin_audit_log, sessions management |
| `025_subscriptions.sql` | subscription plans, user subscriptions, coupons, redemptions |
| `026_chat.sql` | conversations, chat messages, notification preferences |
| `027_priority3.sql` | ai_generations, analytics_events, saved_searches, search_alerts, price_history, seo_* |
| `028_newest_index.sql` | `idx_properties_newest (status, id DESC)` — Priority 4; default newest list no longer uses a temp b-tree |

Migrations run inside a transaction each and are recorded in
`schema_migrations`; a failed migration rolls back and aborts startup
rather than leaving a half-applied schema. Never edit an applied
migration — add a new forward migration instead. Production data is
never touched by tests (they use temporary databases).

## Tests

```sh
npm test    # 100 tests across 28 files, all passing (Node.js >= 24, verified 2026-10-28 Priority 4) — add a new test file to `package.json` when adding one
```

## Priority 4 (2026-10-28)

- Caching: API responses `Cache-Control: no-store`; upload
  downloads `no-store`; non-HTML static assets `public,
  max-age=3600`; HTML pages get no public cache header.
- Performance: migration 028 (`idx_properties_newest`);
  homepage 85,150 bytes raw / 16,871 gzipped on a fresh empty
  database; 140 article images lazy-loaded (fixed 150 px
  height). No speed claim is made on an empty database.
- Accessibility: form error/success messages now carry
  `role="alert"` / `role="status"` and use dark red/green
  (6.47:1 / 7.13:1 on white; the old light colours measured
  2.77:1 / 1.74:1 and failed AA); the mobile nav toggle now
  exposes `aria-expanded` / `aria-controls`; `.tbl` tables
  scroll horizontally under 600 px. No manual keyboard /
  screen-reader pass has been done — see ACCESSIBILITY.md.
- Backup/restore: procedure in DEPLOYMENT.md; a restore on a
  temporary copy was actually run and returned RESTORE_OK.
  There is still no automated/scheduled backup in this repo.
- Browser tests: NOT run — Playwright is unavailable in this
  environment, so browser journeys are not claimed. API-level
  journeys are covered by `test/journey.js` and
  `test/journeys-p1.js`.

Covered: auth/RBAC, properties, leads/CRM (incl. tags, scores, SLA,
stats, export), contact, my-enquiries, visits, tickets, services,
portal lists, newsletter, performance (gzip, headers, indexes),
accessibility, and one end-to-end journey test. The `test` script in
`package.json` lists files explicitly — add a new test file there.

## Priority 2 domains (2026-10-28)

Builder Projects + Units (`server/src/builder.js`, migration 021), Property
Reviews (`reviews.js`, 022), Staff Tasks (`tasks.js`, 023), Advanced RBAC
with custom roles + audit log + session revocation (`rbac.js`, 024; 2FA is
NOT implemented — see CHANGELOG), Subscriptions + Coupons + Promotions
(`subscriptions.js`, 025; seeded plan prices are the public prices on
`pricing.html`; paid subscriptions stay pending until staff activate
them against a verified payment; `POST /api/webhooks/payment` is a 501
stub that never activates anything), and user-to-user Chat + notification
preferences (`chat.js`, 026; in-app notifications only — email, SMS,
WhatsApp and Push are stored toggles, not delivery). Full endpoint lists
are in `FRONTEND_BACKEND_MAPPING.md` §5 and the per-module rules in
`CHANGELOG.md` ("Priority 2").

## Priority 3 domains (2026-10-28)

AI assistants (`server/src/ai.js`, migration 027): a generic
OpenAI-compatible chat-completions provider, configured only by
environment — `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`,
`AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_TIMEOUT_MS`
(default 15000). Keys are never stored in the database or sent to the
frontend. With no provider key, `POST /api/ai/generate` answers 503
`AI_NOT_CONFIGURED` and generates nothing. Limit: 20 generations per
user per UTC day. Generated text is stored as `generated`, needs
explicit approval, and only then can be applied to a property the user
may edit (title/description only; SEO generations are metadata only).
The quality check (`GET /api/properties/:id/quality-check`) is
rule-based on stored facts, not an AI judgement. No valuation endpoint
exists: an automated figure is never presented as an official
valuation.

Analytics + Reports (`server/src/priority3.js`, migration 027):
`GET /api/analytics/summary` and `GET /api/analytics/export` (CSV)
aggregate only real rows — `analytics_events` (property_view /
property_search, recorded from Priority 3 onward; earlier activity is
not reconstructed), inquiries/leads, visits, builder projects/units,
verified subscription-linked payments only (unverified/unlinked
payments are never counted as revenue), promotions, and lead sources.
Formulas are returned in the response. Staff see all rows; other
`analytics:view` holders see only their own. PDF export is NOT
implemented: this zero-dependency codebase has no PDF library, and no
PDF output is claimed.

SEO (`priority3.js`, 027): `GET/POST /api/seo/metadata`,
`GET/POST/DELETE /api/seo/redirects` (redirects are honoured with
their stored 301/302 on real requests), `GET /api/seo/duplicates`
(stored records only), `GET/PUT /api/seo/robots` (stored override or
not set), `GET /api/seo/sitemap` (live XML: static .html files that
exist plus published properties only — never drafts), and
`POST /api/seo/link-check` / `GET /api/seo/broken-links` (internal
links of a real page checked against files on disk). No search-engine
indexing status is reported anywhere. Canonical base defaults to the
existing build.py base (`https://shubhamgautambagde.github.io/primepropertys`)
and can be overridden with `SITE_BASE_URL`; the canonical-domain
decision (github.io vs primepropertys.in) is still open.

Saved searches + alerts (`priority3.js`, 027): `POST/GET/DELETE
/api/saved-searches`, `GET /api/saved-searches/:id/match`
(server-filtered, paginated), `GET /api/search-alerts`. Publishing a
property creates one deduplicated in-app notification per matching
saved search; email/SMS delivery is not configured and is never
claimed.

Price history (`priority3.js`, 027 + `properties.js`): PATCHing a
property's price appends one row (old/new price, actor, timestamp).
History is never rewritten and never backfilled for pre-table edits.
`GET /api/properties/:id/price-history` follows normal property
visibility (drafts: owner / view_any only).

Reminders (`priority3.js`, 027): `GET /api/reminders` computes visits,
lead follow-ups, tasks (due within 7 days or overdue) and
subscriptions expiring within 30 days from real rows, scoped to the
caller (staff see all). Reminders are computed on read and pushed
nowhere.

Recommendations (`priority3.js`, 027): `GET
/api/properties/:id/recommendations` ranks published properties by
how many stated attributes match (city, type, listing type, bedrooms,
price within 25%), server-paginated (max 20). The count is a count of
matching attributes, not a measured similarity score, and listings are
never bulk-downloaded to the browser.
