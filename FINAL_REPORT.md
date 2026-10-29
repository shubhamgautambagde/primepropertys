# FINAL REPORT — PrimePropertys: Complete Audit, Bug Fixing, Feature Development, Production Readiness

**Working copy only. No push to GitHub, no deploy to any host, no production data touched.**
Working copy: `~/workspace/primepropertys-audit/primepropertys`
Pristine backup: `~/workspace/primepropertys-audit/primepropertys-backup-2026-10-28`
Base commit: `0116c3b` ("Triage (25/25): system-settings + final files")
Runtime: Node.js v24.22.1 (declared requirement: Node >= 24 — **not lowered**)
Date of this report: 2026-10-28 (all work on this date; Phases A + Priorities 1–4)

## 1. Verdict first

**Production readiness: NOT READY.**

Priorities 1–4 fixed everything that could be fixed in this repo without a
provider, a host, or a user product decision. What remains is not a list of
small code defects — it is launch infrastructure and credentials that do not
exist yet, plus two honest testing gaps (no browser tests, no manual
accessibility pass) and demo data still rendering on public pages. Any
statement of the form "PrimePropertys is production-ready" would be false
until the named blockers in §12 are cleared **and** the user authorises a
deploy naming a host and a database.

## 2. Complete source audit — summary

Phase A inspected the real code (server, migrations, tests, shared CSS/JS,
build script, and sampled pages across all 27 sections) and re-counted
everything instead of copying the spec's numbers. Full detail:
`SOURCE_CODE_AUDIT.md`, `SECURITY_AUDIT.md`, `FILE_INVENTORY.json`
(generated from an actual filesystem walk, JSON-validated).

### Verified counts (recounted 2026-10-28, Priority 4 re-check)

| Item | Verified count | Notes |
|---|---|---|
| HTML pages | **653** (20 root + 633 in `sections/`, 27 sections) | Unchanged by Priorities 1–4 |
| Total size | 61.4 MB, avg ~94 KB/page (was ~91 KB in Phase A; the increase is lazy-loading attributes + rebuilt bundles) | Inlined single-file pages by design |
| Forms | **362** total: **224 wired** (`<form data-api>`) + **138 `data-backend="not-connected"`** | The 138 are exactly the unwired set; their fallback honestly shows "Demo preview — no data was saved yet". No marker was deleted to clear the audit |
| `data-api` values | **44** distinct values | Earlier docs said 17 — that was wrong (BUG-004) |
| `href="#"` occurrences in source | **186 in 52 files** | View 54, Edit 48, WhatsApp 24, View Details 22, Use Template 19, rest 19 |
| Internal links | 31,371 checked, **0 broken** | Phase A; re-verified by the journey tests' homepage/sitemap/robots checks |
| Images | 374, all with `alt` | 140 article images now lazy-loaded (Priority 4); 234 remain external Unsplash 1200 px, no `srcset` |
| Server tests | **100/100 pass** (was 59/59 in Phase A, 96/96 before Priority 4, +4 Priority 4 tests) | `cd server && npm test`, ~34 s |
| Browser tests | **0 — NOT run** | Playwright is unavailable in this environment; browser journeys are not claimed (see §9) |
| Migrations | **001–028** | Listed in §7 |
| API routes | ~94 route patterns in `server/src/server.js` + module files | Summarised in §8 |

### Documentation discrepancies found and fixed

- README said 263 not-connected forms and 54 tests → actual 138 / 59 at
  Phase A, now **100 tests** after Priorities 1–4. README updated in
  Priority 4.
- `FRONTEND_BACKEND_MAPPING.md` misstated 8+ endpoints → corrected in
  Priority 1 from `FRONTEND_BACKEND_MAPPING_AUDIT.md` (original audit
  file kept alongside it, not overwritten).
- `ACCESSIBILITY.md` said 652 pages → 653 (Priority 1).
- `DEPLOYMENT.md` said 339 audit entries in one place, 341 in another →
  removed, replaced with the Phase A recount (Priority 1).
- `server/README.md` migration table stopped at 020 → now lists 001–028
  (Priority 4).
- `TRIAGE.md` is a historical slice log (59/59 at that slice). A Priority 4
  note at its top now says so explicitly and points to this report for
  current counts, instead of rewriting history.

## 3. Prioritised bug register — status

