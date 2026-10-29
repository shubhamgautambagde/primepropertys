# BUG REGISTER — PrimePropertys (Phase A, 2026-10-28)

> Priority 4 status note (2026-10-28): the rows below are the Phase A
> findings, unchanged. Their post-Phase-A status is:
> - FIXED in code + tested: BUG-001 (Secure on HTTPS), BUG-002
>   (token logging gated), BUG-003 (CSRF Origin check), BUG-004
>   (mapping corrected), BUG-005 (README counts — now 100 tests,
>   138 markers), BUG-008 (live property detail), BUG-009/BUG-028
>   (server search filters), BUG-010 (wizard remapping removed;
>   unsupported choices now error explicitly — enum extension
>   still a user decision), BUG-012 (binary upload, scoped;
>   floor-plan/360°/verification/report uploads still unwired),
>   BUG-013 remains a missing capability, not a fixed defect
>   (payments are pending records, webhook is a 501 stub),
>   BUG-014 remains (SMS/WhatsApp queued only), BUG-017 (rate
>   limits on all writes), BUG-023 (admin audit log, Priority 2),
>   BUG-025 (ACCESSIBILITY/DEPLOYMENT counts corrected).
> - STILL OPEN (not re-verified as fixed, do not claim fixed):
>   BUG-006 (server log says 127.0.0.1 while binding all
>   interfaces), BUG-007 (.env never loaded), BUG-011 (wizard
>   early steps sessionStorage-only), BUG-015 (settings prefill
>   on 3 pages — not re-checked in Priority 4), BUG-016 (non-user
>   admin tables still demo rows), BUG-018 (8 sections with no
>   group JS — partially addressed by Priority 2/3 group wiring,
>   not fully re-audited), BUG-020 (demo phone, 693 matches),
>   BUG-021 (canonical github.io, sitemap 105/653),
>   BUG-022 (7-day sessions, no revoke UI beyond password
>   change — session endpoints exist in Priority 2, revoke UI
>   not verified), BUG-027 (WhatsApp number policy undecided),
>   BUG-029/BUG-030 (no manual a11y pass, no browser tests,
>   no migration-rollback test), BUG-031 (page weight by
>   design), BUG-032 (lead score formula, copy caveat).
> - PARTIALLY FIXED in Priority 4: form-message contrast and
>   announcement (was not a numbered Phase A bug; the old
>   colours failed AA), nav-toggle aria-expanded, table
>   scrolling on mobile. Manual keyboard/screen-reader pass
>   still not done.

Severity: Critical = blocks production / leaks credentials or auth; High = user-visible
wrong behaviour or wrong documentation a developer would act on; Medium = real defect
with a workaround or limited blast radius; Low = doc/consistency nit.
Status: CONFIRMED = read in code or reproduced by count/run. ENHANCEMENT = a missing
feature, not a broken existing behaviour (kept in a separate section so counts are honest).
Verification evidence is the command/file read, not a claim. No marker was deleted.

## CONFIRMED DEFECTS

### Critical (5)

| ID | File / function / line | Confirmed behaviour | Expected | Root cause | Correction | Evidence |
|---|---|---|---|---|---|---|
| BUG-001 | `server/src/auth.js:141` `sessionCookieHeader()` | `Secure` is added only if `SESSION_COOKIE_SECURE=1`; default HTTP deployment sends the session cookie without Secure. | Secure on HTTPS production by default; documented opt-out only for local HTTP. | Opt-in flag, not environment-aware default. | Set Secure when the deployment is HTTPS (or always except explicit local dev), and document the env var in server/README. | Read auth.js; DEPLOYMENT.md:105 and server/README.md both flag it. |
| BUG-002 | `server/src/server.js` `request-password-reset`, `request-verification` | Default `EMAIL_BACKEND=console` prints the full password-reset / email-verification token to the server log (`console.log(... token=...)`). Anyone with log access can reset any account / verify any email. | Tokens never logged; delivery via a configured provider, else 503 without issuing a usable token in logs. | Console backend is the default, not a dev-only flag. | Gate console-email behind an explicit dev flag (e.g. `EMAIL_BACKEND=console` only with `NODE_ENV=development`); otherwise 503. Rotate nothing (no production tokens observed). | Read server.js auth handlers; server/README confirms console behaviour. |
| BUG-003 | `server/src/server.js` (whole API) | No CSRF token on any cookie-authenticated POST/PATCH/PUT/DELETE. Protection rests solely on `SameSite=Lax` + no CORS headers. A same-site or Lax-allowed top-level flow, or a future CORS relaxation, reopens CSRF. | Per-session CSRF token (or Origin/Referer check) for state-changing API calls. | Never implemented; SameSite treated as sufficient. | Add CSRF token issuance + check (or strict Origin check) before production; add a test. | grep: no `csrf` in server/src or assets/js; api.js sends no token. |
| BUG-004 | `FRONTEND_BACKEND_MAPPING.md` §1 | At least 8 rows misstate the real endpoint: `login`/`register` listed as "(client-side / navigation only)" but forms.js calls `PP.login`→POST /api/auth/login and `PP.register`→POST /api/auth/register; `inquiry` listed client-side but calls POST /api/inquiries; `contact` listed as `/api/leads/` but calls POST /api/contact; `wizard-upload-notice` listed as `/api/tickets` but forms.js shows an honest no-upload notice and calls no API; `wizard-step`/`wizard-edit` listed client-side but delegate to post-property.js which POSTs/PATCHes /api/properties; `service-track` listed as `/api/newsletter/subscribe` but is a client-side redirect to complaint-tracking.html?request_id=; `campaign-filter` listed as /api/message-templates but calls `PP.applyCampaignFilter` (client filter). | Mapping matches forms.js + server.js exactly. | Generated mapping was not re-checked against handler code. | Replace with FRONTEND_BACKEND_MAPPING_AUDIT.md (this audit) and fix the original in Phase 1. | Compared mapping rows against forms.js case blocks line by line. |
| BUG-005 | `README.md:66,87` | README says "54 tests" and "263 not-connected forms". Actual: 59 tests, 138 markers. A developer planning from README over-plans by ~2× on unwired work and under-counts tests. | Counts generated from files, or at least matching TRIAGE.md (59/138). | README not updated after the 2026-10-28 triage slices. | Correct README in Phase 1; add a count-generation step to the release checklist. | `node --test` = 59 pass; grep = 138. |

