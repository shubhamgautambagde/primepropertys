# PRIME CMS — Current Architecture

Date: 2026-10-30. This describes the system as it exists
today, before CMS work. It is the baseline the CMS must not
break.

## 1. System overview

```
Browser ──► Static HTML page (self-contained, inlined CSS/JS)
   │              │
   │              └── window.PP (assets/js/api.js) ──► REST API
   │                                                    │
   └──────────► Node.js server (server/src/server.js) ──┘
                      │                    │
              handleStatic()          handleApi() dispatcher
              (pages, assets,         (auth, properties, leads,
               gzip, 404 for           visits, tickets, services,
               /server/*, *.db)       payments, campaigns,
                                       contact, newsletter,
                                       settings, users, uploads,
                                       health)
                      │                    │
                      └──── SQLite (server/data/primepropertys.db)
```

Two halves, honestly separated:

- **Static site** (653 pages): public content, browse pages,
  form UIs. Works with no server at all.
- **API + SQLite** (Node): login, live listings, dashboards,
  CRM, export, contact inbox, uploads. Needs a Node host;
  on GitHub Pages these sections report "server unreachable"
  instead of faking success.

## 2. Request flow (Node server)

1. `createServer` receives the request. Cookies are parsed;
   the `pp_session` token (if any) is SHA-256 hashed and
   looked up in `sessions` (7-day TTL, expiry enforced).
2. If the path starts with `/api/`, `handleApi` dispatches:
   auth routes first, then per-domain handlers by path
   prefix. Unknown API paths return 404 JSON; unknown
   methods on known paths return 405.
3. Otherwise `handleStatic` serves a file under
   `STATIC_ROOT` with gzip when accepted, correct MIME
   types, and a hard 404 for `/server/*` and `*.db`.
4. Errors: API errors are `{ok:false, error:{code,message}}`
   style JSON with the HTTP status; malformed bodies return
   400; validation failures return 400 with field detail;
   visibility failures return 404 (never 403 for existence).

## 3. Frontend conventions (must survive the CMS)

- **Build**: `tools/build.py` concatenates shared CSS
  (tokens → base → layout → components → forms →
  dashboard → responsive) and shared JS (navigation →
  components → api → forms → core), appends the section's
  group files from `tools/section-map.json`, and rewrites
  every page's single `<style>` and single `<script>`
  block. Idempotent. Also injects canonical + Open Graph
  tags (Stage I SEO).
- **API client**: `window.PP.get/post` → `{ok, status,
  data}`. All live rendering goes through it.
- **Forms**: `forms.js` dispatches on `data-api`; fields
  come from `[data-api-field]`; success reuses the page's
  `.form-success` div. Every wired form needs a real case
  in `forms.js` — an unwired form is a dead button, and
  dead buttons are not allowed.
- **Lists**: `#pp-live-*` container + group-JS renderer
  after `PP.me()`. Property detail responses return the row
  at top level; list endpoints wrap in `{data, pagination}`.
- **Design tokens**: navy `#0A2240`, royal blue `#2563EB`,
  red `#E11D48`. The CMS default theme must preserve this
  identity; it is not a redesign.

## 4. Backend module map

| File | Lines | Responsibility |
| --- | --- | --- |
| server.js | 702 | HTTP server, router, static handler, auth dispatch |
| leads.js | 490 | Inquiries, lead workflow, notes, activities, tags, follow-ups, scores, SLA, stats, export, notifications |
| visits.js | 257 | Site-visit request/list/updates, assign, stats, analytics |
| properties.js | 243 | Property CRUD, publish, save, recent, similar, mine |
| campaigns.js | 233 | Campaigns, templates, queued messages (QUEUED only) |
| uploads.js | 220 | Binary upload, magic-byte sniffing, gated file serving |
| services.js | 215 | Service requests + workflow |
| auth.js | 174 | Register/login/logout, sessions, throttle, reset/verify tokens, permission checks |
| tickets.js | 166 | Support tickets + replies + workflow |
| payments.js | 161 | Offline payment records, billing profiles, refunds |
| validate.js | 125 | Shared input validation |
| settings.js | 77 | Settings (4-key allowlist; secrets refused) |
| contact.js | 66 | Contact messages (fixed subjects, digits-only phone) |
| newsletter.js | 59 | Subscribe / resubscribe / neutral unsubscribe |
| db.js | 40 | openDb + transactional migration runner |

