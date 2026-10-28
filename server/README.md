# PrimePropertys backend

Zero-dependency Node.js (>= 24) server + SQLite. It serves the static
site from the repository root and a full read/write JSON API under
`/api`. (This README replaces the old "Stage D / read-only API"
description: the API now covers auth, properties, leads/CRM, contact,
site visits, support tickets, service requests and newsletter
subscriptions.)

## Run

```sh
cd server
node src/server.js            # http://127.0.0.1:8902
PORT=8903 DATABASE_PATH=/tmp/app.db node src/server.js
```

No `npm install` is needed: the server uses only Node's standard library
(`node:http`, `node:sqlite`). The database file is created on first run
and migrations in `migrations/` are applied automatically, in filename
order, tracked in `schema_migrations`.

Environment variables: `PORT` (default 8902), `DATABASE_PATH`,
`STATIC_ROOT`, `EMAIL_BACKEND` (`console` prints email links to the
server log; otherwise email-dependent flows answer 503
`EMAIL_NOT_CONFIGURED` — no email provider is configured).

There is no default admin. Create the first admin directly against the
database (see `DEPLOYMENT.md` for the exact steps).

## Conventions (all routes)

- Errors are `{error:{code,message}}`. Never a stack trace.
- Invisible resources return **404, not 403**, so existence is never
  leaked (leads, visits, tickets, service requests, drafts).
- Auth is a session cookie `pp_session` (HttpOnly, SameSite=Lax).
  Every protected operation checks the session **and** the permission
  server-side; hiding a button is never the authorization mechanism.
- Login throttling: 5 failed attempts per IP + email per 10 minutes
  → 429.
- List endpoints are paginated (`?limit=` 1–100, `?offset=`).
- Gzip is applied to text responses >= 1 KB when the client accepts it.
- Security headers on every response, including CSV: nosniff,
  SAMEORIGIN, strict-origin-when-cross-origin, and a CSP that allows
  the build's genuine inline scripts/styles plus Unsplash images only.
  Known gap: the session cookie has no `Secure` flag on plain HTTP —
  add it on HTTPS hosting.

## Auth

Passwords are scrypt hashes; sessions store token hashes only (never
raw tokens). Password-reset tokens live 1 hour, email-verification
tokens 24 hours. Self-registration is limited to Buyer, Seller, Owner,
Agent, Builder and Investor. 9 roles, 15 permissions (see
`migrations/002_auth.sql`).

| Route | Description |
|---|---|
| `POST /api/auth/register` | Self-registration (6 roles only) |
| `POST /api/auth/login` | Sets the session cookie |
| `POST /api/auth/logout` | Invalidates the session |
| `GET /api/auth/me` | Current user |
| `POST /api/auth/change-password` | Logged-in password change |
| `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password` | Reset flow (503 without an email provider; console backend prints the link) |
| `POST /api/auth/request-verification`, `POST /api/auth/verify-email` | Email verification (same provider caveat) |
| `GET /api/users` | User list; needs `users:manage`; never returns password hashes |

## Properties

All writes require login; ownership or the matching `*_any` permission
is enforced on every write. Drafts are never visible to non-owners
(404). Creating always starts as `draft`; only
`properties:publish_any` (Admin/Super Admin) can publish — that is the
approval step. Editing a published listing as a non-publisher sends it
back to `draft` for re-approval. Delete is a soft delete
(`deleted_at`). Images are URL references only — binary multipart
upload is not implemented.

| Route | Description |
|---|---|
| `GET /api/properties` | Public list: published only, with filters/sort/pagination |
| `GET /api/properties/mine` | Own listings (`?status=` draft/published/sold/rented) |
| `POST /api/properties` | Create (needs `properties:create`); always starts `draft` |
| `GET /api/properties/:id` | Detail (with images) |
| `PATCH /api/properties/:id` | Edit own (`edit_own`) or any (`edit_any`); status cannot be set directly |
| `POST /api/properties/:id/publish`, `POST /api/properties/:id/unpublish` | Approval step (needs `properties:publish_any`) |
| `DELETE /api/properties/:id` | Soft delete |
| `POST /api/properties/:id/images`, `DELETE /api/properties/:id/images/:imageId` | Image URL references |
| `POST /api/properties/:id/save`, `DELETE /api/properties/:id/save` | Save / unsave |
| `GET /api/saved`, `GET /api/recently-viewed` | Own saved properties and recent views |