Phase A: **32 confirmed defects** (Critical 5, High 12, Medium 11, Low 4)
plus **20 enhancements** kept separate (see §4). Full register with
file/function/line, confirmed vs expected behaviour, severity, root cause
and evidence: `BUG_REGISTER.md` (its Priority 4 status note at the top
is the authoritative post-Phase-A status; the Phase A rows are unchanged).

### Fixed in code and tested

- **BUG-001** Secure cookie: now set on HTTPS requests,
  `X-Forwarded-Proto: https`, `SESSION_COOKIE_SECURE=1` or
  `FORCE_HTTPS=1`. Plain-HTTP local dev still works.
- **BUG-002** Token logging: reset/verification tokens are printed
  only when `EMAIL_BACKEND=console` AND (`NODE_ENV=development` OR
  `PP_DEV_CONSOLE_EMAIL=1`). Default mode answers 503 and logs no token.
- **BUG-003** CSRF: cookie-authenticated state-changing requests with
  a mismatched `Origin`/`Referer` host are rejected 403
  `CSRF_FORBIDDEN`. Limitation (documented in CHANGELOG): requests
  with neither header (curl, test clients) are allowed, and
  login-CSRF with no prior session cookie is not covered.
- **BUG-004** Mapping doc: corrected (above).
- **BUG-005** README counts: corrected, then updated again to 100 tests.
- **BUG-008** Property detail: `property-details.html` now renders a
  real property by `?property_id=` (published publicly, draft only
  for owner/`properties:view_any`, missing/invalid/draft 404 — no
  fabricated listing). Live search/saved/recent cards link to real IDs.
  Static demo cards were NOT rewritten — they have no ID to point to.
- **BUG-009 / BUG-028** Server search: bedrooms, bedrooms_min,
  area_min/max, possession_status, locality are now server filters
  with correct filtered pagination totals; the 100-row client-side
  filter is removed.
- **BUG-010** Wizard remapping: removed. Lease/PG/Office/Shop/
  Warehouse are no longer silently remapped — the server rejects
  them with an explicit error naming the choice. Category is now
  persisted (migration 019). Extending the enums still needs a user
  decision (table rebuild, CHECK constraints in migration 001).
- **BUG-012** Binary upload (scoped): real multipart upload for
  property images/documents — signature+MIME+size (max 10 MB),
  safe random filenames, storage outside the static root
  (`UPLOAD_DIR`, refused with 500 if inside it), images public
  only when published, documents private even on published
  listings, ordering/deletion/replacement, tested for invalid /
  MIME-mismatched / oversized / unauthorised files.
- **BUG-017** Rate limits: all writes now limited (register
  30/hour/IP, reset 10/hour/IP+email, other writes 300/hour/user
  or IP per route group; pre-existing stricter limiters unchanged).
  Buckets are in-memory, single-instance only — a multi-process
  deployment needs a shared store.