### High (12)

| ID | File / area | Confirmed behaviour | Expected | Root cause / correction | Evidence |
|---|---|---|---|---|---|
| BUG-006 | `server/src/server.js:627` `server.listen(PORT)` | Binds all interfaces by default, but the log line says `http://127.0.0.1:PORT`. An operator reading the log believes the server is loopback-only. | Bind explicitly to 127.0.0.1 for local runs (or log the real bind address). | `listen(PORT)` with no host. | Read server.js tail. |
| BUG-007 | `server/.env.example` + `server/src/server.js:27-30` | `.env.example` says "Copy to .env", but the server has no dotenv loader (zero deps) and reads `process.env` only. A copied `.env` file is silently ignored. | Either load `.env` (documented, zero-dep parser) or change the example to "export these variables". | Doc/code mismatch. | grep dotenv: 0 hits; read .env.example. |
| BUG-008 | `sections/property-engine/property-details.html` (+ buyer/investor demo cards) | No live property-detail renderer exists. Demo-card "View Details" links (22 occurrences) have no property ID and cannot resolve to a real record. Search-results/saved/recent pages do render live, so the gap is specific to this page + demo cards. | Detail page renders GET /api/properties/:id (published, or own draft) like saved/recent do. | Renderer never built; TRIAGE.md admits it. | TRIAGE.md "Property detail live render"; grep View Details = 22. |
| BUG-009 | `server/src/server.js` `listProperties()` + `assets/js/forms.js` site-search | Frontend site-search sends `bedrooms`, `bedrooms_min`, `area_min`, `area_max`, `possession_status` params; the server ignores all of them (only city, property_type, listing_type, min/max_price, sort). Narrow filters are applied client-side over at most 100 fetched rows, so results can silently omit matches beyond row 100. | Server filters for bedrooms/area/possession (columns exist in migration 017) with pagination, or frontend says so. | Search params added to frontend without server support. | Compared forms.js site-search params vs listProperties where-clause. |
| BUG-010 | `assets/js/groups/post-property.js` header + `server/src/validate.js` enums | Wizard maps Lease→rent, PG/Office/Shop/Warehouse→Commercial, and drops `category` entirely (no column). A user selecting "PG" or "Lease" gets a different listing type stored, silently. | Either extend the enums (new migration) or block those choices until the enum exists; never silently remap. Product decision required. | Enum in validate.js is narrower than wizard choices. | Read both files; wizard comment admits the mapping. |
| BUG-011 | `assets/js/groups/post-property.js` draft flow | Pre-description wizard steps exist only in `sessionStorage` (`pp-wizard`); closing the tab, switching device, or clearing storage loses them, and no server draft exists until the description step. | Server draft created at step 1 (or explicit "drafts are device-local until description" warning on every early step). | Create API requires title+type+listing_type+price+city, which early steps lack. | Read post-property.js header + saveStep. |
| BUG-012 | Binary upload (all upload pages) | Every file input / "Choose Files" button is dead: no multipart handling in server, no FormData in JS. Upload pages (photos, floor plans, 360, documents, verification, report screenshots) show an honest notice only on submit forms; bare "Choose Files" buttons do nothing at all. | Real binary upload per Phase E, or remove/disable dead buttons with a notice. | Never implemented; images are URL-only (`validateImageUrl`, property_images.url). | grep multipart/FormData: 0 in server/src; forms.js:881-884, 918-920 notices. |
| BUG-013 | `server/src/payments.js` + payments pages | Payments are offline/manual records only: create→pending→staff verify/reject→refund-request. No gateway, no webhook, no signature verification. A checkout page that looks like payment is only a pending record (the success text does say this — the defect is the missing capability, rated High because pricing/subscription pages imply a purchase). | Gateway in test mode + webhook verification before any paid entitlement is sold. | Provider never chosen. | Read payments.js header; no gateway/webhook string in server/src. |
| BUG-014 | `server/src/campaigns.js`, `server/src/server.js` queued-messages | SMS/WhatsApp/email "send" only queues a row (`queued_messages`); nothing delivers it, and there is no worker, provider, retry, or delivery-status update. Campaign pages imply delivery. | Provider + worker + status updates, or rename the UI to "queue only" everywhere. | Provider never configured. | Read campaigns.js; forms.js sms/whatsapp success text admits NOT sent. |
| BUG-015 | Settings prefill (3 pages) | `sections/super-admin/ai-settings.html`, `system-settings.html`, `sections/security-center/security-settings.html` carry the settings form, but the settings group file is only inlined on system-settings pages (one group per section in section-map.json). On those 3 pages fields show HTML defaults and Reset is a no-op; submit still works via forms.js. | Inline the settings group on those sections, or remove the form there. | Build maps one group file per section. | TRIAGE.md settings note; section-map.json js_map. |
| BUG-016 | Admin tables beyond users | View (54) + Edit (48) href="#" rows: only the 8 user-table pages render live (admin.js + GET /api/users). All other admin tables (leads, properties, payments, etc. in super-admin/super-manager) are static demo rows with no IDs, so their actions cannot resolve. | Live tables per domain, or remove demo actions. | Domains exist for some tables but no renderer was built. | PLACEHOLDER report + admin.js scope check. |
| BUG-017 | Rate limiting scope | Only login (5/10 min per IP+email), inquiries (10/hour/IP), contact (20/hour/IP), newsletter have limits. Register, ticket/service creation, payments, campaigns, password-reset requests have none, and all buckets are in-memory (lost on restart, per-process only). | Limits on all public/anonymous writes + a shared store (or documented single-process limit). | Incremental addition, never a pass over all routes. | grep RateLimited in server/src (only 4 sites). |

