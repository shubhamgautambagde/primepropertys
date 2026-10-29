# PrimePropertys — Deployment guide (Stage J)

Final verification state (2026-10-28, Priority 4): 100/100 tests pass
(including the end-to-end journey test below), build idempotent
(second run 0 pages changed), audit 0 broken internal links.
Verified recounts: 653 pages, 362 forms (224 wired + 138
`data-backend="not-connected"`), 186 `href="#"` occurrences in
source. Stages A–J of the brief are done; the items under "Not
production-ready yet" are the remaining work, and each needs a
user decision or real credentials. This document is NOT a
production-readiness sign-off — see PRODUCTION_READINESS.md and
FINAL_REPORT.md (verdict: NOT ready).

## Architecture: two halves, honestly separated

| Half | Where it runs | What works there |
| --- | --- | --- |
| Static site (653 pages) | GitHub Pages: https://shubhamgautambagde.github.io/primepropertys/ | All public content, blog/news, property browse pages, forms' UI |
| Node.js API + SQLite | A Node host (not Pages) | Login, live listings, dashboards, CRM, export, contact inbox |

GitHub Pages serves static files only. On Pages, API-backed
sections honestly report that the server is unreachable instead
of faking success. Until the Node server is hosted, treat Pages
as the public brochure and the Node server as the app.

## Running the Node server

Requirements: Node.js >= 24 (uses `node:sqlite`, no
dependencies to install — there is no `npm install` step).

```sh
cd server
PORT=8902 DATABASE_PATH=data/primepropertys.db node src/server.js
```

On start the server applies every migration in
`server/migrations/` in order (001–028). A fresh database
starts **empty**: no demo properties, leads, or users are
seeded. That is deliberate — the brief forbids hardcoded
sample data as production data.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8902` | Port to listen on |
| `DATABASE_PATH` | `server/data/primepropertys.db` | SQLite file |
| `STATIC_ROOT` | site root (parent of `server/`) | Static files served alongside the API |
| `EMAIL_BACKEND` | `console` | See "Email" below |

### Creating the first admin

There is no default admin account (that would be a shipped
credential). Create one with the server's own password hash:

```sh
cd server
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './src/auth.js';
const db = new DatabaseSync('data/primepropertys.db');
db.prepare(\"INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'Admin')\")
  .run('you@example.com', hashPassword('choose-a-strong-password'));
db.close();
"
```

Then log in at `/login.html`. Only the six self-service roles
(Buyer, Seller, Owner, Agent, Builder, Investor) can
self-register; Admin / Super Admin / Manager / Staff accounts
are created this way.

### Static deploys (GitHub Pages)

Pushing to `main` on
`https://github.com/shubhamgautambagde/primepropertys`
redeploys Pages automatically (allow ~1–3 minutes). The
generated `sitemap.xml` uses the Pages base URL; if the site
moves to a custom/root domain, change `BASE_URL` in
`tools/sitemap.py` and `SEO_BASE` in `tools/build.py`,
rebuild, and regenerate the sitemap. Note: `robots.txt` only
takes effect at a domain root — under the Pages subpath
(`/primepropertys/robots.txt`) crawlers do not read it, which
is documented in the file itself.

## Email, SMS, WhatsApp: not configured

- `EMAIL_BACKEND=console` prints password-reset and verification
  links to the server log ONLY in dev mode (`NODE_ENV=development`
  or `PP_DEV_CONSOLE_EMAIL=1`). In default mode those endpoints
  answer 503 and log no token. Nothing is delivered in any mode
  without a real provider.
- Any other value without a real provider configured returns
  `503 EMAIL_NOT_CONFIGURED` — the API never pretends an
  email was sent.
- To enable real delivery, configure a provider and set its
  credentials through the deployment environment (never commit
  credentials; `.env.example` contains placeholders only).
  SMS and WhatsApp delivery do not exist yet at all:
  notifications are in-app database rows only.

## Security notes (as deployed)

- Every response carries `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, a strict referrer policy,
  and a CSP that allows the build's genuine inline
  scripts/styles plus Unsplash images. CSP is not a substitute
  for the DOM-construction discipline (see `ACCESSIBILITY.md`
  and the innerHTML regression test).
- Sessions are HttpOnly, SameSite=Lax cookies holding token
  hashes only (never the token itself). `Secure` is set on HTTPS
  requests, when `X-Forwarded-Proto: https` is present, or when
  `SESSION_COOKIE_SECURE=1` / `FORCE_HTTPS=1` is set; plain-HTTP
  local development keeps working without it.
- Login is throttled (5 failures per IP+email per 10 minutes
  → 429); public inquiry is IP-limited (10/hour) and contact
  is IP-limited (20/hour). Since Priority 1, all other writes are
  also limited in memory (register 30/hour/IP, reset requests
  10/hour/IP+email, other writes 300/hour/user or IP per route
  group) — single-instance only; see server/README.md.
- Cookie-authenticated state-changing requests with a mismatched
  `Origin`/`Referer` host are rejected with 403 `CSRF_FORBIDDEN`.
- File uploads: binary multipart upload is implemented for
  property images/documents (Priority 1): JPEG/PNG/WEBP/GIF/PDF
  by file signature, declared MIME must match, max 10 MB, random
  server filenames, storage under `UPLOAD_DIR` (must be outside
  the static root, otherwise uploads are refused), images public
  only when published, documents private. No malware scanner is
  available in this environment, so none is claimed. The wizard
  Photos/Documents pickers use it; floor-plan, 360°, verification
  and report-screenshot buttons are still unwired. Property
  images can still also be URL references.
- No secrets, API keys, or credentials are committed. Test
  fixtures use a dummy password (`Secret123`) that is not a
  real credential.

## Backups and rollback

- SQLite backup = copy the database file while the server is
  stopped (or use SQLite's backup API). Local pre-slice
  backups live in `~/workspace/primepropertys-backup-*/`.
- Static rollback = redeploy any earlier commit of the
  `primepropertys` repo (push history is recorded in
  `primepropertys-website.muse-github-snapshot-sync.json`).
- Database rollback = restore the matching `.db` backup; the
  schema is versioned by the migration files, so a backup
  pairs with the code that created it.

### Backup + restore procedure (Priority 4, tested 2026-10-28)

1. Back up with SQLite's online backup API, not a raw `cp` of a
   live file: `python3 -c "import sqlite3; s=sqlite3.connect(
   'data/primepropertys.db'); d=sqlite3.connect('backup.db');
   s.backup(d); d.close(); s.close()"`. Back up the upload
   directory (`UPLOAD_DIR`, outside the static root) alongside
   the database — uploads are referenced by database rows, so
   a database backup without its uploads is incomplete.
