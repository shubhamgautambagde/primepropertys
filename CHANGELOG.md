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

## Portal my-lists (post-Stage-J slice, 2026-10-28)

### What was built — no new endpoints, no migration
Six portal list pages that still showed demo rows now
render from endpoints that already existed; the slice
was found by auditing the portal sections for pages
without live markers after the home-services slice:
- buyer-portal/my-site-visits.html -> GET
  /api/site-visits (buyer sees only their own).
- owner-portal/my-properties.html -> GET
  /api/properties/mine plus GET /api/leads for the
  per-property Leads column.
- owner-portal/site-visits.html -> GET
  /api/site-visits (owner sees visits on their own
  properties).
- owner-portal/property-leads.html -> GET /api/leads
  (owner sees leads on their own properties), with
  View details links to lead-details.html?lead_id=.
- agent-portal/assigned-leads-1.html -> GET
  /api/leads?assigned_to=<current user>.
- agent-portal/assigned-leads-2.html -> the same list
  grouped client-side by source (count, closed,
  conversion %).

### Honest limits kept in the render
- Views on my-properties shows a dash: the list
  endpoint does not expose per-property view counts.
- Budget on assigned-leads-1 shows a dash: inquiries
  carry no buyer budget field (same documented limit
  as lead scoring). Assigned shows "You" (the list is
  filtered to the current agent).
- Agent on my-site-visits shows a dash: visits carry
  no agent until one is assigned.
- The by-source page groups the first 100 assigned
  leads client-side.
- Deliberately NOT wired: buyer-portal/my-leads.html
  — a buyer's "leads" have no distinct meaning (their
  enquiries already live on my-enquiries.html via
  /api/inquiries/mine); wiring it to /api/leads would
  show the buyer nothing, since lead visibility is
  owner-or-assignee based. That page needs a product
  decision, not a wiring job.

### Verified
- Tests: 53/53 pass (52 + 1 new in
  server/test/portal-lists.js: assigned_to filter and
  properties/mine status filter). Three test bugs
  were fixed during the run (publish is POST not
  PATCH; property create requires listing_type;
  enquiries go to POST /api/inquiries with property_id
  in the body) — the server was right each time.
- Build idempotent; all modules `node --check` PASS.
- Audit unchanged at 337 entries (tables are not
  audit bugs), 0 broken links.
- Live flow on a fresh database (port 8950, temp DB
  deleted afterwards): owner creates draft +
  published, buyer enquires + requests a visit, admin
  assigns the lead to the agent — owner mine 2,
  owner leads 1, owner visits 1, buyer visits 1,
  agent assigned 1.
- Backup before this change:
  `~/workspace/primepropertys-backup-portal/`.

## Newsletter subscriptions (brief Phase C, 2026-10-28)

### What was built
- Migration 013: newsletter_subscriptions (email UNIQUE
  COLLATE NOCASE, status subscribed/unsubscribed,
  consent_at, unsubscribed_at, timestamps) + status
  index. No new permission and no list endpoint: the
  slice stores consent only, exactly as the brief
  scopes it.
- server/src/newsletter.js + routes POST
  /api/newsletter/subscribe and POST
  /api/newsletter/unsubscribe: email validated with
  the shared isValidEmail helper; 20 attempts/hour/IP
  rate limit (same window style as contact/inquiry);
  duplicate subscribe returns 200 already_subscribed
  (case-insensitive); unsubscribed addresses can
  resubscribe (200 resubscribed); unsubscribe always
  answers neutrally so it cannot enumerate subscribers.
- forms.js `newsletter` case + all 70 footer
  newsletter forms wired (identified mechanically by
  the newsletter-row pattern; every other
  not-connected form on those pages untouched).
- Audit docs completed for brief Phase A/B: new
  FRONTEND_BACKEND_MAPPING.md (generated from the
  actual source: forms.js cases resolved through
  api.js helpers, real form tags only, server routes,
  unwired counts by section with blocking reasons)
  and PLACEHOLDER_LINKS_REPORT.md (the 186 raw
  href="#" occurrences triaged: 184 listed + 2
  resolved in Stage B; no link changed — every
  remaining group lacks a determinable destination,
  and the brief forbids inventing one).

### Honest limits kept
- Subscribing never claims an email was sent: no
  email provider is configured. Token-based
  confirm/unsubscribe is deliberately NOT built,
  because tokens cannot be delivered without a
  provider; the doc records that as the follow-up.
- The brief's raw counts were verified against the
  source before acting: 186 href="#" and 333
  data-backend="not-connected" occurrences are both
  still true (the audit's 52/282 count files and
  unmarked forms, not raw occurrences).
- Post-property wizard forms were inspected and NOT
  wired: the wizard has no shared draft state and
  needs binary uploads + OTP, which are product
  decisions, not wiring jobs.

### Verified
- Tests: 54/54 pass (53 + 1 new in
  server/test/newsletter.js: subscribe 201, duplicate
  200, invalid 400, neutral unsubscribe, resubscribe,
  database row check).
- Build idempotent; all modules `node --check` PASS.
- Audit: 312 entries (was 337; files with unwired
  forms 282 -> 257 as 25 pages were fully cleared),
  not-connected markers 333 -> 263 (exactly the 70
  wired newsletter forms), 0 broken links.
- Live flow on a fresh database (port 8952, temp DB
  deleted afterwards): subscribe 201 -> duplicate 200
  already_subscribed -> unsubscribe 200 -> resubscribe
  200 -> database row status subscribed.
- Backup before this change:
  `~/workspace/primepropertys-backup-newsletter/`.

## README reconciliation (brief Phase J, 2026-10-28)

### What changed — documentation only, no behaviour change
- Root README.md rewritten: it still claimed "Public Website
  (Static)", "17 pages", "no build step, no backend, no database",
  and "forms do not send data anywhere" — all false since Stage D.
  It now describes the real project (653 pages, 27 sections,
  Node >= 24 + SQLite backend, build.py, 54 tests) and points to
  DEPLOYMENT.md, CHANGELOG.md, FRONTEND_BACKEND_MAPPING.md and
  PLACEHOLDER_LINKS_REPORT.md, with the honest-limits list kept
  intact (Pages static-only, email unconfigured, binary upload
  not implemented, Secure cookie gap, empty production DB).
- server/README.md rewritten: it still claimed "Stage D" and a
  "read-only JSON API" and covered only Stages D–G. It now
  documents every route group (auth, properties, leads/CRM incl.
  tags/scores/SLA/stats/export, contact, visits + analytics,
  tickets, services, newsletter, health), the shared conventions
  (404-not-403 visibility, error shape, pagination, gzip,
  security headers), and all 13 migrations with their contents.
  Route inventory was extracted from server.js, not recalled.
- One stale string fixed in passing: the server startup log
  said "Stage G"; it now says just "PrimePropertys server".

### Verified
- Tests: 54/54 pass (no code behaviour changed; the log line
  is console output only).
- Backup before this change:
  `~/workspace/primepropertys-backup-readmes/`.

## Payments core (autopilot slice 1, 2026-10-28)

### Autopilot decision, documented (user: "sab kuch autopilot mode me solve kar do")
- There is no payment gateway configured and no provider credentials
  exist, so a gateway integration cannot be built by autopilot — it
  would require inventing credentials. What was built instead is the
  complete offline/manual payment domain, with the limit stated in
  the code, the docs and the UI copy: a payment record is a PENDING
  claim until staff verify it; nothing charges a card, UPI id or bank
  account. A future gateway integration must add its own provider
  fields and webhooks and must not reinterpret these rows as gateway
  charges.

### What was built
- Migration 014: payments (description, amount_paise integer —
  paise, never float rupees — method card/upi/netbanking/wallet/
  emi/other, reference, status pending/verified/rejected/
  refund_requested/refunded, refund fields, verified_by/at) +
  billing_profiles (one row per user) + payments:manage
  permission (Super Admin, Admin).
