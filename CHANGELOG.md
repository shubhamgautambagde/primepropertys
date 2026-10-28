# PrimePropertys — Changelog

## Stage B — Frontend repairs (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-a/` (Stage A original is at `~/workspace/primepropertys-backup-original-2026-10-28/`).
Per-file detail (every changed file with change counts): `~/workspace/primepropertys-audit/stage-b-changes.json`.
Audit scripts: `~/workspace/primepropertys-audit/audit.py` (re-run after Stage B), `stage_b.py`, `stage_b2.py`.

### Fixed and verified
- **Field names (all pages):** 1,222 submittable fields (999 inputs + 164 selects + 59 textareas) now have a `name`. Before: 991 inputs had none. Names are inferred from aria-label, placeholder, id, or (for selects) option text, and are unique within each page. Fields with no hint got an `aria-label` as well. Verified: 0 submittable fields without a name remain.
- **Meta descriptions (650 pages):** every page now has a unique `<meta name="description">` derived from its H1. Before: 0 pages had one.
- **Alt text (146 images):** every image now has usable alt text, inferred from the nearest preceding heading or, failing that, "PrimePropertys property photo". Before: 146 of 374 images lacked alt text. Verified: 0 missing.
- **Duplicate titles (36 pages):** duplicate `<title>` values disambiguated with section/file names. Distinct titles: 614 -> 650.
- **Help & Support links (50 pages):** buyer-portal and investor-portal top-bar links that pointed to `href="#"` now point to `../../help-center.html`. Verified: all 50 resolve.
- **Print links (2 pages):** now call `window.print()` instead of doing nothing.
- **HTML tag balance (21 pages):** root `index.html` was missing one closing `</div>` in the testimonials/news section; all 20 property-engine pages had a duplicated `</main></div></div></div></main>` tail. Both fixed. Verified with a tag-balance parser: 0 pages with issues remain (was 21).
- **Form handler honesty (651 files: 650 pages + assets/js/main.js):** the shared submit handler no longer clears user input, and when it shows a `.form-success` message it appends a "Demo preview — no data was saved yet" note. Client-side tool forms (`onsubmit="return false"`, e.g. calculators) are untouched. Verified: all 8 distinct inline script blocks + main.js pass `node --check`.
- **Links preserved:** internal links 30,560 -> 30,610 (the +50 are the mapped Help links); **0 broken internal links** before and after.

### Not fixed in Stage B (carried forward, with reasons)
- **184 remaining `href="#"` links (52 files):** View (54), Edit (48), Chat on WhatsApp (24), View Details (22), Use Template (19), Share (6), Download Plan (PDF) (2), and 9 miscellaneous actions. These were investigated file by file; their destinations do not exist yet (property/document detail pages, WhatsApp number, template system, share/export actions) and were **not guessed**. Full list: `~/workspace/primepropertys-audit/href-hash-remaining.json`. Resolution belongs to Stages F/G/H, or needs the owner's intent/business inputs.
- **349 forms still have no backend action:** by design in Stage B — there is no backend yet. Forms are now marked `data-backend="not-connected"` (343 forms; 6 calculator/tool forms excluded) so Stage H can find and wire them. Success messages now carry the demo note above.
- **Inline CSS/JS duplication:** unchanged in Stage B (7.6 MB CSS / 3.5 MB JS repeated). This is Stage C's refactor, which must preserve the single-file preview property.
- **Demo/sample data:** phone, email, person names, stats, and prices are still screenshot-derived demo content. Replacing them needs confirmed real business data (owner input) or Stage H real-data wiring.
- **Side effect to note:** sample-person pattern matches rose 198 -> 200 because two alt texts now derive from testimonial headings containing person names. No new sample data was invented.

### Verification note (Stage B, honest limitation)
- Live-browser click-through (actually clicking Submit in a real browser) was **not** performed: the browser tool blocks localhost navigation, and the user asked the assistant to do all work itself rather than take over the browser. The browser spot-check task was therefore stopped.
- Instead, all four spot-checks were verified against the actually served site (`http://127.0.0.1:8901/`, HTTP 200 on all four pages): homepage contains inlined navy design + property cards + images; contact form has named fields and the honest demo-note handler with no input clearing; buyer-dashboard Help link resolves to the served Help Center page; property-details serves with sidebar + styled content. All 8 checks passed. A real-browser click test remains open and can be done by opening the served URL in any browser.

### Audit comparison (Stage A -> Stage B)
- Bug register entries: 1,495 -> 344. Remaining: forms without backend 286 files, `href="#"` 52 files, plus 6 site-wide architectural items (no backend, no auth, demo data, duplicated code, no tooling, Unsplash dependency).
- Inputs without name: 991 -> 0. Images missing alt: 146 -> 0. Tag-balance issues: 21 pages -> 0. Broken links: 0 -> 0.

## Stage C — CSS/JS refactoring (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-c/` (Stage B state, including its git repo).
Build: `tools/build.py` (run from the site root). Source of truth from now on: shared files below — never edit inlined CSS/JS in pages directly.