2. Store the backup off the web root, readable only by the
   operator account (DB file permissions: owner read/write
   only, e.g. `chmod 600`; the same for the upload directory
   and its files). No backup encryption is implemented in this
   repo — encrypt at the host/filesystem level if backups leave
   the host.
3. Restore test (actually run 2026-10-28, not assumed): a
   temporary server registered a user and created a property
   (`RESTORE-CHECK-VILLA`, id 1), the database was backed up
   with the API above, copied to a fresh path, and a second
   temporary server started on that copy — login succeeded and
   `/api/properties/mine` returned the same property.
   Result: RESTORE_OK. Re-run this procedure on the real host
   before relying on it there; this repo has no automated or
   scheduled backup, and that gap alone blocks a production
   launch (see PRODUCTION_READINESS.md).
4. Rollback: stop the server, replace the database + upload
   directory with the matching backup pair, restart. Never mix
   a database backup with uploads from a different point in
   time, and never restore a backup onto a newer schema
   without checking the migration list (001–028).

## Performance (measured, Stage I + Priority 4)

- Homepage over the Node server: 42,385 bytes plain,
  10,887 bytes gzipped (-74%) when the client accepts gzip
  (Stage I numbers, on the older smaller homepage).
- Priority 4 re-measurement (2026-10-28, fresh empty database):
  homepage 85,150 bytes raw / 16,871 bytes gzipped (-80%);
  after Priority 4 changes 86,296 bytes raw (the +1,146 bytes
  are the lazy-loading attributes on article images).
  API list/detail/search on an empty database: 3–8 ms — no
  speed improvement is claimed on an empty database.
- Caching (Priority 4): API responses now carry
  `Cache-Control: no-store` (private data must never sit in a
  shared cache); controlled upload downloads also carry
  `no-store`; non-HTML static assets carry `public,
  max-age=3600`; HTML pages carry no public cache header, so a
  rebuild is never masked by a stale cached page.
