# FRONTEND ↔ BACKEND MAPPING — PrimePropertys

Generated from the actual source: `assets/js/forms.js` case blocks, `assets/js/api.js` helpers, 
real `<form data-api="…">` tags in pages (inlined JS references excluded), `server/src/server.js` routes, 
and audit counts. A form is "wired" when its handler calls a real API endpoint and shows success 
only after a successful response. A form is "unwired" when it still carries `data-backend="not-connected"`.

## 1. Wired forms (`data-api` → endpoint → pages)

| Form (`data-api`) | Endpoint | Pages |
|---|---|---|
| `assign` | `/api/leads/ + id` | 1 — sections/central-crm/lead-assignment.html |
| `contact` | `/api/contact (via PP.submitContact)` | 1 — contact.html |
| `inquiry` | `/api/inquiries (via PP.submitInquiry)` | 5 — sections/property-engine/contact-owner.html, sections/property-engine/contact-agent.html, sections/property-engine/make-enquiry.html (+2 more) |
| `login` | `/api/auth/login (via PP.login)` | 1 — login.html |
| `newsletter` | `/api/newsletter/subscribe` | 70 — sections/property-search/advanced-search.html, sections/property-search/buy-properties.html, sections/property-search/commercial-properties.html (+67 more) |
| `register` | `/api/auth/register (via PP.register)` | 1 — register.html |
| `service-assign` | `/api/service-requests/ + id` | 1 — sections/support-home-services/complaint-tracking.html |
| `service-request` | `/api/service-requests` | 1 — sections/support-home-services/service-request-form.html |
| `service-schedule` | `/api/service-requests/ + id` | 1 — sections/support-home-services/complaint-tracking.html |
| `service-track` | `(navigation only)` | 1 — sections/support-home-services/complaint-tracking.html |
| `ticket` | `/api/tickets` | 1 — sections/support-home-services/contact-support.html |
| `ticket-assign` | `/api/tickets/ + id` | 1 — sections/super-manager/ticket-details.html |
| `ticket-reply` | `/api/tickets/ + id` | 1 — sections/super-manager/ticket-details.html |
| `transfer` | `/api/leads/ + id` | 1 — sections/central-crm/lead-transfer.html |
| `visit-assign` | `/api/site-visits/ + id` | 1 — sections/site-visit/assign-agent.html |
| `visit-feedback` | `/api/site-visits/ + id` | 1 — sections/site-visit/visit-feedback.html |
| `visit-request` | `/api/site-visits` | 1 — sections/site-visit/site-visit-dashboard.html |

## 2. API routes present in `server/src/server.js`

- `/api/auth/change-password`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/register`
- `/api/auth/request-password-reset`
- `/api/auth/request-verification`
- `/api/auth/reset-password`
- `/api/auth/verify-email`
- `/api/contact`
- `/api/followups`
- `/api/health`
- `/api/inquiries`
- `/api/inquiries/mine`
- `/api/leads`
- `/api/leads/export`
- `/api/leads/scores`
- `/api/leads/sla`
- `/api/leads/stats`
- `/api/newsletter/subscribe`
- `/api/newsletter/unsubscribe`
- `/api/notifications`
- `/api/properties`
- `/api/properties/mine`
- `/api/recently-viewed`
- `/api/saved`
- `/api/service-requests`
- `/api/service-requests/stats`
- `/api/site-visits`
- `/api/site-visits/analytics`
- `/api/site-visits/stats`
- `/api/tags`
- `/api/tickets`
- `/api/users`

## 3. Unwired forms by section (`data-backend="not-connected"`, occurrences)

| Section | Unwired forms | Blocking reason |
|---|---|---|
| root | 263 | Root-level pages: mixed demo and landing widgets. |

Total unwired occurrences: 263 (down from 333 after the newsletter slice wired 70 footer forms).

## 4. Notes

- Live tables (not forms) are wired in `assets/js/groups/*.js`: CRM lists, visit lists, ticket tables, service tables, portal my-lists, saved/recent/my-enquiries pages.
- Auth model: session cookie `pp_session` (HttpOnly, SameSite=Lax); every protected route checks the session and the permission server-side; see `server/src/auth.js` and `DEPLOYMENT.md` for the known Secure-flag gap on plain HTTP.
- Email: no provider configured. `EMAIL_BACKEND=console` prints links to the server log; otherwise contact/password-reset flows return 503 EMAIL_NOT_CONFIGURED. Newsletter subscription stores consent only and never claims an email was sent.
- Binary upload is not implemented anywhere (validated URL references only).