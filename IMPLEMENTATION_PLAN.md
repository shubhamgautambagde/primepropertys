# IMPLEMENTATION PLAN — PrimePropertys (Phase A → Phase B+)

Rules carried from the spec: one module at a time; inspect → design migration →
backend → validation/authorisation → frontend → tests → docs → checkpoint; never
delete `data-backend` markers to clear the audit; never lower Node ≥24; never deploy
without explicit authorisation; never report a feature complete without a test/run.
Working copy only — nothing here authorises a push or a deploy.

## Priority 1 — Critical repairs (do first, in this order)

| # | Module | Work | Blocker (decision / credential) | Done when |
|---|---|---|---|---|
| P1-1 | Documentation reconciliation | Fix README counts (59 tests, 138 markers, root directory, Option 2 path); fix FRONTEND_BACKEND_MAPPING.md from FRONTEND_BACKEND_MAPPING_AUDIT.md; fix ACCESSIBILITY 652→653; fix DEPLOYMENT 339/341 inconsistency; add a count-generation script to the release checklist. | None. | Counts in docs match a fresh grep + test run. |
| P1-2 | Security defaults | SEC-01 Secure cookie default on HTTPS; SEC-02 gate console-email behind dev-only flag; SEC-03 CSRF token or Origin check + test; SEC-06 rate limits on all writes. | Decision: what counts as "production" for the Secure/console gates (env var name). | Tests for CSRF rejection, token-not-in-logs, and rate-limit 429 on register/reset. |
| P1-3 | Property detail render | Build `property-details.html` live renderer (GET /api/properties/:id, published or own draft, images, enquiry link with ?property_id=). Then point demo-card View Details at it only where a real ID exists; leave other demo cards labelled demo. | Decision: detail URL pattern (existing page + ?property_id= vs new route). | Browser journey: search → detail → enquiry, verified live. |
| P1-4 | Server search filters | Add bedrooms/bedrooms_min/area_min/area_max/possession_status (and locality) to listProperties with pagination; remove the 100-row client-side filter fallback or keep it only as a progressive enhancement. | None (columns exist). | API tests for each new filter + pagination total correctness. |
| P1-5 | Wizard correctness | Decide the enum question (extend property_type/listing_type via migration, or block PG/Office/Shop/Warehouse/Lease choices); persist `category` (new column) or drop the choice; create a server draft at step 1 or add an explicit device-local warning on early steps. | **Product decision**: enum extension vs choice restriction; category semantics. | Wizard journey test covers the decided behaviour; no silent remapping remains. |
| P1-6 | Binary upload (Phase E core) | Multipart upload: signature+MIME+size validation, safe filenames, non-executable storage, permission + private-document checks, ordering, deletion, replacement; wire wizard upload steps + report screenshots + verification documents to it. | Decision: storage location (local disk vs object storage), size limits, retention/backup policy, malware-scan availability. | Tests: invalid file, oversized file, unauthorised upload, private-document access denied — all passing. |
| P1-7 | Browser journeys | Add Playwright (or equivalent) journeys 1–6, 9–11 from spec §23 (registration→dashboard→logout; property draft→approval→publish; search→detail→enquiry; enquiry→lead→conversion; visit request→completion; ticket→resolution; unauthorised→denied; invalid upload→rejection). | None (tooling choice only). | Journeys run in CI-equivalent local run and pass; results recorded, not claimed. |
| P1-8 | Admin tables (remaining) | Live renderers for non-user admin tables, or remove their demo View/Edit actions. Start with properties and leads tables (domains exist). | None. | No href="#" View/Edit remains on a table that has live data. |

## Priority 2 — Core product features (one domain at a time)

