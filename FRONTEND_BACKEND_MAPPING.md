# FRONTEND ↔ BACKEND MAPPING — PrimePropertys

Generated from the actual source: `assets/js/forms.js` case blocks, `assets/js/api.js` helpers,
real `<form data-api="…">` tags in pages (inlined JS references excluded), `server/src/server.js` routes,
and audit counts. A form is "wired" when its handler calls a real API endpoint and shows success
only after a successful response. A form is "unwired" when it still carries `data-backend="not-connected"`.
Client-side cases (search navigation, in-page filters, calculators) are wired behaviour without a
server endpoint; they are marked as such and never claim a server save.

Endpoint column corrected 2026-10-28 (Priority 1) from FRONTEND_BACKEND_MAPPING_AUDIT.md (BUG-004): login, register, inquiry, contact, wizard-step, wizard-edit, wizard-upload-notice, service-track, campaign-filter, wizard-choice. Page counts in §1 are distinct-file counts, re-verified 2026-10-28 by counting distinct HTML files per `data-api` value; they differ from occurrence counts (e.g. newsletter 105 files / 106 forms, settings 34 files / 62 forms) because a page can carry more than one form of the same type.

## 1. Wired forms (`data-api` → endpoint → pages)

| Form (`data-api`) | Endpoint | Pages |
|---|---|---|
| `assign` | `/api/leads/` | 1 — sections/central-crm/lead-assignment.html |
| `billing-profile` | `/api/billing-profile` | 12 — sections/payments/billing-profile.html, sections/payments/index.html, sections/payments/invoice-details.html (+9 more) |
| `calc-appr` | `(client-side / navigation only)` | 1 — sections/investor-portal/appreciation-calculator.html |
| `calc-roi` | `(client-side / navigation only)` | 1 — sections/investor-portal/property-roi-calculator.html |
| `calc-yield` | `(client-side / navigation only)` | 1 — sections/investor-portal/rental-yield-calculator.html |
| `campaign-create` | `/api/campaigns/` | 1 — sections/marketing/create-campaign.html |
| `campaign-edit` | `/api/campaigns/` | 17 — sections/marketing/affiliate.html, sections/marketing/agent-promotion.html, sections/marketing/banner-ads.html (+14 more) |
| `campaign-filter` | `(client-side filter)` | 1 — sections/marketing/campaigns.html |
| `change-password` | `/api/auth/change-password` | 5 — sections/agent-portal/security.html, sections/builder-portal/security.html, sections/buyer-portal/security-settings.html (+2 more) |
| `contact` | `/api/contact` | 1 — contact.html |
| `emergency-support` | `/api/tickets` | 1 — sections/support-home-services/emergency-support.html |
| `faq-search` | `(client-side / navigation only)` | 2 — faq.html, help-center.html |
| `inquiry` | `/api/inquiries` | 5 — sections/property-engine/contact-agent.html, sections/property-engine/contact-owner.html, sections/property-engine/make-enquiry.html (+2 more) |
| `login` | `/api/auth/login` | 1 — login.html |
| `newsletter` | `/api/newsletter/subscribe` | 105 — about.html, accessibility.html, careers.html (+102 more) |
| `payment-checkout` | `/api/payments` | 1 — sections/payments/payment-checkout.html |
| `refund-request` | `/api/payments/` | 1 — sections/payments/refund-request.html |
| `register` | `/api/auth/register` | 1 — register.html |
| `report-problem` | `/api/tickets` | 2 — report-problem.html, sections/property-engine/report-property.html |
| `section-search` | `(client-side / navigation only)` | 13 — sections/form-builder/conditional-logic.html, sections/form-builder/form-analytics.html, sections/form-builder/form-builder-dashboard.html (+10 more) |
| `service-assign` | `/api/service-requests/` | 1 — sections/support-home-services/complaint-tracking.html |
| `service-request` | `/api/service-requests` | 1 — sections/support-home-services/service-request-form.html |
| `service-schedule` | `/api/service-requests/` | 1 — sections/support-home-services/complaint-tracking.html |
| `service-track` | `(client-side redirect to complaint-tracking.html?request_id=)` | 1 — sections/support-home-services/complaint-tracking.html |
| `settings` | `/api/settings` | 34 — sections/security-center/security-settings.html, sections/super-admin/ai-settings.html, sections/super-admin/system-settings.html (+31 more) |
| `site-search` | `(client-side / navigation only)` | 4 — index.html, sections/investor-portal/investment-search.html, sections/mobile/mobile-ui.html (+1 more) |
| `sms-message` | `/api/queued-messages` | 15 — sections/communication/chat.html, sections/communication/communication-preferences.html, sections/communication/conversations.html (+12 more) |
| `template` | `/api/message-templates` | 4 — sections/communication/email-templates.html, sections/communication/notification-templates.html, sections/communication/sms-templates.html (+1 more) |
| `ticket` | `/api/tickets` | 1 — sections/support-home-services/contact-support.html |
| `ticket-assign` | `/api/tickets/` | 1 — sections/super-manager/ticket-details.html |
| `ticket-reply` | `/api/tickets/` | 1 — sections/super-manager/ticket-details.html |
| `transfer` | `/api/leads/` | 1 — sections/central-crm/lead-transfer.html |
| `visit-assign` | `/api/site-visits/` | 1 — sections/site-visit/assign-agent.html |
| `visit-feedback` | `/api/site-visits/` | 1 — sections/site-visit/visit-feedback.html |
| `visit-request` | `/api/site-visits` | 49 — sections/central-crm/agent-performance.html, sections/central-crm/all-leads.html, sections/central-crm/call-history.html (+46 more) |
| `whatsapp-message` | `/api/queued-messages` | 15 — sections/communication/chat.html, sections/communication/communication-preferences.html, sections/communication/conversations.html (+12 more) |
| `wizard-choice` | `(client-side / sessionStorage only)` | 3 — sections/post-property/select-property-category.html, sections/post-property/select-property-type.html, sections/post-property/select-purpose.html |
| `wizard-duplicate` | `(client-side / navigation only)` | 1 — sections/post-property/duplicate-check.html |
| `wizard-edit` | `/api/properties` (PATCH via post-property.js) | 32 — sections/post-property/360-upload.html, sections/post-property/amenities.html, sections/post-property/contact-preferences.html (+29 more) |
| `wizard-quality` | `(client-side / navigation only)` | 1 — sections/post-property/listing-quality-score.html |
| `wizard-step` | `/api/properties` (POST at description step, then PATCH via post-property.js) | 32 — sections/post-property/360-upload.html, sections/post-property/amenities.html, sections/post-property/contact-preferences.html (+29 more) |
| `wizard-submit` | `(client-side / navigation only)` | 1 — sections/post-property/submit-property.html |
| `wizard-upload-notice` | `(no API call; honest upload-not-implemented notice)` | 32 — sections/post-property/360-upload.html, sections/post-property/amenities.html, sections/post-property/contact-preferences.html (+29 more) |
| `wizard-verification` | `(client-side / navigation only)` | 1 — sections/post-property/verification.html |