- server/src/payments.js + routes: POST /api/payments
  (logged-in; creates pending; checkout billing fields are saved
  to the billing profile in the same transaction), GET list
  (own, or all for payments:manage; ?status= filter), GET detail
  (own or manage, else 404), PATCH (manage only: pending ->
  verified/rejected; refund_requested -> refunded, or rejected
  which returns the payment to verified since the refund was
  declined), POST :id/refund-request (payer only, from pending/
  verified, amount capped at the payment amount), GET/PUT
  /api/billing-profile (own).
- Pages wired (new assets/js/groups/payments.js mapped in
  tools/section-map.json — the payments section previously had no
  JS group): payment-history (live table, PAY-<id>), invoice-list
  (live table, invoice numbers derived as INV-<id>, View links to
  details), invoice-details (?payment_id=, live meta + single-item
  breakdown; no GST invented — the amount is the total payable),
  refund-status (?payment_id= detail, or the user's refund-related
  payments without one), refund-request (payment dropdown
  populated from the user's pending/verified payments; reason +
  amount + refund-to), billing-profile (save + prefill),
  payment-checkout (amount 1123900 paise and description "PRO
  plan — yearly" taken from the page's own offer copy, not
  invented; success note honestly says pending + no gateway
  charge). Portal tables wired too: buyer/owner/agent payment
  histories and owner invoices (INV-<id>).
- Deliberately left alone: payment-success / payment-failed /
  payment-processing pages (status landing pages, not data views;
  checkout shows its own success note and does not redirect to
  them) and the subscription plan flows (plans/checkout/upgrade/
  downgrade/cancel/coupons need a plan catalog — next autopilot
  item is campaigns, then settings, then the wizard; subscription
  plans follow from the plan prices shown on the plans pages).

### Verified
- Tests: 55/55 pass (54 + 1 new in server/test/payments.js:
  create/validation, visibility 404, manage-only verify,
  illegal transitions, refund request cap + approve, refund
  decline returning to verified, billing profile save + stranger
  isolation, list scoping).
- Build idempotent; all modules `node --check` PASS. One false
  alarm during verification: payments.js IS inlined (build.py
  strips leading header comments, so grepping for the header
  text proves nothing — the live table ids in the inlined code
  are the real check).
- Audit: 309 entries (was 312; not-connected markers 263 -> 260,
  exactly the 3 wired payment forms), 0 broken links.
- Live flow on a fresh database (port 8954, temp DB deleted
  afterwards): create 201 pending -> verify 200 -> refund-request
  200 -> refund-approve 200 -> buyer list 1 -> billing profile
  saved (city Nagpur).
- Backup before this change:
  `~/workspace/primepropertys-backup-payments/`.

## Campaigns + templates + queued messages (autopilot slice 2, 2026-10-28)

### Autopilot decisions, documented
- Marketing campaigns are AD campaigns — the create form's own
  fields (objective, type, description, daily/total budget,
  channels Facebook+Instagram / Google Ads / YouTube Ads / All
  Channels). Ad-platform metrics (impressions, clicks, spend,
  platform leads/conversions) do NOT exist: no ad platform is
  connected, so those list columns show a dash, never a number.
- Templates are reusable message content (channel, name, subject,
  body). "Use Template" now navigates to the channel's center page
  with ?template_id= : SMS/WhatsApp centers prefill the compose
  form; email/notification centers (which have no compose form)
  show the selected template with an honest note instead of
  pretending to send. No compose UI was invented for email.
- SMS/WhatsApp center submissions are stored as QUEUED messages:
  no SMS/WhatsApp provider is configured, so nothing is sent, and
  the success note says so. The WhatsApp form had no recipient
  field at all — a send form without one cannot function — so a
  Phone Number input was added to it (the only added field in
  this slice).

### What was built
- Migration 015: campaigns (budgets in paise, status
  draft/scheduled/active/paused/completed/cancelled with an
  enforced transition map) + message_templates (channel
  email/sms/whatsapp/notification) + queued_messages (channel
  sms/whatsapp, recipient, body, template_id, status queued) +
  campaigns:manage permission (Super Admin, Admin).
- server/src/campaigns.js + routes: POST/GET /api/campaigns,
  GET/PATCH /api/campaigns/:id, POST/GET /api/message-templates,
  GET /api/message-templates/:id, POST/GET /api/queued-messages
  — all campaigns:manage-gated (403 for others, since these are
  staff domains, not per-user resources).
- Pages wired (new assets/js/groups/marketing.js mapped in
  tools/section-map.json; communication remapped from crm.js to
  new assets/js/groups/communication.js — verified safe: no
  communication page contains a crm.js-guarded id): campaigns
  list (live rows + working search/status filter; Budget real,
  Spent/Performance/Leads/Conversions dashes), campaign details
  (?campaign_id= + status buttons), create + edit campaign
  (prefill on edit), 4 template pages (live card grids + create
  form on each — the form was added to sms/whatsapp/notification
  pages, which had none), sms-center + whatsapp-center compose
  forms (queued, not sent), notification-logs + notification-
  center (live queued-message lists; Sent column is a dash).
- Deliberately left alone: campaign-analytics (its metrics do
  not exist), affiliate/promotions/coupons/referral/banner-ads/
  featured-property/property-boost/agent-builder-project-
  promotion/marketing-dashboard (need ad-platform or plan data),
  chat/conversations/messages/communication-preferences/push-
  notifications (need provider or chat backends), and the
  email-center compose UI (does not exist; not invented).

### Verified
- Tests: 56/56 pass (55 + 1 new in server/test/campaigns.js:
  staff-only 403, channel/budget validation, illegal status
  transitions, status filter, template channel filter, queued
  message validation + template reference).
- Build idempotent; all modules `node --check` PASS.
- Audit: 303 entries (was 309; not-connected markers 260 -> 254,
  exactly the 6 wired forms), 0 broken links.
- Live flow on a fresh database (port 8955, temp DB deleted
  afterwards): campaign create 201 draft (total 7,500,000 paise)
  -> activate 200 -> template create 201 -> queued message 201
  (status queued) -> lists correct.
- Backup before this change:
  `~/workspace/primepropertys-backup-campaigns/`.

## Settings core (autopilot slice 3, 2026-10-28)

### Key finding that changed the design
- All 28 system-settings forms are byte-identical copies of one
  generic form (Site/Service Name, Support Email, Contact Number,
  Default Country + Save + Reset). The page titles differ (Email
  Settings, Payment Settings, 2FA, ...), but NO page-specific
  field — no SMTP host, no API key, no payment secret, no OTP
  secret — exists anywhere in the markup. The earlier "settings
  hold secrets" concern was based on titles, not fields, so no
  secret-handling design was needed for what the pages actually
  contain, and no secret field was invented.
- Real defect found in the same forms: the Reset button was
  type="submit", so it would SAVE instead of resetting.

### What was built
- Migration 016: site_settings (key/value) + settings:manage
  permission (Super Admin, Admin). The four rows are seeded with
  the values the pages themselves already display as current
  values (value="..." attributes): the site's own identity, not
  sample user data.
- server/src/settings.js + routes GET/PUT /api/settings
  (settings:manage-gated). The four-key allowlist IS the security
  mechanism: any other key (smtp_password, api_key, payment
  secret, otp secret, webhook secret, ...) is refused with 400,
  so a secret can never be smuggled into this store through a
  form, an API call, or a future page edit. Email format is
  validated with the shared isValidEmail helper. GET also reports
  the email backend (value only, never a secret).
- Pages wired (new assets/js/groups/settings.js mapped in
  tools/section-map.json — system-settings remapped from admin.js,
  verified safe: no settings page holds an admin.js-guarded id):
  all 28 forms save + prefill the same four settings; Reset is
  now type="button" and restores the last saved values instead
  of submitting.
- Two latent server bugs fixed in passing, both found by this
  slice's tests: (1) the /api/settings dispatch used `m`, which
  is undefined in handleApi (handler functions define it, the
  dispatcher does not) — anonymous requests crashed into a 400
  "Malformed request"; now uses req.method. (2) PUT request
  bodies were never parsed (only POST/PATCH were read), so PUT
  endpoints always saw an empty body — this also silently broke
  PUT /api/billing-profile from the payments slice, which now
  works too (verified live).