| Order | Domain | Migration + API + frontend + tests | Blocker |
|---|---|---|---|
| P2-1 | Builder Projects + Units | projects, towers/buildings, units (available/reserved/sold), milestones/progress, amenities, documents, offers, enquiries, verification, publish flow; builder-only ownership checks. | Data-model decision (towers vs flat units); document evidence needs P1-6. |
| P2-2 | Property Reviews | reviews, moderation, reporting, aggregation, verified-visit indicator (from visits, never fabricated). | Moderation policy decision (pre- vs post-moderation). |
| P2-3 | Staff Tasks | tasks, assignment, due/priority/status, comments, activity, reminders (in-app first), role visibility. | None. |
| P2-4 | Custom Roles + Permissions | roles table, permission matrix/overrides/scope/temp permissions, migration of the 15 seed permissions, admin audit log (SEC-05) as part of this module. | Decision: seed roles as immutable built-ins or editable. |
| P2-5 | Subscription Catalog + Entitlements | plans, listing limits/credits, featured packages, agent/builder plans, create/renew/upgrade/downgrade/cancel/expire, invoice + payment history, usage checks on property creation. **No paid activation until P2-6 webhook verification exists.** | **Product decision**: plan prices/limits/credits. **Credential**: payment provider test-mode keys. |
| P2-6 | Payment Gateway (test mode) | Provider integration, webhook signature verification, idempotent webhook handling, refund flow through the provider, never trust client-submitted success, never store card details. | **Credential**: provider test keys + webhook secret; provider choice (Razorpay/Stripe/etc. — user decision). |
| P2-7 | Coupons + Promotions | coupons, discount types, dates, usage/per-user limits, eligible plans, boosts, promotion windows, audit log; connect to P2-5/P2-6. | Depends on P2-5 catalog. |
| P2-8 | User-to-User Chat | conversations, membership, messages, unread counts, mark-read (incl. mark-all-read), rate limiting, no phone exposure without consent. | Decision: in-app only vs WhatsApp bridge (provider needed for bridge). |
| P2-9 | Notification Preferences | prefs store, in-app + email preference enforcement, visit/lead reminder preferences (in-app first; external channels need providers). | None for in-app; provider for email/SMS delivery. |

## Priority 3 — Advanced features

P3-1 AI assistants (provider abstraction, server-side keys, usage limits + cost logging,
human approval before publish, honest unavailable state, prompt-injection guard for
untrusted descriptions). **Blocker: AI provider credential + provider choice.**
P3-2 Analytics + reporting (event table, property/search/lead/visit/subscription reports,
CSV export; PDF only if a PDF decision is made). Retention decision required.
P3-3 SEO management (records, redirects, robots, sitemap for all public pages, crawler/
analyser, duplicate-metadata detection). **Blocker: canonical domain decision.**
P3-4 Search alerts (saved search + in-app alerts; email alerts need an email provider).
P3-5 Price history (append-only price_events on property PATCH).
P3-6 Automated reminders (visit reminders; channel decision as P2-9).
P3-7 PDF/CSV reports beyond leads (visit export, analytics export).
P3-8 Advanced recommendations (similar-properties exists; extend only with real
signals, never invented affinity).

## Priority 4 — Production hardening

P4-1 Performance: linked-asset build option (removes the ~91 KB/page inline duplication
and the CSP `unsafe-inline` requirement), responsive images, lazy loading, cache headers,
compression verification on the real host, DB index review with EXPLAIN on real query
patterns. Measure before/after; do not cache private data in shared caches.
P4-2 Accessibility: manual keyboard walkthrough, focus-trap/modal audit, screen-reader
pass on portal/CRM/admin widgets, contrast re-check after any design change.
P4-3 External integrations: email provider (transactional + verification + receipts),
SMS, WhatsApp Business (number policy first), push (VAPID keys). Each: env-var config,
timeouts, retries where safe, idempotency, delivery-status logging, sandbox test.
P4-4 Backup + recovery: automated SQLite backup, restore test on a scratch copy,
backup encryption/access control, incident-response doc, rollback procedure test.
P4-5 Security testing: CSRF/IDOR regression suite, auth test expansion (2FA once built),
header verification on the real host, Node patch policy.
P4-6 Deployment verification: HTTPS, Secure cookie, HSTS (only once HTTPS is real),
env-var-only secrets, file permissions, upload restrictions, logging policy (no tokens),
error monitoring, rate-limit verification on the host, and a final production-readiness
sign-off against PRODUCTION_READINESS.md. **No deploy without explicit user authorisation.**

## Checkpoints and ordering constraints

- P1-2 (security) before any production exposure; P1-6 (upload) before P2-1 documents
  and verification evidence; P2-5 catalog before P2-7 coupons; P2-6 gateway test-mode
  before any paid entitlement is activated; P3-1 AI only after a provider credential
  exists — until then the UI must say unavailable.
- Each module ends with: migration file, route tests, frontend wiring, docs updated,
  and a checkpoint note in CHANGELOG.md. A module without a passing test run is not
  "done" in any report.
