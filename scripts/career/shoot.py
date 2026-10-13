#!/usr/bin/env python3
"""Screenshot a rendered chat HTML file to PNG (headless Chromium via Playwright).
Usage: shoot.py <in.html> <out.png>"""
import sys
from playwright.sync_api import sync_playwright

src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 900}, device_scale_factor=2)
    pg.goto("file://" + src)
    pg.wait_for_timeout(150)
    pg.screenshot(path=out, full_page=True)
    b.close()
print("shot:", out)
