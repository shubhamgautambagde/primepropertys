# SOURCE CODE AUDIT — PrimePropertys (Phase A)

Date: 2026-10-28. Working copy only: `~/workspace/primepropertys-audit/primepropertys`
(git HEAD `0116c3b` "Triage (25/25): system-settings + final files"; pristine backup
`~/workspace/primepropertys-audit/primepropertys-backup-2026-10-28`, diff-clean before audit).
No push, no deploy, no production data touched. Nothing below is claimed without a
file read or a run; method and evidence are in BUG_REGISTER.md.

## 1. Verified baseline (re-counted, not copied)

| Measure | Verified | Source / method |
|---|---|---|
| HTML pages | **653** (20 root + 633 in `sections/`, 27 sections) | `find` walk; see FILE_INVENTORY.json |
| `data-backend="not-connected"` | **138 occurrences in 132 files**; every one is a `<form>` | grep, all 653 pages |
| `href="#"` | **186 occurrences in 52 files** | grep, all 653 pages |
| Forms total | 362 (224 with `data-api`, 138 without — exactly the unwired set) | grep |
| Internal links | 31,371 checked, **0 broken** | Python link resolver, all pages |
| Images | 374, 0 without `alt`; 0 pages without `<h1>`; 0 pages with duplicate `id` | scripted scan |
| Node | **v24.22.1**; `server/package.json` engines `>=24` | `node --version` |
| Server tests | **59/59 pass** (20 test files, ~24.4 s) | `node --test server/test/*.js` (full npm-test list) |
| HTML size | 59,209,597 bytes, avg ~90,673 bytes/page, max 131,119 | filesystem walk |
| Server code | `server/src/` 2,928 lines (14 files); migrations 17 files; tests 6,124 lines total incl. src+migrations+tests walk (see inventory) | `wc -l` |
| Shared frontend | `assets/js/` core + groups + components; `assets/css/` 8 core files + section CSS; `tools/build.py` (131 lines), `tools/sitemap.py`, `tools/section-map.json` | read |

## 2. What is actually built (and what is only pages)

**Real, tested backend (SQLite, zero-dependency Node, `server/src/server.js` 629 lines).**
Tables (29, migrations 001–017): users, sessions, tokens, permissions/role_permissions,
properties, property_images, property_views, saved_properties, inquiries, lead_activities,
lead_followups, lead_tags, tags, notifications, site_visits, support_tickets, ticket_replies,
service_requests, contact_messages, newsletter_subscriptions, payments, billing_profiles,
campaigns, message_templates, queued_messages, site_settings, + schema_migrations.
Routes: auth (register/login/logout/me/change-password/reset/verify), properties
(create/draft/publish/unpublish/edit/soft-delete/images/save/recent/similar/mine),
leads/CRM (inquiries, assign, notes, follow-ups, tags, scores, SLA, stats, CSV export,
notifications read), site visits, tickets, service requests, contact, newsletter,
payments (pending records + refund requests + billing profile), campaigns/templates/
queued messages, settings (4-key allowlist), users list/detail/PATCH, health.
Validation is real (`server/src/validate.js`: enums, lengths, integer ranges, image-URL
scheme check) and authorisation is server-side per route (see SECURITY_AUDIT.md).

