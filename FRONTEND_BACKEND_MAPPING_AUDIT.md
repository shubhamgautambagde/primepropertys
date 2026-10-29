# FRONTEND ↔ BACKEND MAPPING — AUDIT CORRECTION (Phase A)

**Status: this file corrects `FRONTEND_BACKEND_MAPPING.md`, which was NOT overwritten.**
The original's §3 (unwired by section) and §2 (route list) verified correct; its §1
endpoint column is wrong in at least 8 rows (BUG-004). Use this file until the original
is fixed in Phase 1. Method: every `data-api` value in HTML was matched to its case
block in `assets/js/forms.js` / `assets/js/groups/post-property.js`, and every case
block was matched to a route in `server/src/server.js`. 44 values, 0 orphans either way.

## 1. Wired forms — corrected mapping

| Form (`data-api`) | Real handler → endpoint | Notes |
|---|---|---|
| `login` | forms.js → `PP.login` → **POST /api/auth/login** | Then role dashboard redirect (forms.js DASHBOARDS; Seller → index.html). Original mapping said "client-side only" — wrong. |
| `register` | forms.js → `PP.register` → **POST /api/auth/register** | Self-service roles only (server enforces). Original said "client-side only" — wrong. |
| `change-password` | forms.js → **POST /api/auth/change-password** | Requires current_password; revokes other sessions. Investor security page lacks the field → unwired (see §2). |
| `inquiry` | forms.js → `PP.submitInquiry` → **POST /api/inquiries** | Requires `?property_id=` or `data-property-id`; without it, honest error, no save. Original said "client-side only" — wrong. |
| `contact` | forms.js → `PP.submitContact` → **POST /api/contact** | Rate-limited 20/hour/IP. Original said `/api/leads/` — wrong. |
| `newsletter` | forms.js → **POST /api/newsletter/subscribe** | 86 forms in HTML (footer variant); rate-limited. Unsubscribe has an endpoint but no form found in HTML. |
| `assign`, `transfer` | forms.js → **POST /api/leads/:id/assign** (+ notes for transfer reason) | Requires numeric lead_id + assigned_to; names alone cannot resolve. |
| `visit-request` | forms.js → **POST /api/site-visits** | Requires property_id + scheduled_at. 50 forms. |
| `visit-assign` | forms.js → **POST /api/site-visits/:id/assign** (+ optional PATCH scheduled_at) | |
| `visit-feedback` | forms.js → **PATCH /api/site-visits/:id** | Requires `?visit_id=`; rating 1–5 and/or feedback. |
| `ticket`, `report-problem`, `emergency-support` | forms.js → **POST /api/tickets** | Report maps to subject "Report: <category>"; emergency to "Emergency: <type>". Screenshots are dropped with a notice (no binary upload). Login required server-side. |
| `ticket-reply` | forms.js → **POST /api/tickets/:id/replies** | Requires `?ticket_id=`. |
| `ticket-assign` | forms.js → **POST /api/tickets/:id/assign** | Requires `?ticket_id=` + assigned_to. |
| `service-request` | forms.js → **POST /api/service-requests** | Validates category/issue/address/date/slot/description; urgency normalised to high/normal/low. |
| `service-assign` | forms.js → **POST /api/service-requests/:id/assign** | Requires `?request_id=`. |
| `service-schedule` | forms.js → **PATCH /api/service-requests/:id** | Requires `?request_id=` + scheduled_at. |
| `service-track` | forms.js → **client-side redirect** to `complaint-tracking.html?request_id=` | No API call. Original said `/api/newsletter/subscribe` — wrong. |
| `payment-checkout` | forms.js → **POST /api/payments** | Creates a **pending** record only; amount must come from `data-amount-paise` on the page. No gateway charge. |
| `billing-profile` | forms.js → **PUT /api/billing-profile** | |
| `refund-request` | forms.js → **POST /api/payments/:id/refund-request** | |
| `campaign-create` | forms.js → **POST /api/campaigns** | Saved as draft; metrics need an ad platform (none). |
| `campaign-edit` | forms.js → **PATCH /api/campaigns/:id** | Requires `?campaign_id=`; without it, honest error. |
| `campaign-filter` | forms.js → `PP.applyCampaignFilter` (**client-side filter**, groups/marketing.js) | Original said `/api/message-templates` — wrong. |
| `template` | forms.js → **POST /api/message-templates** | Channel from `data-channel` attr (default email). |
| `sms-message`, `whatsapp-message` | forms.js → **POST /api/queued-messages** | Queued only, NOT sent; success text says so. |
| `settings` | forms.js → **PUT /api/settings** | Server allowlist: only site_name, support_email, contact_number, default_country. Any other key → 400. Prefill only works where the settings group file is inlined (BUG-015). |
| `wizard-step`, `wizard-edit` | forms.js → post-property.js `wizardSaveStep`/`wizardSaveEdit` → **POST /api/properties** (description step creates the draft) then **PATCH /api/properties/:id** per step | Pre-description steps: sessionStorage only. Original said "client-side only" — incomplete/wrong. |
| `wizard-choice` | forms.js → post-property.js `wizardSaveChoice` → sessionStorage only (purpose/type/category choice) | Choice is persisted to the server only when the draft is created/patched. |
| `wizard-upload-notice` | forms.js → **no API call**; honest "upload not implemented" notice | Original said `/api/tickets` — wrong. |
| `wizard-quality`, `wizard-duplicate` | post-property.js → client-side render over GET /api/properties/mine (+ city/type list for duplicates) | No dedicated quality/duplicate endpoint; duplicate check is client-side, not a server guarantee. |
| `wizard-verification`, `wizard-submit` | post-property.js → client-side; submit **does not publish** (stays draft, needs admin publish) | |
| `faq-search`, `section-search` | forms.js → client-side DOM filter | No server call, no save claimed. |
| `site-search` | forms.js → client-side redirect to search target with URL params (city/type/listing/price; bedrooms/area/possession passed but ignored server-side — BUG-009) | |
| `calc-roi`, `calc-yield`, `calc-appr` | forms.js → existing buyer.js calculator functions | Client-side only. |

