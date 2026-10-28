# PrimePropertys — Deployment guide (Stage J)

Final verification state (2026-10-28): 48/48 tests pass
(including the end-to-end journey test below), build idempotent,
audit 0 broken internal links. Stages A–J of the brief are done;
the items under "Not production-ready yet" are the remaining
work, and each needs a user decision or real credentials.

## Architecture: two halves, honestly separated

| Half | Where it runs | What works there |
| --- | --- | --- |
| Static site (652 pages) | GitHub Pages: https://shubhamgautambagde.github.io/primepropertys/ | All public content, blog/news, property browse pages, forms' UI |
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
`server/migrations/` in order (001–008). A fresh database
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

- `EMAIL_BACKEND=console` (default): password-reset and
  verification links are printed to the server log instead of
  being sent. Nothing is delivered.
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
  hashes only (never the token itself). Known gap: the cookie
  does not set the `Secure` flag, so if you serve HTTPS-only
  (recommended), add `Secure` to the session cookie in
  `server/src/auth.js` or terminate TLS at a reverse proxy
  that you trust.
- Login is throttled (5 failures per IP+email per 10 minutes
  → 429); public inquiry is IP-limited (10/hour) and contact
  is IP-limited (20/hour).
- File uploads are URL references only: binary multipart
  upload is not implemented, so property images must be
  hosted URLs (currently Unsplash URLs in the pages).
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

## Performance (measured, Stage I)

- Homepage over the Node server: 42,385 bytes plain,
  10,887 bytes gzipped (-74%) when the client accepts gzip.
- Database: migration 008 indexes turned the leads
  status-filter query from a full table SCAN into an index
  SEARCH (verified with `EXPLAIN QUERY PLAN` on 200-row
  test tables), and gave the property list a status-first
  index. GitHub Pages applies its own compression to the
  static site; the Node gzip numbers above are for the
  hosted-server case.

## Final verification (Stage J)

- `npm test` in `server/`: 50/50 pass, including
  `test/journey.js` — one test that walks the whole product:
  admin creates a draft property (invisible publicly),
  publishes it (visible), a buyer enquires, the admin
  assigns and advances the lead (new → contacted →
  interested), adds a note, a follow-up (completed), and a
  tag, then scores (60, Warm), SLA, stats, CSV export,
  contact inbox, saved properties, and my-enquiries are all
  checked, plus the homepage, sitemap, and robots responses.
- `python3 tools/build.py` twice: second run 0 changes.
- Audit: 339 bug entries, 0 broken internal links.

## Remaining audit items — what they actually need

The 341 entries are not 341 defects to fix blindly:

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
- Payments (needs a real provider and credentials — never
  invented), support tickets, campaigns, settings forms.
- Hosting decision: Node hosting vs PHP-only hosting. If
  PHP-only, the Stage D data layer needs a port; the
  current server is Node-only.
- Manual accessibility walkthrough (keyboard order, focus
  traps, screen-reader announcements) — automated checks
  pass; see `ACCESSIBILITY.md`.
