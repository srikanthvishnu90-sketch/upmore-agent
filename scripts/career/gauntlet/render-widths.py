#!/usr/bin/env python3
"""Gauntlet pilot grader tool (U02): render a harness surface HTML at 320px and
390px widths, measure horizontal overflow, save screenshots.
Usage: render-widths.py <surface.html> <out_dir>  -> prints JSON measurements."""
import json, sys
from playwright.sync_api import sync_playwright

src, out_dir = sys.argv[1], sys.argv[2]
result = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w in (320, 390):
        pg = b.new_page(viewport={"width": w, "height": 800}, device_scale_factor=2)
        pg.goto("file://" + src)
        pg.wait_for_timeout(150)
        m = pg.evaluate("""() => ({
            inner_width: window.innerWidth,
            doc_scroll_width: document.documentElement.scrollWidth,
            body_scroll_width: document.body ? document.body.scrollWidth : null,
            horizontal_scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
            text_sample: (document.body ? document.body.innerText : '').slice(0, 200)
        })""")
        pg.screenshot(path=f"{out_dir}/screen-{w}.png", full_page=True)
        result[str(w)] = m
        pg.close()
    b.close()
print(json.dumps(result))