## Leads + CRM

Inquiries ARE leads: website submissions land in `inquiries` and are
worked through the pipeline there. Enforced transitions:
`new → contacted → interested → site_visit → negotiation → closed/lost`;
`closed`/`lost` are terminal. Visibility: `leads:view_any` sees all;
otherwise a user sees leads on their own properties or assigned to
them; invisible leads return 404.

| Route | Description |
|---|---|
| `POST /api/inquiries` | Public capture (rate-limited 10/hour per IP). Property must be published. Duplicates (same property + phone/email in 30 days) are flagged via `duplicate_of`, not rejected. Phone comparison normalizes +91/trunk-0 |
| `GET /api/inquiries/mine` | Own enquiries — matched by user_id only, never by email |
| `GET /api/leads`, `GET /api/leads/:id` | List (filters: status, assigned_to, property_id) + detail |
| `PATCH /api/leads/:id` | Status move (invalid transitions → 400); every move is logged as an activity |
| `POST /api/leads/:id/assign` | Needs `leads:assign`; logs activity + creates an in-app notification for the assignee |
| `POST /api/leads/:id/notes`, `GET /api/leads/:id/activities` | Notes + full activity log |
| `POST /api/leads/:id/followups`, `GET /api/leads/:id/followups`, `PATCH /api/leads/:id/followups/:fid/done` | Follow-ups with due dates and completion |
| `GET /api/followups` | Follow-ups visible to the caller |
| `GET /api/tags`, `GET/POST /api/leads/:id/tags`, `DELETE /api/leads/:id/tags/:tagId` | Free-form tags (max 50 chars, deduped case-insensitively); add/remove logged to the timeline |
| `GET /api/leads/scores` | Score = stage points (new 10 / contacted 25 / interested 50 / site_visit 70 / negotiation 85) + 5/note (max 15) + 5/completed follow-up (max 15), capped at 100; closed = 100 Won, lost = 0 Lost; bands Hot ≥70, Warm ≥40, else Cool. Profile/budget signals are NOT in the data and are not claimed |
| `GET /api/leads/sla` | Targets from the SLA page's own copy: first contact within 1 hour, follow-up within 24 hours; breach = first response >1h, no follow-up within 24h while older than 24h, or any past-due open follow-up; closed/lost stop tracking |
| `GET /api/leads/stats` | Total, by-status, funnel, by-source, top properties, by-assignee + conversion % |
| `GET /api/leads/export` | CSV download; needs `leads:export` (Admin/Super Admin) |
| `GET /api/notifications`, `POST /api/notifications/:id/read` | Own in-app notifications, unread first |

Notifications are in-app database rows only. No email/SMS/WhatsApp
sending is configured or claimed.

## Contact

| Route | Description |
|---|---|
| `POST /api/contact` | Public message (rate-limited 20/hour per IP); subject must be one of the listed subjects |
| `GET /api/contact` | Inbox; needs `contact:view` |

## Site visits

Statuses: requested → confirmed/rejected/cancelled;
confirmed → completed/cancelled; completed/rejected/cancelled terminal.
Visibility mirrors leads: requester, property owner, assignee, and
`visits:manage` holders (Admin, Super Admin). A requester may cancel
their own requested/confirmed visit. Feedback (text + 1–5 rating) only
on completed visits. Rescheduling keeps the status and stamps
`rescheduled_at`.

| Route | Description |
|---|---|
| `POST /api/site-visits` | Request (logged in, published property only, future date only) |
| `GET /api/site-visits`, `GET /api/site-visits/:id` | Visibility-scoped list (`?status=`, `?property_id=`) + detail |
| `PATCH /api/site-visits/:id` | Status / reschedule / feedback / rating per the rules above |
| `POST /api/site-visits/:id/assign` | Needs `visits:manage`; assignee gains visibility |
| `GET /api/site-visits/stats`, `GET /api/site-visits/analytics` | Counts; analytics = totals, rates, top properties, agent totals, upcoming 7 days (no by-source: visits carry no source field) |

## Support tickets

