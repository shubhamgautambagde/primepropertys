# SECURITY AUDIT — PrimePropertys (Phase A, 2026-10-28)

Scope: `server/src/*.js`, `server/migrations/*.sql`, `assets/js/*.js` + groups,
`.env.example`, and the static pages' data handling. No penetration test was run;
findings are code-reading findings, each with its file reference. Severity as in
BUG_REGISTER.md.

## 1. What is sound (verified, do not "fix")

- **Password hashing**: scrypt (N=16384, r=8, p=1), random 16-byte salt, format
  `scrypt:<salt>:<key>`; verification uses `timingSafeEqual` (`server/src/auth.js`).
  Strength rule is modest (8+ chars, letter + digit) — acceptable, not strong; do not
  weaken it.
- **Session/token storage**: sessions store only SHA-256 of a random 32-byte token;
  reset tokens (1 h) and verification tokens (24 h) likewise hashed, single-use for
  reset (used_at) and consumed on verify. Cookie value itself is the raw token, as
  standard for opaque sessions.
- **Authorisation is server-side everywhere checked**: properties (owner vs
  `*_any`), leads (view_any vs own/assigned, else 404 not 403 — no existence leak),
  visits/tickets/services (visibility functions), payments (owner vs payments:view),
  settings (settings:manage), users (users:manage), leads export (leads:export).
  Hiding a button is never the mechanism (server/README states this; route code
  confirms it for the domains read).
- **SQL injection**: all route handlers use parameterised queries. The one dynamic
  ORDER BY (`listProperties`) selects from a hardcoded allowlist map, never from
  user input. No string-interpolated user value into SQL was found.
- **Output encoding**: `innerHTML` count is 0 in shipped JS (enforced by a test);
  rendering uses textContent/DOM construction. CSP is present on every response
  (see §3 for its `unsafe-inline` caveat).
- **Secrets in repo**: none found. Grep for key/token patterns returned only the
  test dummy password `Secret123` in `server/test/auth.js` (not a real credential).
  `server/.env.example` holds placeholders only. Settings allowlist (4 keys) refuses
  smtp_password/api_key/payment secrets with 400 — secrets cannot land in
  `site_settings` via the API.
- **Static serving**: path traversal is blocked (`resolve` + prefix check in
  `handleStatic`); unknown extensions serve as `application/octet-stream`; 404/403
  are plain text, no stack traces. API errors are `{error:{code,message}}`, never
  stack traces.
- **Login throttling**: 5 failures per IP+email per 10 minutes → 429; success clears
  the bucket. Public inquiry (10/hour/IP), contact (20/hour/IP), newsletter have
  IP limits. Body cap 100 KB, invalid JSON → 400.

## 2. Confirmed findings (Critical / High)

