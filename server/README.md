# PrimePropertys backend — Stage D

Zero-dependency Node.js (>= 24) server + SQLite. It serves the static site
from the repository root and a read-only JSON API under `/api`.

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

## API (Stage D + E + F + G)

### Leads + CRM (Stage G)

Inquiries ARE leads: website submissions land in `inquiries` and are
worked through the pipeline there. Pipeline (enforced transitions):
`new → contacted → interested → site_visit → negotiation → closed/lost`;
`closed`/`lost` are terminal. Visibility: `leads:view_any` sees all;
otherwise a user sees leads on their own properties or assigned to them;
invisible leads return 404, not 403.

| Route | Description |
|---|---|
| `POST /api/inquiries` | Public capture (rate-limited 10/hour per IP). Property must be published. Duplicates (same property + phone/email in 30 days) are flagged via `duplicate_of`, not rejected. Phone comparison normalizes +91/trunk-0 |
| `GET /api/leads`, `GET /api/leads/:id` | List (filters: status, assigned_to, property_id) + detail, per visibility above |
| `PATCH /api/leads/:id` | Status move (invalid transitions → 400); every move is logged as an activity |
| `POST /api/leads/:id/assign` | Needs `leads:assign`; logs activity + creates an in-app notification for the assignee |
| `POST /api/leads/:id/notes`, `GET /api/leads/:id/activities` | Notes + full activity log |
| `POST /api/leads/:id/followups`, `GET .../followups`, `PATCH .../followups/:fid/done` | Follow-ups with due dates and completion |
| `GET /api/leads/export` | CSV download; needs `leads:export` (Admin/Super Admin) |
| `GET /api/notifications`, `POST /api/notifications/:id/read` | Own in-app notifications, unread first |

Notifications are in-app database rows only. No email/SMS/WhatsApp sending
is configured or claimed; external notification delivery is Stage J work
alongside the email provider.

## API (Stage D + E + F)

### Properties (Stage F)

All writes require login; ownership or the matching `*_any` permission is
enforced on every write. Drafts are never visible to non-owners (404).
Creating a listing always starts as `draft`; only `properties:publish_any`
(Admin/Super Admin) can publish — this is the approval step. Editing a
published listing as a non-publisher sends it back to `draft` for
re-approval. Delete is a soft delete (`deleted_at`).

| Route | Description |
|---|---|
| `POST /api/properties` | Create (needs `properties:create`); validated fields; always starts `draft` |
| `PATCH /api/properties/:id` | Edit own (`edit_own`) or any (`edit_any`); status cannot be set directly |
| `POST /api/properties/:id/publish` | Approval step (needs `properties:publish_any`) |
| `POST /api/properties/:id/unpublish` | Owner or `publish_any`; back to `draft` |
| `DELETE /api/properties/:id` | Soft delete (owner `delete_own` or `delete_any`) |
| `GET /api/properties/mine` | Caller's own listings including drafts |
| `POST /api/properties/:id/images`, `DELETE /api/properties/:id/images/:imageId` | Image references by URL only; URL must be http(s), no credentials, no dangerous schemes |
| `POST /api/properties/:id/save`, `DELETE .../save`, `GET /api/saved` | Save/unsave + saved list |
| `GET /api/recently-viewed` | Caller's recently viewed properties, most recent first |
| `GET /api/properties/:id/similar` | Same city + type, published, excluding self, max 6 |
| `GET /api/properties?sort=` | `newest` (default), `price_asc`, `price_desc`, `area_desc` |

Honest limitation: Stage F stores image *references* (URLs, as the site
already uses Unsplash URLs) with strict validation. Binary multipart file
upload with disk storage and MIME sniffing is NOT implemented yet — there
is no disk upload path to secure, so none is claimed.

## API (Stage D + E)

### Auth (Stage E)

Passwords are hashed with scrypt (Node stdlib); sessions are server-side
rows and the cookie holds only a random token (HttpOnly, SameSite=Lax).
Self-registration allows Buyer, Seller, Owner, Agent, Builder, Investor
only — Admin, Super Admin and Support can never self-register. Login is
throttled: 5 failed attempts per IP+email in 10 minutes → 429.