- **BUG-023** Admin audit log: added in Priority 2 (migration 024).
- **BUG-025** Count inconsistencies: corrected (above).
- **Priority 4 (new, not a Phase A numbered bug):** form error/success
  colours failed AA (#F87171 = 2.77:1, #4ADE80 = 1.74:1 on white) →
  now #B91C1C = 6.47:1, #166534 = 7.13:1; form messages now carry
  `role="alert"` / `role="status"`; mobile nav toggle now exposes
  `aria-expanded` / `aria-controls`; `.tbl` tables scroll under
  600 px. All asserted in `server/test/perf-p4.js`.

### Still open — do not claim these fixed

- **BUG-006** Server binds all interfaces but logs
  `http://127.0.0.1:PORT` (still present at `server.js:1177-1178`).
- **BUG-007** `.env` is never loaded (no dotenv loader); the
  documented "copy `.env.example` to `.env`" workflow silently fails.
- **BUG-011** Wizard early steps exist only in `sessionStorage`;
  no server draft before the description step (documented honestly,
  not faked).
- **BUG-015** Settings prefill on 3 pages (not re-checked in Priority 4).
- **BUG-016** Non-user admin tables are still static demo rows.
- **BUG-018** 8 sections had no group JS file in Phase A; Priority 2/3
  wiring partially addressed this, but it was not fully re-audited.
- **BUG-020** Demo data: demo phone still renders (693 matches
  counted 2026-10-28, was 691 in Phase A); demo listings/reviews
  still render on public pages.
- **BUG-021** Canonical/sitemap point to github.io; sitemap lists
  105/653 URLs. Needs the canonical-domain decision.
- **BUG-022** 7-day sessions, no idle timeout; session endpoints
  exist (Priority 2) but a revoke UI was not verified.
- **BUG-027** WhatsApp number policy undecided (owner phones gated
  by `hide_number`; public exposure is a privacy decision).
- **BUG-029 / BUG-030** No manual accessibility pass, no browser
  tests, no migration-rollback test.
- **BUG-031** Page weight (~94 KB/page inlined) — by design.
- **BUG-032** Lead score is stage-points only — copy caveat stands.
- **BUG-013 / BUG-014** are missing capabilities, not fixed defects:
  payments are pending records with a 501 webhook stub; SMS/WhatsApp
  are queued rows only, never sent (see §12).

### What is genuinely solid (not rebuilt)

Auth (scrypt, hashed tokens, timing-safe compare), property
draft → admin-publish flow, enquiries → leads pipeline (transitions,
scores, SLA, CSV export), visits, tickets, services, contact,
newsletter, offline payments, campaigns/templates/queue, settings
allowlist, user admin — all server-side permission-checked and
test-covered. All 44 `data-api` values have a handler and vice versa
(0 orphans, Phase A). All SQL uses parameterised queries; the one
dynamic ORDER BY uses a hardcoded allowlist. `innerHTML` assignments
in shipped JS: 0 (enforced by a test).

## 4. Feature gap analysis — status

Phase A enhancements (20) and their Priority 2/3 outcome. Detail:
`FEATURE_GAP_ANALYSIS.md`.

| Enhancement | Status after Priorities 2–3 |
|---|---|
| E-01 Builder Projects + Units | **Implemented** (migration 021, builder.js, towers/units, milestones, amenities, verification, publish flow, builder-only ownership) |
| E-02 Property Reviews | **Implemented** (migration 022, moderation, reporting, aggregation, verified-visit indicator from visits only — never fabricated) |
| E-03 Staff Tasks | **Implemented** (migration 023, assignment, due/priority/status, comments, activity) |
| E-04 Custom Roles / Permissions | **Implemented** (migration 024, custom roles ADD permissions only, built-ins untouched, admin audit log). 2FA is **NOT** implemented |
| E-05 Subscriptions / Billing | **Implemented as catalog + entitlements** (migration 025, plans, limits/credits, renew/upgrade/downgrade/cancel/expire, invoice + payment history). **No gateway** — paid subscriptions stay pending until staff activate against a verified payment |
| E-06 Coupons / Promotions | **Implemented** (migration 025, discount types, dates, usage/per-user limits, eligible plans, boosts, audit log) |
| E-07 User-to-user Chat | **Implemented, in-app only** (migration 026, conversations, membership, unread counts, mark-read, rate limiting, no phone exposure without consent) |
| E-08 AI Assistants | **Implemented as a provider abstraction, no provider configured** (migration 027, ai.js, OpenAI-compatible chat-completions, server-side keys only, 20 generations/user/UTC day, human approval before publish, 503 `AI_NOT_CONFIGURED` without a key, quality check is rule-based, no valuation endpoint) |
| E-09 Analytics / Reporting | **Implemented from real events only** (migration 027, property/search/lead/visit/subscription reports, CSV export). PDF export **blocked** (no library/decision) |
| E-10 SEO Management | **Implemented** (migration 027, metadata records, redirects honoured as real 301/302, robots, duplicate detection, link checks; crawler claims only for pages actually checked). Canonical domain still undecided |
| E-11 Search Alerts | **Implemented, in-app only** (migration 027, saved searches + alerts; email alerts need an email provider) |
| E-12 Price History | **Implemented** (migration 027, append-only price events on PATCH) |
| E-13 Profile fields | Not separately reported as done in Priority 2/3 — treat as **unverified / still open** unless a later check proves otherwise |
| E-14 Notification Preferences / Push | **Preferences implemented, in-app only** (migration 026); Push **not implemented** (no VAPID keys) |
| E-15 Form Builder storage | **Not implemented** (no stored-form/submission domain reported) |
| E-16 Visit Reminders | **Implemented as computed-on-read** (Priority 3; never pushed — pushing needs a channel/provider) |
| E-17 Account Deletion workflow | **Not implemented** (needs an explicit user decision on retention/anonymisation; never autopilot) |
| E-18 Property Verification workflow | Partial: publish approval exists; a separate verification table/workflow beyond publish was **not** reported as built |
| E-19 Saved searches / Recommendations | **Implemented** (saved searches in migration 027; recommendations from real signals only, similar-properties pre-existed) |
| E-20 PDF/CSV reports beyond leads | CSV: leads export pre-existed, analytics CSV added (Priority 3). PDF: **not implemented** |

## 5. Implemented feature list (cumulative, verified by tests unless noted)

Auth + RBAC (9 roles, 15 permissions, custom roles, audit log, session
revocation endpoints), property create/edit/draft/submit/admin-publish/
unpublish/archive/soft-delete, public search with server filters +
pagination + saved/recently-viewed/similar, enquiries → leads (assign,
notes, follow-ups, tags, scores, SLA, stats, CSV export), contact inbox,
site visits (request/assign/schedule/complete/feedback, analytics),
support tickets + replies, service requests, newsletter, offline
payments + billing profiles + refund requests, campaigns/templates/
queued messages (queue only), settings (allowlisted), user admin,
builder projects + units, reviews, staff tasks, subscriptions +
coupons/promotions (no gateway), in-app chat + notification
preferences, AI generation abstraction (503 without a key), analytics
from real events, SEO records/redirects, saved searches + alerts,
price history, reminders (computed on read), recommendations, binary
property uploads (scoped, see §3), live property detail rendering,
CSRF Origin check, write rate limits, HTTPS-aware Secure cookies,
gated token logging, cache headers (API no-store, static public
3600 s, HTML uncached), lazy article images, accessibility fixes
(§10).

## 6. Remaining disconnected forms and unresolved links

- **Remaining `data-backend="not-connected"` forms: 138** (unchanged
  count — no marker was deleted). These are the forms whose operation
  needs a provider, a product decision, or a domain that was not built
  (see `PLACEHOLDER_LINKS_REPORT.md` and the per-section grouping in
  `FRONTEND_BACKEND_MAPPING.md`): payments (provider), campaigns
  (email provider), settings pages holding secrets, the post-property
  wizard's floor-plan/360°/verification/report-screenshot upload
  steps, admin tables whose demo rows carry no IDs, form-builder
  storage, account deletion, and similar.
- **Remaining `href="#"` occurrences in source: 186 in 52 files.**
  By link text (Phase B report, still matching the recount):
  View 54, Edit 48, WhatsApp 24, View Details 22, Use Template 19,
  Share 6, Download Plan (PDF) 2, Compose New 1, Mark all as read 1,
  Play Video 1, calendar controls 3, More 1, Reset 1, Export 1.
  Runtime resolutions (the static source still counts them, but the
  clicked link is real): the 8 user-table pages render live from
  `GET /api/users` with real View/Edit destinations, and Use Template
  links navigate with `?template_id=`. Everything else is unresolved
  for the reasons in the report — inventing a destination would
  fabricate a link, so none was invented.

## 7. Database schema and migrations (001–028)

Migrations run in filename order, one transaction each, tracked in
`schema_migrations`; a failed migration rolls back and aborts startup.
Never edit an applied migration — add a forward one. No down-migrations
and no migration-rollback test exist.

| File | Contents |
|---|---|
| 001_init.sql | users (9 roles), properties, property_images, inquiries, saved_properties; property_type/listing_type CHECK constraints (the reason enum extension needs a table rebuild) |
| 002_auth.sql | sessions (token hashes only), reset tokens (1 h), verification tokens (24 h), 15 permissions |
| 003_properties.sql | property_views |
| 004_leads.sql | lead pipeline (notes, follow-ups, activities, notifications) |
| 005_contact.sql | contact_messages + `contact:view` |
| 006_inquiries_user.sql | inquiries.user_id |
| 007_lead_tags.sql | tags + lead_tags |
| 008_perf_indexes.sql | status-first properties index; inquiries assigned/status/source; followups due_at |
| 009_site_visits.sql | site_visits + `visits:manage` |
| 010_visit_assignment.sql | site_visits.assigned_to |
| 011_support_tickets.sql | support_tickets + ticket_replies + `tickets:manage` |
| 012_service_requests.sql | service_requests + `services:manage` |
| 013_newsletter.sql | newsletter_subscriptions |
| 014_payments.sql | payments + billing profiles (offline/manual records only) |
| 015_campaigns.sql | campaigns, message templates, queued messages (queue only) |
| 016_site_settings.sql | site_settings (allowlisted keys; secrets refused with 400) |
| 017_wizard_fields.sql | wizard fields on properties |
| 018_search_filters_index.sql | `idx_properties_search_filters (status, bedrooms, area_sqft, possession_status)` |
| 019_property_category.sql | `properties.category` (residential/commercial/land/project) |
| 020_property_uploads.sql | `property_uploads` (binary upload metadata) |
| 021_builder.sql | builder_projects, project_units, milestones, amenities |
| 022_reviews.sql | property_reviews + moderation |
| 023_tasks.sql | staff_tasks + comments/activity |
| 024_rbac.sql | custom_roles, role grants, admin_audit_log, session management |
| 025_subscriptions.sql | subscription plans, user subscriptions, coupons, redemptions |
| 026_chat.sql | conversations, chat messages, notification preferences |
| 027_priority3.sql | ai_generations, analytics_events, saved_searches, search_alerts, price_history, seo_* |
| 028_newest_index.sql | **Priority 4:** `idx_properties_newest (status, id DESC)` |

## 8. API documentation — summary

Full per-route documentation is in `server/README.md` and the route
tables in `FRONTEND_BACKEND_MAPPING.md` §§2–5. Conventions (all routes):
errors are `{error:{code,message}}`, never stack traces; invisible
resources return 404, not 403 (no existence leak); auth is an HttpOnly,
SameSite=Lax session cookie `pp_session`; every protected operation
checks session + permission server-side; list endpoints are paginated
(`?limit=` 1–100, `?offset=`); gzip applies to text >= 1 KB when
accepted; security headers on every response.

Key groups (route patterns, not an exhaustive listing): auth
(`/api/auth/*`, `/api/users`), properties (`/api/properties`,
`/api/properties/mine`, `/api/saved`, `/api/recently-viewed`,
`/api/properties/:id/uploads`, `/api/uploads/:id`), leads/CRM
(`/api/leads`, `/api/followups`, `/api/tags`, `/api/leads/stats`,
`/api/leads/sla`, `/api/leads/scores`, `/api/leads/export`),
inquiries (`/api/inquiries`, `/api/inquiries/mine`), contact,
site visits, tickets, services, newsletter, payments
(`/api/payments`, `/api/billing-profile`, `/api/webhooks/payment`
= 501 stub), campaigns/templates/queued-messages, settings,
builder projects, reviews, tasks, custom roles + admin audit log,
subscription plans/subscriptions/entitlement/coupons, conversations,
notification preferences, AI (`/api/ai/generate` = 503 without a key,
`/api/ai/generations`), analytics (`/api/analytics/summary`,
`/api/analytics/export` CSV), SEO (`/api/seo/*`), saved searches,
search alerts, reminders, health (`/api/health`).

## 9. Modified file list

The working copy is uncommitted (base commit `0116c3b`), so the full
list is `git status` in the working copy — 711 entries at the Priority 4
start, plus the Priority 4 changes below. The bulk of the count is the
build: `python3 tools/build.py` re-inlines the shared CSS/JS bundle
into all 653 pages, so a shared-file change touches every page even
when only the bundle changed. Page bodies changed only where a module
says so (see CHANGELOG.md, Priority 1–4 sections).

### Priority 4 changes (this stage)

- `server/src/server.js` — API `Cache-Control: no-store`; upload
  downloads `no-store`; non-HTML static assets `public, max-age=3600`;
  HTML pages get no public cache header.
- `server/migrations/028_newest_index.sql` — new (see §7).
- `server/test/perf-p4.js` — new, 4 tests (cache headers, 028 index +
  query plan, accessibility source checks, lazy article images).
- `server/package.json` — `perf-p4.js` added to the test script.
- `assets/js/forms.js` — form messages: `role="alert"` / `role="status"`,
  dark red/green colours (see §10).
- `assets/js/navigation.js` — nav toggle `aria-expanded` /
  `aria-controls`.
- `assets/css/responsive.css` — `.tbl` horizontal scroll under 600 px.
- 42 HTML pages — `loading="lazy" decoding="async"` added to their
  140 article images (fixed 150 px height).
- `assets/css/style.css`, `assets/js/main.js` — regenerated by
  `tools/build.py` (second run: 0 pages changed, idempotent).
- Docs: `README.md`, `server/README.md`, `DEPLOYMENT.md`,
  `ACCESSIBILITY.md`, `PRODUCTION_READINESS.md`, `TRIAGE.md`
  (superseding note), `BUG_REGISTER.md` (Priority 4 status note),
  `CHANGELOG.md` (Priority 4 entry, below), and this file.

### Priority 4 CHANGELOG entry

Appended at the end of `CHANGELOG.md` with this report (performance
numbers, cache headers, index 028, accessibility fixes, backup/restore
test result, documentation reconciliation, and the still-open items).

## 10. Automated test results

| Run | Result |
|---|---|
| Phase A baseline | 59/59 pass |
| Before Priority 4 | 96/96 pass |
| Priority 4 new tests alone (`node --test server/test/perf-p4.js`) | 4/4 pass |
| Priority 4 full suite (`cd server && npm test`) | **100/100 pass, 0 fail, 0 skipped, ~34 s** |
| Build idempotence | `python3 tools/build.py` twice — second run **0 pages changed** |
| Restore test (Priority 4, temporary copies only) | **RESTORE_OK** — register → create property `RESTORE-CHECK-VILLA` (id 1) → SQLite backup API → fresh server on the copy → login → `/api/properties/mine` returned the same property |

Tests run against temporary databases that are deleted afterwards; no
fake production data is ever inserted. Test files (28): run, auth,
properties, leads, contact, my-enquiries, crm, perf, a11y, journey,
visits, tickets, services, portal-lists, newsletter, payments,
campaigns, settings, wizard, users-admin, security-p1, detail-p1,
search-p1, wizard-p1, upload-p1, journeys-p1, priority2, priority3,
perf-p4.

### Browser test status — honestly: NOT run

Playwright is unavailable in this environment (no package, no browser
binaries, no global install). Browser journeys 1–11 from the spec were
therefore **not** executed and are **not** claimed. The equivalent
API-level journeys are covered by `test/journey.js` and
`test/journeys-p1.js` (registration → login → dashboard → logout;
property draft → admin publish → public search/detail; search →
detail → enquiry → lead visible to admin; unauthorised denied;
invalid upload rejected). Installing Playwright + a browser in an
environment that allows it, then re-running journeys 1–6 and 9–11
against a served copy, is a named remaining step.

## 11. Security review

Full review: `SECURITY_AUDIT.md` (Phase A, code-reading findings — **no
penetration test was run, and none is claimed**; no dependency scan
beyond noting zero runtime dependencies, with Node itself as the
dependency to keep patched at >= 24).

- Sound and unchanged: scrypt password hashing (N=16384, r=8, p=1,
  random salt, timing-safe compare), SHA-256-hashed session/reset/
  verification tokens (reset 1 h, verification 24 h, reset single-use),
  parameterised SQL everywhere (dynamic ORDER BY from a hardcoded
  allowlist), server-side authorisation on every protected route
  (ownership or permission, else 404 — no existence leak), no secrets
  in the repo, static path-traversal blocking, no stack traces in API
  errors, `innerHTML` count 0 in shipped JS.
- Fixed in Priorities 1–4: Secure cookie on HTTPS, gated token logging,
  CSRF Origin check, rate limits on all writes, upload validation +
  private-document access control, admin audit log (Priority 2),
  API/download `no-store` cache headers (Priority 4).
- Still open: 2FA does not exist (security pages carry toggles that do
  not save — documented, not faked); email verification is not enforced
  for login (a product decision, not silently changed); 7-day sessions
  with no idle timeout; no PII encryption-at-rest beyond SQLite file
  permissions; no request logging / error monitoring / alerting;
  CSP still requires `unsafe-inline` because of the inlined-page build
  (removing it needs a linked-asset build + nonces/hashes); no HSTS
  (correct to add only once HTTPS is real); no CORS headers (currently
  protective — same-origin API only — and must stay that way unless a
  cross-origin client is explicitly approved).
- Security testing in Priority 4: re-ran the security-relevant suites
  (`security-p1`, `auth`, `users-admin`, `upload-p1`) as part of the
  100/100 run; added tests only for real behaviours (cache headers,
  index plan, accessibility source checks, lazy images). No fuzzing,
  no penetration test, no review of any production hosting that is not
  in this repo, and no review of the GitHub Pages static configuration
  beyond noting it serves pages without the API.

## 12. Performance — before / after (measured, not estimated)

Measured with a fresh empty database on the local Node server
(2026-10-28, Priority 4 measurement script, temporary server + DB).

| Measurement | Before Priority 4 | After Priority 4 | Interpretation |
|---|---|---|---|
| Homepage raw size | 85,150 bytes | 86,296 bytes | +1,146 bytes = lazy-loading attributes on article images; not a regression, a feature addition |
| Homepage gzipped | 16,871 bytes (-80%) | (gzip unchanged in mechanism; same -80% class) | Gzip was already in place (text >= 1 KB, client accepts gzip) |
| Homepage response | 15.7 ms | 19.6 ms | Same order; timing on an empty local DB is noise, no speed claim |
| CSS asset (`/assets/css/base.css`) | 1,475 bytes, no Cache-Control | 1,475 bytes, `public, max-age=3600` | Repeat visits can now cache static assets for 1 hour |
| API health / list / detail-404 / filtered search | 3.7–6.5 ms, no Cache-Control | 3.6–7.6 ms, `no-store` | No speed improvement is claimed on an empty database; the change is correctness (private data never in a shared cache) |
| Default list query plan (`status='published'`, newest first) | `SEARCH … USING INDEX idx_properties_search_filters` + `USE TEMP B-TREE FOR ORDER BY` | `SEARCH … USING INDEX idx_properties_newest (status=?)`, **no temp b-tree** | Migration 028; asserted in `perf-p4.js`. Filtered (bedrooms) queries now also scan in id order on an empty DB — the planner may choose differently on a large DB, and that choice is not claimed |
| Page weight | ~91 KB/page avg (Phase A) | ~94 KB/page avg, 61.4 MB total | Inlined bundle by design; a linked-asset build is the only way to remove this ceiling, and it was not built (it would change CSP + single-file preview behaviour) |
| Images | 374 external Unsplash, 1200 px, 0 lazy | 140 article images lazy (fixed 150 px height, no layout shift); 234 still 1200 px, no `srcset` | No responsive-image claim for the remaining 234 |

No private data is cached in a shared cache: API and upload downloads
are `no-store`; only non-HTML public static assets are public-cached;
HTML pages are uncached so rebuilds are never masked.

## 13. Deployment checklist

| Item | Status |
|---|---|
| Supported runtime | Node >= 24 declared and verified (v24.22.1); zero runtime dependencies |
| Database persistence | SQLite file via `DATABASE_PATH`; migrations 001–028 auto-applied, tracked in `schema_migrations`; single-process (no pooling concern, but also no multi-process story) |
| Database backups | **Procedure documented + restore tested on a scratch copy (RESTORE_OK). No automated/scheduled backup, no backup encryption in-repo** — blocks launch |
| Migration safety | One transaction per migration, rollback on failure; **no down-migrations, no migration-rollback test, no production dry-run** |
| HTTPS | **Not ready** — no TLS in the server (correct; terminate at a reverse proxy), no proxy config, no HSTS, no real-host verification |
| Secure cookies | HTTPS-aware (Priority 1, tested); only actually Secure if HTTPS termination is real |
| Secrets management | No secrets in repo; settings allowlist refuses secrets; env vars only. **`.env` files are never loaded** — the documented copy workflow silently fails |
| File permissions | Specified in DEPLOYMENT.md (owner-only, `chmod 600` for DB + uploads); **not verified on a real host** |
| Upload restrictions | Implemented + tested (signature/MIME/size, 10 MB, outside static root, private documents). No malware scanner available or claimed |
| Logging / error monitoring | Token logging gated (dev-only flag). **No request logging, error monitoring, or alerting** |
| Rate limiting | All writes limited, in-memory, single-instance only |
| Authorisation | Server-side checks verified for all built domains; new domains must meet the same bar + IDOR tests |
| Payment verification | **Not ready** — 501 webhook stub, pending records only |
| Email configuration | **Not ready** — no provider; 503 outside dev mode |
| SMS / WhatsApp | **Not ready** — queued rows only |
| AI provider | **Not ready** — no key; 503 |
| Push | **Not ready** — toggles only |
| Deployment architecture | **Not ready** — no named host, reverse proxy, process manager, health-check, or restart policy in this repo |
| Restore procedure | Documented + scratch-copy tested; **not tested on a real host** |
| Incident response | **No runbook, contact/decision list, or breach-notification procedure** |
| Accessibility (manual) | **Not done** — automated scans + Priority 4 source checks only |
| Browser testing | **Not done** — Playwright unavailable |
| Demo data | **Still renders** (demo phone 693 matches, demo listings/reviews) |
| Canonical domain / SEO | **Undecided** — github.io canonical, sitemap 105/653 URLs |
| Deploy authorisation | **Not given** — no host + database has been named by the user, and no deploy was performed |

## 14. Known limitations (complete, not softened)

1. No production host, HTTPS termination, process manager, or health-check exists in this repo.
2. No email, SMS, WhatsApp, payment-gateway, AI, push, or map provider is configured; every such flow answers honestly (503 / 501 / queue-only) and nothing is simulated as delivered.
3. 138 forms and 186 `href="#"` occurrences remain in source (see §6) for the reasons stated there.
4. Wizard Lease/PG/Office/Shop/Warehouse choices cannot create a draft until the user decides: extend the enums via a table rebuild, or remove/restrict those choice cards.
5. Wizard early steps are device-local (`sessionStorage`) until the description step; closing the tab loses them.
6. 2FA, account-deletion workflow, form-builder storage, PDF export, and a separate property-verification workflow beyond publish approval are not built.
7. No manual keyboard/screen-reader pass, no browser tests, no migration-rollback test, no load test beyond gzip + query-plan checks, no penetration test.
8. No automated backup, no backup encryption in-repo, no error monitoring, no incident runbook.
9. Demo data still renders on public pages; the demo phone, demo listings, and demo reviews must be removed or visibly labelled before launch.
10. The live primepropertys.in site is a separate Botble deployment and is out of scope for this repo — do not conflate it with this codebase, and never restore this repo's database onto that site's data.
11. `.env` files are silently ignored, and the server log still says `127.0.0.1` while binding all interfaces — both are open defects (BUG-007, BUG-006) that an operator must know about.
12. The inlined-page build (~94 KB/page, `unsafe-inline` CSP) is a deliberate design trade-off for single-file preview; removing it needs a linked-asset build that was not in scope for Priority 4.

## 15. Recommended next development phase (in order)

1. **User decisions (blocking everything else):** canonical domain
   (github.io vs primepropertys.in); wizard enum (extend vs restrict);
   WhatsApp number policy; subscription plan prices/limits/credits
   (if paid plans are to launch); account-deletion
   retention/anonymisation policy; upload retention/backup policy;
   whether email-gated flows stay disabled or get a provider.
2. **Credentials (test mode first, one at a time):** payment gateway
   test keys + webhook secret (then webhook signature verification +
   idempotent handling + a real test-mode purchase before any paid
   entitlement is activated); transactional email provider; AI provider
   key (only then does `POST /api/ai/generate` do anything real);
   SMS / WhatsApp Business / push only if those channels are wanted.
3. **Launch infrastructure:** named host + reverse proxy with HTTPS +
   HSTS, process manager + restart/health-check, automated SQLite +
   upload backup with a restore test **on that host**, file
   permissions verified there, error monitoring + log policy (no
   tokens/passwords/bodies), shared rate-limit store if multi-process.
4. **Testing gaps, in this order:** Playwright + browser journeys
   1–6 and 9–11 against a served copy; manual keyboard/screen-reader
   pass on portal/CRM/admin widgets; migration-rollback test;
   demo-data removal or labelling on every public page.
5. **Then, and only then:** a production-readiness sign-off re-run
   against the launch candidate, with every checklist row either Ready
   or explicitly accepted in writing by the user with its risk noted —
   followed by explicit user authorisation naming the host and the
   database. No automatic deploy at any point.
6. **Deferred product work (after launch, not before):** 2FA,
   account-deletion workflow, form-builder storage, PDF export,
   separate property-verification workflow, linked-asset build
   (removing the `unsafe-inline` CSP requirement), responsive
   images/`srcset` for the remaining 234 images, and the remaining
   138 unwired forms that need the decisions in (1).

## 16. Priority 4 file inventory (for the record)

New/changed in Priority 4 only — see §9 for the full list. All other
files are as left by Priorities 1–3, whose per-module change lists are
in `CHANGELOG.md`. The working copy remains uncommitted; committing
and pushing are separate, user-authorised steps that were **not**
performed here.
