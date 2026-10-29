# FEATURE GAP ANALYSIS — PrimePropertys (Phase A)

Rule used: a feature "exists" only if a table + route + test exist. A page alone is
not a feature. All "absent" verdicts below were checked by grepping `server/src/`
and `server/migrations/` for the domain's tables/routes.

## 1. Exists and tested (do not rebuild)

Auth + roles (9 roles, 15 permissions, seeded), property CRUD + draft→publish approval
+ soft delete + images-as-URLs + save/recent/similar, public search (limited filters,
see BUG-009), enquiries→leads pipeline with assignment/notes/follow-ups/tags/scores/SLA/
stats/CSV export, in-app notifications (read-only except mark-read), site visits
(request/assign/schedule/complete/feedback/stats/analytics), support tickets + replies,
service requests, contact inbox, newsletter subscribe/unsubscribe, offline/manual
payments + billing profile + refund requests, campaigns + message templates + queued
(not sent) messages, site settings (4 keys), user admin list/detail/PATCH, wizard
draft flow (sessionStorage until description, then PATCH accumulation).

## 2. Missing domains (spec §9–§19 vs reality)

| Spec domain | Server today | Frontend pages (unwired) | Blocking reason |
|---|---|---|---|
| Builder Projects / Towers / Units / Milestones / Offers / Project CRM | None. No projects table. `project_name` is only a text column on properties. | builder-portal: add-project1/2, construction-progress, floor-plans, project-crm2, project-location, project-offers, project-videos, unit-details (14 forms) | New domain + migration + APIs + tests. No credential blocker; needs the data model decision (towers vs flat unit list). |
| Reviews + moderation + aggregation | None. Visit feedback (rating 1–5 on a visit) is the only rating in the system, and it is not a property review. | property-engine/property-reviews, buyer-portal/reviews (demo "4.6/5") | New domain. Decision: who may review (verified visit/transaction only?) and moderation policy. |
| Staff Tasks | None. Lead follow-ups exist but are lead-linked, not general tasks. | manager-staff/tasks, assigned-tasks (3 forms) | New domain. No credential blocker. |
| Advanced RBAC: custom roles, matrix, overrides, scoped/temp permissions | Fixed roles + 15 permissions in 002_auth.sql seed. No roles table, no editor endpoint. | super-admin create-role/edit-role/roles/permission-matrix/overrides/scope/permissions, security-center permission-changes (9 forms) | New domain + migration of role_permissions to a roles table. Decision: migrate existing assignments or keep seed roles as built-ins. |
| Real Subscriptions + billing | No plan catalog, no subscription records, no entitlement checks. Payments checkout sells "PRO plan yearly" as a pending record only. | subscription cancel/downgrade/upgrade/checkout (4), owner listing-credits | **Credential + product decision**: plan catalog (prices, listing limits, credits) AND a payment provider in test mode (see §4). Never activate paid entitlements without verified webhooks. |
| Coupons / Promotions / Boosts / Featured | None. Campaigns (marketing spend records) are a different domain. | marketing coupons, featured-property, property-boost (3) | New domain; depends on the subscription catalog for eligible plans. |
| User-to-User Chat | None. `queued_messages` is an SMS/WhatsApp queue, not conversations; there is no conversation/message table, no membership check, no unread-count write path. | communication chat/messages, agent/owner messages, push-notifications, communication-preferences (4) | New domain. Decision: in-app chat only, or also bridge to WhatsApp (provider needed for the latter). |
| AI Assistants (12 listed in spec) | None. No provider, no key handling, no usage table. | ai-intelligence all 14 pages, 13 forms | **Credential**: an AI provider + server-side key + usage limits. Until then the honest state is "unavailable", never a simulated answer. |
| Analytics / Reporting | Only visits analytics + lead stats/SLA/scores. No event table (property views are stored per user, not as an analytics event stream), no exports except leads CSV. | analytics all 18 pages, 17 forms | New domain (events table + aggregation). Decision: which metrics are contractual vs informational; retention period. |
| SEO Management | Static only: build.py injects canonical + OG from page title/meta description; sitemap.xml has 105/653 URLs; robots.txt is static. No SEO records, no redirect table, no crawler. | seo all 24 pages, 14 forms | New domain + crawler/analyser. Decision: canonical domain (github.io vs primepropertys.in). |
| Search Alerts | None. | property-search/search-alerts (1) | New domain (saved search + alert dispatch needs an email provider for delivery; in-app alerts alone are possible without one). |
| Price History | None. Properties table has a single current price; no history table, and PATCH overwrites it. | property-engine/property-price-history (1) | New domain (append-only price_events on PATCH). No credential blocker. |
| Property Verification (beyond publish) | Publish approval (`properties:publish_any`) exists; there is no separate verification status, document check, or verifier field. | property-engine/property-verification, owner/builder/buyer verification pages | New workflow + document upload (blocked on Phase E binary upload for document evidence). |
| Profiles (bio/city/etc.) | users: email, password_hash, full_name, phone, role, status, email_verified_at. Nothing else. | agent/owner/builder/manager/buyer profile forms | New columns + endpoint. No credential blocker. |
| Notification Preferences / Push | No prefs store; notifications are lead-scoped in-app rows. | communication-preferences, push-notifications, privacy-settings | New domain; push needs a provider (VAPID/web-push keys) — credential decision. |
| Form Builder storage | None. | form-builder create-form/form-editor/submission-details/validation-rules (5) | New domain. |
| Visit Reminders | None (follow-ups are lead-linked). | site-visit/visit-reminder (1) | New domain or extend follow-ups with a visit link. Decision: reminder channel (in-app only vs email/SMS provider). |
| Account Deletion | No endpoint, no retention workflow. | buyer-portal/delete-account (1) | **Explicit user decision required** (retention, anonymisation, what happens to listings/leads). Never autopilot. |

