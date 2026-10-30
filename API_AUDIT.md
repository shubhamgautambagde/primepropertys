# PRIME CMS — API Audit

Date: 2026-10-30. Base: the Node dispatcher in
`server/src/server.js` + domain modules. 52 distinct
`/api/` path patterns (prefix routes with `:id` segments
counted once). All responses are JSON. Auth is the
`pp_session` cookie unless noted.

## 1. Conventions (verified across modules)

- Success: `{ok:true, ...}` with the resource or
  `{data, pagination}` for lists. Property detail returns
  the row at top level.
- Errors: JSON with status code + code + message.
  400 validation / malformed JSON, 401 unauthenticated,
  404 unknown route or invisible record, 405 wrong method,
  429 throttled.
- **Visibility rule: 404, not 403.** Drafts, other users'
  private records, and strangers' resources return 404.
- Pagination: `?limit=&offset=`; modules disagree on an
  empty `limit` (strict → 400, lenient → 20) — preserved
  as-is; new CMS endpoints must document their own rule.
- Rate limits are DB-backed where they exist (login
  throttle, inquiry/contact/newsletter attempt tables in
  the port line; Node line: login throttle + validation).
- No CSRF tokens anywhere (documented gap). No API keys
  yet (Phase 11 of the CMS plan).

## 2. Endpoint families

### Health & auth

| Method & path | Auth | Notes |
| --- | --- | --- |
| GET /api/health | — | status + db + version |
| POST /api/auth/register | — | self-service roles only |
| POST /api/auth/login | — | throttled 5/IP+email/10 min → 429 |
| POST /api/auth/logout | cookie | clears session |
| GET /api/auth/me | cookie | user + roles + permissions |
| POST /api/auth/change-password | cookie | old password required |
| POST /api/auth/request-password-reset | — | 503 when no email backend; never leaks existence |
| POST /api/auth/reset-password | token | 1h expiry |
| POST /api/auth/request-verification | cookie | verification token |
| POST/GET /api/auth/verify-email | token | 24h expiry |

### Users

| Method & path | Auth | Notes |
| --- | --- | --- |
| GET /api/users | `users:manage` | admin list |
| GET/PATCH /api/users/:id | `users:manage` or self-scope | status + role edits; own-role edit refused |

### Properties

| Method & path | Auth | Notes |
| --- | --- | --- |
| GET /api/properties | — | public list: filters, sorts, pagination |
| POST /api/properties | auth | create incl. 51 wizard columns |
| GET /api/properties/mine | auth | owner's listings |
| GET /api/properties/:id | visibility | draft: owner only, else 404 |
| PATCH /api/properties/:id | owner/staff | edit; revert-to-draft supported |
| POST /api/properties/:id/publish, /unpublish | `properties:publish_any` | |
| DELETE /api/properties/:id | owner/staff | soft delete |
| GET /api/saved, /api/recently-viewed | auth | |
| POST/DELETE /api/properties/:id/save | auth | save/unsave |
| GET /api/properties/:id/similar | visibility | |

### Leads / CRM

| Method & path | Auth | Notes |
| --- | --- | --- |
| POST /api/inquiries | — | published-property only; duplicate flagged; rate-limited |
| GET /api/inquiries/mine | auth | own enquiries |
| GET /api/leads | staff visibility | view_any / owner / assigned |
| GET /api/leads/:id | staff visibility | detail + timeline |
| PATCH /api/leads/:id | staff | status workflow map enforced |
| POST /api/leads/:id/notes, /assign, /tags, /followups | staff | +5 scoring rules, capped |
| GET /api/leads/scores, /sla, /stats, /export | staff | export = CSV |
| GET /api/followups | staff | visible follow-ups |
| GET /api/notifications, /api/notifications/:id | auth | in-app only; no mark-all-read |
| GET /api/tags | staff | |

### Visits, tickets, services

| Method & path | Auth | Notes |
| --- | --- | --- |
| POST/GET /api/site-visits | auth | request + list |
| GET /api/site-visits/stats, /analytics | staff | |
| PATCH /api/site-visits/:id | requester/staff | cancel, reschedule stamp, feedback-on-completed, assign |
| POST/GET /api/tickets | auth | create + list |
| GET/PATCH /api/tickets/:id, POST /:id/replies | requester/staff | workflow + requester-close + assign |
| POST/GET /api/service-requests | auth | create + list |
| GET /api/service-requests/stats | staff | |
| PATCH /api/service-requests/:id | requester/staff | workflow + requester-cancel + schedule/assign |

### Payments, campaigns, settings, contact, newsletter

| Method & path | Auth | Notes |
| --- | --- | --- |
| GET/POST /api/payments | staff/payer scope | offline records; verify/reject/refund |
| GET/PUT /api/billing-profile | auth | own profile |
| GET/POST /api/campaigns (+/:id) | staff | rupee→paise budgets, status flow |
| GET/POST /api/message-templates (+/:id) | staff | per channel |
| GET/POST /api/queued-messages | staff | QUEUED only — never sent |
| GET/PUT /api/settings | `settings:manage` | 4-key allowlist; secrets → 400 |
| POST /api/contact | — | fixed subjects, digits-only phone, rate-limited |
| POST /api/newsletter/subscribe, /unsubscribe | — | neutral unsubscribe (no existence leak) |

### Uploads

| Method & path | Auth | Notes |
| --- | --- | --- |
| POST /api/properties/:id/uploads | owner/staff | multipart, magic-byte sniffing, 10 MB images / 25 MB docs, server-generated names, replace-by-id |
| GET /api/properties/:id/uploads | visibility | |
| GET /api/uploads/:id/file | gated | inline images, attachment docs, private → 404 |
| PATCH/DELETE /api/uploads/:id | owner/staff | sort order, delete |

## 3. Missing API families (CMS work)

No endpoints exist yet for: pages, revisions, templates,
menus, media library (beyond property uploads), themes,
plugins, forms + submissions, SEO metadata + redirects,
custom content types, websites/domains, activity logs,
API keys, backups, or admin audit. Every one of these is
specified in CMS_DEVELOPMENT_PLAN.md with the same
conventions as above (cookie auth, permission checks,
validation, pagination, 404 visibility, audit logging).

## 4. Compatibility rules for new CMS endpoints

1. Never change an existing path's method, shape, or
   status codes.
2. New paths live under `/api/cms/*` or a new top-level
   family (`/api/pages`, `/api/menus`, …) — never by
   overloading an existing path.
3. Every mutating CMS endpoint checks a permission
   (existing or new `cms:*` permission, seeded by its
   migration) and writes an activity-log row.
4. Every list endpoint paginates and documents its
   empty-`limit` behaviour.
5. Public CMS reads (published pages, menus, published
   posts) need no auth; drafts and admin reads need auth
   + permission, with 404 for invisible records.
