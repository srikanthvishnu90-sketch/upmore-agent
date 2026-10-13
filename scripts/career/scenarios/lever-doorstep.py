#!/usr/bin/env python3
"""Doorstep fill of the REAL Lever demo-board application form, from a locally
hosted capture of the live page (jobs.lever.co/leverdemo/.../apply, fetched
verbatim). Fills TEST-persona values, reads them back from the form's own DOM
state, screenshots the filled form, and STOPS — submit is never clicked.
Usage: lever-doorstep.py <captured.html> <out.png> ; prints JSON of read-back values."""
import sys, json
from playwright.sync_api import sync_playwright

src, out = sys.argv[1], sys.argv[2]
VALUES = {
    "name": "Alex Testcase (TEST)",
    "email": "alex.testcase@example.test",
    "phone": "+1 555-0100 (TEST)",
    "location": "Chicago, IL (TEST)",
    "org": "TEST Systems Inc",
    "pronouns": "they/them (TEST)",
}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 430, "height": 900}, device_scale_factor=2)
    pg.goto("file://" + src)
    pg.wait_for_timeout(400)
    filled = {}
    for field, val in VALUES.items():
        el = pg.query_selector(f'[name="{field}"]')
        if el:
            try:
                el.fill(val)
                filled[field] = el.input_value()
            except Exception as e:
                filled[field] = f"UNFILLABLE: {str(e)[:80]}"
        else:
            filled[field] = "FIELD ABSENT"
    # Pronouns on the Lever demo form are a checkbox group, not a text field:
    # check "They/them" (the TEST persona's stated pronouns) and read it back.
    try:
        cb = pg.evaluate_handle("""() => { const labels=[...document.querySelectorAll('label')]; const l=labels.find(x=>x.innerText.trim().startsWith('They/them')); return l ? (l.querySelector('input[type=checkbox]') || document.getElementById(l.htmlFor)) : null; }""")
        el = cb.as_element()
        if el:
            el.check()
            filled["pronouns"] = "They/them checkbox checked: " + str(el.evaluate("e => e.checked"))
        else:
            filled["pronouns"] = "CHECKBOX NOT FOUND"
    except Exception as e:
        filled["pronouns"] = f"CHECKBOX FAILED: {str(e)[:80]}"
    has_submit = pg.query_selector('button[type="submit"], input[type="submit"], .postings-btn-submit') is not None
    has_captcha = pg.query_selector('[name="h-captcha-response"], .h-captcha, iframe[src*="captcha"]') is not None or "h-captcha" in pg.content()
    pg.screenshot(path=out, full_page=True)
    b.close()
print(json.dumps({"filled": filled, "submitButtonPresent": has_submit, "captchaPresent": has_captcha, "submitted": False}))
