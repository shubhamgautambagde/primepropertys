#!/usr/bin/env python3
"""PrimePropertys build: regenerate every page's inlined CSS/JS from shared sources.

Why inlined? Pages must render styled when opened alone (single-file preview,
including the Muse file viewer, which serves one file without its folder).
The shared files below are the single source of truth; never edit inlined
<style>/<script> blocks in pages directly — edit a shared file and run:
    python3 tools/build.py
from the site root. The build is idempotent: running it twice changes nothing.

Inputs (never overwritten by this script):
  assets/css/tokens.css, base.css, layout.css, components.css, forms.css,
    dashboard.css, responsive.css   (concatenated in this order = core CSS)
  assets/css/sections/<group>.css    (section layout, mapped in section-map.json)
  assets/js/navigation.js, components/tabs.js, components/accordion.js,
    components/filters.js, api.js, forms.js, core.js
    (concatenated in this order = core JS bundle; api.js is the Stage H
    API client and must load before forms.js, which calls it)
  assets/js/validation.js is a standalone library for Stage H form wiring
    and is deliberately NOT inlined into pages (no form uses it yet).
  assets/js/groups/<group>.js        (section behaviour, mapped in section-map.json)
Outputs:
  assets/css/style.css, assets/js/main.js  (concatenated shared sources, for
    reference and for any future linked-asset build)
  Every *.html page: its single <style> block and single inline <script>
    block are replaced with core + its section's files.
Pages with anything other than exactly one <style> and one inline <script>
are skipped and listed as warnings.
"""
import json, pathlib, re, sys

BASE = pathlib.Path(__file__).resolve().parent.parent
CSS_ORDER = ["tokens.css", "base.css", "layout.css", "components.css",
             "forms.css", "dashboard.css", "responsive.css"]
JS_ORDER = ["navigation.js", "components/tabs.js", "components/accordion.js",
            "components/filters.js", "api.js", "forms.js", "core.js"]

def read(p):
    return p.read_text()

def strip_leading_header(text):
    """Remove only the file's leading /* ... */ header comment (the
    'edit this file, run build' notice). Source files keep it; inlined
    copies drop it so 650 pages do not each repeat eight headers."""
    m = re.match(r"\s*/\*.*?\*/\s*\n", text, flags=re.S)
    return text[m.end():] if m else text

def main():
    section_map = json.loads((BASE / "tools/section-map.json").read_text())
    layout_map, js_map = section_map["layout_map"], section_map["js_map"]
    core_css = "".join(read(BASE / "assets/css" / name) for name in CSS_ORDER)
    core_js = "".join(read(BASE / "assets/js" / name) for name in JS_ORDER)
    (BASE / "assets/css/style.css").write_text(core_css)
    (BASE / "assets/js/main.js").write_text(core_js)
    changed, skipped, warnings = 0, 0, []
    for f in sorted(BASE.rglob("*.html")):
        if ".git" in f.parts or "tools" in f.parts:
            continue
        rel = f.relative_to(BASE)
        section = rel.parts[1] if len(rel.parts) >= 3 and rel.parts[0] == "sections" else None
        css = "".join(strip_leading_header(read(BASE / "assets/css" / name)) for name in CSS_ORDER)
        if section and section in layout_map:
            css += strip_leading_header(read(BASE / "assets/css/sections" / (layout_map[section] + ".css")))
        js = "".join(strip_leading_header(read(BASE / "assets/js" / name)) for name in JS_ORDER)
        if section and section in js_map:
            js += strip_leading_header(read(BASE / "assets/js/groups" / (js_map[section] + ".js")))
        text = f.read_text(errors="ignore")
        if len(re.findall(r"<style>", text)) != 1 or len(re.findall(r"<script>", text)) != 1:
            skipped += 1
            warnings.append(str(rel))
            continue
        # Use a function replacement so backslashes in CSS/JS are literal.
        new = re.sub(r"<style>.*?</style>", lambda m: "<style>\n" + css + "</style>", text, count=1, flags=re.S)
        new = re.sub(r"<script>.*?</script>", lambda m: "<script>\n" + js + "</script>", new, count=1, flags=re.S)
        if new != text:
            f.write_text(new)
            changed += 1
    print(f"pages updated: {changed}, skipped: {skipped}")
    if warnings:
        print("warnings (skipped pages):")
        for w in warnings:
            print(" ", w)
    return 0

if __name__ == "__main__":
    sys.exit(main())