Statuses: open → in_progress → resolved → closed, plus open→closed
and resolved→in_progress (reopen); closed terminal. Visibility:
requester, assignee, `tickets:manage` holders (Admin, Super Admin,
Support). A requester may close their own ticket from any open state,
including resolved; reopening is staff-only.

| Route | Description |
|---|---|
| `POST /api/tickets` | Create (subject ≤200, message ≤2000, priority low/medium/high) |
| `GET /api/tickets`, `GET /api/tickets/:id` | Visibility-scoped list (`?status=`, `?priority=`) + detail with reply thread |
| `PATCH /api/tickets/:id` | Status change |
| `POST /api/tickets/:id/assign` | Needs `tickets:manage` |
| `POST /api/tickets/:id/replies` | Anyone who can see the ticket |

## Service requests

Statuses: requested → assigned → scheduled → in_progress → completed,
plus cancelled from any open state; completed/cancelled terminal.
Visibility mirrors tickets: requester, assignee, `services:manage`
holders (Admin, Super Admin, Support). A requester may cancel their own
request from any open state. `preferred_date` + `time_slot` are the
user's ask; `scheduled_at` is the staff-confirmed time.

| Route | Description |
|---|---|
| `POST /api/service-requests` | Create (all form fields required; urgency low/normal/high) |
| `GET /api/service-requests`, `GET /api/service-requests/:id` | Visibility-scoped list (`?status=`, `?category=`) + detail |
| `PATCH /api/service-requests/:id` | Status and/or `scheduled_at` (assigned→scheduled sets the status; scheduled→reschedule keeps it; must be a future date/time) |
| `POST /api/service-requests/:id/assign` | Needs `services:manage`; requested→assigned, stamps `assigned_at` |
| `GET /api/service-requests/stats` | Total, by-status, in_progress (= assigned + scheduled + in_progress), resolved (= completed), closed (= cancelled) |

## Newsletter

Subscription stores consent only and never claims an email was sent
(no provider is configured). Token-based confirm/unsubscribe waits for
a provider, since tokens cannot be delivered without one.

| Route | Description |
|---|---|
| `POST /api/newsletter/subscribe` | Subscribe (rate-limited 20/hour per IP); duplicate → 200 `already_subscribed` (case-insensitive); resubscribe → 200 `resubscribed` |
| `POST /api/newsletter/unsubscribe` | Always answers neutrally, so it cannot enumerate subscribers |

## Health

| Route | Description |
|---|---|
| `GET /api/health` | Version string + status (used by tests to wait for startup) |

## Migrations

| File | Contents |
|---|---|
| `001_init.sql` | users (9 roles), properties, property_images, inquiries, saved_properties |
| `002_auth.sql` | sessions (token hashes only), reset tokens (1h), verification tokens (24h), 15 permissions |
| `003_properties.sql` | property_views |
| `004_leads.sql` | Lead pipeline support (notes, follow-ups, activities, notifications) |
| `005_contact.sql` | contact_messages + `contact:view` |
| `006_inquiries_user.sql` | inquiries.user_id |
| `007_lead_tags.sql` | tags + lead_tags |
| `008_perf_indexes.sql` | Indexes (properties status-first; inquiries assigned/status/source; followups due_at) |
| `009_site_visits.sql` | site_visits + `visits:manage` |
| `010_visit_assignment.sql` | site_visits.assigned_to |
| `011_support_tickets.sql` | support_tickets + ticket_replies + `tickets:manage` |
| `012_service_requests.sql` | service_requests + `services:manage` |
| `013_newsletter.sql` | newsletter_subscriptions |

Migrations run inside a transaction each and are recorded in
`schema_migrations`; a failed migration rolls back and aborts startup
rather than leaving a half-applied schema. Never edit an applied
migration — add a new forward migration instead. Production data is
never touched by tests (they use temporary databases).

## Tests

```sh
npm test    # 54 tests across 15 files, all passing (Node.js >= 24)
```

Covered: auth/RBAC, properties, leads/CRM (incl. tags, scores, SLA,
stats, export), contact, my-enquiries, visits, tickets, services,
portal lists, newsletter, performance (gzip, headers, indexes),
accessibility, and one end-to-end journey test. The `test` script in
`package.json` lists files explicitly — add a new test file there.