## 3. Partially present — do not mistake for complete

- **Property search**: city/type/listing_type/price/sort work server-side; bedrooms, area,
  possession, amenities, locality, verified-only, builder filters do not (BUG-009).
- **Property detail rendering**: exists as an API (GET /api/properties/:id + images),
  but no page renders it (BUG-008). Saved/recent/search-results render live; detail does not.
- **Payments**: record-keeping only (BUG-013). **Campaigns**: records only, no delivery
  (BUG-014). **Settings**: 4 keys only; every other settings page (AI keys, payment keys,
  SMTP, OTP) is a form that the allowlist will refuse with 400 — by design, but the UI
  does not always say that before submit.
- **Wizard**: draft creation + step PATCH + quality/duplicate (client-side over own
  listings) + verification (client-side) + submit (stays draft) all work; uploads,
  category persistence, and pre-description persistence do not (BUG-010/011/012).
- **Notifications**: in-app rows + mark-one-read exist; mark-all-read, preferences,
  and any external delivery do not.

## 4. External-provider gaps (all need a credential or a decision, none exist today)

Email (transactional, reset, verification, receipts, enquiry notices): no provider;
`EMAIL_BACKEND=console` (log) or anything else → 503. SMS: none. WhatsApp Business:
none (no number policy either — BUG-027). Payment gateway: none. AI provider: none.
Push: none. Maps: none (no coordinates stored; never invent them). PDF generation:
none (Download Plan PDF links are dead). Malware scanning for uploads: not applicable
until uploads exist; document the choice when Phase E lands.

## 5. What the spec asks for that this audit recommends NOT building as specified

- "AI Property Valuation" as an official figure: build only as a clearly-labelled
  estimate with human review, never as a valuation (spec §14 already requires this).
- "Download all listings to the browser" search: explicitly rejected by spec §19;
  server filtering (BUG-009) is the fix, not a bigger client fetch.
- Any feature that would require inventing listings, reviews, ratings, revenue,
  impressions or locations: refused by the spec's own non-negotiables and by this audit.
  Demo rows must be labelled or replaced, never presented as data.