**Frontend architecture — read this before editing anything.**
Pages are self-contained by design: `tools/build.py` inlines shared CSS/JS into every
page (exactly one `<style>` + one inline `<script>` per page, else skipped). Edit
`assets/`, never inlined copies, then re-run build.py twice (idempotence is claimed in
docs; not re-run here because Phase A must not modify the working copy's pages).
Shared JS order: navigation, tabs, accordion, filters, `api.js` (`window.PP`, same-origin
fetch, `credentials: 'same-origin'`), `forms.js` (one dispatcher per `data-api` value),
`core.js`, plus one group file per section from `tools/section-map.json`.
**Every `data-api` value found in HTML has a handler in `forms.js`/post-property.js
and vice versa (44 values, 0 orphans)** — verified by script. `assets/js/validation.js`
is explicitly NOT inlined and no form uses it yet (build.py header comment).

**Unwired behaviour is honest, not fake.** A form with no `data-api` hits the fallback
at the end of `forms.js`: submit is prevented and a "Demo preview — no data was saved
yet" note is appended. No unwired form claims a save. The same honesty holds for
queued SMS/WhatsApp ("NOT sent: no provider"), payment checkout ("pending, no gateway
charge"), wizard uploads, and the empty-production-database rule.

## 3. Existing docs: what verified, what did not

| Doc | Verdict |
|---|---|
| TRIAGE.md (187 entries, 138 markers, 59/59, 0 broken links) | **Verified** on counts; its per-domain blocker classification is the best starting point and is reused in FEATURE_GAP_ANALYSIS.md. Note: its "audit 187 entries" is a per-file entry count, not 187 defects. |
| PLACEHOLDER_LINKS_REPORT.md (186 href="#", by text) | **Verified** on total; by-text table matches recount (View 54, Edit 48, WhatsApp 24, View Details 22, Use Template 19, rest 19). Its "resolved at runtime" claim holds only for the 8 user-table pages (admin.js over GET /api/users); other View/Edit rows are still demo rows. |
| FRONTEND_BACKEND_MAPPING.md | **Partly WRONG — do not use as-is.** At least 8 rows misstate the endpoint (see BUG-004). A corrected audit mapping is in FRONTEND_BACKEND_MAPPING_AUDIT.md; the original file was NOT overwritten. |
| README.md | **Outdated on counts**: says 263 not-connected (actual 138) and "54 tests" (actual 59). Also says the site lives in `primepropertys-website/` (no such directory; root is the site) and its Option 2 path does not exist. Page/section counts (653/27) are correct. |
| DEPLOYMENT.md | Mostly accurate; internally inconsistent on audit size (339 vs 341 entries, §Final verification vs §Remaining) and says `.env.example` holds placeholders — true, but the server never loads a `.env` file (no dotenv, zero deps), so copying it does nothing unless vars are exported. |
| ACCESSIBILITY.md | Says "652 pages"; actual 653. Automated claims verified (lang/h1/main/alt/dup-id scan all pass); manual keyboard/screen-reader testing explicitly not done — that limit is real. |
| CHANGELOG.md | Historical slice log; its older counts (263, 54 tests) are superseded, not errors in their own slice context. Do not quote them as current. |
| server/README.md | Accurate on routes, limits and the Secure-cookie gap. Its "Stage D read-only" description was replaced. |

## 4. Wired vs unwired, by section

Unwired (`data-backend="not-connected"`) occurrences: property-engine 23, analytics 17,
builder-portal 14, seo 14, ai-intelligence 13, super-admin 9, owner-portal 9,
agent-portal 7, form-builder 5, buyer-portal 5, subscription 4, communication 4,
central-crm 4, marketing 3, manager-staff 3, site-visit 1, security-center 1,
property-search 1, investor-portal 1. Root pages: 0. Sections with **no** unwired forms:
blog, mobile, news, payments, post-property (wizard forms are wired or honestly
noticed), property-search except search-alerts, super-manager, support-home-services,
system-settings.

Sections with **no group JS file** in `section-map.json` (core bundle only, no live
renderer): ai-intelligence, analytics, blog, form-builder, mobile, news, seo,
subscription. That absence predicts their unwired counts.

## 5. Sampling method and limits

- Full counts: grep/Python over all 653 pages (markers, links, forms, ids, alt, h1).
- Line-level reads: all of `server/src/` (auth, server, properties, validate, settings,
  payments, leads structure), `assets/js/api.js`, `assets/js/forms.js` (full),
  `assets/js/groups/post-property.js` (wizard flow), `tools/build.py`,
  `tools/section-map.json`, all migrations' table definitions, `server/.env.example`.
- Sampled pages: one or more per section, all 132 unwired-form files listed by title
  in the audit working notes (titles captured for every unwired file; full list is
  derivable by `grep -rl 'data-backend="not-connected"' sections/`).
- NOT done in Phase A (by design, no browser tooling in this agent): live browser
  walkthrough, manual keyboard/screen-reader test, load test, or any run against
  production. Browser journeys are a Priority 1 item in IMPLEMENTATION_PLAN.md.
- The inlined copies in pages were NOT re-diffed against `assets/` page-by-page;
  build idempotence is a documented claim, not re-verified here.

## 6. Headline conclusions

1. The core product (auth → property draft → admin publish → enquiry → lead → visit/
   ticket/service) is real, permission-checked and test-covered. It is not a mock.
2. Everything beyond that core is pages without a domain: builder projects, reviews,
   tasks, coupons, subscriptions, chat, AI, analytics, SEO records, search alerts and
   price history have **no tables and no routes** — only frontend pages.
3. The single largest correctness risk is not the unwired forms (they are honestly
   labelled) but the **wrong documentation** (mapping + README counts) and the
   **security defaults** (Secure cookie opt-in, reset tokens printed to the server log
   in the default console-email mode, no CSRF token, no 2FA, no admin audit log).
4. Production readiness is **not established** (see PRODUCTION_READINESS.md). The
   codebase itself says so in DEPLOYMENT.md and server/README.md; Phase A agrees.