- Deliberately left alone: maintenance-mode + logo-favicon +
  index (admin-style listing/landing pages, no settings forms —
  triage item) and any page-specific settings UI (does not exist
  in the markup; not invented).

### Verified
- Tests: 57/57 pass (56 + 1 new in server/test/settings.js:
  seeded defaults, staff-only 403, anonymous 401, six
  secret-looking keys refused, invalid email refused, update +
  persistence + untouched keys).
- Build idempotent; all modules `node --check` PASS.
- Audit: 275 entries (was 303; not-connected markers 254 -> 226,
  exactly the 28 wired settings forms), 0 broken links.
- Live flow on a fresh database (port 8956, temp DB deleted
  afterwards): anon GET 401 -> seeded values correct -> secret
  key refused 400 -> update 200 -> reread shows the new value;
  billing PUT 200 + reread city Nagpur (latent fix confirmed).
- Backup before this change:
  `~/workspace/primepropertys-backup-settings/`.

## Post-property wizard draft flow (autopilot slice 4, 2026-10-28)

### How the wizard actually works (verified against the markup)
- The wizard is a 27-step chain (start -> purpose -> category ->
  type -> location -> basic -> area -> area2 -> pricing ->
  amenities -> description -> photos -> photos2 -> video ->
  video2 -> floor-plan -> floor-plan2 -> 360 -> documents ->
  owner -> contact -> preview -> quality -> duplicate ->
  verification -> submit -> success), plus my-listings, drafts,
  edit and performance pages. Only three forms have submit
  buttons (edit, verification, submit); every other step form is
  button-less and proceeds via its Continue link. That decided
  the wiring: step saves happen on Continue-link clicks (and on
  Enter-submits via forms.js), not on form submits.
- The create call needs title + property_type + listing_type +
  price + city, and those only all exist at the description
  step. So steps before it keep answers in sessionStorage and
  show an honest notice saying so; the description step creates
  the draft (POST /api/properties) from the accumulated answers
  and every later step PATCHes it by ?draft_id= (carried on all
  wizard links, with a sessionStorage fallback).

### What was built
- Migration 017: 51 new nullable/defaulted columns on
  properties for the wizard's real fields (facing, age,
  possession, furnishing, floors, balconies, parking flags,
  areas incl. super-builtup/terrace/garden, price-per-sqft,
  negotiable, maintenance, deposit (text — the form's options
  are durations like "2 Months"), ownership, transaction type,
  amenities (JSON array), video/360 URLs, floor-plan titles,
  owner details, contact preferences + flags, pincode, address,
  project, dimensions, area notes, availability). Validation
  accepts them all as optional; create persists them; PATCH
  already applied them dynamically.
- New assets/js/groups/post-property.js (js_map entry
  post-property -> post-property): choice-card handling
  (data-choice-key/value on cards; purpose Sell/Rent/Lease ->
  sale/rent/rent and type PG/Office/Shop/Warehouse ->
  Commercial, because the API enums have no lease or PG/office/
  shop values — documented in the file), session accumulation,
  draft creation, step PATCHing, link rewriting, prefill,
  drafts + my-listings tables (leads counted client-side; Views
  stays a dash — no per-property view count is exposed),
  preview/success/performance renders, completeness score
  (labelled as such: % of 20 scored fields filled) and a real
  duplicate check (same city + type + price/area within +-10%
  across own listings and published ones).
- forms.js cases: wizard-step (hook), wizard-edit (PATCH title/
  price/description + status select mapped to publish/unpublish
  with honest partial-failure reporting; availability is stored,
  status is not a PATCH field), wizard-verification,
  wizard-submit, wizard-choice, wizard-upload-notice,
  wizard-quality, wizard-duplicate.
- Pages wired (25 forms): all 14 step forms + amenities (12
  checkboxes -> data-amenity), photos/photos2/documents
  (upload-notice: binary upload is NOT implemented anywhere, so
  these steps save nothing and say so — images stay URL
  references via Edit Property), quality + duplicate (live
  renders), verification (OTP has no provider: the note says so
  and the flow proceeds to submit for review), submit (terms
  required; the draft stays a draft — review, not publish),
  edit (prefill + save), 3 choice pages, drafts + my-listings
  tables, and live containers on preview/quality/duplicate/
  success/performance.
- Deliberately left alone: binary uploads (no backend support),
  OTP verification (no provider), and the demo content below
  the live containers on render pages (same as dashboard demo
  cards, which stay demo by design).

### Verified
- Tests: 58/58 pass (57 + 1 new in server/test/wizard.js:
  create with wizard fields, PATCH accumulation, draft stays
  draft, seller publish 403 / admin publish 200, rejected
  flag/amenities/email PATCHes change nothing). One test-author
  bug fixed in passing: property routes return the row at top
  level (respond() sends body directly), not under .data.
- Build idempotent; all modules `node --check` PASS.
- Audit: 250 entries (was 275; not-connected markers 226 ->
  201, exactly the 25 wired wizard forms), 0 broken links.
- Live flow on a fresh database (port 8959, temp DB deleted
  afterwards): create 201 draft -> PATCH 200 (earlier values
  kept) -> mine?status=draft lists it -> seller publish 403 ->
  admin publish 200.
- Backup before this change:
  `~/workspace/primepropertys-backup-wizard/`.

## Remaining forms + admin tables triage (autopilot slice 5, 2026-10-28)

### Wired from existing endpoints (no new domains invented)
- Newsletter, second footer variant (36 forms, 35 files): root and blog
  footers use `<form class="newsletter-row" data-backend>` with a bare
  email input — a different shape from the section footers wired in
  the newsletter slice. Same endpoint, same case.
- Settings, second location (3 forms): super-admin ai-settings +
  system-settings and security-center security-settings hold the same
  4-field form; submit works via the shared case, but prefill/Reset
  need the settings group file, which the build only inlines on
  system-settings pages — documented in TRIAGE.md, not faked.
- Report forms (2) + emergency support (1) -> tickets, with the
  honest screenshot caveat (binary upload is not implemented).
- FAQ / help search (2) -> client-side accordion filter.
- Site search (4): index, advanced search, investment search, mobile
  search -> search-results.html with URL params; the search-results
  renderer now honours API filters plus client-side bedrooms /
  possession / area filters (fetching up to 100 rows when a client
  filter is active). ROI filtering is honestly unavailable.
- Section search (13): form-builder (7), news (4), support
  search-support, owner my-properties -> client-side row/card filter.
- Change password (5): agent, builder, buyer, manager-staff, owner
  security forms -> POST /api/auth/change-password (already existed,
  unwired). Investor security cannot use it (no current-password
  field) and stays unwired.
- Calculators (3): investor ROI / yield / appreciation already
  computed in buyer.js; the forms only lacked a data-api tag, so
  Enter-submit did nothing. They now carry one, delegating to the
  existing functions.
- Admin user tables (8): one renderer in admin.js over GET /api/users
  (list now exposes email_verified_at to users:manage holders) with
  per-page filters; View/Edit open user-details.html?user_id= with a
  real edit form via new PATCH /api/users/:id (own-role changes
  refused). This resolves the View/Edit placeholder links at runtime;
  static demo rows remain in source, so the audit still lists those
  files.

### New server surface (kept minimal, tested)
- GET /api/users/:id and PATCH /api/users/:id, both users:manage-
  gated; PATCH validates role against the 9 platform roles and status
  against active/suspended, refuses own-role changes, never returns
  password hashes. Tests in server/test/users-admin.js (port 8960).

### Audit gotcha fixed in passing
- A header comment in the new admin.js code contained the literal
  text href="#" — the audit scans inlined script as markup, so all
  83 admin.js pages flagged as false positives. The comment was
  rewritten; counts below are clean.