- Database: migration 008 indexes turned the leads
  status-filter query from a full table SCAN into an index
  SEARCH (verified with `EXPLAIN QUERY PLAN` on 200-row
  test tables), and gave the property list a status-first
  index. GitHub Pages applies its own compression to the
  static site; the Node gzip numbers above are for the
  hosted-server case.
- Priority 4 index (migration 028): the default public list
  (`status='published'`, newest first) previously used
  `idx_properties_search_filters` plus "USE TEMP B-TREE FOR
  ORDER BY"; with `idx_properties_newest (status, id DESC)`
  the plan is `SEARCH … USING INDEX idx_properties_newest`
  with no temp b-tree (verified with EXPLAIN QUERY PLAN and
  asserted in `server/test/perf-p4.js`).
- Images: 140 article images now carry `loading="lazy"
  decoding="async"` (fixed 150 px height in marketing.css, so
  lazy loading cannot shift layout). The other 234 images are
  external Unsplash URLs at 1200 px width with no `srcset` —
  no responsive-image claim is made for them.

## External integrations — configuration only (Priority 4)

No provider, key, or webhook in this section is configured or
verified. Do not treat any row as "integrated" until its
credential exists and its test-mode flow has been run.

| Integration | Current honest state | Configuration when a provider is chosen |
|---|---|---|
| Transactional email (reset, verification, receipts, enquiry notices) | Not configured. Reset/verification answer 503 outside dev console mode; no token is logged there. | Server-side env vars only, never in the repo or in `site_settings` (the settings allowlist refuses secrets with 400). Timeout + retry where safe, idempotency where the provider supports it, delivery status logged where available. |
| SMS | Not configured. Messages are queued rows only, never sent. | Provider + sender ID + env-var credentials; rate limits; consent/unsubscribe handling. |
| WhatsApp Business | Not configured. Queued rows only; no Business account, no number policy (owner phones are gated by `hide_number` — exposing them publicly is a user privacy decision). | WhatsApp Business account + phone number + Meta app credentials, all server-side. |
| Payment gateway | Not configured. `POST /api/webhooks/payment` is a 501 stub that never activates anything; payments are staff-verified pending records. | Test-mode keys + webhook secret first; webhook signature verification; idempotent webhook handling; never trust client-submitted success; never store card details; never activate a paid entitlement without verified payment. |
| AI provider | Not configured. `POST /api/ai/generate` answers 503 `AI_NOT_CONFIGURED`. | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_TIMEOUT_MS` (default 15000). Keys server-side only, never in the database or frontend. Limit: 20 generations/user/UTC day. Generated content needs human approval before publish and is never presented as an official valuation. |
| Push notifications | Not configured. Preferences are stored toggles only. | VAPID keys + subscription storage, once a provider decision is made. |
| Map search | Not implemented. No coordinates are stored and none are invented. | A real map provider + valid property coordinates, only if the user wants it. |

## Final verification (Stage J + Priority 4)

- `npm test` in `server/`: 100/100 pass (Priority 4), including
  `test/journey.js` — one test that walks the whole product:
  admin creates a draft property (invisible publicly),
  publishes it (visible), a buyer enquires, the admin
  assigns and advances the lead (new → contacted →
  interested), adds a note, a follow-up (completed), and a
  tag, then scores (60, Warm), SLA, stats, CSV export,
  contact inbox, saved properties, and my-enquiries are all
  checked, plus the homepage, sitemap, and robots responses.
- `python3 tools/build.py` twice: second run 0 changes.
- Audit: 0 broken internal links (see SOURCE_CODE_AUDIT.md; the 339/341 entry figures previously printed here were inconsistent and are not reused).

## Remaining audit items — what they actually need

The older entry counts in this section (339/341) are superseded by the Phase A recount — 138 `data-backend="not-connected"` forms and 186 `href="#"` occurrences (SOURCE_CODE_AUDIT.md). The breakdown below is that older slice's classification, not a current count, and its items are not defects to fix blindly:

- 284 "form without backend action": demo forms awaiting a
  real endpoint. Each needs a product decision (which
  endpoint, which fields) — the brief forbids inventing
  success for them, so they stay honestly demo until wired.
  (Two fewer than Stage J: the visit-feedback and
  visit-assign forms were wired in the visit-booking
  slices.)
- 52 placeholder `href="#"` links: destinations do not exist
  yet. The brief forbids guessing them.
- 3 site-wide: demo data still presented on unwired
  dashboard cards (needs the remaining domains); inlined
  CSS/JS duplication is by design (single-file preview —
  the shared sources are the truth, `tools/build.py`
  generates the pages); external Unsplash images (needs a
  decision on hosting approved images locally).

## Not production-ready yet

- Visit-booking is done: request/list/detail/status/
  feedback/stats/assign/analytics endpoints plus all
  wired site-visit pages (dashboard, requests, 5 status
  lists, rescheduled, reminder, details, feedback,
  assign-agent, analytics). Only index.html (a landing
  page with no data) and the calendar page (already live
  via follow-ups) sit outside the visit endpoints.
- Support tickets are done: create/list/detail/status/
  assign/reply endpoints plus the wired complaints,
  support, contact-support, and ticket-details pages.
- Home service requests are done: create/list/detail/
  status/schedule/assign/stats endpoints plus the wired
  service-request-form, my-service-requests, and
  complaint-tracking pages (photo upload stays
  visual-only — binary upload is not implemented).
- Portal my-lists are done: buyer my-site-visits,
  owner my-properties / site-visits / property-leads,
  and agent assigned-leads (list + by-source) pages
  render from existing endpoints — no new server
  surface. Buyer my-leads is deliberately left
  unwired: a buyer's "leads" have no distinct meaning
  (their enquiries already live on my-enquiries).
- Newsletter subscriptions are done: subscribe /
  unsubscribe endpoints plus all 70 footer newsletter
  forms wired. Subscription stores consent only and
  never claims an email was sent (no provider is
  configured); token-based confirm/unsubscribe waits
  for a provider. Audit docs added:
  FRONTEND_BACKEND_MAPPING.md and
  PLACEHOLDER_LINKS_REPORT.md (186 href="#" triaged,
  none changed — no determinable destinations).
- Payments (offline/manual records) are done: create/list/
  detail/verify/refund-request/refund-approve endpoints plus
  billing profiles, and the wired payment-history, invoice-list,
  invoice-details, refund-status, refund-request, billing-profile
  and checkout pages (plus portal payment histories and owner
  invoices). NO gateway is configured: records are pending
  claims until staff verify them, and nothing charges a card,
  UPI id or bank account. A live gateway still needs a provider
  and credentials.
- Campaigns, templates and queued messages are done: ad-campaign
  CRUD with enforced status flow, message templates per channel,
  and SMS/WhatsApp compose forms that QUEUE messages (never
  claimed as sent — no provider is configured), plus live
  campaign lists/details, template grids, Use Template flows and
  notification logs. Ad-platform metrics (impressions, clicks,
  spend, platform conversions) do not exist and are shown as
  dashes, never invented.
- Site settings are done: GET/PUT /api/settings with a four-key
  allowlist (site name, support email, contact number, default
  country) — all 28 system-settings forms hold the same four
  fields, so they all read/write the same row, with prefill and
  a Reset that restores saved values instead of submitting.
  Any other key (SMTP/API/payment/OTP secrets and the like) is
  refused with 400: secrets are never stored here and belong in
  environment variables on the server. No secret field exists in
  the settings markup, so none was invented.
- Triage is done: the remaining forms were either wired from existing
  endpoints (newsletter second variant, settings second location, report +
  emergency tickets, FAQ/help search, site search with URL params,
  section search, change password, investor calculators, live admin user
  tables with a real user edit endpoint) or documented in TRIAGE.md with
  the domain or decision that blocks them. Nothing was faked to clear
  the audit: audit 187 entries, 0 broken links.
- The post-property wizard is done: 27 steps share one draft —
  answers accumulate in the browser until the description step
  creates the draft, then every later step PATCHes it by
  ?draft_id=. 51 wizard columns (migration 017) hold the forms'
  real fields; drafts, my-listings, preview, completeness score
  and a real duplicate check are live. Drafts stay drafts until
  admin approval — the submit step never claims a publish.
  Binary photo/document upload and OTP verification are NOT
  implemented (no backend support / no provider) and the pages
  say so instead of faking success.
- Payments (needs a real provider and credentials — never
  invented), support tickets, campaigns, settings forms.
- Hosting decision: Node hosting vs PHP-only hosting. If
  PHP-only, the Stage D data layer needs a port; the
  current server is Node-only.
- Manual accessibility walkthrough (keyboard order, focus
  traps, screen-reader announcements) — automated checks
  pass; see `ACCESSIBILITY.md`.
