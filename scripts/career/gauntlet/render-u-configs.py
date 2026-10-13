#!/usr/bin/env python3
"""Gauntlet U-lane grader tool: render a surface HTML under ONE named
device/accessibility configuration and measure the properties the harness
surface can support:
  - horizontal overflow (document scrollWidth vs innerWidth)
  - text scaling: config desktop-ts200 injects 200% bubble/heading font sizes
    (grader-side style override on the same surface HTML, the same technique
    render-widths.py uses for viewport widths)
  - reading order: .bubble texts in DOM order
  - structure: <html lang>, viewport meta, h1 count (contrast is NOT measured
    by this surface -- the U-lane checks are contrast-agnostic by design)
  - keyboard-path equivalents: focusable elements (a/button/input/[tabindex])
    in DOM order; the harness surface ships no composer/input at all, which
    the runner records as an explicit coverage gap, not a pass.
Usage: render-u-configs.py <surface.html> <out_dir> <config>
Configs: w320 (320x800, 100% text) | w390 (390x844, 100% text) |
         desktop-ts200 (1280x900, 200% text)
Prints one JSON object; saves screen.png in out_dir."""
import json, sys
from playwright.sync_api import sync_playwright

src, out_dir, config = sys.argv[1], sys.argv[2], sys.argv[3]
CONFIGS = {
    "w320": {"width": 320, "height": 800, "text_scale": 1},
    "w390": {"width": 390, "height": 844, "text_scale": 1},
    "desktop-ts200": {"width": 1280, "height": 900, "text_scale": 2},
}
cfg = CONFIGS[config]
result = {"config": config, "viewport": cfg}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": cfg["width"], "height": cfg["height"]}, device_scale_factor=1)
    pg.goto("file://" + src)
    if cfg["text_scale"] != 1:
        pg.add_style_tag(content=".bubble{font-size:30px !important;line-height:1.4} h1{font-size:32px !important} .card{font-size:28px}")
    pg.wait_for_timeout(150)
    m = pg.evaluate("""() => {
        const bubbles = Array.from(document.querySelectorAll('.bubble')).map(e => e.innerText);
        const focusables = Array.from(document.querySelectorAll('a,button,input,select,textarea,[tabindex]')).map(e => ({tag: e.tagName, tabindex: e.getAttribute('tabindex'), text: (e.innerText||'').slice(0,40)}));
        return {
            inner_width: window.innerWidth,
            doc_scroll_width: document.documentElement.scrollWidth,
            body_scroll_width: document.body ? document.body.scrollWidth : null,
            horizontal_scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
            html_lang: document.documentElement.getAttribute('lang'),
            viewport_meta: !!document.querySelector('meta[name="viewport"]'),
            h1_count: document.querySelectorAll('h1').length,
            bubble_count: bubbles.length,
            bubble_texts: bubbles,
            focusable_count: focusables.length,
            focusables: focusables,
            negative_tabindex: focusables.filter(f => f.tabindex === '-1').length,
            text: document.body ? document.body.innerText : ''
        };
    }""")
    pg.screenshot(path=f"{out_dir}/screen.png", full_page=True)
    result.update(m)
    pg.close()
    b.close()
print(json.dumps(result))
