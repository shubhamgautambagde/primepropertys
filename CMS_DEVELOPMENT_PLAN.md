# PRIME CMS — Development Plan

Date: 2026-10-30. This plan implements the PRIME CMS brief
in the existing Node.js + SQLite tree. It does not replace
the backend, delete pages, or break APIs. Each phase ends
with tests passing before the next phase starts.

## 0. Ground rules (brief §25, restated as build rules)

1. Work in this tree only. No separate replacement project.
2. Node + SQLite stay. A framework change needs a written
   impact note + user approval first — it is not assumed.
3. No page deleted without approval; no working feature
   removed; no fake success, dead button, or fabricated
   record.
4. New migrations only; never edit an applied migration.
5. Back up before major changes (the tree is a git repo;
   commit per phase).
6. Every phase: automated tests + a docs update.

## 1. Phase 1 — Audit (this document set) ✅ DONE 2026-10-30

Outputs: SOURCE_CODE_AUDIT.md, CURRENT_ARCHITECTURE.md,
DATABASE_AUDIT.md, API_AUDIT.md, CMS_DEVELOPMENT_PLAN.md
(this file), FEATURE_GAP_ANALYSIS.md. No code changed.

## 2. Phase 2 — Architecture & database design

- Close the Node/PHP divergence first: port the Priority
  2/3 domains (projects, reviews, tasks, custom roles +
  notification preferences, chat, price history, analytics,
  AI status) from the PHP line back into Node migrations
  019–026 + modules + tests. Until this lands, the Node
  tree is not the single source of truth.
- Design the CMS tables (brief §19): cms_websites,
  cms_pages, cms_page_revisions, cms_page_templates,
  cms_content_types, cms_custom_fields, cms_menus,
  cms_menu_items, cms_media, cms_plugins,
  cms_plugin_versions, cms_themes, cms_theme_settings,
  cms_form_definitions, cms_form_submissions,
  cms_seo_metadata, cms_redirects, cms_widgets,
  cms_settings, cms_activity_logs.
- Decide: one migration per table family, foreign keys
  into users/properties/inquiries where they relate.
- Deliverable: design doc + empty-table migrations +
  tests proving migrations apply cleanly on a fresh DB.

## 3. Phase 3 — CMS Core & admin dashboard

- Core modules in `server/src/cms/`: config, website
  config, module registry, plugin registry, theme
  registry, routing, events/hooks, cache, media, logging,
  localization, API management — independent of the
  real-estate modules.
- Registry discipline (from the brief): a plugin/theme
  directory without a valid manifest is not loaded and
  never executed; installation requires explicit admin
  confirmation (trusted-install flow).
- Admin dashboard: transform the super-admin section
  into the 24-item CMS navigation (Dashboard, Websites,
  Pages, Blog, News, Media Library, Navigation Menus,
  Website Builder, Theme Manager, Plugin Manager, Real
  Estate, Properties, Users, Roles and Permissions, Leads,
  CRM, Forms, SEO Manager, Analytics, Integrations,
  Payment Settings, System Settings, Backup, Activity
  Logs). Every item opens a working module — no UI-only
  entries. Items whose modules land later stay visibly
  "coming in Phase N" with no dead button behind them.
- Auth: reuse existing sessions + roles; add `cms:*`
  permissions via migration seed; custom roles without
  breaking existing grants.

## 4. Phase 4 — Dynamic page management

- CRUD + duplicate + publish/unpublish + schedule +
  drafts + revisions + templates + categories + slugs +
  SEO fields + visibility + access permissions.
- Safe dynamic renderer: pages render from validated
  JSON documents (never raw HTML from the DB executed
  blindly); existing static pages keep working in
  parallel until their CMS equivalent is verified.
- Migration path: static page → CMS page import that
  preserves slug + content, verified page by page.

## 5. Phase 5 — Content management

- Database-managed: homepage, about, contact, blog posts,
  news, FAQ, testimonials, careers, help center, pricing,
  legal pages, footer, header, banners, ads.
- Blog/news use the existing blog + news sections' pages
  as the migration source; categories + authors + publish
  states from Phase 4.

## 6. Phase 6 — Media manager

- Extend the uploads domain (magic-byte sniffing, size
  limits, safe names) into a full library: images, video,
  documents; preview, compression, resizing, thumbnails,
  search, categories, rename, delete, alt text, metadata,
  storage usage. Never executable uploads. Private vs
  public gating as in the uploads domain today.

## 7. Phase 7 — Theme management

- Install / activate / deactivate / preview / settings /
  customization (header, footer, colors, typography,
  layout, responsive). The current design becomes the
  default theme (navy `#0A2240`, royal `#2563EB`, red
  `#E11D48`); existing layouts become reusable templates
  via the build.py section-group mapping — no redesign
  of 653 pages.

## 8. Phase 8 — Plugin management