### Medium (11)

| ID | Area | Confirmed behaviour | Correction |
|---|---|---|---|
| BUG-018 | `tools/section-map.json` | 8 sections have no js_map entry (ai-intelligence, analytics, blog, form-builder, mobile, news, seo, subscription): core bundle only, no live behaviour. | Add group files when those domains are built; until then do not imply live behaviour on those pages. |
| BUG-019 | `assets/js/validation.js` | Standalone library, deliberately not inlined, used by no form (build.py comment). Client validation therefore depends on per-form ad-hoc checks in forms.js. | Either inline it and wire it, or delete it to avoid a dead library. |
| BUG-020 | Demo data in production-facing pages | Demo phone +91 98765 43210 appears in 691 matches; demo listings (e.g. property-report "Lodha Eternis, Andheri East", reviews "4.6/5") render as if real on logged-out pages. Live render replaces some rows when logged in; logged-out visitors still see demo content. | Gate demo cards behind login, or label them "Demo" visibly, or replace with live data. |
| BUG-021 | Canonical / sitemap domain | `tools/build.py` SEO_BASE and `sitemap.xml` point to `shubhamgautambagde.github.io/primepropertys`, not the live domain primepropertys.in; sitemap lists only 105 of 653 URLs. | Decide the canonical domain (user decision), regenerate sitemap for all public pages, exclude drafts/private pages. |
| BUG-022 | Session lifetime | 7-day session TTL, no sliding expiry, no idle timeout, no "active sessions" revocation endpoint (only revoke-others on password change). | Add session list/revoke + idle timeout policy (product decision). |
| BUG-023 | No admin audit log | Lead activities are logged, but admin actions (publish, user role change, payment verify, settings PUT) have no audit table. | Add audit_log table + writes on sensitive actions. |
| BUG-024 | `server/src/server.js` body handling | 100 KB body cap is fine, but non-JSON bodies on POST/PATCH/PUT return 400 only after full read; more importantly, GET routes with a body are ignored silently. Minor. | Document; no change needed before production. |
| BUG-025 | `ACCESSIBILITY.md` + `DEPLOYMENT.md` | ACCESSIBILITY says 652 pages (actual 653); DEPLOYMENT says 339 audit entries in one section and 341 in another. | Correct counts; generate from files. |
| BUG-026 | `README.md` structure section | Says site is in `primepropertys-website/` and Option 2 runs `python3 -m http.server` there; that directory does not exist. | Correct to repo root. |
| BUG-027 | `sections/post-property/*` WhatsApp links | 24 href="#" "Chat on WhatsApp" links: no number policy. Owner phones exist in wizard data but are gated by `hide_number`; exposing them publicly is a privacy decision, not a wiring job. | User decision (see FEATURE_GAP_ANALYSIS.md blockers). |
| BUG-028 | Search-results client filtering | When a client-side filter (bedrooms/possession/area) is active, the page fetches up to 100 rows and filters locally; total counts and pagination then describe the fetched subset, not the filtered set. | Fix with BUG-009 (server filtering). |

