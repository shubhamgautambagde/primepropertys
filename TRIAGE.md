# TRIAGE — Remaining forms, links and admin tables (autopilot slice 5, 2026-10-28)

> Priority 4 note (2026-10-28): this file is a historical slice log.
> Its state line below is that slice's state, not the current state.
> Current verified counts: 653 pages, 362 forms (224 wired + 138
> `data-backend="not-connected"`), 186 `href="#"` occurrences in
> source, 100/100 server tests, migrations 001–028. Statements in
> this file that binary upload "is not implemented anywhere" and
> that search filters are client-side are superseded by Priority 1
> (binary upload, server-side search). The current authoritative
> status is FINAL_REPORT.md.

State after this slice: tests 59/59, audit 187 entries (was 250), 0 broken
internal links, `data-backend="not-connected"` occurrences 201 → 138.

## What this slice wired (existing endpoints only, no new domains invented)

- **Newsletter, second footer variant (36 forms, 35 files):** root pages and
  blog footers carry `<form class="newsletter-row" data-backend>` with a bare
  email input — a different shape from the section footers wired in the
  newsletter slice. Same endpoint, same case.
- **Settings, second location (3 forms):** super-admin ai-settings +
  system-settings and security-center security-settings hold the same
  4-field settings form as the system-settings section. Submit works via
  the shared settings case; prefill/Reset need the settings group file,
  which is only inlined on system-settings pages (build maps one group per
  section) — so on these 3 pages the fields show their HTML defaults and
  Reset is a safe no-op. Documented here, not faked.
- **Report forms (2):** report-problem.html + property-engine/report-property
  → tickets (`Report: <category>`, description + URL + reporter contact).
  Screenshots cannot upload (binary upload is not implemented anywhere);
  the note says so and the report still goes through without them.
- **Emergency support (1):** emergency-support.html → tickets
  (`Emergency: <type>`, location + phone).
- **FAQ / help search (2):** client-side accordion filter; no server call,
  no claim of one.
- **Site search (4):** index hero search, advanced search, investment
  search, mobile search → search-results.html with URL params. The
  search-results renderer now honours city/property_type/listing_type/
  min_price/max_price from the API and bedrooms/possession/area
  client-side (fetching up to 100 rows when a client filter is active,
  so a narrow filter does not falsely report zero matches). Investment
  search cannot filter by ROI (no ROI field exists) — the case says so
  and searches on city + budget.
- **Section search (13):** form-builder (7), news (4), support
  search-support (1), owner my-properties (1) → client-side row/card
  filter. News category selects are not applied (cards carry no reliable
  category marker); only the search text filters.
- **Change password (5):** agent, builder, buyer, manager-staff, owner
  security forms → POST /api/auth/change-password (already existed,
  unwired). Investor security has no current-password field, so it
  cannot use this endpoint — left unwired (see below).
- **Calculators (3):** investor ROI / yield / appreciation already
  computed correctly in buyer.js via onclick; the forms only lacked a
  `data-api` tag, so Enter-submit did nothing. They now carry
  `data-api` + a case delegating to the existing functions.
- **Admin user tables (8):** super-admin users, user-details,
  user-verification, verification-management + super-manager
  agent-management, team-management, user-operations, verification-queue.
  One renderer in admin.js over GET /api/users (new: list now exposes
  `email_verified_at` to users:manage holders) with per-page filters
  (all / unverified / agents / team). View/Edit open
  user-details.html?user_id=, which renders the user plus a real edit
  form (role + status via new PATCH /api/users/:id, users:manage-gated;
  own-role changes refused server-side). This resolves the 102 View/Edit
  placeholder links **at runtime** — the static demo rows remain in
  source, so the audit still counts those files (see links report).

## What remains, and what unblocks it

### Needs a new data domain (not a wiring job)
- **Projects (builder-portal, 15 forms):** add-project, verification,
  construction progress, offers, units, project CRM/location/videos —
  there is no projects table. Largest remaining domain.
- **Reviews (property-engine property-reviews, buyer reviews):** no
  reviews table.
- **Tasks (manager-staff tasks/assigned-tasks):** no tasks table.
- **Coupons, boosts, featured properties (marketing):** no coupons or
  promotion records (campaigns exist; these are separate).
- **Subscriptions (subscription cancel/downgrade/upgrade/checkout,
  owner listing-credits):** no plan catalog and no subscription records.
  The payments checkout already sells the PRO plan yearly as a pending
  payment; a real subscription flow needs the catalog decision first.
- **Forms (form-builder create-form, form-editor, submission-details):**
  no stored-form/submission domain.