- Install / activate / deactivate / update / delete /
  settings / permissions / migrations / routes / events /
  dependencies / versions. One directory + manifest per
  plugin. Reserved directories (brief §9): blog,
  real-estate, crm, job-portal, ecommerce, booking,
  payment, newsletter, analytics, seo, whatsapp. The
  existing real-estate + CRM code becomes the first
  plugins' reference implementation — extracted, not
  copied.

## 9. Phase 9 — Visual website builder

- Elementor-like builder on versioned, validated JSON
  page documents: drag-and-drop, live preview, sections,
  containers, rows/columns, header/footer builders,
  text/image/video/button/gallery/slider/form/pricing/
  testimonial/custom-HTML widgets, custom CSS, responsive
  previews (desktop/tablet/mobile), undo/redo, duplicate,
  reusable templates, autosave, revision history.
- Migration path for existing HTML pages (Phase 4 import
  extended to block structure).

## 10. Phase 10 — Menu & navigation builder

- Database-driven menus: CRUD, drag-and-drop ordering,
  nesting, mega menu, header/footer/mobile variants,
  external + internal page links, role-based visibility.
  The current navigation.js becomes the renderer.

## 11. Phase 11 — Form builder

- Dynamic forms: CRUD, drag-and-drop fields (text, email,
  phone, dropdown, checkbox, radio, file, date), validation
  rules, submissions, export, email notifications (only
  when a provider is configured — else honest
  "not configured"), spam protection, embedding into CMS
  pages. Existing wired forms (newsletter, contact,
  visit-request, wizard) become the first built-ins.

## 12. Phase 12 — SEO manager

- Per-page title, meta description, focus keywords,
  canonical, XML sitemap (dynamic, replacing the static
  generator's output), robots.txt, Open Graph, schema
  markup, redirect manager, alt-text audit, indexing
  status, internal-link analysis. All stored in
  `cms_seo_metadata` / `cms_redirects`.

## 13. Phase 13 — System settings

- Dynamic settings replacing the 4-key allowlist with
  grouped modules (general, branding, logo/favicon, SMTP,
  email templates, SMS, WhatsApp, OTP, API, payment
  gateways, currency, language, timezone, cache, storage,
  security, backup, maintenance, webhooks, privacy, cookie
  consent). Secrets in env only, never in API responses;
  sensitive sections restricted to Super Admin.

## 14. Phase 14 — Real-estate & CRM integration

- No rebuild: connect the existing domains to CMS pages
  (property detail blocks, search blocks, lead capture
  forms), custom content types for properties/projects/
  agents/agencies/builders, and CMS permissions on top of
  existing grants. Subscriptions + coupons stay blocked
  until the user supplies the plan catalog (see §17).

## 15. Phase 15 — Multi-website architecture

- `cms_websites` + domains + per-website themes, pages,
  menus, settings, SEO, media, plugins, users — isolated
  at the DB and application level. Prepared in Phase 2
  schema, activated only after the single-site CMS is
  stable and tested (brief §21).

## 16. Phase 16 — Security & performance

- CSRF tokens (the largest open gap), secure cookies
  (already HttpOnly/SameSite-Lax), XSS + SQL-injection
  hardening (parameterized queries already; DOM rendering
  already avoids user-data innerHTML), upload security
  (done), admin audit log (new in Phase 3), rate limiting
  (extend DB-backed limits to CMS endpoints), 2FA,
  session revocation UI, secure password reset (done),
  secure API auth (keys, Phase 11 of the brief's API
  section). Performance: measured before/after (query
  counts, API times, page weight); asset versioning,
  lazy loading, responsive images, pagination discipline.

## 17. Phase 17 — Testing & documentation

- Extend `server/test/` per phase; keep the journey
  tests green; add CMS journey tests (create page →
  publish → render; install plugin → activate; form →
  submission). Docs: installation, deployment, module
  docs per domain. No "complete" claim until every
  implemented module passes its functional tests.

## 18. Live-deployment rule (Serverbyt, shared hosting)

The live site cannot run Node. Each CMS phase therefore
ships twice: (1) Node implementation + tests in this
tree; (2) a PHP-port slice deployed to primepropertys.in
through the proven pipeline (full-tree zip, panel
extract, health + auth + 404 verification, zip removed,
pp-config.php/.htaccess/static files/DB rows untouched).
A phase is not "live" until both are verified.

## 19. Decisions still needed (blocked — never invent)

- Subscription plan catalog (contents/prices) — blocks
  subscriptions + coupons.
- Live payment gateway provider + keys + webhook secret
  (TEST MODE first).
- Email/SMS/WhatsApp providers + sender identities.
- AI provider + model choice.
- WhatsApp per-listing number policy.
- Account-deletion policy (confirmation + retention).
- Static frontend re-upload to primepropertys.in (live
  HTML predates the Priority 2/3 wiring) — needed before
  CMS admin pages can be exercised live.
- `server/` directory inside the live web tree — move
  out of web root before any Node/DB work there (asked
  2026-10-29, unanswered; currently safe only because
  no .db exists there).