### Everything else: documented, not faked
- TRIAGE.md (site root + audit dir) classifies every remaining form
  and link group: needs a new domain (projects, reviews, tasks,
  coupons/boosts, subscriptions, stored forms, SEO records, AI
  provider, analytics, chat, profiles, prefs, uploads, reminders,
  custom roles) or needs a product decision (WhatsApp number policy,
  detail render, share/plan/video assets, callback context,
  sale/rent choice on add-property forms, account deletion).
- FRONTEND_BACKEND_MAPPING.md regenerated from source (44 wired
  cases, 138 unwired occurrences); PLACEHOLDER_LINKS_REPORT.md notes
  the View/Edit runtime resolution.

### Verified
- Tests: 59/59 pass (58 + 1 new users-admin test).
- Build idempotent; all modules `node --check` PASS.
- Audit: 187 entries (was 250; form files 195 -> 132,
  not-connected occurrences 201 -> 138, placeholder-link files 52,
  0 broken links).
- Live flow on a fresh database (port 8961, temp DB deleted
  afterwards): users list 200 with verified field, detail, patch
  role, self-role 400, newsletter 201, change-password 200 + login
  with the new password, property publish, search filters
  (city+type hit, other city empty).
- Backup before this change:
  `~/workspace/primepropertys-backup-triage/`.

## Priority 1 — Module 1: Documentation reconciliation (2026-10-28)

Working copy only; no push, no deploy. Backup: `~/workspace/primepropertys-audit/primepropertys-backup-2026-10-28`.
- README.md: "54 tests" → 59 (verified by `npm test`, 59/59 before this change); "263 not-connected forms" → 138 (verified by grep over all 653 pages); Option 2 path corrected to the site root (no `primepropertys-website/` directory exists); structure tree corrected to the site root.
- ACCESSIBILITY.md: "652 pages" → 653 (verified by file walk).
- DEPLOYMENT.md: "48/48 tests" → 59/59; "652 pages" → 653; the inconsistent "339 vs 341 audit entries" figures removed and replaced with a pointer to SOURCE_CODE_AUDIT.md, with the older breakdown explicitly labelled superseded (Phase A recount: 138 not-connected forms, 186 `href="#"` occurrences).
- FRONTEND_BACKEND_MAPPING.md: endpoint column corrected from FRONTEND_BACKEND_MAPPING_AUDIT.md (BUG-004) for login, register, inquiry, contact, wizard-step, wizard-edit, wizard-upload-notice, service-track, campaign-filter, wizard-choice. Page counts in §1 were re-verified as distinct-file counts (every row matches a fresh distinct-file recount); they differ from occurrence counts (newsletter 105 files / 106 forms, settings 34 files / 62 forms, wizard-step 32 files / 46 forms) because a page can carry more than one form of the same type — the audit file's occurrence numbers were not copied over the file counts.
- No `data-backend="not-connected"` marker was deleted or changed.

## Priority 1 — Module 2: Security defaults (2026-10-28)

- Session cookie (`server/src/auth.js`, `server/src/server.js`): `Secure` is now set when the request arrived over TLS, when `X-Forwarded-Proto: https` is present, or when `SESSION_COOKIE_SECURE=1` / `FORCE_HTTPS=1` is set. Plain-HTTP local development still works (no `Secure` flag, login verified). Logout clears with the same flag.
- Token logging (`server/src/server.js`): password-reset and email-verification tokens are printed to the server log ONLY when `EMAIL_BACKEND=console` AND (`NODE_ENV=development` OR `PP_DEV_CONSOLE_EMAIL=1`). In default mode both endpoints answer 503 `EMAIL_NOT_CONFIGURED` and issue no token to any log (verified: default log contains no "password reset for" / "token="; dev log token was used to reset and log in).
- CSRF (`server/src/server.js`): cookie-authenticated POST/PATCH/PUT/DELETE requests with an `Origin` or `Referer` host that does not match the request host are rejected with 403 `CSRF_FORBIDDEN`. Same-origin browser requests pass; requests with neither header (curl, test clients) are allowed. GET is excluded on purpose (email-verification link). Limitation: a login-CSRF attempt with no prior session cookie is not covered by this check, because it is not a cookie-authenticated request.
- Rate limits (`server/src/auth.js`, `server/src/server.js`): all write endpoints now have a limit. New: register 30/hour/IP, password-reset requests 10/hour/IP+email, verification requests 30/hour/user, newsletter unsubscribe 30/hour/IP, all other writes 300/hour per user (or per IP when anonymous) per route group. Existing stricter limiters (login, inquiries, contact, newsletter subscribe) are unchanged and are not double-counted. All buckets are in-memory and single-instance only (lost on restart; a multi-process deployment needs a shared store) — documented in server/README.md.
- Docs: server/README.md environment/CSRF/rate-limit sections and DEPLOYMENT.md security notes updated to match the new behaviour.
- Tests: new `server/test/security-p1.js` (4 tests, ports 8962–8966) covering Secure flag on/off, CSRF reject/allow/no-origin, register rate-limit trip at the 31st attempt, and token-log gating in both modes. Added to `package.json` test list.

## Priority 1 — Module 3: Live property detail (2026-10-28)

- `sections/property-engine/property-details.html`: added a `#pp-live-detail` container (notice + body) after the H1. No demo markup was deleted; the demo stays visible when no id is given or the fetch fails, with a notice saying so.
- `assets/js/groups/engine.js`: new renderer (built into property-engine pages via `tools/build.py`, second run 0 changes). With `?property_id=<id>` it fetches `GET /api/properties/:id` and renders title, type, listing type, city/locality, price, BHK/bath/area/facing/furnishing/possession, description, amenities and images from the API, plus a Make Enquiry link carrying the same id. Published listings render publicly; a draft renders only for its owner / `properties:view_any` holder (the API already 404s everyone else, and the page says so). Missing, invalid and draft ids show a 404 notice and do not fabricate a listing. On a successful live render the demo preview siblings are hidden so the page does not show two listings.
- View Details links now point to real ids where the row has one: live search-result cards (`assets/js/groups/search.js`), live saved/recent cards (`assets/js/groups/buyer.js`, both renderers) now include `property-details.html?property_id=<id>` alongside Enquire. Static demo cards (`href="#"`, no id in source) were NOT rewritten — they have no real id to point to, and guessing one would fabricate a link.
- Tests: new `server/test/detail-p1.js` (2 tests, port 8967) — published detail public, draft/missing/invalid ids 404, and served detail/search/saved pages contain the live container / View Details link. Added to `package.json`.

## Priority 1 — Module 4: Server-side search (2026-10-28)

- `server/src/server.js` `listProperties`: added `bedrooms` (exact), `bedrooms_min`, `area_min`, `area_max`, `possession_status` and `locality` filters. Invalid numeric filters return 400 instead of being silently ignored. Existing city / property_type / listing_type / price / sort behaviour is unchanged. `pagination.total` is now the filtered count from `COUNT(*)` over the same WHERE clause (it already was, for the old filters; the fix is that the new filters are in that clause, so the total is no longer the client-filtered subset).
- `server/migrations/018_search_filters_index.sql`: new index on `properties (status, bedrooms, area_sqft, possession_status)` for the new filters.
- `assets/js/groups/search.js`: search-results now passes bedrooms / bedrooms_min / area / possession / locality through to the API and reports the API total. The old client-side filter over at most 100 rows (BUG-009/BUG-028) is removed. Build run twice, second run 0 changes.
- Tests: new `server/test/search-p1.js` (3 tests, port 8968) — each new filter, combined filters, pagination total vs page size, invalid filters 400, existing city/price behaviour unchanged, and the served search page no longer contains the client-filter code. Added to `package.json`.

## Priority 1 — Module 5: Wizard correctness (2026-10-28)

