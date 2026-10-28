# PrimePropertys — Accessibility notes (Stage I)

Measured on 2026-10-28 across all 652 pages with automated scans
(`server/test/a11y.js` re-runs these checks on every test run).
No manual screen-reader or keyboard walkthrough has been performed
yet — that is the honest limit of this document.

## What was already good (baseline, before this slice)

- Every page declares `<html lang="en">`.
- Every page has exactly one `<h1>`.
- Every page has a `<main>` landmark.
- All 374 images carry an `alt` attribute.
- No empty links or buttons (every link/button has text or an
  `aria-label`).

## What this slice fixed

- **868 form controls got an accessible name** (641 inputs, 167
  selects, 60 textareas) via `aria-label`, derived from the
  control's placeholder, name, or id. Visible `<label>` elements
  were deliberately not added: they would shift layouts, and the
  brief forbids changing the design. Placeholder text alone is
  not a label (it disappears on input and is not reliably
  announced), so it is kept as a hint and the `aria-label` is
  the name. Hidden, submit, button, reset and image inputs are
  exempt — they need no label.
- **Skip link on every page**: `<a class="skip-link"
  href="#main-content">Skip to main content</a>` right after
  `<body>`, with the page's `<main>` carrying
  `id="main-content" tabindex="-1"`. The link is visually
  hidden until keyboard-focused, so the visual design is
  unchanged.
- **Visible keyboard focus**: `:focus-visible` (royal-blue
  3px outline, 2px offset) in `assets/css/base.css`, inlined
  into every page by the build. `:focus-visible` — not `:focus`
  — so mouse clicks stay outline-free.

## Colour contrast (measured, not changed)

All brand pairs pass WCAG 2.1 AA for normal text (4.5:1):

| Pair | Ratio |
| --- | --- |
| Navy #0A2240 on white / white on navy | 15.96:1 |
| Royal blue #2563EB on white / white on royal | 5.17:1 |
| Red #E11D48 on white / white on red | 4.70:1 |

No colour changes were needed.

## Known limits

- Automated checks only: keyboard tab order, focus traps in
  dialogs, and screen-reader announcements have not been
  manually tested.
- Demo forms and dashboard demo cards remain demo content
  (honestly labelled); their controls are labelled like the
  rest, but the data behind them is not real yet.
- Portal, CRM and admin pages are app surfaces: they follow
  the same page-level rules above, but their interactive
  widgets (tabs, accordions, filters) have not had a dedicated
  keyboard audit.
