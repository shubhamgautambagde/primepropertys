# PLACEHOLDER LINKS REPORT — PrimePropertys (brief Phase B)

Source: raw count of `href="#"` in the site is 186 occurrences; the Stage B triage file 
(`href-hash-remaining.json`) lists 184 of them with link text and file (2 were already resolved in Stage B). 
The audit reports 52 files containing such links (one entry per file).

## Verdict

No `href="#"` was changed in this pass. Every remaining occurrence falls into one of the groups below, 
and for every group the brief forbids the only available "fix": inventing a destination, wiring a button 
with no handler, or pointing a row action at a page without the row's record ID. Each group states what 
would actually resolve it.

## By link text

| Link text | Count | Disposition |
|---|---|---|
| View | 54 | UNRESOLVED — table action on demo rows in super-admin/super-manager admin tables. The rows carry no real record IDs, so no correct destination exists. Resolves when those tables are wired to live data and the link can point at a real detail page with an ID. Do not guess a destination. |
| Edit | 48 | UNRESOLVED — same as View: row action on demo rows with no record IDs. Needs live tables first. |
| 💬 Chat on WhatsApp | 24 | UNRESOLVED — needs a per-listing/per-owner phone number, which demo rows do not carry; WhatsApp delivery is also outside the current backend (no provider). Needs a product decision on what number a listing exposes. |
| View Details | 22 | UNRESOLVED — property-card links on demo cards with no property IDs. No detail link can be formed without an ID. Pages that already render live rows (saved-properties, recently-viewed) replace these demo rows when logged in; logged-out visitors still see the demo cards. |
| Use Template | 19 | UNRESOLVED — needs a template-apply/compose feature. Email campaigns are blocked on an email provider (see mapping doc). |
| Share | 6 | UNRESOLVED — share action with no share target or handler defined. Needs a product decision (native share vs copied link vs social URLs). |
| Download Plan (PDF) | 2 | UNRESOLVED — no PDF generator and no plan files exist on the server. Needs a file/PDF capability decision. |
| Compose New | 1 | UNRESOLVED — no messages API exists; the messages section is demo content. Needs a messaging feature decision. |
| Mark all as read | 1 | UNRESOLVED — no notifications API for bulk actions exists (notifications are lead-scoped in-app rows only). |
| ▶ Play Video | 1 | UNRESOLVED — video player/modal with no video source wired. Needs a media decision. |
| ‹ May 2025 › | 1 | UNRESOLVED — calendar navigation control, not navigation. Converting it to a button without a calendar handler would create a dead button, so it is left as-is and reported. |
| Today | 1 | UNRESOLVED — calendar control, same as above. |
| + Add Visit | 1 | UNRESOLVED — visit-creation shortcut on a calendar page; the real visit request flow lives on the site-visit dashboard. Needs a decision on whether this shortcut opens that flow. |
| More ▾ | 1 | UNRESOLVED — dropdown trigger with no menu defined. Needs the menu contents. |
| Reset | 1 | UNRESOLVED — filter reset on visit-requests.html, whose filter controls are demo text (not real controls) and which has no export/filter backend. Needs real filters first. |
| Export | 1 | UNRESOLVED — export on visit-requests.html; no visit-export endpoint exists (only leads have CSV export). Needs an endpoint decision. |

## By section

| Section | Occurrences |
|---|---|
| super-admin | 48 |
| super-manager | 48 |
| post-property | 24 |
| communication | 21 |
| property-engine | 15 |
| buyer-portal | 13 |
| investor-portal | 9 |
| site-visit | 6 |

## What the triage slice resolved (2026-10-28)
- **View (54) + Edit (48):** resolved at runtime. The 8 super-admin /
  super-manager user tables now render live from GET /api/users with
  per-page filters, and their View/Edit links open
  user-details.html?user_id= with a real edit form (PATCH
  /api/users/:id). The static demo rows remain in source, so the
  audit still lists those files — the links a user clicks are real.
- **Use Template (19):** resolved by the campaigns slice (links
  navigate with ?template_id=); remaining flags on those pages are
  Compose New / Mark all as read (see TRIAGE.md).

## What would resolve each group

- View / Edit (102): wire the super-admin and super-manager tables to live data, then point each row action at its real detail/edit page with the record ID.
- View Details (22): give property cards real property IDs (live render) and a detail-page URL pattern; until then the link cannot be formed.
- Chat on WhatsApp (24): decide which phone number a listing exposes, then build `https://wa.me/<number>` links from real data.
- Use Template (19): configure an email provider and build the compose-from-template flow.
- Share / Download Plan / Play Video / Compose / Mark-all-read / Add Visit / More / Reset / Export (17): each needs its feature (share handler, PDF generation, media source, messages API, notifications API, calendar handlers, real filters + visit export).
- Total accounted: 184 triaged + 2 resolved in Stage B = 186 raw occurrences.