- Decision (documented, not silent): unsupported choices are NOT remapped and the product enums are NOT extended. Extending them would require rebuilding the `properties` table because migration 001 puts `property_type` / `listing_type` in CHECK constraints — a product decision with data-migration risk, not a Priority 1 repair. Instead, the wizard now carries the user's actual choice and the server rejects it with an explicit error naming that choice (e.g. `listing_type 'lease' is not supported`, `property_type 'PG' is not supported`). Product decision still needed from the user: extend the enums via a table rebuild (then Lease/PG/Office/Shop/Warehouse become real listings) or remove/restrict those choice cards — until then those choices cannot create a draft.
- Choice cards changed (page markup, not inlined JS): select-purpose Lease now carries `lease` (was `rent`); select-property-type PG/Office/Shop/Warehouse now carry `PG`/`Office`/`Shop`/`Warehouse` (were all `Commercial`). Both pages now carry a visible note saying those choices are not yet supported and will error at the description step instead of creating a draft under a different type.
- Category persisted: new migration `019_property_category.sql` adds a nullable `category` column; `validate.js` restricts it to residential/commercial/land/project (bad values 400 with the value named); `properties.js` create now stores it (PATCH already went through validation, so it stores too).
- SessionStorage-only early steps: NOT changed — a server draft still cannot exist before the description step because create requires title + property_type + listing_type + price + city, which only all exist then. The limitation is already stated honestly in `post-property.js`'s header, in the pre-draft notice inserted on step pages, and here; no server draft at step 1 was faked.
- Tests: new `server/test/wizard-p1.js` (3 tests, port 8969) — all five unsupported choices 400 with the choice named and no draft created, category create/patch/bad-value, and served choice pages carry the real values. Added to `package.json`. Build: 0 pages changed (only server code + two page bodies, no shared JS body change beyond a stripped header comment).

## Priority 1 — Module 6: Binary upload (Phase E, scoped) (2026-10-28)

- Backend (`server/src/uploads.js`, migration `020_property_uploads.sql`): `POST /api/properties/:id/uploads` (multipart, one file per request), `GET /api/properties/:id/uploads`, `PATCH .../uploads/:uploadId` (sort_order), `DELETE .../uploads/:uploadId`, `GET /api/uploads/:id` (controlled download). Validation, all server-side: JPEG/PNG/WEBP/GIF/PDF by file signature only, declared MIME must match the signature, max 10 MB, empty files rejected, executable files rejected by signature (never by extension alone). Storage filenames are random 32-hex + validated extension; the user name is display-only and never a path. `UPLOAD_DIR` defaults to a sibling of the static root and uploads are refused with 500 `UPLOAD_DIR_UNSAFE` if it resolves inside the static root, so files cannot be fetched by guessing a static URL. Images also become `property_images` rows at `/api/uploads/:id` (public only when published, like other property data); documents are private — owner or `properties:view_any` only, even on published listings, served as attachments. Static serving now also refuses `/server/*` (source/data tree) with 404.
- Not implemented / honestly left: malware scanning — no scanner exists in this environment, so none is claimed (signature/MIME/size/permission checks are the controls); external URLs are NOT accepted as a substitute for upload (URL images remain a separate, pre-existing feature, not a new upload path); wizard floor-plan, 360°, verification and report-screenshot upload buttons are still unwired and keep their honest notices.
- Frontend: wizard Photos / Documents pickers (`assets/js/groups/post-property.js`, built into post-property pages) now upload real files one by one to the upload API when a draft exists, and say so when no draft exists. The old `wizard-upload-notice` form notices remain for the unwired steps.
- Docs: server/README.md (Uploads section, `UPLOAD_DIR`, migrations 018–020) and DEPLOYMENT.md file-upload notes updated.
- Tests: new `server/test/upload-p1.js` (4 tests, ports 8970–8971) — valid image stored/served/listed and shown in detail, invalid/MIME-mismatched/oversized/executable/unauthorised/anonymous rejected, documents private on a published listing, reorder/replace/delete, unsafe `UPLOAD_DIR` refused with 500, `/server/*` static 404. Added to `package.json`.

## Priority 1 — Module 7: Browser journeys (2026-10-28)

- Playwright is NOT available in this environment (no playwright package, no browser binaries, no global install, no Python playwright), so browser tests were NOT run and are not claimed. Per the task, the equivalent API-level journeys were run instead in new `server/test/journeys-p1.js` (4 tests, port 8972): (1) registration → login → me → logout → me 401; (2) property draft → admin publish → public search/detail (the wizard "submit" step keeps a listing as a draft for review — there is no server submit endpoint, so publish remains the admin step); (3) search → detail → enquiry → lead visible to admin; (4) unauthorised denied — anonymous create 401, stranger draft 404 (no existence leak), stranger PATCH 404, owner publish 403; (5) invalid upload rejected 400. Added to `package.json`.
- Blocker for real browser journeys: install Playwright + a browser in an environment that allows it, then re-run journeys 1–6, 9–11 from the spec against a served copy — that step was not done here.

## Priority 2 — Core features (2026-10-28)

Working copy only; no push, no deploy. Backup: `~/workspace/primepropertys-audit/primepropertys-backup-2026-10-28`. Baseline before this stage: 79/79 server tests; after: 86/86 (`server/test/priority2.js`, 7 tests, port 8973, added to `package.json`).

### Module 1: Builder Projects + Units — DONE
- Migrations `021_builder.sql`: builder_projects (draft → pending → approved/rejected → published → approved on unpublish / archived), project_locations (lat/lng stored only when supplied, never invented), project_towers, project_units (available/reserved/sold), project_milestones (progress 0–100), project_amenities, project_documents (http(s) URL references only — binary upload for projects is NOT implemented because Priority 1 uploads are property-scoped; see Module 1 limitation), project_enquiries, project_crm_activities, project_offers.
- `server/src/builder.js` + routes `/api/builder-projects…`: create (Builder/Admin), list with city/type/status/price filters and mine=1, detail with children + unit counts, submit/verify/publish/unpublish/archive with the state machine above, towers/units/unit-status/milestones/amenities/documents/offers, enquiries (published projects only, anonymous allowed with name+phone) + enquiry list + CRM activities. Builders manage only their own projects; strangers get 404 on drafts and on manage endpoints.
- Frontend: live "Your Projects" list in `sections/builder-portal/my-projects.html` (`#pp-builder-projects`, `assets/js/groups/builder.js`); the demo project table is untouched below it. The add-project demo form keeps its honest demo notice — it was NOT converted, because its field names do not map to the API.

### Module 2: Property Reviews — DONE
- Migration `022_reviews.sql`: property_reviews (rating 1–5, pending by default, one non-rejected review per user per property via partial unique index), review_reports (one report per reporter per review).
- `server/src/reviews.js` + routes `/api/properties/:id/reviews`, `/api/reviews/:id` (moderate/delete), `/api/reviews/:id/report`: public list shows APPROVED reviews only with approved-only count/average; moderators (reviews:moderate) can filter by status and approve/reject from pending only. `verified` is set only when a completed site visit for that user+property exists and the reviewer is not the owner — never from an enquiry or lead. Owners cannot review their own property.
- Frontend: approved reviews + aggregation render on `sections/property-engine/property-details.html` (`#pp-property-reviews`, `assets/js/groups/engine.js`) when `?property_id=` is present.

### Module 3: Staff Tasks — DONE
- Migration `023_tasks.sql`: staff_tasks, task_comments, task_activity.
- `server/src/tasks.js` + routes `/api/tasks…`: create (login-gated; assignee must exist), list with status/priority/assignee/overdue filters, detail with comments + activity, update with the transition map (todo→in_progress/blocked/cancelled, in_progress→blocked/done/cancelled, blocked→in_progress/cancelled, done/cancelled→todo by manager/creator only), comments, stats (totals by status + overdue count). Visibility: creator, assignee, or tasks:view_any. Assignees may change status and comment only — retitling, reassigning, due-date or priority changes by a non-manager assignee are 403.
- Frontend: live task list in `sections/manager-staff/tasks.html` (`#pp-staff-tasks`, `assets/js/groups/builder.js`); the demo task form keeps its honest demo notice.

