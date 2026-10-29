# PRODUCTION READINESS — PrimePropertys (Priority 4 verdict: STILL NOT READY)

Verdict: **STILL NOT production-ready after Priorities 1–4.** Priorities 1–4 fixed the code items that could be fixed without a provider, a host, or a user decision (see the updated checklist below). The remaining blockers are not code defects to fix in this repo alone: a named host with HTTPS, a payment/email/SMS/WhatsApp/AI provider, an automated backup on that host, demo-data removal, a manual accessibility pass, browser journeys, and explicit user authorisation naming host + database.
The list below is a go/no-go checklist. An item is "Ready" only if verified in
this repo; "Not ready" items block a production launch, not just a nice-to-have.

## Go / no-go checklist

| Area | Status | Evidence / note |
|---|---|---|
| Supported runtime | Ready (with a caveat) | Node ≥24 declared and verified (v24.22.1); zero runtime dependencies; server starts with `node src/server.js`. Caveat: no Node patch/update policy documented. |
| Database persistence | Partial | SQLite file via `DATABASE_PATH`, migrations auto-applied in order, tracked in schema_migrations, foreign_keys ON. No production DB file, no connection pooling concern (single-process), no migration-rollback test. |
| Database backups | Partial — restore tested, automation missing | Restore was actually tested on a temporary copy in Priority 4 (RESTORE_OK: register → create property → backup API → fresh server → login → same property returned). Still no automated/scheduled backup, no backup encryption in-repo, and no restore test on the real host. Automation + host restore test still block launch. |
| Migration safety | Partial | Migrations are transactional per file (BEGIN/COMMIT/ROLLBACK in db.js) and idempotent-ish (IF NOT EXISTS / OR IGNORE). No down-migrations, no production migration dry-run. |
| HTTPS | Not ready | No TLS in the server (correct — terminate at a reverse proxy), but no proxy configuration and no HSTS. Secure-cookie handling is now HTTPS-aware (see next row); BUG-006 bind-address log misstatement was not re-verified in Priority 4 and is not claimed fixed. |
| Secure cookies | Ready for the implemented rule, host-dependent | HttpOnly + SameSite=Lax present; Secure is now set on HTTPS requests, on X-Forwarded-Proto: https, or with SESSION_COOKIE_SECURE=1 / FORCE_HTTPS=1 (Priority 1, tested). It is only actually Secure in production if HTTPS termination is real — that part is still not ready. |
| Secrets management | Partial | No secrets in repo (verified in Phase A); settings allowlist refuses secrets; env vars are the mechanism. BUG-007 (.env never loaded) was not re-verified as fixed in Priority 4 — treat the documented `.env` copy workflow as untrusted until re-checked. No provider credentials exist at all. |
| File permissions / upload restrictions | Partial | Binary upload exists since Priority 1 (signature/MIME/size, 10 MB, safe filenames, storage outside the static root, private-document access control, tested). DB/upload file permissions are now specified in DEPLOYMENT.md (owner-only, chmod 600) but have not been verified on a real host. No malware scanner is available or claimed. |
| Logging / error monitoring | Partial | Token logging is now gated behind a dev-only flag (Priority 1, tested: default mode 503s and logs no token). Still no request logging, error monitoring, or alerting. |
| Rate limiting | Ready for single-instance, with a documented limit | All writes are now limited (Priority 1, tested): register 30/hour/IP, reset 10/hour/IP+email, other writes 300/hour/user-or-IP per route group, plus the stricter pre-existing limiters. Buckets remain in-memory only — a multi-process deployment still needs a shared store. |
| Authorisation | Ready for existing domains | Server-side permission checks verified for auth, properties, leads, visits, tickets, services, payments, settings, users (SECURITY_AUDIT.md §1). New domains must meet the same bar and add IDOR tests. |
| Payment verification | Not ready | No gateway, no webhook (the webhook route is a 501 stub that never activates anything). Payments are staff-verified pending records. Do not sell anything paid until a gateway is verified in test mode. |
| Email configuration | Not ready | No provider. Reset/verification answer 503 outside dev console mode and log no token. Transactional email, receipts, and enquiry notices all depend on a provider that does not exist. |
| SMS / WhatsApp | Not ready | Queued only, never sent. No provider, no number policy. |
| AI provider | Not ready | None configured. The API answers 503 AI_NOT_CONFIGURED and generates nothing; the UI must keep saying unavailable until a provider key exists. |
| Deployment architecture | Not ready | No production host, reverse-proxy, process manager, health-check, or restart policy is specified in this repo. DEPLOYMENT.md describes local runs and GitHub Pages static hosting (which serves pages without the API). The live primepropertys.in site is a separate Botble deployment and is out of scope for this audit — do not conflate it with this repo. |
| Restore procedure | Partial — tested on a scratch copy, not on a host | Procedure is documented in DEPLOYMENT.md and a restore on a temporary copy was actually run in Priority 4 (RESTORE_OK). It has not been run on a real host, and there is no automated backup to restore from in production. |
| Incident response | Not ready | No runbook, no contact/decision list, no breach-notification procedure. |
| Accessibility (manual) | Not ready | Automated scans pass, plus Priority 4 automated checks (form-message roles, nav aria-expanded, table scroll, contrast fixes). Manual keyboard/screen-reader testing explicitly still not done. |
| Browser testing | Not ready | No Playwright/browser tests — Playwright is unavailable in this environment and browser journeys are not claimed. API + static-scan tests only (100/100). |
| Demo data leakage | Not ready | Demo phone still renders (693 matches counted 2026-10-28, was 691 in Phase A); demo listings/reviews still render on public pages. Remove or visibly label before launch (BUG-020). |
| Canonical domain / SEO | Not ready | Canonical + sitemap point to github.io; sitemap covers 105/653 URLs; no redirect/robots management (BUG-021). |

## Minimum launch blockers (all must clear)

1. ~~BUG-001 Secure cookie, BUG-002 token logging, BUG-003 CSRF, BUG-017 rate limits~~
   — cleared in code in Priority 1 (tested); the Secure flag is only
   actually Secure once HTTPS termination (blocker 4) is real.
2. Email provider (or a documented decision that email-gated flows stay disabled, with
   the UI saying so — password reset cannot stay in console-log mode; it
   no longer is: default mode is 503 with no token logged).
3. Automated backup + tested restore — restore tested on a scratch copy
   in Priority 4; automated/scheduled backup on a real host still missing.
4. HTTPS termination + HSTS + real-host header verification.
5. Demo data removed or labelled on every public page.
6. Browser journeys (P1-7) passing.
7. A named production host, process manager, and restart/health-check configuration.
8. Explicit user authorisation to deploy, naming the host and the database (never
   the production Botble site's data, which this repo does not manage).

## What "ready" would look like after Priorities 1–4

All P1 items done and tested; P2 domains the user actually wants launched (not
necessarily all of P2) built with tests; P3/P4 items that affect launch (backup,
monitoring, accessibility manual pass, performance measurement) done; this checklist
re-run against the launch candidate with every row either Ready or explicitly
accepted in writing by the user with its risk noted. Until then, any statement of
the form "PrimePropertys is production-ready" would be false, and this audit
does not make it.
