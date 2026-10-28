# FRONTEND ↔ BACKEND MAPPING — PrimePropertys

Generated from the actual source: `assets/js/forms.js` case blocks, `assets/js/api.js` helpers,
real `<form data-api="…">` tags in pages (inlined JS references excluded), `server/src/server.js` routes,
and audit counts. A form is "wired" when its handler calls a real API endpoint and shows success
only after a successful response. A form is "unwired" when it still carries `data-backend="not-connected"`.
Client-side cases (search navigation, in-page filters, calculators) are wired behaviour without a
server endpoint; they are marked as such and never claim a server save.

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
| `campaign-filter` | `/api/message-templates` | 1 — sections/marketing/campaigns.html |
| `change-password` | `/api/auth/change-password` | 5 — sections/agent-portal/security.html, sections/builder-portal/security.html, sections/buyer-portal/security-settings.html (+2 more) |
| `contact` | `/api/leads/` | 1 — contact.html |
| `emergency-support` | `/api/tickets` | 1 — sections/support-home-services/emergency-support.html |
| `faq-search` | `(client-side / navigation only)` | 2 — faq.html, help-center.html |
| `inquiry` | `(client-side / navigation only)` | 5 — sections/property-engine/contact-agent.html, sections/property-engine/contact-owner.html, sections/property-engine/make-enquiry.html (+2 more) |
| `login` | `(client-side / navigation only)` | 1 — login.html |
| `newsletter` | `/api/newsletter/subscribe` | 105 — about.html, accessibility.html, careers.html (+102 more) |
| `payment-checkout` | `/api/payments` | 1 — sections/payments/payment-checkout.html |
| `refund-request` | `/api/payments/` | 1 — sections/payments/refund-request.html |
| `register` | `(client-side / navigation only)` | 1 — register.html |
| `report-problem` | `/api/tickets` | 2 — report-problem.html, sections/property-engine/report-property.html |
| `section-search` | `(client-side / navigation only)` | 13 — sections/form-builder/conditional-logic.html, sections/form-builder/form-analytics.html, sections/form-builder/form-builder-dashboard.html (+10 more) |
| `service-assign` | `/api/service-requests/` | 1 — sections/support-home-services/complaint-tracking.html |
| `service-request` | `/api/service-requests` | 1 — sections/support-home-services/service-request-form.html |
| `service-schedule` | `/api/service-requests/` | 1 — sections/support-home-services/complaint-tracking.html |
| `service-track` | `/api/newsletter/subscribe` | 1 — sections/support-home-services/complaint-tracking.html |
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
| `wizard-choice` | `/api/tickets` | 3 — sections/post-property/select-property-category.html, sections/post-property/select-property-type.html, sections/post-property/select-purpose.html |
| `wizard-duplicate` | `(client-side / navigation only)` | 1 — sections/post-property/duplicate-check.html |
| `wizard-edit` | `(client-side / navigation only)` | 32 — sections/post-property/360-upload.html, sections/post-property/amenities.html, sections/post-property/contact-preferences.html (+29 more) |
| `wizard-quality` | `(client-side / navigation only)` | 1 — sections/post-property/listing-quality-score.html |
| `wizard-step` | `(client-side / navigation only)` | 32 — sections/post-property/360-upload.html, sections/post-property/amenities.html, sections/post-property/contact-preferences.html (+29 more) |
| `wizard-submit` | `(client-side / navigation only)` | 1 — sections/post-property/submit-property.html |
| `wizard-upload-notice` | `/api/tickets` | 32 — sections/post-property/360-upload.html, sections/post-property/amenities.html, sections/post-property/contact-preferences.html (+29 more) |
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