### Module 4: Advanced RBAC — DONE (2FA blocked, documented)
- Migration `024_rbac.sql`: custom_roles, custom_role_permissions, user_custom_roles, admin_audit_log; new permissions roles:manage, audit:view (Super Admin + Admin).
- `server/src/auth.js` `listPermissions` now returns the UNION of the fixed role's permissions and the user's custom roles (with a fallback to fixed roles if the Priority 2 tables are absent). Custom roles only ADD permissions; deleting a custom role drops its grants via ON DELETE CASCADE. Built-in roles are untouched.
- `server/src/rbac.js` + routes `/api/custom-roles…` (create/list/get/update/delete/assign/unassign), `/api/admin-audit-log` (audit:view), `/api/auth/sessions` (own sessions list, revoke by id — own or users:manage), `/api/auth/revoke-other-sessions`. Sensitive actions are audited: role create/update/delete/assign/unassign, project verify/publish states, review moderation, plan/coupon/subscription activation, user suspension and role changes (hooked in `server.js` user PATCH).
- Frontend: live custom-role list on `sections/super-admin/roles.html` (`#pp-custom-roles`) and live audit log on `sections/super-admin/audit-logs.html` (`#pp-audit-log`), both in `assets/js/groups/admin.js`.
- 2FA NOT implemented (blocked): the existing auth has no TOTP secret storage, enrolment, backup-code or recovery flow, and inventing one ad-hoc would be unsafe. What exists instead and is now wired: session revocation UI/API, login throttling, and the audit log. Product decision needed: approve a proper TOTP design (secret storage + enrolment + recovery) before 2FA is built.

### Module 5: Subscriptions + Coupons + Promotions — DONE (no gateway, by design)
- Migration `025_subscriptions.sql`: subscription_plans, user_subscriptions, property_promotions, coupons, coupon_redemptions; `properties.featured` flag; `payments.subscription_id` link for invoice history.
- Prices are NOT invented: the seeded catalog is exactly the public prices on `pricing.html` — FREE ₹0 (1 listing, 5 photos, 0 featured), BASIC ₹499/mo (5, 20, 0), PRO ₹1,199/mo (20, 50, 1 featured), PREMIUM ₹2,499/mo (unlimited, 100, 5 featured), with yearly prices from the same cards (₹5,988 / ₹14,388 / ₹29,988). Admins may create/edit plans via `POST/PATCH /api/subscription-plans` (subscriptions:manage).
- `server/src/subscriptions.js` + routes: plans list, subscription create (FREE → active immediately; paid → pending), activate (staff with subscriptions:manage or payments:manage, ONLY against a VERIFIED payment for the same user of at least the plan price — otherwise 400; the payment is then linked as the invoice), change-plan (paid target → pending), cancel, expire (staff), mine, entitlement (plan + listings used/limit/remaining + featured credits used/remaining), invoices (payments linked to the subscription), feature/unfeature a published property (active subscription, featured credits remaining, 30-day promotion row), coupons create/apply/redeem (percent/fixed, dates, global + per-user limits, eligible plans; duplicate redemption prevented by the limit checks, not by a UNIQUE constraint alone).
- Payment webhook: `POST /api/webhooks/payment` always answers 501 `WEBHOOK_NOT_CONFIGURED` and stores/activates nothing — no provider is configured, so no webhook can ever activate an entitlement.
- Listing-limit note (honest limitation): the entitlement endpoint reports limits and usage, and featured credits ARE enforced, but property creation is NOT retroactively blocked for users with no subscription (legacy behaviour — blocking it would break the existing property tests and every pre-subscription listing flow). A create-time gate should call the entitlement check; that is a product decision, not a silent change.
- Frontend: live plan list on `sections/subscription/plans.html` (`#pp-subscription-plans`) and live subscriptions + entitlement on `sections/subscription/my-subscription.html` (`#pp-my-subscription`), new group `assets/js/groups/subscriptions.js` wired in `tools/section-map.json` (`subscription` section). The subscription checkout/coupon demo pages keep their honest demo notices.

### Module 6: User-to-user Chat + Notifications — DONE (in-app only)
- Migration `026_chat.sql`: conversations, conversation_members, chat_messages, message_reads, user_notification_preferences. Permission chat:use granted to all 9 roles.
- `server/src/chat.js` + routes `/api/conversations…` (create/list/get/messages/read) and `/api/notification-preferences` (get/put): dedicated conversation model, NOT the SMS/WhatsApp queue. Membership is enforced on every read/write (strangers get 404, never 403 with existence); creating a conversation with exactly the same member set returns the existing thread (no duplicate). Member listings expose id + full_name only — no phone numbers or emails. Unread counts exclude the reader's own messages; mark-read inserts reads for others' messages only. Sending a message creates an in-app notification (existing notifications table, listed via `/api/notifications`) for each other member whose preference allows message alerts; email/SMS/WhatsApp/Push toggles are stored but CANNOT deliver — the preference response says so explicitly, and no delivery is claimed.
- Frontend: live conversation list on `sections/communication/conversations.html` (`#pp-conversations`, `assets/js/groups/communication.js`). The chat compose demo form keeps its honest demo notice; message sending is API-tested, not faked on the page.
- Rate limiting: all new writes go through the existing Priority 1 write limiter (300/hour per user per route group, plus login/inquiry/contact/newsletter limiters where applicable); no separate chat limiter was added, and none is claimed.

### Frontend wiring (all modules)
- `assets/js/api.js`: Priority 2 helpers (listBuilderProjects, listReviews, listTasks, listPlans, mySubscriptions, entitlement, listConversations, listCustomRoles, listAuditLog).
- Build: `python3 tools/build.py` run twice after frontend changes — second run 0 pages changed. All pages' inlined scripts were regenerated (core api.js changed), which is why the working-copy diff touches many pages; page bodies changed only on the 8 pages listed above.
- No `data-backend="not-connected"` marker was deleted. Demo forms that were not converted keep the forms.js demo notice.

## Priority 3 — Advanced features (2026-10-28)

Working copy only; no push, no deploy. Backup: `~/workspace/primepropertys-audit/primepropertys-backup-2026-10-28`. Baseline before this stage: 86/86 server tests; after: 96/96 (`server/test/priority3.js`, 10 tests, port 8974 + a stub-provider port + a plain port 8975 for the unconfigured test, added to `package.json`).

### Module 1: AI assistants — DONE (provider abstraction; no real provider configured)
- `server/src/ai.js` + migration `027_priority3.sql` (ai_generations table, ai:use permission granted to all 9 roles). Provider is a generic OpenAI-compatible chat-completions client: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_MS` from environment only; keys never touch the database or frontend.
- Unconfigured behaviour verified: a server without AI env answers 503 `AI_NOT_CONFIGURED` and generates nothing — no template text dressed as AI output. With a local stub provider (test double only, never a paid provider), generation returns the provider's text plus its reported token counts (10 in / 20 out in tests); counts are NULL when a provider reports none, never invented.
- Guardrails: untrusted property text is wrapped as data (control characters stripped, truncated to 2000 chars, system instruction to use it as facts only); limit 20 generations/user/day (stored rows counted); generations stay `generated` until the owner approves, and only then can be applied to an editable property (title/description; SEO generations are metadata only and cannot be applied). Unapproved apply is 400.
- Quality check is rule-based on stored facts (title/description length, price, city, images, area, bedrooms) and is labelled as such — not an AI judgement.
- NOT built, on purpose: AI Property Valuation as an endpoint (an automated figure must never be presented as an official valuation); AI lead/support/search/locality/price/marketing assistants beyond the three implemented kinds (title, description, SEO) — their pages keep honest demo notices.
- Frontend: live generate + generations list on `sections/ai-intelligence/ai-description-generator.html` (`#pp-ai`, new group `assets/js/groups/priority3.js`, mapped in `tools/section-map.json` for ai-intelligence).

