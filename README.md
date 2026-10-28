# PrimePropertys — Public Website (Static)

A properly structured static website built to match the PrimePropertys Public
Website UI screenshots: dark-navy header/footer, red accent, royal-blue
primary buttons, pale blue-grey panels, and a centred ~1200px layout.

## How to open

Option 1 — open the file directly:

- Open `index.html` in any browser.

Option 2 — serve it locally (recommended, so all relative links work exactly
as they will when hosted):

```bash
cd primepropertys-website
python3 -m http.server 8000
```

Then open http://localhost:8000/ in your browser.

No build step, no backend, and no database are needed. Forms show an inline
success message via JavaScript; they do not send data anywhere. Property
photos are stable Unsplash image URLs — the screenshot PNGs themselves are
not embedded.

## Structure

```
primepropertys-website/
  index.html
  about.html, services.html, how-it-works.html, pricing.html, contact.html,
  faq.html, help-center.html, careers.html, report-problem.html,
  accessibility.html, cookie-policy.html, disclaimer.html,
  privacy-policy.html, refund-policy.html, terms.html, sitemap.html
  assets/css/style.css
  assets/js/main.js
  README.md
```

## Page list (17 pages)

| File | Page |
|---|---|
| index.html | Home — Find Your Dream Property |
| about.html | About Us |
| services.html | Services |
| how-it-works.html | How It Works |
| pricing.html | Pricing |
| contact.html | Contact Us |
| faq.html | FAQ |
| help-center.html | Help Center |
| careers.html | Careers |
| report-problem.html | Report a Problem |
| accessibility.html | Accessibility |
| cookie-policy.html | Cookie Policy |
| disclaimer.html | Disclaimer |
| privacy-policy.html | Privacy Policy |
| refund-policy.html | Refund Policy |
| terms.html | Terms & Conditions |
| sitemap.html | Sitemap (links to all 17 pages) |

Every page is a complete standalone HTML file — its CSS and JS are inlined
in the page itself (so it renders styled even when opened on its own),
while the shared source files are still kept in `assets/css/style.css`
and `assets/js/main.js`. All pages share the same header and footer,
and every internal link points to a real file in this site.

## Interactive behaviour (assets/js/main.js)

- Mobile navigation toggle
- Home search-tab switching
- FAQ / Help Center accordions and search filtering
- Pricing Monthly/Yearly toggle and audience tabs
- Careers job search / department / location filtering
- Contact, report, and newsletter forms show an inline success message

## Full portal (all sections)

Open `sections.html` for a directory of all 27 sections (Public Website + 26 section folders under `sections/`), totalling 649 HTML pages. Each section folder has its own `index.html` listing its pages, and every page is self-contained (CSS/JS inlined) so it renders styled when opened alone.