| Route | Description |
|---|---|
| `POST /api/auth/register` | `{email, password (8+ chars, letters+digits), full_name?, phone?, role?}` → 201 with user (no password hash) + permissions, session cookie set |
| `POST /api/auth/login` | → 200 with user + permissions, session cookie set; wrong credentials 401, suspended 403, throttled 429 |
| `POST /api/auth/logout` | Deletes the session, clears the cookie |
| `GET /api/auth/me` | Current user + permissions; 401 without a session |
| `POST /api/auth/change-password` | `{current_password, new_password}`; revokes other sessions |
| `POST /api/auth/request-password-reset` | Creates a reset token (1h). Requires `EMAIL_BACKEND=console` (default, dev only: link printed to server log); otherwise 503 EMAIL_NOT_CONFIGURED — no fake "email sent" claim |
| `POST /api/auth/reset-password` | `{token, new_password}`; single-use, revokes all sessions |
| `POST /api/auth/request-verification`, `POST /api/auth/verify-email` | Email verification tokens (24h); same console-backend rule as reset |

Draft listings: the owner (or a user with `properties:view_any`) can fetch
their own draft via `GET /api/properties/:id`; everyone else — including
other logged-in users — gets 404, so draft existence is not leaked (IDOR
protection, tested).

Permissions are granular (`properties:create/edit_own/edit_any/publish_any/
delete_own/delete_any/view_any`, `leads:view_own/view_any/assign/export`,
`users:manage`, `content:manage`, `payments:view`, `settings:manage`) and
seeded per role in migration 002. `GET /api/auth/me` returns the caller's
permission list.

### Email

No email provider is configured (plan rule: document, don't invent).
`EMAIL_BACKEND=console` prints reset/verification links to the server log
for development. Production email (SMTP/API provider + credentials via
environment) is Stage G/J work; until then the request endpoints honestly
return 503 when the console backend is disabled.

## API (Stage D)

| Route | Description |
|---|---|
| `GET /api/health` | `{status:"ok", db:"ok", version:"stage-d"}` |
| `GET /api/properties` | Published, non-deleted listings. Filters: `city`, `property_type`, `listing_type`, `min_price`, `max_price`. Pagination: `limit` (1-100, default 20), `offset` (default 0). Response: `{data, pagination:{limit, offset, total}}` |
| `GET /api/properties/:id` | One published listing with its `images` array |

Errors are JSON: `{error:{code, message}}` — no stack traces are leaked.
Unknown API routes return 404; non-GET API requests return 405.

## Schema (migration 001_init)

`users` (email unique, `password_hash` only, role CHECK over the nine
roles from the plan), `properties` (owner, type, listing type, price in
rupees, city/locality, area, beds, baths, status, soft delete via
`deleted_at`), `property_images`, `inquiries` (pipeline status
new → contacted → interested → site_visit → negotiation → closed/lost),
`saved_properties`. Indexes on the search/filter columns.

The schema is derived from the site's own content (property cards,
search filters, plan entity sketch). Stage B's auto-generated form field
names (`field`, `field-2`, …) were deliberately NOT used as column names;
Stage H will map each real form to these endpoints.

## What Stage D deliberately does NOT include

- **No authentication** (Stage E): the public API returns published
  listings only. Drafts are never exposed, even if requested.
- **No write endpoints** (property CRUD is Stage F, leads Stage G).
- **No sample data in the production database**: it starts empty.
  Tests seed their own temporary databases and delete them afterwards.
- **No secrets in code**: configuration is via environment only
  (see `.env.example`).

## PostgreSQL path (production)

Stage D implements SQLite for development. For production, the schema
translates almost directly to PostgreSQL except: `INTEGER PRIMARY KEY
AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`, `datetime('now')` defaults →
`now()`, and the `node:sqlite` data layer needs a `pg` adapter. That
adapter is Stage J deployment work, not something silently claimed here.

## Environment

See `.env.example`. `DATABASE_URL` is documented for production but is
not read by the Stage D server (SQLite only).
