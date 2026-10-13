#!/usr/bin/env python3
"""Gauntlet re-run grader tool (U03): render an artifact HTML page at phone
(320px), small-phone (390px) and desktop (1280px) widths; report horizontal
scroll per width, save screenshots, and return the page's full innerText as
extracted_text. Usage: artifact-render.py <page.html> <out_dir>"""
import json, sys
from playwright.sync_api import sync_playwright

src, out_dir = sys.argv[1], sys.argv[2]
result = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, w in (("320", 320), ("390", 390), ("desktop", 1280)):
        pg = b.new_page(viewport={"width": w, "height": 900}, device_scale_factor=2)
        pg.goto("file://" + src)
        pg.wait_for_timeout(150)
        m = pg.evaluate("""() => ({
            inner_width: window.innerWidth,
            doc_scroll_width: document.documentElement.scrollWidth,
            horizontal_scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
            text: document.body ? document.body.innerText : ''
        })""")
        pg.screenshot(path=f"{out_dir}/artifact-{name}.png", full_page=True)
        result[name] = {k: v for k, v in m.items() if k != "text"}
        if name == "desktop":
            result["extracted_text"] = m["text"]
        pg.close()
    b.close()
print(json.dumps(result))
