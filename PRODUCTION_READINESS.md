# PRODUCTION READINESS — PrimePropertys (2026-10-28)

Verdict: **NOT production-ready.** The application is a verified,
well-tested codebase, but the items below block a production launch.
Nothing here is deployed; no production deployment happens without
explicit user authorization (brief rule).

## Ready

- **Runtime:** Node.js ≥ 24, zero-dependency stdlib server
  (`node:http` + `node:sqlite`). No npm install step, no native
  modules. Declared runtime matches the code (brief's "Node.js
  22.16.0" describes the user's environment, not a code requirement).
- **Tests:** 59/59 pass, including an end-to-end journey test and
  per-domain suites (auth, properties, leads, visits, tickets,
  services, payments, campaigns, settings, wizard, users-admin).
- **Migrations:** 001–017, auto-applied in filename order inside
  transactions, recorded in `schema_migrations`. Never edit an
  applied migration.
- **Static hosting:** GitHub Pages serves the 653 pages (verified
  live). Static pages alone are safe to serve publicly.
- **Security headers, gzip, rate limits, RBAC gates:** verified
  (see SECURITY_AUDIT.md).
- **Backups of source:** per-slice backup directories exist
  (`primepropertys-backup-*`), and every pushed slice is on GitHub
  main (head `0116c3bf` at last push).

## Blockers (must resolve before launch)

1. **Hosting decision open.** The Node API has no host yet. Pages
   serves static files only — every API-backed feature shows an
   honest "server unreachable" notice there. Node hosting vs a
   PHP-only port is undecided; PHP-only would need a port of the
   data layer.
2. **Secure cookie flag.** Set `SESSION_COOKIE_SECURE=1` on the
   HTTPS host. Off by default; forgetting it is a session-security
   regression.
3. **CSRF tokens.** Not implemented (SameSite=Lax only).
4. **Admin audit log.** Sensitive admin actions are not logged.
5. **Email/SMS/WhatsApp providers.** Not configured. Password reset
   and verification by email, enquiry notifications, and queued
   messages all depend on providers that do not exist yet. The
   console-email fallback must stay dev-only.
6. **Payment gateway.** Offline/manual payment records only. No
   provider, no webhook verification, no entitlement activation
   from verified payment. Never activate paid entitlements without
   verified payment.
7. **Binary uploads.** Not implemented. Property images/documents
   are URL references; the upload feature (Phase E) must land with
   validation before any user file is accepted.
8. **Database backups/restore.** No backup schedule, no restore
   procedure, no retention policy for the SQLite file. The file
   must be backed up off-host on a schedule, and restores tested.
9. **Logging/monitoring.** Server logs to stdout only; no error
   monitoring, no alerting, no incident-response runbook.
10. **First admin.** Production DB starts empty by design; the
    first admin must be created with the documented hash command
    (or an equivalent) on the production host — never ship a
    default credential.

## Operational checklist (at launch time)

- [ ] Node host chosen; `PORT`, `DATABASE_PATH`, `STATIC_ROOT`,
      `EMAIL_BACKEND`, `SESSION_COOKIE_SECURE=1` set.
- [ ] HTTPS enforced; HSTS considered.
- [ ] SQLite file on persistent storage with scheduled backups
      and a tested restore.
- [ ] First admin created; default-credential check passed.
- [ ] Email provider configured; reset + verification tested
      end-to-end in production.
- [ ] CSRF tokens + admin audit log shipped.
- [ ] Upload validation shipped (if uploads are enabled).
- [ ] Payment provider in test mode first; webhooks verified
      idempotent before any paid entitlement.
- [ ] Error monitoring + log retention configured.
- [ ] Rollback plan: previous GitHub main commit + DB backup.

## Known non-blockers (documented, accepted)

- Demo stat cards and demo rows remain on some pages by design;
  live sections are labelled and replace them at runtime.
- Ad-platform metrics, AI features, analytics exports, chat,
  projects, reviews, tasks, subscriptions, coupons, SEO records:
  not built (see TRIAGE.md / FEATURE_GAP_ANALYSIS.md). They are
  missing features, not production defects, but their pages must
  not claim otherwise — and today they do not.