| ID | Finding | File | Severity | Fix |
|---|---|---|---|---|
| SEC-01 (=BUG-001) | Session cookie has no `Secure` flag unless `SESSION_COOKIE_SECURE=1`. | auth.js:141 | Critical for HTTPS production | Secure by default on HTTPS; document the flag. |
| SEC-02 (=BUG-002) | Password-reset + email-verification tokens printed to the server log in the default `EMAIL_BACKEND=console` mode. Log access = account takeover. | server.js auth handlers | Critical | Gate console-email behind dev-only flag; otherwise 503 with no token issued to logs. |
| SEC-03 (=BUG-003) | No CSRF token or Origin/Referer check on state-changing API calls. Mitigated today only by `SameSite=Lax` + no CORS. | server.js (whole API) | Critical for production | Add CSRF token or strict Origin check + test before production. |
| SEC-04 | No 2FA anywhere. Security pages carry 2FA toggles that do not save (change-password handler itself warns: "2FA/notification toggles save nahi hote"). No TOTP/WebAuthn, no backup codes, no suspicious-login alert. | forms.js change-password; security-center/super-admin pages | High | New domain (TOTP at minimum) + toggle persistence; product decision on mandatory vs optional 2FA for Admin. |
| SEC-05 | No admin audit log. Lead activities are logged, but publish/unpublish, user role/status changes, payment verification, settings PUT, and session revocation are not recorded anywhere. | server/src/* (absence verified) | High | audit_log table + writes on sensitive actions; admin viewer page. |
| SEC-06 | No rate limit on most writes: register, password-reset request, ticket/service creation, payments, campaigns, settings PUT, user PATCH. Only login/inquiry/contact/newsletter are limited, and all buckets are in-memory (lost on restart, per-process). | server.js, auth.js, leads.js, contact.js, newsletter.js | High | Limits on all anonymous/authenticated writes; shared store or documented single-process limit. |
| SEC-07 | Email verification is not enforced anywhere: unverified users can log in and use the product (verified_at is only displayed in the admin user list). Password-reset flow does not require a verified email either. | auth.js login (no verified check) | Medium-High | Decide: gate sensitive actions on verified email, or document that verification is informational. Do not silently change login behaviour without a product decision. |
| SEC-08 | Session lifetime 7 days, no idle timeout, no session list/revoke UI. Only password change revokes other sessions. A stolen cookie is valid for up to 7 days. | auth.js SESSION_TTL_MS | Medium | Session management page + idle timeout policy. |
| SEC-09 | `SameSite=Lax` + `HttpOnly` are set, but there is no `Partitioned`/`__Host-` prefix and the cookie path is `/`. Acceptable; not a finding on its own — record it so a future "just add Secure" change does not claim the cookie work is done. | auth.js | Low (note) | Consider `__Host-` prefix when Secure is made default (requires Path=/ and no Domain, both already true). |

## 3. Headers and transport (verified present, with caveats)

Every response (static, API, CSV) carries: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
and a CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
'unsafe-inline'; img-src 'self' https://images.unsplash.com data:; connect-src 'self';
font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`.
Caveats: (a) `unsafe-inline` is required by the inlined-page build — it weakens CSP
against XSS and cannot be removed without a linked-asset build + nonces/hashes;
(b) no `Strict-Transport-Security` header (correct to add only once HTTPS is real);
(c) no CORS headers at all — that is currently protective (same-origin API only),
and must stay that way unless a cross-origin client is explicitly approved;
(d) gzip is applied to text ≥1 KB (verified by test).

## 4. Input validation and upload (verified)

- Server validation (validate.js) covers property writes thoroughly (enums, lengths,
  integer ranges, amenities array cap 50×100 chars, owner_email format).
- Other domains validate in their module files (leads transitions, payment status
  machine, settings allowlist, ticket/service required fields). No domain was found
  that accepts arbitrary JSON into the DB unchecked, except: property PATCH accepts
  any allowlisted wizard column — that is by design, and the allowlist is the control.
- **File upload**: there is no binary upload path at all, so there is currently no
  upload vulnerability — and no upload feature. Image URLs are validated
  (absolute http/https only, no credentials in URL, ≤2048 chars) but are NOT
  checked for content type, size, or reachability: a "property image" can point at
  any http(s) URL, including a tracking URL or a non-image. When Phase E lands, it
  must add: signature + MIME + size checks, safe server-side filenames, non-executable
  storage, permission checks, private-document access control, and (where supported)
  malware scanning. Do not accept external URLs as a substitute for upload in new
  features.
- **IDOR**: checked for properties, leads, visits, tickets, services, payments,
  users. The pattern is consistent (ownership or permission, else 404). New domains
  must follow the same pattern and add tests for "other owner gets 404".

## 5. Data handling, privacy, retention

- PII in DB: email, phone, full_name, owner_phone, addresses, inquiry messages.
  No encryption-at-rest beyond SQLite file permissions; no field-level encryption.
  Document this before production; at minimum, restrict DB file permissions and
  backup access.
- Demo phone +91 98765 43210 (691 matches) and demo listings are not real PII, but
  they are presented as contact data on public pages — remove or label before
  production (BUG-020).
- No data-retention, anonymisation, or account-deletion policy is implemented
  (see FEATURE_GAP_ANALYSIS E-17). Notification/lead/contact retention is unbounded.
- Logs: the server logs only the startup line and (in console-email mode) tokens
  (SEC-02). No request logging, no audit trail — good for privacy, bad for incident
  response. Decide a log policy that excludes tokens, passwords, and message bodies.
- Backups: manual SQLite file copy only (DEPLOYMENT.md); no automated backup, no
  restore test, no encryption of backups. See PRODUCTION_READINESS.md.

## 6. What was NOT verified (do not claim)

No penetration test, no dependency scan (there are zero runtime dependencies, which
removes that class, but Node itself is the dependency — keep Node ≥24 patched),
no fuzzing of the API, no review of the GitHub Pages static hosting configuration
(it serves pages without the API, so API security does not apply there — but demo
data and the demo phone do), and no review of any production hosting that is not
in this repo.