### What changed
- **Shared CSS system (7 files, `assets/css/`):** tokens.css (design tokens: navy #0A2240, blue #2563EB, red #E11D48, pale #EEF3FA), base.css, layout.css, components.css, forms.css, dashboard.css, responsive.css. Split from the old monolithic style.css with **zero rule changes**: concatenation of the 7 files contains exactly the same 130 rules as before (verified by rule-set comparison).
- **Section layouts (12 files, `assets/css/sections/`):** agent, app, builder, buyer, crm, marketing, side, owner, post, engine, search, admin — the 12 distinct portal-layout suffixes that were previously duplicated inside pages, now stored once each and mapped in `tools/section-map.json`. Class names were NOT unified across sections (that would require editing HTML in 650 pages); each section keeps its own layout classes.
- **Shared JS modules (`assets/js/`):** navigation.js, components/tabs.js, components/accordion.js, components/filters.js, forms.js, core.js — the old single DOMContentLoaded handler split into one guarded listener per module, same logic, same order. Section behaviour kept verbatim in `assets/js/groups/` (admin, builder, buyer calculators, crm, engine, search).
- **Validation library (`assets/js/validation.js`):** pure helpers (isRequired, isValidEmail, isValidPhoneIN, isValidPrice, isValidAreaSqFt), unit-tested 7/7 in Node. Deliberately NOT inlined into pages and NOT wired to any form yet — server-side validation in Stage D/H remains the authority.
- **Build output:** `assets/css/style.css` and `assets/js/main.js` are now regenerated concatenations of the shared sources. Pages keep inlined copies (single-file preview preserved — the Muse viewer bug from Stage A must not return). Build is idempotent: second run changed 0 files. Distinct inline script blocks fell 8 -> 7.
- **One behaviour guard added:** accordion now checks that the clicked button is inside an `.acc-item` before toggling (previously it would throw on a stray button; no page has one, so no visible change).

### Verified
- CSS rules per page vs Stage B: **0 mismatches across all 650 pages**.
- JS: all 7 distinct inline script blocks + all 14 module/group files pass `node --check`; validation helpers 7/7 tests pass.
- Links: **0 broken out of 30,610**. Served spot-checks (index, contact, buyer dashboard): HTTP 200 with the new modular CSS/JS present and in order.
- Audit re-run: bug entries 344 -> 345. The +1 is not a regression: calculator `innerHTML` (investor ROI/yield/appreciation tools) was previously hidden inside inlined scripts and is now tracked as a file (`assets/js/groups/buyer.js`). Values fed into it are numeric-coerced (`+value`, `toFixed`), so injection risk is low; replacing it with safe DOM construction is deferred to Stage I to avoid breaking working calculators.
- Inline CSS bytes fell slightly (7,596,485 -> 7,544,311) from header handling; inline JS bytes rose modestly from modular headers/comments. Page weight via cached external assets is NOT claimed: pages still inline by design (preview requirement). Switching to linked assets is a Stage I decision, not a silent change.

### Not changed in Stage C
- No page layout, class name, colour, or visible behaviour was changed. No form was wired to a backend (Stage H). No demo data was replaced. The GitHub repository (uploaded in Stage B state) is now behind local Stage C changes — it will need a follow-up push after Stage C is accepted, or Stage C can be pushed as its own commit later.

## Stage D — Backend + database foundation (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-d/`.
Stack decision (per Stage A plan recommendation, hosting answer still open):
Node.js v24 + SQLite for development, PostgreSQL documented for production.
No PHP/MySQL installed here, so the Laravel alternative was not built; if
the user's hosting turns out to be PHP-only, Stage D's data layer will need
a port (flagged, not hidden).

### What was built (all new, no existing page changed)
- `server/` — zero-dependency Node.js server (stdlib only: `node:http`,
  `node:sqlite`). No `npm install` needed. Serves the static site from the
  repo root and a JSON API under `/api`.
- `server/migrations/001_init.sql` — tables: `users` (email unique,
  password_hash only, nine roles via CHECK), `properties` (type, listing
  type, price in rupees, city/locality, area, beds, baths, status, soft
  delete), `property_images`, `inquiries` (pipeline status new →
  contacted → interested → site_visit → negotiation → closed/lost),
  `saved_properties`; indexes on search/filter columns; migrations tracked
  in `schema_migrations` and applied automatically on startup.
- `server/src/db.js`, `server/src/server.js` — migration runner + server.
  API: `GET /api/health`, `GET /api/properties` (filters city, type,
  listing type, price range; pagination limit 1-100 default 20),
  `GET /api/properties/:id` (with images). Errors are JSON
  `{error:{code,message}}` with no stack traces.
- `server/test/run.js` — 8 automated tests (node:test) against temporary
  databases that are deleted afterwards.
- `server/README.md`, `server/.env.example`, `server/.gitignore` — run
  instructions, API docs, schema notes, PostgreSQL translation notes
  (BIGSERIAL, now() defaults, pg adapter = Stage J work, not claimed).

### Verified (real behaviour, not claims)
- Tests: **8/8 pass** — health, empty list, published-only listing,
  city/type/price filters, pagination, detail with images, draft + missing
  id 404, invalid limit 400, unknown route 404, POST 405, static homepage
  through the same server.
- Live server run (port 8902, fresh database): health `ok`, properties
  list empty with `total: 0`, homepage 200, buyer dashboard 200, path
  traversal attempt returned 404 without leaking any file, unknown API
  route returned JSON 404. Database file inspected: all 6 tables present,
  migration `001_init.sql` recorded, **0 property rows** (no fake data).
- Server was stopped after verification; the production database file
  (`server/data/primepropertys.db`, git-ignored) stays empty.

### Deliberately NOT in Stage D
- No authentication (Stage E): the public API returns published listings
  only; drafts are never exposed even if requested by id.
- No write endpoints (property CRUD is Stage F, leads Stage G).
- No sample/demo rows in the production database; no secrets anywhere.
- The GitHub Pages site is unaffected: Pages serves only the static site;
  `server/` is for Node hosting (Stage J deployment).

## Stage E — Auth + RBAC (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-e/`.
No existing page changed; all work is in `server/`.

### What was built
- `server/migrations/002_auth.sql` — `sessions` (server-side, token hashes
  only), `password_reset_tokens` (1h, single-use), `email_verification_tokens`
  (24h), `permissions` (15 granular permissions) + `role_permissions` seed
  for all nine roles; `users.email_verified_at` added.
- `server/src/auth.js` — scrypt password hashing (stdlib crypto), session
  create/lookup/revoke, token create/consume, permission checks, cookie
  helpers, login throttling (5 failed attempts per IP+email in 10 min → 429,
  in-memory).
- `server/src/server.js` — auth routes: register, login, logout, me,
  change-password (revokes other sessions), request/reset password,
  request/verify email. Public data routes unchanged except one rule: the
  owner (or `properties:view_any`) may fetch their own draft via
  `GET /api/properties/:id`; everyone else gets 404, so draft existence is
  never leaked.
- `server/test/auth.js` — 9 auth tests; `package.json` test script now runs
  both test files.

### Rules enforced (not just documented)
- Self-registration allows Buyer, Seller, Owner, Agent, Builder, Investor
  only — Admin, Super Admin, Support return 400 and can never self-register.
- No password hash ever leaves the server (`/api/auth/me` and register/
  login responses strip it; tested).
- Suspended accounts cannot log in (403, after password verification so
  suspension is not leaked by timing alone).
- Email delivery is NOT faked: with `EMAIL_BACKEND=console` (dev default)
  reset/verification links print to the server log; with any other backend
  and no provider configured, the request endpoints honestly return 503
  EMAIL_NOT_CONFIGURED instead of claiming an email was sent.

### Verified
- Tests: **17/17 pass** (8 Stage D tests + 9 Stage E tests), including
  IDOR: owner A sees own draft (200), owner B gets 404, anonymous gets 404.
- Live curl run on a fresh database: register (Owner, correct permission
  list) → me with cookie (200) → logout → same cookie me (401) →
  anonymous me (401). Temp server stopped afterwards; temp database deleted.
- Stage D behaviour preserved: public list still published-only, all
  Stage D tests still pass (only change: health version string stage-d →
  stage-e, test updated accordingly).

## Stage F — Property management (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-f/`.
No existing page changed; all work is in `server/`.

### What was built
- `server/migrations/003_properties.sql` — `property_views` (upsert per
  user+property) + owner lookup index.
- `server/src/validate.js` — property field validation (title/city/type/
  listing/price ranges, area/beds/baths caps) and strict image-URL validation
  (http(s) only, no credentials, no javascript:/data: schemes).
- `server/src/properties.js` + router wiring in `server/src/server.js` —
  create (always draft), edit (owner edit of published reverts to draft for
  re-approval), publish (publish_any only = approval step), unpublish,
  soft delete, mine list, image add/delete, save/unsave + saved list,
  recently viewed, similar properties, and sort (newest/price_asc/
  price_desc/area_desc) on the public list.
- `server/test/properties.js` — 5 property tests; `package.json` test
  script now runs all three test files. One Stage D test expectation was
  updated (POST /api/properties unauthenticated is now 401, not 405,
  because create exists; health version stage-e → stage-f).

### Rules enforced
- Every write checks ownership or the matching *_any permission; other
  owners get 403 on published properties and 404 on drafts (no leak).
- Status cannot be set directly through create/edit — only the
  publish/unpublish endpoints change it.
- Delete never destroys rows (soft delete); saved/recent lists never show
  deleted properties or other users' drafts.

### Verified
- Tests: **22/22 pass** (8 Stage D + 9 Stage E + 5 Stage F).
- Live curl flow on a fresh database: owner register → create draft →
  public list empty → owner publish 403 → admin publish → public list
  shows it → buyer save → saved list shows it. Temp server stopped and
  temp database deleted afterwards.

### Deliberately NOT in Stage F
- Binary multipart file upload is not implemented; images are validated
  URL references only (matching the site's existing Unsplash-URL pattern).
- No frontend wiring yet: the 650 static pages still show their demo
  content; connecting pages to this API is Stage H.

## Stage G — Leads + CRM + notifications (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-g/`.
No existing page changed; all work is in `server/`.

### What was built
- `server/migrations/004_leads.sql` — inquiries gain `assigned_to`,
  `source`, `duplicate_of`; new tables `lead_activities`, `lead_followups`,
  `notifications`.
- `server/src/leads.js` + router wiring — public inquiry capture (IP rate
  limit 10/hour, published-property only), lead list/detail with
  view_any vs own visibility, enforced pipeline transitions with activity
  logging, assignment (leads:assign + assignee notification), notes,
  follow-ups with completion, CSV export (leads:export), in-app
  notifications with unread counts and owner-only read.
- `server/test/leads.js` — 5 lead tests; test script runs all four files.

### Rules enforced
- Pipeline transitions are a fixed map; new → closed directly is 400,
  closed/lost are terminal.
- Duplicates are flagged (`duplicate_of`, `is_duplicate`), never silently
  dropped or rejected — a customer may legitimately enquire twice.
- Export is permission-gated (buyer gets 403); notification read is
  owner-only (others get 404).

### A real bug the tests caught
- The duplicate test initially failed: '+91 98765 43210' vs '9876543210'
  did not match as the same number. Fixed in `leads.js` by normalizing
  the +91 country code and trunk 0 before comparison. Tests then passed.

### Verified
- Tests: **27/27 pass** (8 D + 9 E + 5 F + 5 G).
- Live curl flow on a fresh database: public inquiry → admin assigns to
  agent → agent notification appears (unread 1) → agent moves new →
  contacted → admin CSV export shows the row with the new status. Temp
  server stopped and temp database deleted afterwards.

### Deliberately NOT in Stage G
- No external notification delivery (email/SMS/WhatsApp): notifications
  are in-app rows only, pending a configured provider (Stage J).
- No frontend wiring yet (Stage H).

## Stage H, Phase 1 — API client + contact form wired to real data (2026-10-28)

### What was built
- Backup before this phase: `~/workspace/primepropertys-backup-stage-h/`.
- `server/migrations/005_contact.sql` — new `contact_messages` table
  (general enquiries, separate from property inquiries) + `contact:view`
  permission seeded for Super Admin, Admin and Support.
- `server/src/contact.js` — `POST /api/contact` (public, 20/hour/IP rate
  limit, validated: name, email, phone 10-15 digits, subject from the
  form's list, message up to 2000 chars) and `GET /api/contact`
  (login + `contact:view` required, paginated).
- `server/src/server.js` — `/api/contact` route mounted; health version
  string bumped to `stage-h`.
- `assets/js/api.js` — shared API client (same-origin fetch, cookie
  sessions, honest error objects, never a fake success), inlined into all
  650 pages via `tools/build.py` (api.js added to JS_ORDER before
  forms.js).
- `assets/js/forms.js` — forms with `data-api="contact"` now submit for
  real: success shows the page's success message with NO demo note and
  resets the form only because the data was saved; failure keeps the
  input and shows the server's honest error. All other forms keep the
  Stage B demo behaviour (demo note appended).
- `contact.html` — main form wired (`data-api="contact"`); newsletter
  form deliberately still demo (no endpoint yet).

### Verified
- Tests: **31/31 pass** (27 previous + 4 new contact tests: valid 201 +
  DB row, five invalid payloads 400, auth/permission gating 401/403/200,
  rate limit 429 after 20/hour).
- Build: 650 pages updated, 0 skipped, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Audit re-run: 0 broken internal links, bug entries unchanged at 345.
- Live curl flow on a fresh database (port 8906, temp DB deleted
  afterwards): health ok, valid contact POST 201 with row in DB,
  invalid POST 400, served contact.html contains the wiring.

### Deliberately NOT in this phase (remaining Stage H slices)
- Property enquiry pages (make-enquiry, contact-agent/owner, callbacks,
  site visits) are NOT wired yet: they need a real published property
  context (property_id) before their submits can be real.
- Dashboards (buyer/owner/agent/builder) are NOT wired yet: no login or
  registration pages exist in the site to start a session from.
- Search/results pages have no live listings renderer yet; their demo
  counts (e.g. "12,450 results") remain labelled demo content only via
  the existing demo handler, never presented as live data.
- 348 other forms still show the honest demo note until their slice
  lands. Nothing is marked complete without a verified behaviour.
- Stage H changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## Stage H, Phase 2 — Live search listings + property enquiry forms (2026-10-28)

### What was built
- `sections/property-search/search-results.html` — live container added
  (`#pp-live-results` + `#pp-live-notice` after the lead paragraph).
- `assets/js/groups/search.js` — live listings renderer (property-search
  pages only, guarded by the container): fetches `GET /api/properties`,
  renders real published properties as cards (title, type, city,
  specs, INR price) with an Enquire link carrying `?property_id=N`.
  API unreachable → demo content untouched + honest notice; zero
  results → honest empty message; lead count replaced with the real
  total only when live data arrives. Renderer uses DOM construction
  (createElement/textContent) only — no innerHTML anywhere.
- `assets/js/forms.js` — new `data-api="inquiry"` handler: property_id
  comes from `?property_id=` (or a form's `data-property-id`); without
  one the form honestly refuses to submit instead of faking it.
  Fields map via explicit `data-api-field` attributes (with a
  name-based fallback); email omitted when empty; site-visit date/time
  is preserved by prefixing it into the message text; duplicate
  submissions surface the API's `is_duplicate` note. Success resets
  the form only because the row was saved; failure keeps the input.
- 5 enquiry pages wired (main form only): `make-enquiry`,
  `contact-agent`, `contact-owner`, `request-callback`,
  `request-site-visit` in `sections/property-engine/`. Their mini
  mobile/email-only forms stay demo-honest (they carry no enquiry
  content). Stale `data-backend="not-connected"` removed from the
  wired main forms.

### Verified
- Tests: **31/31 pass** (no server change in this phase).
- Build: 650 pages updated in the first pass, then 18 (search group)
  after the innerHTML rewrite; second runs 0 changes (idempotent);
  all modules `node --check` PASS.
- Audit re-run: 0 broken internal links, bug entries back to 345
  (the renderer's first version briefly added one innerHTML flag; it
  was rewritten to DOM construction instead of deferred).
- Live flow on a fresh database (port 8907, temp DB deleted
  afterwards): seeded published property appears via
  `GET /api/properties`; enquiry POST 201 with lead row; repeat
  submission flagged `is_duplicate: true`; enquiry without
  property_id honestly 400; served search-results and make-enquiry
  pages contain the new wiring.

### Deliberately NOT in this phase (remaining Stage H)
- Dashboards (buyer/owner/agent/builder) are NOT wired yet: the site
  has no login or registration pages to start a session from, so
  building auth UI is its own slice.
- Enquiry pages still need real property links: until listing cards
  elsewhere link with `?property_id=`, only the search-results cards
  and hand-built URLs reach the wired forms.
- Stage H changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## Stage H, Phase 3 — Auth pages + buyer/owner dashboards (2026-10-28)

### What was built
- `login.html`, `register.html` (new, site root, built from the shared
  page shell: 1 h1 each, unique titles/descriptions). Register offers
  only the 6 self-service roles (Buyer, Seller, Owner, Agent, Builder,
  Investor); Admin/Super Admin/Support cannot self-register, per the
  Stage E server rule.
- `assets/js/forms.js` — `data-api="login"` and `data-api="register"`
  handlers: real API login/register, honest server errors, then a
  role-based redirect to that role's dashboard (Seller has no
  dedicated dashboard section, so sellers land on the home page).
  Pages with `#pp-auth-status` show the logged-in user and a dashboard
  link instead of a bare form.
- `assets/js/groups/buyer.js` — buyer dashboard live sections: saved
  properties (`GET /api/saved`) and recently viewed
  (`GET /api/recently-viewed`), rendered with DOM construction only.
  Anonymous visitors get an honest login notice + login link; logged-in
  buyers see their real name in the greeting instead of the demo name.
- `assets/js/groups/owner.js` (new) + `tools/section-map.json`
  (`owner-portal` added to `js_map`) — owner dashboard live section:
  own listings (`GET /api/properties/mine`, drafts included) with
  status text, real-name greeting, anonymous login notice.
- `tools/audit.py` — tool correction: forms with a `data-api`
  attribute now count as backend-connected (they submit via JS to a
  real endpoint), so per-file "no backend action" counts are accurate
  instead of flagging wired forms.

### Verified
- Tests: **31/31 pass** (no server change in this phase).
- Build: 652 pages (650 + 2 new), 0 skipped, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Audit re-run: 0 broken internal links; bug entries 347 (345 + the
  2 new pages, each still containing 1 demo newsletter form; wired
  forms no longer miscounted). Note: the audit script's hardcoded
  Stage A site-wide entries are now partly stale (backend, auth and
  build tooling demonstrably exist); they are flagged here for a
  re-triage pass in Stage I rather than silently deleted.
- Live flow on a fresh database (port 8908, temp DB deleted
  afterwards): owner register → draft create → admin publish → buyer
  register → view → save → saved list shows the property → owner
  "mine" shows it → anonymous "mine" is 401; served login, buyer
  dashboard and owner dashboard pages contain the new wiring.

### Deliberately NOT in this phase (remaining Stage H)
- Agent, builder, investor and super-admin dashboards are NOT
  live-wired yet: their pages exist and auth redirects land on them,
  but their data is still demo content.
- No logout button and no session display in the shared header yet.
- Newsletter/mini forms everywhere remain demo-honest.
- Stage H changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## Stage H, Phase 4 — Remaining dashboards + header session + key pages (2026-10-28)

### What was built
- `assets/js/groups/agent.js` (new) + `tools/section-map.json`
  (`agent-portal` added to `js_map`) — agent dashboard live leads
  (`GET /api/leads`: leads on the agent's properties or assigned to
  them), real-name greeting, anonymous login notice.
- `assets/js/groups/builder.js` — builder dashboard live own listings
  (`GET /api/properties/mine`, drafts included).
- `assets/js/groups/buyer.js` — investor dashboard live saved +
  recently-viewed sections; buyer saved-properties page live list;
  buyer recently-viewed page live list; buyer notifications page live
  list with unread count and per-item Mark read
  (`POST /api/notifications/:id/read`). All blocks guarded by their
  own container; anonymous visitors get a login notice, never demo
  data presented as theirs.
- `assets/js/groups/admin.js` — super-admin dashboard live summary:
  contact-message total, leads total, unread notifications, recent
  contact messages. Each call handled independently so a 403 on one
  (non-admin visitor) shows an honest per-line message instead of
  hiding the rest.
- `assets/js/navigation.js` — header session state on every page:
  the static "Sign In" links (which pointed at contact.html) now
  point at the real login page, with the relative prefix derived from
  the header's own index.html link so it works at any depth and under
  any hosting subpath; logged-in users see their name + role and a
  real Logout button (API logout, then home page).

### Verified
- Tests: **31/31 pass** (no server change in this phase).
- Build: 652 pages, 0 skipped, second run 0 changes (idempotent);
  all modules `node --check` PASS.
- Audit re-run: 0 broken internal links (bug count reported in the
  run; wired forms no longer miscounted since the Phase 3 audit fix).
- Live flows on fresh databases (ports 8909/8911, temp DBs deleted
  afterwards): owner create → admin publish → buyer view/save/
  enquire → admin assign via `POST /api/leads/:id/assign` → agent
  sees the lead; builder mine list; investor saved list; contact
  total + leads total for admin; owner notification unread 1 → mark
  read → unread 0; logout → `me` 401; anonymous leads 401; served
  agent/builder/investor/admin/saved/notifications pages contain
  the new wiring and the served home page contains the Logout code.
  Note: an early verification attempt used `PATCH /api/leads/:id`
  for assignment (wrong endpoint) and a follow-up run seeded the
  admin from the wrong directory — both were test-harness errors,
  not product bugs; the corrected run proves the assign + agent
  leads flow end to end.

### Deliberately NOT in this phase (remaining Stage H)
- Hundreds of other forms (CRM actions, campaigns, payments, tickets,
  settings, etc.) remain demo-honest: most need backend endpoints
  that do not exist yet, so wiring them is new API work, not a
  frontend slice — it belongs to a later stage, not Stage H.
- Buyer "My Enquiries" has no buyer-scoped endpoint (leads list
  visibility is property-owner/assignee based), so it stays unwired.
- Stage H changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## Stage H, Phase 5 — Buyer My Enquiries endpoint + page (2026-10-28)

### What was built
- `server/migrations/006_inquiries_user.sql` — nullable `user_id`
  on inquiries (+ index). Anonymous inquiries stay unlinked on
  purpose: the "mine" endpoint matches ONLY explicit user_id links,
  never email, so registering with someone else's email cannot expose
  their enquiries.
- `server/src/leads.js` — `createInquiry` now records the session
  user's id when present; new `listMyInquiries` (401 anonymous,
  paginated, with property titles).
- `server/src/server.js` — `POST /api/inquiries` passes the session
  user id; new `GET /api/inquiries/mine` route (added to the lead
  route group).
- `sections/buyer-portal/my-enquiries.html` + `assets/js/groups/
  buyer.js` — live list (property, status, date, message snippet)
  with an anonymous login notice.
- `server/test/my-enquiries.js` (new, in the test script) — own
  logged-in inquiry listed; anonymous inquiry with the buyer's own
  email NOT listed; other buyer sees none; anonymous 401.

### Verified
- Tests: **32/32 pass** (31 previous + 1 new).
- Build: 50 buyer-portal pages updated, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8912, temp DB deleted
  afterwards): buyer logged-in inquiry → mine shows 1 (H5 Flat,
  new); owner's mine is 0; anonymous mine 401; served
  my-enquiries page contains the wiring.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-h-phase5/`.

### Stage H status
With this slice, every Stage H item that can be wired to existing
data is wired. What remains needs NEW backend endpoints (CRM actions,
campaigns, payments, tickets, settings, …) and is therefore a later
stage's scope, not a wiring slice. Stage H changes remain local only,
NOT pushed to GitHub; the live Pages site still serves Stage C state.

## CRM Stage, Phase 1 — Users + follow-ups endpoints, CRM pages wired (2026-10-28)

### What was built (user chose CRM first)
- `server/src/auth.js` — new `GET /api/users` (gated on
  `users:manage`: Admin/Super Admin only; returns id, email,
  full_name, role, status — never password hashes).
- `server/src/leads.js` — new `GET /api/followups`: follow-ups
  across all leads the caller can see (`leads:view_any` sees all;
  others see follow-ups on their own properties or assigned leads).
  Done follow-ups included with `done_at` set.
- `server/src/server.js` — routes for both endpoints. (Caught during
  implementation: the first version used an undefined `m` variable
  in the new branch — fixed to `req.method` before any test run;
  `node --check` alone would not have caught it.)
- `sections/central-crm/all-leads.html` + `assets/js/groups/crm.js`
  — live leads list with links to details (`?lead_id=`).
- `sections/central-crm/lead-details.html` + crm.js — live details
  workspace built by JS: detail header, status update (PATCH, server
  enforces transitions with honest errors), note form, follow-up
  scheduling form, activities timeline, follow-ups with Done buttons.
- `sections/central-crm/lead-assignment.html` — the old demo form
  (lead-name text, agent-name text, priority — none mappable to the
  API) replaced with a working assign form: lead ID + agent dropdown
  populated from `GET /api/users`; `forms.js` gained a
  `data-api="assign"` handler (POST `/api/leads/:id/assign`).
- `sections/central-crm/follow-up.html` + crm.js — live follow-ups
  list with Done buttons.
- `server/test/crm.js` (new, in the test script) — users gating +
  no hash leak; follow-ups visibility (owner 1, stranger 0, admin
  1); assign flow makes the follow-up visible to the agent.

### Verified
- Tests: **34/34 pass** (32 previous + 2 new).
- Build: 652 pages, 0 skipped, second run 0 changes (idempotent);
  all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8913, temp DB deleted
  afterwards): follow-up created → owner 1 / stranger 0; users
  endpoint buyer 403, admin 4 users with no hash; assign → agent
  sees the follow-up; status new → contacted; served CRM pages
  contain the new wiring.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-crm/`.

### Deliberately NOT in this phase
- Lead transfer page, site-visit CRM pages, scoring/tags/SLA pages
  and remaining CRM reports stay demo-honest (no matching backend
  concepts yet, or they need product decisions).
- CRM changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## CRM Stage, Phase 2 — Lead transfer + site-visit pages (2026-10-28)

### What was built (continuing CRM; no new backend endpoints needed —
### the status filter already existed)
- `sections/central-crm/lead-transfer.html` — the old demo form
  (lead-name/from-agent/to-agent/reason texts, none mappable to the
  API) replaced with a working transfer form: lead ID + agent
  dropdown (populated from `GET /api/users`) + optional reason.
  `forms.js` gained a `data-api="transfer"` handler: it assigns
  (`POST /api/leads/:id/assign`) and then saves the reason as a
  timeline note, reporting honestly if the note save fails after a
  successful transfer.
- `sections/central-crm/site-visit-leads.html` + crm.js — live list
  of leads with status `site_visit` (`GET /api/leads?status=
  site_visit`, visibility enforced server-side).
- `sections/agent-portal/site-visits.html` + agent.js — the agent's
  own site-visit leads (same filter, agent's visible scope).
- `sections/site-visit/site-visit-calendar.html` + crm.js — real
  follow-ups grouped by due date.

### Verified
- Tests: **34/34 pass** (no server change in this phase).
- Build: 652 pages, 0 skipped, second run 0 changes (idempotent);
  all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8914, temp DB deleted
  afterwards): lead stepped new → contacted → interested →
  site_visit; status filter returns it; transfer assign + reason
  note appear in the timeline; agent sees 1 site visit; served
  transfer / site-visit-leads / calendar / agent-visits pages
  contain the new wiring.

### Deliberately NOT in this phase
- Site-visit dashboard, visit details/feedback/reminder/analytics
  and per-status visit list pages (approved/pending/completed/…)
  stay demo-honest — there is no visit entity in the backend yet,
  only lead status + follow-ups, so those pages would need a real
  visit-booking model (a product decision, not a wiring slice).
- CRM changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## CRM Stage, Phase 3 — Leads stats + report pages (2026-10-28)

### What was built (user said "ok next"; reports chosen as the next
### CRM slice — computed from existing data, no product decisions)
- `server/src/leads.js` — new `GET /api/leads/stats`: total,
  by-status counts, pipeline funnel (all 7 statuses, in order),
  by-source, top 10 properties, by-assignee with closures and
  per-assignee conversion inputs. Visibility-scoped exactly like
  the leads list (`leads:view_any` sees all; others see only their
  own properties' leads or assigned leads).
- `server/src/server.js` — route placed BEFORE the `/api/leads/`
  branch on purpose: otherwise `stats` would match the lead-detail
  route and 404.
- 6 central-crm pages wired from the one endpoint (crm.js):
  crm-reports (funnel bars + source + properties), conversion-funnel
  (funnel bars), source-wise-leads (source + share %), property-wise
  -leads (top properties), team-performance + agent-performance
  (assignee leads • closures • conversion %).
- `server/test/crm.js` — stats test appended: anonymous 401, owner
  sees 1, stranger sees 0, admin funnel sums to total, top property
  present.

### Verified
- Tests: **35/35 pass** (34 previous + 1 new).
- Build: 64 central-crm pages updated, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8915, temp DB deleted
  afterwards): 2 leads (1 new, 1 contacted) → stats total 2, new
  1, contacted 1, funnel sum 2, source website 2, top property
  Stats Flat 2; anonymous stats 401; all 6 served report pages
  contain the new wiring.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-crm2/`.

### Deliberately NOT in this phase
- Scoring, tags, SLA rules (all need product decisions on formulas
  and thresholds) and the visit-booking model (needs a visit entity
  design) — flagged for the user, not guessed.
- CRM changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## CRM Stage, Phase 4 — Status lists, dashboard, export, timeline (2026-10-28)

### What was built (user said "ok"; this slice needed no product
### decisions — all from existing endpoints)
- 6 status-filtered lead lists (crm.js, one shared block keyed by
  container id): new / contacted / interested / negotiation /
  closed / lost via `GET /api/leads?status=…`, each row linking to
  lead-details (`?lead_id=`).
- `crm-dashboard.html` — live stats summary from
  `GET /api/leads/stats` (total + per-status counts).
- `crm-export.html` — real CSV download button. Implemented with
  raw fetch (not the shared JSON client, which cannot parse CSV);
  the export is admin-gated server-side, so non-admins get an
  honest permission message instead of a broken download.
- `lead-timeline.html` — chronological activities for `?lead_id=`
  via `GET /api/leads/:id/activities`; without a lead_id it says so
  honestly instead of inventing a global timeline (no such endpoint
  exists).

### Verified
- Tests: **35/35 pass** (no server change in this phase).
- Build: 64 central-crm pages updated, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8916, temp DB deleted
  afterwards): new list 1, lost list 1; admin export returns a real
  CSV header row, owner export 403; lead activities present;
  served new/lost/dashboard/export/timeline pages contain the new
  wiring (the other 4 status pages share the same code path).
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-crm3/`.

### Deliberately NOT in this phase
- Scoring, tags, SLA (need formula/threshold decisions),
  visit-booking model (needs entity design), payments/tickets/
  campaigns/settings (separate domains).
- CRM changes are local only, NOT pushed to GitHub; the live Pages
  site still serves Stage C state.

## Push to GitHub — Stage H + CRM live (2026-10-28)

### What was pushed (user: "sabhi GitHub par turant live kar diya karo")
- Full site snapshot: 718 files, 28.35 MB, in 12 batches (~2.5 MB
  each), on top of the verified Stage C head
  `b1dbff00ac603c7facb1a64f78414cab2fb325ce`.
- Final head: `a604d28dd734aa67239e97331e2a3938f8babaa6`
  (commit "Stage H + CRM (12/12): remaining files + .nojekyll
  for Pages").
- Excluded on purpose: `.git/` internals and `server/data/*.db`
  (the database is never pushed).
- Pages verified live right after the push: login.html serves,
  new-leads.html contains the new CRM wiring, homepage title
  intact.

### Honest scope of "live" on GitHub Pages
- Pages serves static files only. The new pages, designs and
  demo content are live, but the API-backed features (login,
  live listings, dashboards, CRM lists, export) need the Node
  server running on real hosting — on Pages those sections
  honestly report that the server cannot be reached. That
  hosting decision (Node vs PHP-only) is still open.

## CRM Stage, Phase 5 — Lead tags (2026-10-28)

### What was built (user: "aage ka kaam badao"; tags chosen as the
### next slice because they need no product decisions)
- Migration 007: `tags` (unique names) + `lead_tags` link table
  (one tag per lead, enforced by composite primary key).
- New endpoints, same visibility rule as notes/follow-ups
  (anyone who can see the lead can tag it; invisible leads 404):
  `GET /api/tags`, `GET /api/leads/:id/tags`,
  `POST /api/leads/:id/tags` (201 new link; 200 when the tag is
  already attached), `DELETE /api/leads/:id/tags/:tagId`.
  Tag names are free-form, trimmed, collapsed whitespace, max
  50 chars, deduped case-insensitively ("Hot Lead" then
  "hot lead" reuses the same tag). Tag add/remove writes a
  timeline activity, so the timeline shows tagging history.
- `lead-tags.html` wired (crm.js): current tags with Remove
  buttons, an input to add a new tag, and one-click chips for
  existing tags; `?lead_id=` required, with an honest notice
  without one. DOM construction only — tag names are user
  input and are never injected as HTML.

### Verified
- Tests: **36/36 pass** (new tags test in test/crm.js).
- Build: 64 pages updated, second run 0 changes (idempotent);
  all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8917, temp DB deleted
  afterwards): add 201, case-insensitive duplicate 200 with a
  single link, list and all-tags correct, remove 200, list
  empty afterwards, anonymous 401, served lead-tags page
  contains the new wiring.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-crm4/`.

## Push to GitHub — CRM Phase 5 lead tags live (2026-10-28)
- Incremental push of the 70 files changed by the tags slice
  (64 rebuilt pages + shared crm.js + server code + migration
  007 + tests + this changelog), on top of head
  `a604d28dd734aa67239e97331e2a3938f8babaa6`.
- Database files never pushed.

## CRM Stage, Phase 6 — Lead scoring + SLA + escalation (2026-10-28)

### What was built (user said "ok next"; scoring/SLA chosen because
### both compute from existing data — no new product model needed)
- `GET /api/leads/scores` (visibility-scoped, paginated): every
  visible lead with a computed score, band and breakdown.
  Scoring defaults, documented in leads.js: stage points new 10
  / contacted 25 / interested 50 / site_visit 70 / negotiation
  85; +5 per note (max 15); +5 per completed follow-up (max
  15); capped at 100. Closed = 100 (Won), lost = 0 (Lost).
  Honest scope: profile/budget-match signals are NOT in the
  data yet (inquiries carry no buyer budget/profile fields),
  so the score uses stage + engagement + activity only.
- `GET /api/leads/sla` (visibility-scoped): every visible lead
  with first-response time, follow-up signals and sla_status
  (met / pending / breached / closed). Targets come from the
  lead-sla page's own copy: first contact within 1 hour,
  follow-up within 24 hours. A lead breaches when its first
  response took over 1h, when no follow-up was created within
  24h of the inquiry (and it is older than 24h), or when it
  has an open follow-up past its due time. Closed/lost leads
  stop SLA tracking but keep their real signals.
- Pages wired (crm.js, DOM construction only): lead-scoring
  (score + band + breakdown), lead-sla (full SLA table),
  lead-escalation (breached leads only, with an honest
  "no escalation" empty state).
- Routing catch (same as stats): the scores/sla branches sit
  BEFORE the lead-detail route, or 'scores'/'sla' would match
  the :id route and 404.

### Verified
- Tests: **38/38 pass** (new scoring + SLA tests in test/crm.js,
  including a backdated first-response breach and the closed
  state).
- Build: 64 pages updated, second run 0 changes (idempotent);
  all modules `node --check` PASS.
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8918, temp DB deleted
  afterwards): fresh lead score 10 (Cool) with a correct
  breakdown, SLA pending with no first response; after
  contacted + note + follow-up, score 30 and SLA met
  (first response 0h, follow-up within 24h); all three pages
  serve with the new wiring.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-crm5/`.

## Push to GitHub — CRM Phase 6 scoring + SLA live (2026-10-28)
- Incremental push of the 69 files changed by the scoring/SLA
  slice, on top of head `5da48eadd6d0d11b47f17b8cce8487e72cab4173`.
  Database files never pushed.

## Stage I, Slice 1 — SEO foundations (2026-10-28)

### What was built (user said "ok next"; Stage I per the brief)
- `tools/sitemap.py` (re-runnable generator) + `sitemap.xml`:
  105 public URLs — all root pages except login/register,
  all of blog/ and news/, and the public browse/detail pages
  of property-search/ and property-engine/. Portal, dashboard,
  CRM, admin and settings sections are excluded (authenticated
  app surfaces, not content). URLs use the live GitHub Pages
  base; if the site moves to a root domain, change BASE_URL
  and re-run. <lastmod> is the file's modification date;
  no guessed <changefreq>/<priority>.
- `robots.txt`: public content crawlable; 18 authenticated
  sections disallowed (root-domain form, with a comment
  explaining the GitHub Pages subpath situation); points to
  the sitemap.
- Canonical + Open Graph tags on every page, injected by
  `tools/build.py` (the shared build, so future pages get
  them automatically): canonical URL (directory form for
  index pages), og:title from <title>, og:description from
  the page's own meta description, og:type website, og:url.
  Injection is idempotent (pages already carrying a
  canonical link are untouched). Attribute escaping does
  not double-escape existing entities (verified on the
  "Terms & Conditions" title).

### Verified
- Build: 652 pages updated, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Every page has exactly 1 canonical, 1 og:title and
  1 og:url; no <title> changed versus the pre-slice backup.
- sitemap.xml parses as valid XML; all 105 locs resolve to
  real files on disk.
- Tests: 38/38 pass (no server change in this slice).
- Audit re-run: 0 broken internal links.
- Live flow on a fresh database (port 8919, temp DB deleted
  afterwards): sitemap.xml, robots.txt and a section page's
  canonical link all serve correctly.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-i-seo/`.

## Push to GitHub — Stage I SEO slice live (2026-10-28)
- Push of the 657 files changed/added by the SEO slice
  (652 rebuilt pages + build.py + sitemap.py + sitemap.xml +
  robots.txt + this changelog), in 13 batches, on top of head
  `d779179d20132902f1ff85b3b217832b7af16846`.
  Note: the first batch list missed the two root-level new
  files (a diff-parser edge case for "Only in <dir>: <file>"
  lines); they went in batch 13 and were verified on Pages
  afterwards. Database files never pushed.

## Stage I, Slice 2 — Performance + security (2026-10-28)

### What was built (user said "ok next")
- gzip on the Node server (`server/src/server.js`, `node:zlib`):
  compressible text bodies >= 1 KB are gzipped when the client
  accepts it; small bodies and images are left alone. Measured
  on the homepage: 42,385 -> 10,887 bytes (-74%). The request
  object is stashed on its own per-request response object so
  gzip negotiation needs no changes across the 50+ sendJson
  call sites; each request gets its own response object, so
  nothing leaks across requests.
- Security headers on every response (static, API, CSV):
  X-Content-Type-Options nosniff, X-Frame-Options SAMEORIGIN,
  Referrer-Policy strict-origin-when-cross-origin, and a CSP
  that allows the inline scripts/styles the single-file build
  genuinely uses ('unsafe-inline') while restricting everything
  else to same-origin plus Unsplash images. Honest limit: CSP
  does not replace DOM-construction discipline for user data.
- Migration 008 (performance indexes): properties (status,
  city, property_type, listing_type); inquiries (assigned_to),
  (status), (source); lead_followups (due_at). Evidence from
  EXPLAIN QUERY PLAN on 200-row test tables: properties
  status-only lists now SEARCH idx_properties_status (before:
  no status-first index); leads status filters now SEARCH
  idx_inquiries_status (before: full SCAN of inquiries).
- `assets/js/groups/buyer.js`: the 3 calculator innerHTML
  assignments are now DOM construction (strong + br + text
  nodes) via a setCalc helper. A new server test guards this:
  no innerHTML assignment in shipped group/component JS.
- MIME types added for .xml and .txt (sitemap.xml and
  robots.txt previously served as application/octet-stream).
- Audit re-triage: the Stage A site-wide entries "No backend
  / database", "No authentication / authorization" and "No
  build / test tooling" were removed from audit.py with a
  comment recording the evidence (server + 8 migrations +
  API; login/sessions/RBAC enforced; build.py + test suite).
  The audit's innerHTML check was also fixed: it matched any
  mention (flagging a comment and a test file); it now matches
  real assignments and skips test files, which never run in a
  browser.

### Verified
- Tests: 42/42 pass (38 existing + 4 new in test/perf.js:
  gzip round-trip, security headers, migration 008 indexes,
  no-innerHTML guard). Two test bugs found by the run itself
  and fixed: the innerHTML guard matched its own comment, and
  fetch's default gzip handling hid the headers under test —
  the gzip test now uses raw node:http.
- Build: 50 buyer/investor pages rebuilt, second run 0 changes
  (idempotent); all modules `node --check` PASS.
- Audit re-run: 341 bug entries (was 345: 3 stale site-wide
  entries removed + buyer.js genuinely fixed; the perf.js
  false positive appeared and was excluded in the same pass),
  0 broken internal links, 0 unsafe-DOM entries left.
- Live flow on a fresh database (port 8921, temp DB deleted
  afterwards): homepage 42,385 -> 10,887 bytes gzipped, all
  four security headers present, EXPLAIN plans confirm the
  new indexes are used.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-i-perf/`.

## Stage I, Slice 3 — Accessibility (2026-10-28)

### Measured baseline (all 652 pages, automated scan)
Already good before this slice: every page declares lang, has
exactly one <h1>, has a <main> landmark; all 374 images carry
alt text; no empty links or buttons. Gaps found: 0 pages had a
skip link, no :focus styling existed in shared CSS, and 868
form controls (641 inputs, 167 selects, 60 textareas) had no
accessible name — placeholder text only, which is not a label.

### What was fixed (user said "ok next")
- 868 controls labelled with aria-label, derived from the
  control's placeholder (verb prefixes stripped), name, or id,
  with a type-based fallback. Visible <label> elements were
  deliberately NOT added: they would shift layouts, which the
  brief forbids. Hidden/submit/button/reset/image inputs are
  exempt. One-off fixer at /tmp/a11y-fix.py (idempotent:
  second run changes 0 pages).
- Skip link on every page (visually hidden until focused) +
  id="main-content" tabindex="-1" on every <main>.
- :focus-visible (royal-blue 3px outline, 2px offset) in
  assets/css/base.css, inlined into every page by the build.
  :focus-visible, not :focus, so mouse clicks stay
  outline-free.
- Colour contrast measured, not changed: all brand pairs pass
  WCAG AA for normal text (navy 15.96:1, royal 5.17:1, red
  4.70:1). See ACCESSIBILITY.md for the full record and its
  honest limits (automated checks only; no manual
  screen-reader/keyboard walkthrough yet).

### Verified
- Tests: 42 existing + 5 new in server/test/a11y.js (page
  structure, image alts, control names, empty links/buttons,
  shared focus/skip CSS) — full suite re-run below.
- Build: 652 pages rebuilt, second run 0 changes (idempotent);
  all modules `node --check` PASS.
- Re-scan after the fix: 0 unlabeled controls, 0 pages
  without a skip link or focus CSS; spot-checked login.html
  (email -> "Email", password -> "Password") and index.html
  (skip link + main id).
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-i-a11y/`.

## Stage J — Final tests + deployment docs (2026-10-28)

### Final verification (user said "ok next")
- New `server/test/journey.js`: one test walks the whole
  product on a fresh database — draft property invisible
  publicly, publish makes it visible, buyer enquiry,
  assign + status transitions (new -> contacted ->
  interested), note, follow-up (created + completed), tag,
  scores (60, Warm), SLA, stats, CSV export, contact inbox,
  saved properties, my-enquiries, plus homepage/sitemap/
  robots responses. One test bug found and fixed during the
  run (save route is POST /api/properties/:id/save, not
  POST /api/saved/:id — the server was right, the test was
  wrong).
- Full suite: 48/48 pass. Build twice: second run 0 changes.
  Audit: 341 entries, 0 broken internal links.
- `DEPLOYMENT.md` written: architecture (Pages static +
  Node API, honestly separated), local run + env vars,
  first-admin creation, Pages deploy + subpath notes,
  email/SMS/WhatsApp non-configuration (console backend,
  503 otherwise), security notes incl. the known missing
  `Secure` cookie flag, backups/rollback, measured
  performance, remaining-audit triage, and the
  not-production-ready list (visit-booking, payments,
  tickets, campaigns, settings, hosting decision).
- Brief Stages A-J are now complete. Remaining work needs
  user decisions or real credentials and is listed in
  DEPLOYMENT.md, not hidden.
- Backup before this change:
  `~/workspace/primepropertys-backup-stage-j/`.

## Visit-booking core (post-Stage-J slice, 2026-10-28)

### Design decisions made for this slice (user said "ok next")
- Visit statuses mirror the section's own pages: requested
  (pending), confirmed (approved), rejected, completed,
  cancelled. Transitions: requested -> confirmed/rejected/
  cancelled; confirmed -> completed/cancelled; completed/
  rejected/cancelled are terminal.
- Visibility mirrors leads: the requester, the property
  owner, and visits:manage holders (Admin, Super Admin)
  can see a visit. Status changes are owner/manage-only,
  except a requester may cancel their own requested/
  confirmed visit. Feedback (text + 1-5 rating) is only
  accepted on completed visits. Rescheduling keeps the
  status and stamps rescheduled_at (that is how the
  rescheduled-visits page finds its rows).
- Agent assignment and visit analytics are NOT in this
  slice: assign-agent.html and visit-analytics.html stay
  demo-honest until then. The site-visit calendar page
  already showed live follow-ups (CRM Phase 2) and is left
  as-is.

### What was built
- Migration 009: site_visits table + indexes + the
  visits:manage permission (Super Admin, Admin).
- server/src/visits.js + routes: POST /api/site-visits
  (logged-in request on a published property, future
  date only), GET list (visibility-scoped, ?status= and
  ?property_id= filters), GET detail, PATCH (status /
  reschedule / feedback / rating with the rules above),
  GET /api/site-visits/stats (visibility-scoped counts).
- 12 site-visit pages wired in assets/js/groups/crm.js:
  dashboard (request form with a live property dropdown,
  live stats cards, live table), visit-requests, pending,
  approved, completed, cancelled, rejected (status
  tables), rescheduled (client filter on rescheduled_at),
  visit-reminder (upcoming 7 days), visit-details (detail
  + Confirm/Reject/Cancel/Complete actions; the server
  enforces who may do what). visit-feedback.html's form
  is now data-api="visit-feedback" (forms.js case; needs
  ?visit_id=). Demo table rows are replaced by live rows.
- Fixed a pre-existing silent bug found while wiring:
  the CRM follow-up "Mark done" button used PP.post (POST)
  against a PATCH-only route, so it did nothing. It now
  uses PP.request with method PATCH.
- Audit false positives fixed in the same pass: 9
  "duplicate id" entries were my own JS comment
  containing the literal id="..." text (the audit scans
  inlined script text as markup — a known audit
  imprecision, same family as the earlier innerHTML one);
  the comment was reworded and the dashboard form's
  controls gained name attributes.

### Verified
- Tests: 49/49 pass (48 existing + 1 new in
  server/test/visits.js: lifecycle, visibility 404 for
  strangers, illegal transitions, feedback rules,
  reschedule stamping, stats). The a11y test caught the
  new form's unlabelled controls during the run; labels
  were added before this checkpoint.
- Build: 64 crm-group pages rebuilt, second run 0 changes;
  all modules `node --check` PASS.
- Audit: 340 entries (was 341: feedback form wired; the
  9 duplicate-id and 1 inputs-without-name entries above
  resolved), 0 broken internal links.
- Live flow on a fresh database (port 8942, temp DB
  deleted afterwards): create -> publish -> request
  (201, requested) -> confirm -> complete -> feedback
  (rating 5) -> stats (total 1, completed 1).
- Backup before this change:
  `~/workspace/primepropertys-backup-visits/`.

## Visit-booking finish (post-Stage-J slice, 2026-10-28)

### Design decisions made for this slice (user said "ok next")
- Assignment mirrors lead assignment: POST
  /api/site-visits/:id/assign is a visits:manage action
  (Admin, Super Admin only — like leads:assign), the
  assignee may be any user, and the assignee gains
  visibility of the visit (list + detail + stats +
  analytics filters all use the same three-way rule:
  requester, property owner, assignee).
- Analytics is computed from existing visits only (like
  the CRM reports slice): total, by-status, approved /
  completed / cancelled rates as shares of the visible
  total (one decimal), top 5 properties, agent totals +
  completed counts, upcoming-7-days count. Visits carry
  no source field, so no by-source breakdown is claimed
  — the demo "Visits by Source" paragraph was replaced
  by the live breakdown rather than faked.

### What was built
- Migration 010: site_visits.assigned_to + index.
- server/src/visits.js: assignVisit + visitAnalytics;
  list/stats/analytics share one visibility filter;
  routes POST /api/site-visits/:id/assign and
  GET /api/site-visits/analytics (before the detail
  route, same catch as stats).
- assign-agent.html wired: visit + agent dropdowns from
  the real API (agent list is admin-gated, like lead
  assignment), optional date/time reschedules with
  honest partial-failure reporting (forms.js
  data-api="visit-assign"); the demo Agents card is now
  a live agent-performance list from the analytics
  endpoint.
- visit-analytics.html wired: the 4 KPI cards fill from
  live analytics and the demo status/source card is now
  a live breakdown (by-status line, top properties,
  agent performance, upcoming count).
- The site-visit section is now fully wired except
  index.html (a landing page with no data) and the
  calendar page (already live via follow-ups since CRM
  Phase 2).

### Verified
- Tests: 50/50 pass (49 + 1 new in test/visits.js:
  manage-only assign, unknown assignee rejected,
  assignee visibility, analytics totals/rates/
  by-property/by-assignee).
- Build idempotent; all modules `node --check` PASS.
- Audit: 339 entries (was 340: the assign-agent form
  is now wired), 0 broken internal links.
- Live flow on a fresh database (port 8943, temp DB
  deleted afterwards): request -> assign (200) ->
  agent sees detail (200) -> analytics (total 1,
  requested 1, top property + assignee rows correct).
- Backup before this change:
  `~/workspace/primepropertys-backup-visits2/`.

## Support tickets (post-Stage-J slice, 2026-10-28)

### Design decisions made for this slice (user said "ok next")
- Tickets are user-raised issues, separate from home
  service requests (service-request-form.html is a
  plumbing/electrical/etc. form, not a ticket form, so
  it was left alone). Creation lives on
  contact-support.html ("Raise a Ticket"); the admin
  lists are super-manager/complaints.html and
  support.html; detail is a new page,
  super-manager/ticket-details.html (built from the
  support.html shell so its nav and styling match).
- Statuses: open -> in_progress -> resolved -> closed,
  plus open -> closed and resolved -> in_progress
  (reopen). Visibility mirrors visits: requester,
  assignee, and tickets:manage holders (Admin, Super
  Admin, and the Support role — tickets are their job).
  Status changes are manage/assignee-only, except a
  requester may close their own ticket from any open
  state, including resolved (accepting the resolution);
  reopening stays staff-only.
- One design correction during testing: the first
  version only let requesters close from open/
  in_progress, which broke the natural resolve ->
  close flow. The server was fixed, not the test.

### What was built
- Migration 011: support_tickets + ticket_replies +
  tickets:manage permission (Super Admin, Admin,
  Support).
- server/src/tickets.js + routes: POST /api/tickets,
  GET list (visibility-scoped, ?status=/?priority=
  filters), GET detail (with the reply thread),
  PATCH status, POST :id/assign (tickets:manage
  only), POST :id/replies (anyone who can see it).
- Pages wired: complaints + support tables (live
  rows, subject links to the details page),
  contact-support ticket form (data-api="ticket"),
  ticket-details (detail + replies + status buttons +
  assign dropdown + reply form).
- Home service requests (service-request-form,
  my-service-requests, complaint-tracking) are a
  separate domain and were NOT folded into tickets.

### Verified
- Tests: 51/51 pass (50 + 1 new in
  server/test/tickets.js: lifecycle, visibility 404
  for strangers, manage-only assign, illegal
  transitions, reply rules, requester close of a
  resolved ticket, list filters).
- Build idempotent (653 pages now, including the new
  ticket-details.html); all modules `node --check`
  PASS.
- Audit: 339 entries (unchanged: the ticket pages
  had no unwired forms before), 0 broken links.
- Live flow on a fresh database (port 8946, temp DB
  deleted afterwards): create (201, open) -> assign
  -> in_progress -> reply (201) -> resolved ->
  detail (thread present) -> buyer closes resolved
  (200).
- Backup before this change:
  `~/workspace/primepropertys-backup-tickets/`.

## Home service requests (post-Stage-J slice, 2026-10-28)

### Design decisions made for this slice (user said "ok next")
- Service requests are their own domain, not tickets:
  the form's fields (category, issue type, address,
  preferred date/slot, urgency, description) define
  the model. Photo upload stays visual-only: binary
  multipart upload is not implemented anywhere in the
  server (same honest limit as property images).
- Statuses follow the tracking page's own timeline:
  requested (raised) -> assigned -> scheduled (visit
  scheduled) -> in_progress -> completed (resolved),
  plus cancelled from any open state. Timestamps make
  the timeline real: assigned_at, scheduled_at (the
  staff-confirmed visit time — preferred_date +
  time_slot stay the user's original ask),
  completed_at.
- Visibility mirrors tickets: requester, assignee,
  and services:manage holders (Admin, Super Admin,
  Support). Status changes are manage/assignee-only,
  except a requester may cancel their own request
  from any open state. Stats use the list page's own
  card language: In Progress = assigned + scheduled +
  in_progress; Resolved = completed; Closed =
  cancelled.
- The section had no JS group (js_map had no
  support-home-services entry), so a new
  assets/js/groups/services.js was added and mapped
  in tools/section-map.json — the same mechanism the
  other sections use.

### What was built
- Migration 012: service_requests + services:manage
  permission (Super Admin, Admin, Support).
- server/src/services.js + routes: POST
  /api/service-requests, GET list (visibility-scoped,
  ?status=/?category= filters), GET detail, PATCH
  (status / scheduled_at with the rules above), POST
  :id/assign (services:manage only), GET stats.
- Pages wired: service-request-form (all 7 fields,
  urgency text mapped to low/normal/high; success
  message now carries the real HSR-<id>, not the
  demo's HSR-2025-00024), my-service-requests (live
  stats cards + live table with View links),
  complaint-tracking (live detail + derived timeline
  + status buttons + assign card + schedule card +
  the track form now navigates to ?request_id=,
  accepting HSR-12 or plain 12).

### Verified
- Tests: 52/52 pass (51 + 1 new in
  server/test/services.js: lifecycle, visibility 404
  for strangers, manage-only assign, schedule
  transition + timestamp, stats mapping, cancel
  rules). One test expectation was corrected during
  the run (requester cancelling a completed request
  is 403 — not their action — while staff get 400
  for the invalid transition, matching the
  visits/tickets gate order).
- Build idempotent; all modules `node --check` PASS.
- Audit: 337 entries (was 339: the service-request
  and track forms are now wired), 0 broken links.
- Live flow on a fresh database (port 8948, temp DB
  deleted afterwards): create (201, requested) ->
  assign -> schedule (status scheduled, confirmed
  time stored) -> in_progress -> completed -> stats
  (total 1, resolved 1).
- Backup before this change:
  `~/workspace/primepropertys-backup-services/`.
