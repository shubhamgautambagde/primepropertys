# PrimePropertys

Real-estate portal: 653 pages across 27 sections, PrimePropertys branding
(dark navy `#0A2240`, royal blue `#2563EB`, red `#E11D48`), plus a
zero-dependency Node.js + SQLite backend that powers the portal features.

> This README replaces the old "static website only" description. The site
> is no longer static-only: login, listings, leads/CRM, site visits,
> support tickets, service requests and newsletter subscriptions all run
> against the API in `server/`. The old claims (17 pages, no backend, no
> database, forms that "do not send data anywhere") are outdated and were
> removed in the 2026-10-28 README reconciliation.

## Run it

### Option 1 — full site with backend (recommended)

```bash
cd server
node src/server.js            # http://127.0.0.1:8902
PORT=8903 DATABASE_PATH=/tmp/app.db node src/server.js
```

No `npm install` is needed: the server uses only Node's standard library
(`node:http`, `node:sqlite`). Requires **Node.js >= 24**. The database file
is created on first run and migrations in `server/migrations/` are applied
automatically, in filename order, tracked in `schema_migrations`.

Environment variables: `PORT` (default 8902), `DATABASE_PATH`,
`STATIC_ROOT` (defaults to this directory), `EMAIL_BACKEND` (`console`
prints email links to the server log; anything else means email-dependent
flows answer 503 `EMAIL_NOT_CONFIGURED` — no provider is configured).

### Option 2 — static pages only

```bash
cd primepropertys-website
python3 -m http.server 8000
```

Pages render, but API-backed sections (login, live listings, dashboards,
CRM lists, export) honestly report that the server is unreachable until
the Node server is running. The live public site on GitHub Pages works
this way: it serves static files only.

## Build (shared CSS/JS)

Pages are self-contained by design (CSS/JS inlined per page, so a page
never renders unstyled). The shared sources live in `assets/` and are
inlined by the build script — edit the shared files, never the inlined
copies:

```bash
python3 tools/build.py        # regenerates every page; run twice to confirm 0 changes (idempotent)
```

Shared CSS order: tokens, base, layout, components, forms, dashboard,
responsive. Shared JS: `assets/js/api.js` (`window.PP` client),
`forms.js` (one dispatcher for every `data-api` form), plus one group
file per section under `assets/js/groups/` (see `tools/section-map.json`).

## Tests

```bash
cd server
npm test                      # 54 tests, all passing (Node.js >= 24)
```

Tests run against temporary databases that are deleted afterwards; no
fake production data is ever inserted. Test files live in
`server/test/` (auth, properties, leads/CRM, contact, visits, tickets,
services, portal lists, newsletter, performance, accessibility, and one
end-to-end journey test that walks the whole product).

## What is wired, and what is not

- Wired: login/register, property create/edit/publish/save, public
  listings + search results, enquiries → leads, lead assignment/notes/
  follow-ups/tags/scores/SLA/reports/export, contact inbox, site-visit
  request/assign/schedule/complete/feedback, support tickets + replies,
  service requests, newsletter subscribe/unsubscribe, and the buyer /
  owner / agent "my lists" pages.
- The authoritative per-form mapping is
  [`FRONTEND_BACKEND_MAPPING.md`](FRONTEND_BACKEND_MAPPING.md) (17
  `data-api` form handlers, live tables, and every still-unwired form
  grouped by section with its blocking reason).
- Still unwired: 263 `data-backend="not-connected"` forms and 186
  `href="#"` links — triaged in
  [`PLACEHOLDER_LINKS_REPORT.md`](PLACEHOLDER_LINKS_REPORT.md). Most need
  product decisions, not wiring: payments (needs a provider), campaigns
  (needs an email provider), settings pages (mostly hold secrets),
  the post-property wizard (no shared draft state; binary uploads and
  OTP need decisions), and admin tables whose demo rows carry no IDs.
- Honest limits, kept on purpose: binary image upload is not implemented
  (validated URL references only); email/SMS/WhatsApp delivery is not
  configured; notifications are in-app database rows only; the session
  cookie has no `Secure` flag on plain HTTP (add it on HTTPS hosting);
  the production database starts empty (no sample listings, leads or
  stats are fabricated).

## Structure

```text
primepropertys-website/
  index.html, contact.html, login.html, register.html, ...
  sections/            27 sections, 653 pages total
  assets/css/          shared styles (source of truth)
  assets/js/           api.js, forms.js, navigation.js, validation.js, groups/, components/
  tools/               build.py (inlines shared CSS/JS), section-map.json, sitemap.py
  server/              Node.js + SQLite backend (see server/README.md)
  CHANGELOG.md         per-slice change log
  DEPLOYMENT.md        architecture, env vars, hosting notes, not-production-ready list
  ACCESSIBILITY.md     accessibility state and honest limits
  FRONTEND_BACKEND_MAPPING.md
  PLACEHOLDER_LINKS_REPORT.md
  robots.txt, sitemap.xml
```

## Docs worth reading first

- [`server/README.md`](server/README.md) — full API reference.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — architecture (Pages static vs Node
  API), first-admin creation (there is no default admin), backups and
  rollback.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each slice, with
  verification evidence.
