# SECURITY AUDIT — PrimePropertys (2026-10-28, verified against source)

Scope: `server/src/*.js`, `server/migrations/*.sql`, `assets/js/*`,
the session cookie, and the API authorization model. Every claim below
was checked in the code, not inferred from documentation.

## Verified controls (working)

- **Password hashing:** scrypt, 64-byte key, N=16384, r=8, p=1, per-user
  salt (`server/src/auth.js`). Passwords are never stored or logged.
  Strength rule enforced server-side: at least 8 characters with
  letters and digits (`isStrongPassword`, applied on register,
  change-password and reset-password).
- **Sessions:** only SHA-256 token hashes are stored (`sessions.token_hash`),
  never raw tokens. 7-day TTL, IP address and user agent recorded.
  Change-password revokes other sessions; logout clears the cookie.
- **Session cookie:** `pp_session`, HttpOnly, Path=/, SameSite=Lax,
  7-day Max-Age. The Secure flag is opt-in via
  `SESSION_COOKIE_SECURE=1` — it is OFF by default, so plain-HTTP
  deployments leak the cookie flag gap below.
- **Login throttling:** 5 failed attempts per IP+email per 10 minutes
  → 429 (`isLoginBlocked`). Success clears the bucket.
- **Public-submit rate limits:** inquiries 10/hr/IP, contact and
  newsletter 20/hr/IP, each → 429.
- **Authorization:** every protected route checks a permission
  (`users:manage`, `leads:view_any`, `properties:publish_any`,
  `visits:manage`, `tickets:manage`, `services:manage`,
  `payments:manage`, `campaigns:manage`, `settings:manage`, …).
  Visibility failures return 404, not 403, so record existence is not
  leaked (leads, visits, tickets, services, drafts, payments).
- **Ownership rules:** property edits/publish/delete, inquiry
  visibility, visit/ticket/service status changes, refund requests
  and billing profiles are all owner-or-permission gated and tested.
- **Tokens:** password-reset tokens 1h TTL, email-verification tokens
  24h TTL, single-use (used_at), hash-only storage.
- **SQL injection:** all queries use `DatabaseSync.prepare` with `?`
  placeholders; no string-built queries were found in `server/src/`.
- **XSS via rendered data:** group JS builds DOM nodes with
  `textContent` / `createElement` (buyer.js `setCalc` pattern,
  crm/admin/wizard renders). No `innerHTML` assignment with
  user-controlled data was found in `assets/js/` (grep-verified).
- **Security headers on every response (incl. CSV):** nosniff,
  SAMEORIGIN, strict-origin-when-cross-origin, and a CSP that allows
  only self + `images.unsplash.com` for images, with `'unsafe-inline'`
  for scripts/styles (required by the single-file build).
- **Settings allowlist:** only 4 non-secret keys are storable;
  any secret-looking key is refused with 400, so secrets cannot be
  smuggled into the settings row.
- **Secrets handling:** `.env.example` holds placeholders only;
  `.db` files and `.git/` are never pushed (push batches exclude
  them); test fixtures use a dummy password only.

## Gaps (open, with severity)

1. **CSRF tokens missing (Medium).** State-changing routes rely on
   SameSite=Lax cookies alone. SameSite=Lax blocks cross-site POST
   cookies in modern browsers, but there is no per-request token.
   Required by brief Phase N; implement before production.
2. **Secure cookie off by default (Medium).** `SESSION_COOKIE_SECURE`
   must be set to `1` on any HTTPS host; forgetting it downgrades
   session security. Deployment must set it, not just document it.
3. **No binary-upload validation yet (High, blocks Phase E).**
   Uploads are URL references only today, so no file validation
   exists to audit — the upload feature must add signature/MIME/
   size checks, safe filenames, and private-document access control.
4. **No audit log for sensitive admin actions (Medium).** Role/status
   changes (PATCH /api/users/:id), publish/unpublish, payment
   verification and refund approvals are not written to an admin
   audit trail. Required by Phase N.
5. **No 2FA (Medium).** Security pages offer 2FA toggles that are
   not stored and no TOTP/SMS second factor exists. The pages say
   so; do not present the toggles as working.
6. **No account-deletion workflow (Low).** Delete-account forms are
   unwired; deletion needs a confirmation + retention workflow
   (Phase N), not a bare DELETE.
7. **Email delivery unconfigured (Low for security, High for product).**
   `EMAIL_BACKEND=console` prints reset/verification links to the
   server log in dev; without a provider, reset/verify-by-email is
   unavailable (503). The console fallback must never be enabled in
   production — it would leak tokens to logs.
8. **Session revocation list is per-user, not global (Low).**
   Change-password revokes the user's other sessions; there is no
   admin "revoke all sessions" or suspicious-login alerting.

## Not vulnerabilities (checked, cleared)

- The 52 placeholder-link files are demo rows/links, not access
  bypasses; live renders replace them and all data routes are gated.
- The demo stat cards on dashboards are static page copy, not data
  served as real; live sections are labelled as live.
- `href="#"` links cannot reach data without the API, which is
  permission-gated independently of the frontend.

## Verdict

No critical remotely-exploitable flaw was found in the existing
server code. Production readiness is still blocked by the gaps
above (CSRF, Secure flag enforcement, upload validation, admin
audit log) plus the product blockers in PRODUCTION_READINESS.md.