### Module 2: Analytics + Reports — DONE (real events only; PDF blocked)
- `server/src/priority3.js` + `analytics_events` table (027). Property list/detail handlers record a search event (filters only, no PII) and a view event (including anonymous views) from Priority 3 onward. Earlier activity has no event rows and is not reconstructed — the summary says so.
- `GET /api/analytics/summary`: views, searches + top search cities, properties, inquiries by status + closed conversion (null when no inquiries, not 0), agent performance (assigned/closed), builder performance (projects, units available/sold), visits + completion rate, subscription revenue = SUM of `verified` payments linked to a subscription in range (unverified/unlinked excluded; no gateway revenue implied), promotions, lead sources. Formulas are returned in the response. Staff see all; other analytics:view holders see only their own rows. Buyer without the permission gets 403.
- `GET /api/analytics/export`: CSV of the same summary metrics. PDF export is NOT implemented — this zero-dependency codebase has no PDF library; no PDF output is claimed anywhere.
- Frontend: live summary on `sections/analytics/analytics-dashboard.html` (`#pp-analytics`, priority3 group).

### Module 3: SEO Management — DONE (no indexing claims)
- `GET/POST /api/seo/metadata` (seo:manage: Super Admin/Admin only), `GET/POST/DELETE /api/seo/redirects` (redirects honoured with stored 301/302 on real static requests), `GET /api/seo/duplicates` (stored records only), `GET/PUT /api/seo/robots` (stored override or not set), `GET /api/seo/sitemap` (live XML: static .html files that exist + published properties only; drafts and deleted properties excluded — verified in tests), `POST /api/seo/link-check` (internal href/src of a real page checked against files on disk; result stored, seo_metadata.last_checked_at stamped) and `GET /api/seo/broken-links` (stored checks with broken > 0).
- No search-engine indexing status is stored or reported: the app receives none. Canonical base defaults to the existing build.py github.io base and is overridable via `SITE_BASE_URL`; the canonical-domain decision (github.io vs primepropertys.in) remains open for the user.
- Frontend: live broken-link list on `sections/seo/broken-links.html` (`#pp-seo`, priority3 group).

### Module 4: Search Alerts + Saved Searches — DONE (in-app only)
- `POST/GET/DELETE /api/saved-searches` (filters validated to a fixed allowlist; unknown keys and min > max rejected), `GET /api/saved-searches/:id/match` (server-filtered over published properties with a real filtered total — no full-table download to the browser), `GET /api/search-alerts`.
- Publishing a property (`server/src/server.js` publish route) runs alert matching: one deduplicated in-app notification per matching saved search, with the notification text stating in-app only. Email/SMS delivery is not configured and is never attempted or claimed. Verified: a matching Nagpur Apartment alerted, a Mumbai property did not.
- Frontend: live saved searches + alerts on `sections/property-search/saved-search.html` and `search-alerts.html` (`#pp-saved-searches`, `assets/js/groups/search.js`). The pages' create-alert demo forms keep their honest demo notices — they were not converted, because their field names do not map to the API filters.

### Module 5: Property Price History — DONE
- `property_price_history` table (027, append-only) + hook in `server/src/properties.js` `updateProperty`: a row is written only when the price actually changes (old/new price, actor id, timestamp); a same-price PATCH writes nothing. No history is backfilled for edits predating the table.
- `GET /api/properties/:id/price-history` follows normal property visibility (published: public; draft: owner / properties:view_any only — a test initially fetching a draft anonymously correctly got 404 and was fixed to fetch as owner).
- Frontend: live history on `sections/property-engine/property-details.html` (`#pp-price-history`, `assets/js/groups/engine.js`).

### Module 6: Automated Reminders — DONE (computed on read, never pushed)
- `GET /api/reminders`: site visits (requested/confirmed, within 7 days), lead follow-ups (undone, within 7 days), staff tasks (not done/cancelled, due within 7 days), subscriptions (active, expiring within 30 days) — all from real rows, each with an overdue count, scoped to the caller (staff see all). Reminders are computed when the endpoint is read and are pushed nowhere; the response states email/SMS/WhatsApp delivery is not configured. No dedicated reminders page exists, so there is no frontend renderer for this module (API only, documented — not faked on a page).

### Module 7: Advanced Recommendations — DONE
- `GET /api/properties/:id/recommendations` (server-paginated, max 20): published properties sharing city or type, ranked by count of matching attributes (city, type, listing type, bedrooms, price within 25%), each row carrying its `match_reasons` and `match_attributes`. The existing `/similar` endpoint is untouched. The response states the count is a count of matching attributes, not a measured similarity score.
- Frontend: live recommendations on `sections/property-search/recommended-properties.html` (`#pp-recommendations`, search.js group; requires `?property_id=`).

### Frontend wiring (all modules)
- `assets/js/api.js`: Priority 3 helpers (analyticsSummary, listSavedSearches, listSearchAlerts, listPriceHistory, recommendations, aiGenerations, aiGenerate). All renderers build DOM with textContent (no innerHTML), following the existing group-file pattern.
- Build: `python3 tools/build.py` run twice after frontend changes — second run 0 pages changed. As in Priority 2, the regenerated inlined bundle touches many pages; page bodies changed only on the 7 pages listed above, plus `tools/section-map.json` (analytics, ai-intelligence, seo → priority3 group).
- Served-page verification (fresh server, temp DB, deleted afterwards): all 7 live containers present in served HTML.
- No `data-backend="not-connected"` marker was deleted. Demo forms that were not converted keep the forms.js demo notice.
- Decisions/credentials still needed from the user (unchanged from Priority 1/2, now scoped to Priority 3): an AI provider + server-side key before any real generation works (currently 503); canonical domain choice (github.io vs primepropertys.in); PDF-report method if PDF export is ever wanted (blocked, no library); email/SMS providers before alerts/reminders can leave the app (currently in-app only).

## Priority 4 — Production hardening + final report (2026-10-28)

Baseline before this stage: 96/96 server tests. After: 100/100 (`server/test/perf-p4.js`, 4 tests, port 8976, added to `package.json`).

### Performance (measured, not estimated)
- Fresh empty database, local Node server: homepage 85,150 bytes raw / 16,871 bytes gzipped (-80%) before; 86,296 bytes raw after (+1,146 bytes = lazy-loading attributes on article images). API list/detail/search on an empty database: 3–8 ms before and after — no speed improvement is claimed on an empty database.
- `server/migrations/028_newest_index.sql`: `idx_properties_newest (status, id DESC)`. Before, the default list plan used `idx_properties_search_filters` plus "USE TEMP B-TREE FOR ORDER BY"; after, it is `SEARCH … USING INDEX idx_properties_newest` with no temp b-tree (EXPLAIN QUERY PLAN verified, asserted in `perf-p4.js`).
- Caching: API responses now `Cache-Control: no-store`; controlled upload downloads `no-store`; non-HTML static assets `public, max-age=3600`; HTML pages get no public cache header, so rebuilds are never masked. No private data is cached in a shared cache.
- Images: 140 article images now `loading="lazy" decoding="async"` (42 pages; fixed 150 px height in marketing.css, so no layout shift). The other 234 images are external Unsplash 1200 px with no `srcset` — no responsive-image claim is made for them.
- Page weight remains ~94 KB/page (61.4 MB total) by design (inlined single-file pages); a linked-asset build was not built.

