# PrimePropertys — Changelog

## Stage B — Frontend repairs (2026-10-28)

Backup before this stage: `~/workspace/primepropertys-backup-stage-a/` (Stage A original is at `~/workspace/primepropertys-backup-original-2026-10-28/`).
Per-file detail (every changed file with change counts): `~/workspace/primepropertys-audit/stage-b-changes.json`.
Audit scripts: `~/workspace/primepropertys-audit/audit.py` (re-run after Stage B), `stage_b.py`, `stage_b2.py`.

### Fixed and verified
- **Field names (all pages):** 1,222 submittable fields (999 inputs + 164 selects + 59 textareas) now have a `name`. Before: 991 inputs had none. Names are inferred from aria-label, placeholder, id, or (for selects) option text, and are unique within each page. Fields with no hint got an `aria-label` as well. Verified: 0 submittable fields without a name remain.
- **Meta descriptions (650 pages):** every page now has a unique `<meta name="description">` derived from its H1. Before: 0 pages had one.
- **Alt text (146 images):** every image now has usable alt text, inferred from the nearest preceding heading or, failing that, "PrimePropertys property photo". Before: 146 of 374 images lacked alt text. Verified: 0 missing.
- **Duplicate titles (36 pages):** duplicate `<title>` values disambiguated with section/file names. Distinct titles: 614 -> 650.
- **Help & Support links (50 pages):** buyer-portal and investor-portal top-bar links that pointed to `href="#"` now point to `../../help-center.html`. Verified: all 50 resolve.
- **Print links (2 pages):** now call `window.print()` instead of doing nothing.
- **HTML tag balance (21 pages):** root `index.html` was missing one closing `</div>` in the testimonials/news section; all 20 property-engine pages had a duplicated `</main></div></div></div></main>` tail. Both fixed. Verified with a tag-balance parser: 0 pages with issues remain (was 21).
- **Form handler honesty (651 files: 650 pages + assets/js/main.js):** the shared submit handler no longer clears user input, and when it shows a `.form-success` message it appends a "Demo preview — no data was saved yet" note. Client-side tool forms (`onsubmit="return false"`, e.g. calculators) are untouched. Verified: all 8 distinct inline script blocks + main.js pass `node --check`.
- **Links preserved:** internal links 30,560 -> 30,610 (the +50 are the mapped Help links); **0 broken internal links** before and after.

### Not fixed in Stage B (carried forward, with reasons)
- **184 remaining `href="#"` links (52 files):** View (54), Edit (48), Chat on WhatsApp (24), View Details (22), Use Template (19), Share (6), Download Plan (PDF) (2), and 9 miscellaneous actions. These were investigated file by file; their destinations do not exist yet (property/document detail pages, WhatsApp number, template system, share/export actions) and were **not guessed**. Full list: `~/workspace/primepropertys-audit/href-hash-remaining.json`. Resolution belongs to Stages F/G/H, or needs the owner's intent/business inputs.
- **349 forms still have no backend action:** by design in Stage B — there is no backend yet. Forms are now marked `data-backend="not-connected"` (343 forms; 6 calculator/tool forms excluded) so Stage H can find and wire them. Success messages now carry the demo note above.
- **Inline CSS/JS duplication:** unchanged in Stage B (7.6 MB CSS / 3.5 MB JS repeated). This is Stage C's refactor, which must preserve the single-file preview property.
- **Demo/sample data:** phone, email, person names, stats, and prices are still screenshot-derived demo content. Replacing them needs confirmed real business data (owner input) or Stage H real-data wiring.
- **Side effect to note:** sample-person pattern matches rose 198 -> 200 because two alt texts now derive from testimonial headings containing person names. No new sample data was invented.

### Verification note (Stage B, honest limitation)
- Live-browser click-through (actually clicking Submit in a real browser) was **not** performed: the browser tool blocks localhost navigation, and the user asked the assistant to do all work itself rather than take over the browser. The browser spot-check task was therefore stopped.
- Instead, all four spot-checks were verified against the actually served site (`http://127.0.0.1:8901/`, HTTP 200 on all four pages): homepage contains inlined navy design + property cards + images; contact form has named fields and the honest demo-note handler with no input clearing; buyer-dashboard Help link resolves to the served Help Center page; property-details serves with sidebar + styled content. All 8 checks passed. A real-browser click test remains open and can be done by opening the served URL in any browser.

### Audit comparison (Stage A -> Stage B)
- Bug register entries: 1,495 -> 344. Remaining: forms without backend 286 files, `href="#"` 52 files, plus 6 site-wide architectural items (no backend, no auth, demo data, duplicated code, no tooling, Unsplash dependency).
- Inputs without name: 991 -> 0. Images missing alt: 146 -> 0. Tag-balance issues: 21 pages -> 0. Broken links: 0 -> 0.