### Low (4)

| ID | Area | Note |
|---|---|---|
| BUG-029 | `server/test/a11y.js` | Automated scan only: lang, h1, main, skip link, alt, labels, empty links/buttons. No keyboard tab-order, focus-trap, modal, or screen-reader test exists. |
| BUG-030 | Test coverage shape | 59 tests cover API journeys well, but there are no browser (Playwright) tests, no migration-rollback test, no load/perf test beyond gzip + one EXPLAIN QUERY PLAN claim. |
| BUG-031 | Page weight | Avg ~91 KB inlined HTML × 653 pages = ~59 MB repo; every page repeats the full core bundle. This is by design (single-file preview) but is the performance ceiling until a linked-asset build exists. |
| BUG-032 | `server/src/leads.js` lead scoring | Score formula is stage points + notes/follow-ups only; profile/budget signals are explicitly not in the data. Not a bug, but any "lead score" UI copy that implies richer signals would be. Keep copy aligned. |

**Count: 32 confirmed defects — Critical 5, High 12, Medium 11, Low 4.**

## ENHANCEMENTS (missing features, not defects — do not count in the defect total)

E-01 Builder Projects/Units (no tables/routes; 14 unwired builder-portal forms).
E-02 Property Reviews (no table; property-reviews + buyer reviews pages unwired).
E-03 Staff Tasks (no table; manager-staff tasks pages unwired).
E-04 Custom Roles/Permissions (fixed 9 roles, 15 permissions, seeded in 002_auth.sql; role editors unwired).
E-05 Real Subscriptions/Billing (no plan catalog, no subscription records; payments are pending records; 4 unwired subscription forms + owner listing-credits).
E-06 Coupons/Promotions/Boosts (no tables; campaigns exist but are separate; marketing coupons/featured/boost unwired).
E-07 User-to-User Chat (no table/routes; queued_messages is SMS/WhatsApp queue only; communication chat/messages unwired).
E-08 AI Assistants (no provider, no routes; 13 ai-intelligence forms unwired).
E-09 Analytics/Reporting domain (only visits analytics + lead stats/SLA exist; 17 analytics forms unwired, exports unwired).
E-10 SEO Management records (no tables; canonical/OG tags are static from build.py; 14 seo forms unwired; no crawler).
E-11 Search Alerts (no table/routes; 1 unwired form).
E-12 Price History (no table; property-price-history page unwired; properties table has no history).
E-13 Profile fields (users store full_name/phone only; bio/city/profile forms unwired).
E-14 Notification Preferences / Push (no prefs store, no push provider; preferences pages unwired).
E-15 Form Builder storage (no stored-form/submission domain; 5 form-builder forms unwired).
E-16 Visit Reminders (no reminders domain; follow-ups are lead-linked, not visit-linked).
E-17 Account Deletion workflow (no endpoint; buyer delete-account unwired — needs explicit user decision, never autopilot).
E-18 Property Verification workflow (no verification table/endpoint beyond publish approval; verification pages unwired).
E-19 Saved-search / recommendations engine (saved properties exist; saved searches and recommendations do not).
E-20 PDF/CSV reports beyond leads CSV (only leads export exists; visit export, analytics export unwired).

## What is NOT a bug (verified, to prevent false fixes)

- Unwired forms showing "Demo preview — no data was saved yet" are working as designed; do not "fix" them by deleting the marker or by wiring them to the wrong endpoint.
- `href="#"` on demo table rows is not a broken link (0 broken internal links verified); the fix is live data, not a guessed destination.
- `innerHTML` count is 0 in shipped JS (test `perf.js`/a11y enforces it); rendering uses textContent/DOM construction.
- Password hashing (scrypt, random salt, timing-safe compare) and token hashing (SHA-256 of random 32-byte tokens) are sound; the issue is token logging (BUG-002), not the crypto.
- All SQL in server/src uses parameterised queries (no string-interpolated user input found in route handlers except the allowlisted sort map in listProperties).
