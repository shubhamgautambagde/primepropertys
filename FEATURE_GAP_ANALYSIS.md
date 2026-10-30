# FEATURE GAP ANALYSIS — PRIME CMS (2026-10-30)

Method: the existing tree checked against the PRIME CMS
brief (§4–§22). Status: DONE (shipped, tested, working),
PARTIAL (some of the domain works, some missing), MISSING
(no domain), BLOCKED (needs a credential, provider, or
product decision — never invented).

This document supersedes the 2026-10-28 Phases A–V
analysis for CMS planning; that version is preserved in
git history, and its substance is condensed in the
appendix below.

## DONE (keep, do not rebuild)

- Auth + RBAC: 9 roles, 19 permissions, scrypt hashes,
  token-hash sessions (7-day), throttle, reset (1h) +
  verification (24h) tokens.
- Property management: CRUD, draft/publish/unpublish,
  soft delete, save, recently viewed, similar, sort,
  51-column wizard, duplicate check, completeness score,
  binary uploads (magic-byte sniffing, gated serving).
- Leads + CRM: inquiries, status workflow, assign, notes,
  activities, tags, follow-ups, scoring, SLA, stats, CSV
  export, notifications (in-app only).
- Site visits, tickets, services, portal lists,
  newsletter, offline payment records, campaigns +
  templates + queued messages, settings (4-key allowlist),
  admin user tables + user edit.
- Frontend system: shared CSS/JS, idempotent build.py,
  section-group mapping, live-list pattern, form wiring.
- SEO basics: static sitemap, robots, canonical + OG tags.
- Performance + security basics: gzip, security headers,
  indexes, DOM rendering without user-data innerHTML,
  404 for `/server/*` and `*.db`.
- Accessibility basics: aria labels, skip links,
  focus-visible, AA-passing brand contrast (measured).

## PARTIAL (shipped part works; rest is a gap)

- **Property detail rendering:** live detail renderer
  exists (Phase A Priority 1); amenities + images render;
  saved/recent lists render. No CMS page wrapper yet.
- **Property search:** city/type/listing/price + client
  filters work; amenities, possession-date, verified-only,
  builder-project, saved-search and alert filters are not
  data filters.
- **Payments:** full offline record domain. No gateway,
  no webhooks, no entitlement activation.
- **Campaigns:** CRUD + status flow + templates + queued
  messages. No delivery, no platform metrics.
- **Notifications:** in-app DB rows only. No preferences
  store (exists in the PHP line only), no mark-all-read.
- **Settings:** 4-field rows only; SMTP/API/OTP/2FA and
  the other brief §18 modules have no fields or provider
  backing.
- **Visits analytics:** computed from visits only.
- **SEO:** static only; no metadata records, redirects
  store, crawler, or audit history.
- **Priority 2/3 domains (projects, reviews, tasks,
  custom roles, notification preferences, chat, price
  history, analytics, AI status):** built + tested in the
  PHP deployment line only — missing from this Node tree.
  Closing this divergence is Phase 2's first job.

## MISSING (no domain — the CMS build)

- **CMS Core (§4):** config, website config, module /
  plugin / theme registries, event + hook system, cache,
  media, logging, localization, API management.
- **Dynamic pages (§5):** create/edit/delete/duplicate/
  publish/unpublish/schedule/draft/revisions/templates/
  categories/slugs/SEO/visibility/permissions, and the
  safe dynamic renderer.
- **Dynamic content (§6):** homepage, about, contact,
  blog, news, FAQ, testimonials, careers, help center,
  pricing, legal, footer, header, menus, banners, ads as
  database records with CRUD.
- **Media library (§7):** beyond property uploads — video,
  documents, preview, compression, resizing, thumbnails,
  search, categories, rename, metadata, storage usage.
- **Theme manager (§8):** install/activate/deactivate/
  preview/settings/customization; current design as the
  default theme; layouts → reusable templates.
- **Plugin manager (§9):** install/activate/deactivate/
  update/delete/settings/permissions/migrations/routes/
  events/dependencies/versions; trusted-install flow.
- **Visual builder (§10):** drag-and-drop, live preview,
  sections/containers/rows/columns, header/footer
  builders, 15 widget kinds, custom CSS, responsive
  previews, undo/redo, templates, autosave, revisions.
- **Menu builder (§11):** database menus, drag-and-drop,
  nesting, mega menu, header/footer/mobile, role
  visibility.
- **Admin dashboard (§12):** the 24-item CMS navigation
  as working modules (today the super-admin section is
  54 static pages, several unwired to live data).
- **Custom content types (§13):** types + fields +
  validation + display + permissions + API availability
  without code changes.
- **Form builder (§16):** dynamic forms, submissions,
  export, notifications, spam protection, page embeds.
- **SEO manager (§17):** metadata records, redirects,
  sitemap (dynamic), robots, OG, schema, analysis,
  indexing status, link analysis.
- **System settings (§18):** grouped modules beyond the
  4-key allowlist (see plan Phase 13).
- **Multi-website (§21):** websites/domains/tenants —
  schema prepared in Phase 2, activation after
  single-site stability.
- **Security (§22):** CSRF tokens, 2FA, session
  revocation UI, admin audit log, account-deletion
  workflow, API keys.
- **Performance (§23):** asset versioning, lazy loading,
  responsive images, measured before/after report.
- **Tests (§24):** CMS journey tests; browser-automation
  journeys (Playwright) not yet run.

## BLOCKED (needs a decision or credential — do not invent)

- Live payment gateway (provider + keys + webhook secret).
- Email/SMS/WhatsApp providers (keys + sender identities).
- AI provider (key + model choice).
- Subscription plan catalog (contents/prices) — blocks
  subscriptions + coupons.
- WhatsApp per-listing number policy (privacy decision).
- Account-deletion policy (confirmation + retention).
- Static frontend re-upload to primepropertys.in.
- `server/` inside the live web tree (move out before
  any Node/DB work there).

## Priority order (brief §24, applied)

1. Phase 2: close the Node/PHP divergence, then CMS
   schema design.
2. Phase 3: CMS Core + dashboard; Phase 4: pages.
3. Phases 5–8: content, media, themes, plugins.
4. Phases 9–13: builder, menus, forms, SEO, settings.
5. Phase 14: real-estate + CRM integration (no rebuild).
6. Phases 15–17: multi-website prep, security +
   performance, testing + docs.

## Appendix — prior A–V status (2026-10-28, condensed)

DONE: audit + bug fixing (Stages A–C, 1,495 → 187 audit
entries, 0 broken links); auth + RBAC (Stage E); property
core + wizard (Stage F); leads + CRM (Stage G); visits,
tickets, services, portal lists, newsletter, payments,
campaigns, settings, admin users; SEO/performance/
accessibility basics (Stage I); deployment docs (Stage J).

PARTIAL at that date: detail rendering, search filters,
payments (offline only), campaigns (no delivery),
notifications (in-app only), settings (4-key), visits
analytics, static SEO. MISSING at that date: binary
uploads (Phase E — since completed), projects, reviews,
tasks, subscriptions, coupons, AI, analytics, chat,
custom roles, SEO management, saved searches, providers,
browser journeys. BLOCKED at that date: the same
provider/credential/policy items listed above, plus the
hosting decision (since resolved: Serverbyt shared
hosting, PHP port for live, Node as reference).
Counts then: 59/59 tests, audit 187, 132 form files,
52 link files, 138 not-connected occurrences, 186
`href="#"` occurrences.