### Accessibility (verified defects only)
- Form error/success note colours failed WCAG AA (#F87171 = 2.77:1, #4ADE80 = 1.74:1 on white) → now #B91C1C = 6.47:1, #166534 = 7.13:1, same red/green meaning.
- Form messages now carry `role="alert"` (errors) / `role="status"` (success) in `assets/js/forms.js`.
- Mobile nav toggle now exposes `aria-expanded` / `aria-controls` in `assets/js/navigation.js`.
- `.tbl` tables scroll horizontally under 600 px (`assets/css/responsive.css`).
- Brand contrast re-measured and passing: navy 15.96:1, royal blue 5.17:1, red 4.70:1, muted 4.76:1, body 7.58:1 on white. No modals/dialogs exist (0 `<dialog>` elements), so no modal focus trap to audit.
- NOT done and not claimed: no manual keyboard/screen-reader pass.

### External integrations (configuration only — nothing new verified)
- No provider, key, or webhook was added. Current honest states documented in DEPLOYMENT.md: email 503 outside dev console mode, SMS/WhatsApp queued rows only, payment webhook a 501 stub that never activates anything, AI 503 without a key, push toggles only, no map provider and no stored coordinates.
- Env vars documented: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_TIMEOUT_MS` (default 15000), plus the pre-existing `PORT`, `DATABASE_PATH`, `STATIC_ROOT`, `EMAIL_BACKEND`, `SESSION_COOKIE_SECURE`, `FORCE_HTTPS`, `PP_DEV_CONSOLE_EMAIL`, `UPLOAD_DIR`.

### Backup + restore (actually tested)
- Procedure documented in DEPLOYMENT.md (SQLite backup API, upload directory backed up alongside the database, owner-only permissions, matching backup pair on restore, never mix points in time).
- Restore test on temporary copies: register → create property `RESTORE-CHECK-VILLA` (id 1) → backup API → fresh server on the copy → login → `/api/properties/mine` returned the same property. Result: RESTORE_OK.
- Still missing: no automated/scheduled backup in this repo, no backup encryption in-repo, no restore test on a real host.

### Security testing (Priority 4)
- Re-ran security-relevant suites as part of the 100/100 run (`security-p1`, `auth`, `users-admin`, `upload-p1`). New tests cover only real behaviours (cache headers, index plan, accessibility source checks, lazy images). No penetration test, fuzzing, dependency scan beyond zero runtime dependencies, or review of production hosting was done, and none is claimed.

### Documentation reconciliation (Priority 4)
- README.md: tests 59 → 100, `data-api` handlers 17 → 44 values, wired/unwired counts, P2/P3 domains summarised, binary-upload and Secure-cookie descriptions corrected to the Priority 1 behaviour.
- DEPLOYMENT.md: final verification 59/59 → 100/100, migrations 001–008 → 001–028, Priority 4 performance/backup/integrations sections added, production verdict restated as NOT ready.
- server/README.md: migration table completed to 028, tests 59+ → 100, Priority 4 section added.
- ACCESSIBILITY.md: Priority 4 fixes + contrast table extended, manual-pass limit restated.
- PRODUCTION_READINESS.md: checklist updated to Priority 4 evidence; verdict remains NOT READY.
- TRIAGE.md: Priority 4 note at the top marking it a historical slice log; BUG_REGISTER.md: Priority 4 status note at the top (Phase A rows unchanged).
- FINAL_REPORT.md (new): complete audit summary, bug register status, feature gap status, implemented list, remaining 138 disconnected forms, remaining 186 `href="#"` occurrences, schema 001–028, API summary, modified files, test results (100/100), browser test status (NOT run — Playwright unavailable), security review, performance before/after, deployment checklist, known limitations, recommended next phase, production verdict NOT ready.
- Build: `python3 tools/build.py` run twice after shared-file changes — second run 0 pages changed.

### Still open after Priority 4 (do not claim fixed)
- BUG-006 (bind-address log), BUG-007 (.env never loaded), BUG-011 (wizard early steps sessionStorage-only), BUG-015 (settings prefill, not re-checked), BUG-016 (non-user admin tables demo rows), BUG-020 (demo phone 693 matches), BUG-021 (canonical github.io, sitemap 105/653), BUG-022 (7-day sessions, no idle timeout), BUG-027 (WhatsApp number policy), BUG-029/030 (no manual a11y pass, no browser tests, no migration-rollback test), 2FA, account deletion, form-builder storage, PDF export, separate verification workflow, payment/email/SMS/WhatsApp/AI/push/map providers, named host + HTTPS + process manager + automated backup + error monitoring + incident runbook, and explicit user authorisation naming host + database. No push, no deploy.

## Wizard enums — extend via table rebuild (2026-10-29, user decision)

User decision 2026-10-29: extend `property_type` / `listing_type` via a
properties table rebuild, NOT by restricting the Lease / PG / Office /
Shop / Warehouse choice cards. Canonical domain github.io was decided
the same day (already the default; no change for that decision).

- Migration `server/migrations/029_wizard_enums.sql`:
  - Old: property_type IN ('Apartment', 'Villa', 'Plot', 'Builder Floor',
    'House', 'Commercial'); listing_type IN ('sale', 'rent').
  - New: property_type adds 'PG', 'Office', 'Shop', 'Warehouse';
    listing_type adds 'lease'. These are exactly the wizard choice-card
    values (select-purpose.html 'lease'; select-property-type.html 'PG',
    'Office', 'Shop', 'Warehouse'). 'Independent House' on the card is
    value 'House', which already existed; no other value was added.
  - Rebuild copies all 70 columns verbatim (only the two enum CHECKs
    change) and recreates all 6 properties indexes. No triggers exist
    on properties.
  - Data-loss risk found and fixed during development: a first rebuild
    test with foreign keys ON copied the property rows identically but
    silently emptied child tables (property_images, saved_properties).
    Fix: `server/src/db.js` now honours a `REQUIRES_FK_OFF` marker in a
    migration file — FK is switched OFF before BEGIN and back ON after
    COMMIT (PRAGMA foreign_keys is a no-op inside a transaction), and
    `PRAGMA foreign_key_check` runs inside the transaction before COMMIT
    so any violation rolls the rebuild back. Re-running the preservation
    test after the fix: existing rows byte-identical, child rows intact,
    FK check empty, all 6 indexes present, next AUTOINCREMENT id not
    reused. No existing data is lost by this migration.
- Validation (`server/src/validate.js`): PROPERTY_TYPES / LISTING_TYPES
  extended to the same values; genuinely unsupported values
  (e.g. 'Castle', 'auction') are still rejected with an error naming
  the value.
- Wizard UI: the "supported nahi hain" notes on select-purpose.html and
  select-property-type.html are replaced with supported notes; the live
  preview in `assets/js/groups/post-property.js` now shows 'For Lease'
  for lease listings (previously it would have shown 'For Sale').
  Build run twice — second run 0 pages changed (32 post-property pages
  regenerated for the preview label only).
- Tests: new `server/test/wizard-enums.js` (port 8977, added to
  `package.json`) — create → admin publish → public detail for Lease,
  PG, Office, Shop, Warehouse; old types still work; bogus values still
  400; PATCH to a new type works; migration-preservation test as above.
  `server/test/wizard-p1.js` updated: its old "unsupported choices fail"
  test now asserts the same choices create a draft with the chosen type,
  never remapped. No push, no deploy.

## Search bug fix — urlParams (2026-10-29, uncommitted, NOT pushed, NOT deployed)

- **Bug:** `assets/js/groups/search.js` line 32 used `urlParams.get(k)` but `urlParams` was never defined anywhere in `assets/js/`. On `sections/property-search/search-results.html?city=Nagpur` the console error was `urlParams is not defined`, the live-results handler threw before `listProperties` ran, and `#pp-live-results` never rendered — even though `GET /api/properties?city=Nagpur` returned the property. Found by Playwright browser journeys (Journey 3 failed on this exact error).
- **Fix:** defined it in the correct scope in the same handler, before `apiParams` is built: `var urlParams = new URLSearchParams(window.location.search);` (now search.js lines 29 and 33). No API behaviour, search filters, or other groups changed.
- **Build:** `python3 tools/build.py` run twice — first run 18 pages updated (all `sections/property-search/` pages), second run 0 pages changed. The inlined copy in `search-results.html` now contains the definition.
- **Verification:** full server test suite **104/104 pass**; Playwright journeys script `~/workspace/primepropertys-audit/browser-tests/journeys.js` against a temp-DB server on port 8903: **9/9 pass**, including Journey 3 (Search → Detail → Enquiry) — log line "search results (city=Nagpur) contain journey property", View Details click through, and enquiry success message shown. Previously Journey 3 was the only failure (8/9).