## 2. API routes present in `server/src/server.js`

- `/api/auth/`
- `/api/auth/change-password`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/register`
- `/api/auth/request-password-reset`
- `/api/auth/request-verification`
- `/api/auth/reset-password`
- `/api/auth/verify-email`
- `/api/billing-profile`
- `/api/campaigns`
- `/api/campaigns/`
- `/api/contact`
- `/api/followups`
- `/api/health`
- `/api/inquiries`
- `/api/inquiries/mine`
- `/api/leads`
- `/api/leads/`
- `/api/leads/export`
- `/api/leads/scores`
- `/api/leads/sla`
- `/api/leads/stats`
- `/api/message-templates`
- `/api/message-templates/`
- `/api/newsletter/subscribe`
- `/api/newsletter/unsubscribe`
- `/api/notifications`
- `/api/notifications/`
- `/api/payments`
- `/api/payments/`
- `/api/properties`
- `/api/properties/`
- `/api/properties/mine`
- `/api/queued-messages`
- `/api/queued-messages/`
- `/api/recently-viewed`
- `/api/saved`
- `/api/service-requests`
- `/api/service-requests/`
- `/api/service-requests/stats`
- `/api/settings`
- `/api/site-visits`
- `/api/site-visits/`
- `/api/site-visits/analytics`
- `/api/site-visits/stats`
- `/api/tags`
- `/api/tickets`
- `/api/tickets/`
- `/api/users`

## 3. Unwired forms by section (`data-backend="not-connected"`, occurrences)

- property-engine: 23
- analytics: 17
- builder-portal: 14
- seo: 14
- ai-intelligence: 13
- owner-portal: 9
- super-admin: 9
- agent-portal: 7
- form-builder: 5
- buyer-portal: 5
- subscription: 4
- central-crm: 4
- communication: 4
- manager-staff: 3
- marketing: 3
- property-search: 1
- security-center: 1
- site-visit: 1
- investor-portal: 1

## 4. Notes

- The remaining unwired forms are triaged in `TRIAGE.md` (same directory): each section's forms
  are classified as wired-by-this-slice, blocked on a missing domain, blocked on a missing
  decision/credential, or a duplicate of an already-wired flow (use the wired page with its `?id=`).
- `data-backend="not-connected"` occurrences are counted raw here; the audit's per-file bug count
  differs (one entry per file with at least one unwired form).
- Pages whose tables are rendered live from the API (admin user tables, CRM lists, portal lists)
  still contain static demo rows in source; at runtime the live render replaces them, so their
  View/Edit links are real even though the source still contains placeholder links.


## 5. Priority 2 additions (2026-10-28, working copy only)

New endpoints (all server-side authorised; see CHANGELOG "Priority 2" for the full rules):
- Builder Projects: `POST/GET /api/builder-projects`, `GET/PATCH /api/builder-projects/:id`, `POST …/submit|verify|publish|unpublish|archive`, `POST …/towers|units|milestones|amenities|documents|offers`, `PATCH …/units/:unitId/status`, `POST/GET …/enquiries`, `POST …/activities`. Frontend: live list on `sections/builder-portal/my-projects.html` (`#pp-builder-projects`).
- Reviews: `POST/GET /api/properties/:id/reviews`, `PATCH/DELETE /api/reviews/:id`, `POST /api/reviews/:id/report`. Frontend: approved reviews on `sections/property-engine/property-details.html` (`#pp-property-reviews`).
- Tasks: `POST/GET /api/tasks`, `GET/PATCH /api/tasks/:id`, `POST /api/tasks/:id/comments`, `GET /api/tasks/stats`. Frontend: live list on `sections/manager-staff/tasks.html` (`#pp-staff-tasks`).
- RBAC: `POST/GET /api/custom-roles`, `GET/PATCH/DELETE /api/custom-roles/:id`, `POST /api/custom-roles/assign|unassign`, `GET /api/admin-audit-log`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`, `POST /api/auth/revoke-other-sessions`. Frontend: roles list on `sections/super-admin/roles.html`, audit log on `sections/super-admin/audit-logs.html`.
- Subscriptions: `GET/POST /api/subscription-plans`, `PATCH /api/subscription-plans/:id`, `POST /api/subscriptions`, `GET /api/subscriptions/mine`, `GET /api/subscriptions/entitlement`, `POST /api/subscriptions/:id/activate|change-plan|cancel|expire`, `GET /api/subscriptions/:id/invoices`, `POST/DELETE /api/properties/:id/feature`, `POST /api/coupons`, `POST /api/coupons/apply|redeem`, `POST /api/webhooks/payment` (501 stub, never activates). Frontend: plans on `sections/subscription/plans.html`, my subscription + entitlement on `sections/subscription/my-subscription.html`.
- Chat: `POST/GET /api/conversations`, `GET /api/conversations/:id`, `POST/GET /api/conversations/:id/messages`, `POST /api/conversations/:id/read`, `GET/PUT /api/notification-preferences`. Frontend: conversation list on `sections/communication/conversations.html` (`#pp-conversations`).
- Demo create/compose forms on add-project, reviews, tasks, chat and subscription checkout pages were NOT converted (their field names do not map to the API) and keep the honest demo notice; they are not counted as wired above.