- **SEO content (seo meta-manager, redirects, robots, global settings,
  page analysers, audit runner):** no stored SEO records; page analysis
  needs a crawler/analyser.
- **AI assistants (ai-intelligence, 13 forms):** no AI provider.
- **Analytics exports (analytics, 17 forms):** export buttons with no
  analytics data behind them. The visits analytics endpoint exists for
  visits only; the rest needs an analytics domain.
- **Chat (communication chat/messages, agent/owner messages):** no
  user-to-user chat domain (queued_messages covers SMS/WhatsApp only).
- **Profiles (agent/owner/builder/manager/buyer profile forms):** users
  store full_name only — phone/bio/city need profile columns + endpoint.
- **Privacy settings, notification preferences, push notifications:**
  no prefs store; push needs a provider.
- **Verification uploads (buyer/owner/builder verification):** binary
  upload is not implemented anywhere.
- **Reminders (site-visit visit-reminder):** no reminders domain
  (follow-ups are lead-linked, not visit-linked).
- **Roles & permissions editors (super-admin create/edit-role, roles,
  permission matrix/overrides/scope, temporary permissions,
  security-center permission-changes):** RBAC roles are fixed in the
  database seed; custom roles need a roles domain.
- **Account deletion (buyer delete-account):** destructive by nature —
  needs the user's explicit decision, not autopilot.
- **Property detail live render (property-engine property-details):**
  no live detail renderer exists yet, so demo-card View Details links
  (buyer-portal, investor-portal) cannot point at real records. Live
  equivalents already exist: search-results cards link to the wired
  enquiry flow, and saved/recently-viewed render live from the API.

### Needs a product decision (not more code)
- **WhatsApp links (24, mostly post-property sidebars):** need a
  per-listing number policy. Owner phones exist (wizard) but are gated
  by the hide_number preference; exposing them publicly is a privacy
  decision for the user.
- **View Details on demo cards (buyer-portal, investor-portal):** need
  real property/investment records + the detail render above.
- **Share / Download Plan (PDF) / Play Video (property-engine):** need
  real property assets (share targets, plan PDFs, video URLs) per
  listing; the wizard now collects video/360 URLs, so this unlocks
  once listings carry them.
- **Use Template links on template pages:** resolved by the campaigns
  slice (they navigate with ?template_id=); the audit still lists the
  files because other placeholder links remain on those pages
  (Compose New, Mark all as read — see below).
- **Compose New / Mark all as read (communication messages,
  notification-center):** compose needs a chat domain; mark-all-read
  needs a notifications write endpoint (notifications are read-only
  rows today).
- **Calendar controls, Reset/Export (site-visit pages):** the calendar
  page is live via follow-ups; its ‹ May 2025 › / Today / + Add Visit
  controls are navigation chrome without a calendar backend; Reset/
  Export on visit-requests need a visits export endpoint (leads export
  exists as the pattern).
- **Print / More (visit-details):** print is browser chrome; More needs
  a defined action menu.
- **Callback forms (property-engine, 14 files):** phone-only, with no
  property context on those generic pages and no name/email — they
  cannot become enquiries (need property_id) or contact messages
  (need name/email/subject). They need either property context on the
  page or extra fields.
- **Add-property single-page forms (agent-portal, owner-portal):**
  missing listing_type (sale/rent) — the wizard covers creation with
  its purpose step; these forms need a sale/rent choice before they
  can create honestly.
- **Duplicate CRM forms (agent/owner/central-crm lead assignment,
  transfer, follow-up, notes, tags; owner site-visit-approval):** the
  wired CRM pages already cover these flows with ?lead_id= /
  ?visit_id=. The portal copies take lead names, not IDs, so they
  cannot resolve to records. Use the wired pages.
- **Investor security form:** toggles + new-password-only; needs a
  current-password field to use change-password, and a prefs/2FA
  domain for the toggles.
- **CRM export form (central-crm crm-export):** the wired crm-export
  downloads real CSV; this form's type/range/format options need
  export endpoint parameters that do not exist yet.
- **Property documents request (property-engine property-documents):**
  name + email only — needs phone + property context, like callbacks.
- **Property share (property-engine property-share):** needs email
  delivery (no provider).

## Audit note (read before quoting the counts)
The audit counts one bug entry per file, and it scans inlined script
text as markup: a JS comment containing a literal `href="#"` once
flagged all 83 admin.js pages as false positives. That comment was
rewritten; the count below is clean. Static demo rows that a live
render replaces at runtime still count in the source — the 52
placeholder-link files are mostly those rows plus the decision items
above, not broken links (broken internal links: 0).