Zero npm dependencies. Node ≥ 24 required (`node:sqlite`
is `DatabaseSync`).

## 5. Data flow by domain

- **Properties**: `properties` + `property_images` (URL
  references) + `uploads` (binary files) + `saved_properties`
  + `property_views`. Status: draft → published; soft delete
  via `deleted_at`. 51 wizard columns on the property row.
- **Leads/CRM**: `inquiries` → status workflow (new 10 /
  contacted 25 / interested 50 / site_visit 70 / negotiation
  85, +5/note max 15, +5/completed follow-up max 15, cap
  100, closed 100, lost 0) + `lead_activities`,
  `lead_followups`, `lead_tags`, `notifications`. SLA:
  first contact 1h, follow-up 24h.
- **Visits / tickets / services**: own tables with
  requester-scoped visibility; staff actions gated by
  `visits:manage` / `tickets:manage` / `services:manage`.
- **Payments**: offline/manual records only
  (PENDING → verified/rejected/refund). Amounts in paise.
  No gateway, no webhooks, no entitlement activation.
- **Campaigns**: CRUD + enforced status flow + templates
  per channel; messages are queued as QUEUED and never
  claimed as sent (no provider).
- **Settings**: one row per key in `site_settings`, but
  only a 4-key allowlist is writable through the API;
  secret keys are refused with 400 (secrets belong in env).
- **Uploads**: `uploads` table + files on disk; images
  inline, documents attachment-only; documents never appear
  in public detail images; private files 404 for strangers.

## 6. Authentication flow

1. Register: self-service roles only (Buyer, Seller, Owner,
   Agent, Builder, Investor). Admin-class roles are never
   self-assignable.
2. Login: scrypt verify → throttle check (5 fails/IP+email/
   10 min → 429) → session row + `pp_session` cookie.
3. Every API call: token hash lookup → user + roles +
   permissions (via `role_permissions` join).
4. Password reset: token, 1h expiry, console backend in dev
   (prints the link; production needs a real email backend
   and must never log the token).
5. Email verification: token, 24h expiry.

## 7. Configuration

- Node: `PORT` (default 8902), `DATABASE_PATH`
  (default `server/data/primepropertys.db`),
  `STATIC_ROOT` (default project root), `EMAIL_BACKEND`
  (`console` default; `''` = unconfigured → 503
  EMAIL_NOT_CONFIGURED, never a fake send).
- No `.env` loader in the Node server; env comes from the
  process environment. No secret is ever returned by an API.

## 8. Deployment architecture (today)

- **Reference + development**: this Node tree, local
  SQLite, `node src/server.js`.
- **Public static mirror**: GitHub Pages (653 pages, no API).
- **Live production**: https://primepropertys.in/ on
  Serverbyt shared hosting — static files from this tree
  plus the PHP + MySQL port of the same `/api/*` contract
  (separate tree, `api/` directory, MySQL database,
  Argon2id passwords — the port's own line, not this
  tree's). CMS features land here via port slices after
  they land and pass tests in Node.
- **Rule for CMS work**: the Node contract is the source
  of truth. A CMS API that exists only in the PHP port (as
  the Priority 2/3 domains currently do) is a divergence
  to be closed, not a pattern to repeat: new CMS domains
  are built in Node first, tested, then ported.

## 9. Invariants the CMS must preserve

1. All existing `/api/*` paths keep their method, shape,
   and status codes (404-not-403 visibility included).
2. All 653 pages keep working until a CMS-managed
   equivalent is verified page by page.
3. Existing users, properties, leads, and CRM rows are
   never migrated destructively; new CMS tables are
   additive, with foreign keys to existing tables where
   they relate.
4. No fake success: queued ≠ sent, recorded ≠ charged,
   draft ≠ published, unconfigured provider → 503, never
   a fabricated answer.
5. Secrets never appear in API responses, page HTML, or
   committed files.
