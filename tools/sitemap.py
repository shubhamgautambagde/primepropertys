#!/usr/bin/env python3
"""Generate sitemap.xml for PrimePropertys' public, crawlable pages.

Usage (from the site root):  python3 tools/sitemap.py

Rules (Stage I, SEO slice):
  * Root pages are included except login.html and register.html
    (functional pages, not indexable content).
  * blog/ and news/ are fully included (public content).
  * property-search/ and property-engine/ include only the public
    browse/detail pages; user-specific pages (saved searches,
    shortlists, alerts, recently viewed, enquiry/contact/request
    actions) are excluded.
  * All portal, dashboard, CRM, admin and settings sections are
    excluded: they are authenticated app surfaces, not content.
  * URLs use the live GitHub Pages base. If the site moves to a
    custom/root domain, change BASE_URL and re-run; page paths
    below are derived from the files on disk, so nothing else
    needs editing.
  * <lastmod> is the file's modification date on disk.
  * No <changefreq>/<priority>: guessing them would be noise.
"""
import datetime
import pathlib

BASE = pathlib.Path(__file__).resolve().parent.parent
BASE_URL = "https://shubhamgautambagde.github.io/primepropertys"

ROOT_EXCLUDE = {"login.html", "register.html"}

BROWSE_SEARCH = {
    "index.html", "buy-properties.html", "rent-properties.html",
    "residential-properties.html", "commercial-properties.html",
    "plots-land.html", "pg-co-living.html", "advanced-search.html",
    "search-results.html", "filter-results.html", "map-search.html",
    "compare-properties.html", "recommended-properties.html",
    "similar-properties.html",
}

DETAIL_ENGINE = {
    "index.html", "property-details.html", "property-photos-gallery.html",
    "property-reviews.html", "property-amenities.html", "floor-plans.html",
    "property-video.html", "360-virtual-tour.html", "property-price-history.html",
}

SECTION_RULES = {
    "blog": None,            # None = every page in the section
    "news": None,
    "property-search": BROWSE_SEARCH,
    "property-engine": DETAIL_ENGINE,
}


def canonical(rel: str) -> str:
    if rel == "index.html":
        return BASE_URL + "/"
    if rel.endswith("/index.html"):
        return BASE_URL + "/" + rel[: -len("index.html")]
    return BASE_URL + "/" + rel


def main() -> None:
    urls = []
    for f in sorted(BASE.rglob("*.html")):
        if ".git" in f.parts or "tools" in f.parts:
            continue
        rel = f.relative_to(BASE).as_posix()
        parts = rel.split("/")
        if parts[0] == "sections":
            if len(parts) < 3:
                continue
            rule = SECTION_RULES.get(parts[1])
            if rule is None and parts[1] not in SECTION_RULES:
                continue
            if rule is not None and parts[2] not in rule:
                continue
        else:
            if len(parts) != 1 or parts[0] in ROOT_EXCLUDE:
                continue
        mtime = datetime.datetime.fromtimestamp(
            f.stat().st_mtime, tz=datetime.timezone.utc).date().isoformat()
        urls.append((canonical(rel), mtime))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in urls:
        lines.append(f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
    lines.append("</urlset>")
    (BASE / "sitemap.xml").write_text("\n".join(lines) + "\n")
    print(f"sitemap.xml: {len(urls)} urls")


if __name__ == "__main__":
    main()