## 2. Page → Form → API → Validation → Authorisation → DB → Response → Test (wired domains)

| Domain | Form(s) | API | Server validation | Authorisation | DB tables | Response | Tests |
|---|---|---|---|---|---|---|---|
| Auth | login, register, change-password | /api/auth/* | email regex, strong password (8+ chars, letter+digit), self-service role allowlist | Session cookie; change-password requires current password; reset tokens hashed, 1 h expiry | users, sessions, password_reset_tokens, email_verification_tokens | {user, permissions} / {ok} / {error:{code,message}} | test/auth.js, users-admin.js |
| Properties | wizard-step/edit, (single-page add-property forms are unwired — missing listing_type) | /api/properties, /mine, /:id, /publish, /unpublish, /images, /save, /saved, /recently-viewed, /:id/similar | validate.js enums/lengths/ranges; image URL scheme check | create: properties:create; edit: owner+edit_own or edit_any; publish: publish_any only; drafts 404 to non-owners | properties, property_images, property_views, saved_properties | Row(s) + pagination {limit,offset,total} | test/properties.js, wizard.js, portal-lists.js |
| Leads/CRM | inquiry, assign, transfer (+ notes/follow-ups/tags via group JS, not forms) | /api/inquiries, /leads, /leads/:id, /assign, /notes, /followups, /tags, /scores, /sla, /stats, /export, /notifications | Status transition machine (new→contacted→interested→site_visit→negotiation→closed/lost, terminal locked); duplicate inquiry flagged via duplicate_of (30 days, phone normalised) | view_any vs own-property/assigned-only, else 404; assign needs leads:assign; export needs leads:export | inquiries, lead_activities, lead_followups, lead_tags, tags, notifications | Rows + stats/funnel; CSV for export | test/leads.js, crm.js, my-enquiries.js, journey.js |
| Site visits | visit-request/assign/feedback | /api/site-visits, /stats, /analytics | Scheduled_at + property required; transition rules in visits.js | Visibility: owner/assignee/manager; assign needs manage permission | site_visits | Row(s) + stats/analytics | test/visits.js |
| Tickets | ticket, report-problem, emergency-support, ticket-reply/assign | /api/tickets, /:id, /replies, /assign | subject+message required | Visibility: reporter/assignee/manager; assign gated | support_tickets, ticket_replies | Row(s) | test/tickets.js |
| Service requests | service-request/assign/schedule | /api/service-requests, /stats | Category/issue/address/date/slot/description required | Visibility + assign gated (services.js) | service_requests | Row(s) + stats | test/services.js |
| Contact | contact | /api/contact | Name/email/message (contact.js) | Public capture, rate-limited; list needs permission | contact_messages | {ok} / list | test/contact.js |
| Newsletter | newsletter | /api/newsletter/subscribe, /unsubscribe | Email validation; duplicate → already_subscribed, not an error | Public, rate-limited; consent_at stored | newsletter_subscriptions | {ok} | test/newsletter.js |
| Payments | payment-checkout, billing-profile, refund-request | /api/payments, /:id, /refund-request, /billing-profile | Amount >0, method enum mapping, status transition machine (pending→verified/rejected, refund_requested→refunded/rejected→verified) | Owner-only visibility except payments:view holders; verify is staff-gated | payments, billing_profiles | Row(s) | test/payments.js |
| Campaigns | campaign-create/edit/filter, template, sms/whatsapp-message | /api/campaigns, /message-templates, /queued-messages | Name required; budget numeric parsing | Campaign/template/queue writes need login + (campaigns.js) role checks | campaigns, message_templates, queued_messages | Row(s); queue success explicitly says NOT sent | test/campaigns.js |
| Settings | settings | /api/settings | 4-key allowlist, max lengths, email validation | settings:manage only (Super Admin; Admin explicitly excluded in seed) | site_settings | {settings, providers:{email_backend}} | test/settings.js |
| Users admin | (group JS, not a form) | GET /api/users, GET/PATCH /api/users/:id | Role allowlist (9 roles), status active/suspended, self-role-change refused | users:manage | users | Row(s) | test/users-admin.js |
| Wizard | wizard-* (see §1) | /api/properties (+ /mine for quality/duplicate) | As Properties | As Properties | properties (+ sessionStorage client-side) | Draft row | test/wizard.js |

## 3. Unwired forms by section + blocking reason (138 occurrences, 132 files)

Full per-file list: `grep -rl 'data-backend="not-connected"' sections/` (132 files).
By section (occurrences): property-engine 23, analytics 17, builder-portal 14, seo 14,
ai-intelligence 13, super-admin 9, owner-portal 9, agent-portal 7, form-builder 5,
buyer-portal 5, subscription 4, communication 4, central-crm 4, marketing 3,
manager-staff 3, site-visit 1, security-center 1, property-search 1, investor-portal 1.

| Blocking reason | Sections / examples |
|---|---|
| No backend domain exists (new table + API + tests needed) | Builder projects/units (builder-portal), reviews (property-engine, buyer), tasks (manager-staff), coupons/boosts (marketing), subscriptions (subscription, owner listing-credits), form-builder storage, SEO records (seo), analytics events/exports (analytics), chat (communication), custom roles (super-admin, security-center), profiles (agent/owner/builder/manager/buyer), notification prefs/push (communication, buyer) |
| Provider missing (credential) | AI (ai-intelligence, all forms), email-dependent share (property-engine/property-share), push (communication/push-notifications), payment-gateway-backed subscription checkout |
| Product decision needed (not a wiring job) | WhatsApp number policy (post-property sidebars are href#, not forms — see BUG-027); property detail render (property-engine/property-details); demo-card View Details (buyer/investor); share/PDF/video targets (property-engine); calendar controls + visit export (site-visit); account deletion policy (buyer/delete-account); sale/rent choice on single-page add-property forms (agent/owner); CRM portal copies that take names not IDs (agent/owner/central-crm — use the wired pages with ?lead_id=) |
| Missing context/fields on the page | Callback forms (property-engine, 14 files: phone-only, no property_id, no name/email — cannot become an enquiry or a contact message); property-documents request (name+email only); investor security (no current-password field) |
| Binary upload missing | Verification uploads (buyer/owner/builder), property photos/documents/floor-plans/360 (wizard upload steps — honestly noticed, not silently dropped) |
| Duplicate of a wired flow | CRM assignment/transfer/follow-up/notes/tags portal copies; owner site-visit-approval (use wired CRM/visit pages) |
| Export/filter parameters don't exist | crm-export options (type/range/format beyond the existing leads CSV); analytics export-center; visit-requests Export/Reset |

## 4. Diff vs the original mapping (what to fix in Phase 1)

1. Correct the 8 rows in BUG-004 (login, register, inquiry, contact, wizard-step/edit,
   wizard-upload-notice, service-track, campaign-filter).
2. Original §1 counts pages per form from an older snapshot (e.g. newsletter 105 vs
   86 `data-api="newsletter"` forms found now; settings 34 vs 62; visit-request 49 vs
   50; wizard-step 32 vs 46). Regenerate counts from HTML, do not hand-edit.
3. Original §1 omits the `data-api` values' actual server validation/authorisation
   (this file's §2 adds it) and does not distinguish "client-side filter" from
   "server save" clearly enough for campaign-filter/site-search/section-search.
4. Keep the original's §3 section counts (verified) and its note that source demo
   rows persist even where runtime rendering is live.
