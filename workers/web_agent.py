#!/usr/bin/env python3
"""Upmore web agent worker v1 — "Do it for me."

Polls web_agent_jobs for queued jobs, drives a real Chromium for the user,
fills the signup form fields it safely can, screenshots everything, and stops
BEFORE any submit. The user watches via screenshots and does the final tap.

HARD RULES (non-negotiable):
  * Never clicks submit/continue/accept/agree/pay/signup buttons.
  * Never fills password, SSN, DOB, payment/card, or security-question fields.
  * Never accepts terms/consent dialogs (dismisses or leaves them).
  * One job per run; fills at most a bounded number of fields.
  * All DB access via sb.py (management-level, RLS-bypassing) — the worker is
    backend, not a client. Service keys are never stored.

Run: cron every 2 minutes. Exits after one job (or no job).
"""
import base64
import io
import json
import os
import re
import subprocess
import sys
import time

SB = ["python3", "/home/hatch/workspace/skills/supabase/bin/sb.py", "query"]
SUPABASE_URL = "https://mrwngntwmnaqrqhupvlt.supabase.co"

# Fields the agent may fill: (label pattern, profile key)
FILLABLE = [
    (re.compile(r"first.?name|given.?name|fname", re.I), "first_name"),
    (re.compile(r"last.?name|family.?name|surname|lname", re.I), "last_name"),
    (re.compile(r"(?<!first )(?<!last )full.?name|^name$", re.I), "name"),
    (re.compile(r"e.?mail", re.I), "email"),
    (re.compile(r"\bstate\b|province|region", re.I), "state"),
    (re.compile(r"zip|postal", re.I), "zip"),
    (re.compile(r"phone|mobile|tel", re.I), "phone"),
]
# Fields the agent must NEVER touch (checked first — deny wins)
FORBIDDEN = re.compile(
    r"passw|ssn|social.?security|dob|birth|card|cvv|cvc|expir|routing|account.?num|"
    r"security.?question|mother.?maiden|pin\b|otp|2fa|verification.?code",
    re.I,
)
# Buttons/links the agent must NEVER click
FORBIDDEN_CLICK = re.compile(
    r"submit|sign.?up|create.?account|continue|accept|agree|consent|pay|checkout|"
    r"buy|purchase|confirm|verify.?identity|i.?agree",
    re.I,
)

MAX_FIELDS = 12
NAV_TIMEOUT = 25000

# SSRF guard: the worker only ever navigates to a URL resolved server-side
# from the routes table (never a client-supplied URL), and that URL must be a
# public http(s) address — no localhost, no private ranges, no metadata IPs,
# no non-standard ports.
import ipaddress
from urllib.parse import urlparse

BLOCKED_HOSTS = {"localhost"}
BLOCKED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def safe_url(raw):
    """Return the URL if it's a public http(s) URL, else None."""
    try:
        u = urlparse((raw or "").strip())
    except Exception:
        return None
    if u.scheme not in ("http", "https") or not u.hostname:
        return None
    host = u.hostname.lower()
    if host in BLOCKED_HOSTS or host.endswith(".localhost"):
        return None
    try:
        ip = ipaddress.ip_address(host)
        if any(ip in net for net in BLOCKED_NETS):
            return None
    except ValueError:
        pass  # hostname, not a literal IP
    if u.port and u.port not in (80, 443):
        return None
    return u.geturl()


def resolve_route_url(route_id):
    """Server-side URL resolution: the ONLY URL the worker may visit."""
    rows = q(
        "SELECT provider_url FROM routes WHERE route_id = %s LIMIT 1"
        % quote_lit(route_id)
    )
    if not rows:
        return None
    return safe_url(rows[0].get("provider_url"))


def quote_lit(s):
    return "'" + (s or "").replace("'", "''") + "'"


def q(sql, retries=3):
    # Beta-test fix (2026-09-24): sb.py subprocess calls flake transiently
    # (proxy hiccups). Retry before giving up — a single flake must never
    # strand a claimed job in 'working' forever.
    last_out, last_err = "", ""
    for attempt in range(retries):
        try:
            r = subprocess.run(SB + [sql], capture_output=True, text=True, timeout=120)
            return json.loads(r.stdout)["result"]
        except Exception:
            last_out, last_err = r.stdout[:300], r.stderr[:300]
            print("SB QUERY FAILED (attempt %d/%d):" % (attempt + 1, retries), last_out, last_err)
            time.sleep(2 * (attempt + 1))
    return None


def claim_job():
    rows = q(
        "UPDATE web_agent_jobs SET status='working', updated_at=now() "
        "WHERE id = (SELECT id FROM web_agent_jobs WHERE status='queued' "
        "ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) "
        "RETURNING id, user_id, route_id, target_url, goal"
    )
    return rows[0] if rows else None


def get_profile(user_id):
    rows = q(
        "SELECT display_name, state FROM profiles WHERE id='%s'" % user_id
    )
    prof = rows[0] if rows else {}
    # email lives on the auth user; fetch via admin-ish path is overkill —
    # use the JWT-free fallback: profiles has no email, so ask sb for it
    return prof


def get_email(user_id):
    # auth.users is not exposed via REST; use the SQL API through sb.py
    rows = q("SELECT email FROM auth.users WHERE id='%s'" % user_id)
    return rows[0]["email"] if rows else ""


def set_status(job_id, status, note=None, error=None):
    sets = ["status='%s'" % status, "updated_at=now()"]
    if note is not None:
        sets.append("agent_note='%s'" % note.replace("'", "''"))
    if error is not None:
        sets.append("error='%s'" % error.replace("'", "''")[:500])
    q("UPDATE web_agent_jobs SET %s WHERE id='%s'" % (", ".join(sets), job_id))


def push_shot(job_id, image_b64, note):
    # Append a screenshot (data URL) to the job's screenshots array
    entry = json.dumps(
        {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
         "note": note,
         "image": "data:image/png;base64," + image_b64}
    )
    q(
        "UPDATE web_agent_jobs SET screenshots = screenshots || '%s'::jsonb, "
        "updated_at=now() WHERE id='%s'" % (entry.replace("'", "''"), job_id)
    )


def field_key(page, el):
    """Identify an input by its accessible name-ish attributes."""
    try:
        return " ".join(filter(None, [
            el.get_attribute("name") or "",
            el.get_attribute("id") or "",
            el.get_attribute("placeholder") or "",
            el.get_attribute("aria-label") or "",
        ]))
    except Exception:
        return ""


def main():
    job = claim_job()
    if not job:
        print("no queued jobs")
        return
    jid = job["id"]
    try:
        _run_job(job, jid)
    except Exception as e:
        # Last-resort guard: the inner flow already sets terminal statuses,
        # but nothing may leave a claimed job stranded in 'working'.
        print("job crashed outside handler:", e)
        try:
            set_status(jid, "failed", error=("crashed: %s" % e)[:300])
        except Exception:
            pass


def _run_job(job, jid):
    # SECURITY: resolve the navigation target server-side from the route's
    # verified provider_url. A client-supplied target_url is never trusted —
    # it is ignored entirely. No route_id or no safe URL => job fails.
    route_id = job.get("route_id")
    if not route_id:
        set_status(jid, "failed", error="no route_id: refusing to visit a client-supplied URL")
        return
    target = resolve_route_url(route_id)
    if not target:
        set_status(jid, "failed", error="no safe provider_url for route %s" % route_id)
        return
    if job.get("target_url") and job["target_url"] != target:
        print("ignoring client target_url (using route provider_url)")
    print("claimed job", jid, target)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        set_status(jid, "failed", error="worker missing playwright")
        return

    prof = get_profile(job["user_id"])
    email = get_email(job["user_id"])
    name = (prof.get("display_name") or "").strip()
    parts = name.split()
    vals = {
        "name": name,
        "first_name": parts[0] if parts else "",
        "last_name": " ".join(parts[1:]) if len(parts) > 1 else "",
        "email": email,
        "state": (prof.get("state") or "").strip(),
        "zip": "",
        "phone": "",
    }

    filled = []
    try:
        with sync_playwright() as pw:
            # Prefer the bundled headless shell; fall back to a full chromium
            # binary (e.g. PLAYWRIGHT_CHROMIUM_PATH) so the worker survives a
            # missing headless-shell install.
            launch_kw: dict = {"headless": True}
            # Honor proxy env when present (sandboxed/egress-filtered nets).
            proxy_srv = (os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "").strip()
            if proxy_srv:
                launch_kw["proxy"] = {"server": proxy_srv}
            exe = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")
            if exe and os.path.exists(exe):
                launch_kw["executable_path"] = exe
            try:
                browser = pw.chromium.launch(**launch_kw)
            except Exception:
                if "executable_path" in launch_kw:
                    raise
                for cand in (
                    os.path.expanduser("~/.cache/ms-playwright/chromium-1243/chrome-linux/chrome"),
                    os.path.expanduser("~/.cache/ms-playwright/chromium-1252/chrome-linux/chrome"),
                ):
                    if os.path.exists(cand):
                        launch_kw["executable_path"] = cand
                        break
                browser = pw.chromium.launch(**launch_kw)
            page = browser.new_page(viewport={"width": 390, "height": 844})  # phone-sized
            try:
                page.goto(target, timeout=NAV_TIMEOUT,
                          wait_until="domcontentloaded")
            except Exception as e:
                set_status(jid, "failed", error="could not load page: %s" % e)
                browser.close()
                return
            page.wait_for_timeout(2500)
            push_shot(jid, shot_b64(page), "Opened the page — looking for the form.")

            # Dismiss cookie/consent banners WITHOUT accepting: prefer
            # reject/close buttons; never click accept/agree.
            for btn in page.query_selector_all("button"):
                try:
                    txt = (btn.inner_text() or "").strip().lower()
                    if re.search(r"reject|decline|close|dismiss|no thanks|not now", txt) \
                            and not FORBIDDEN_CLICK.search(txt):
                        btn.click(timeout=2000)
                        page.wait_for_timeout(800)
                        break
                except Exception:
                    pass

            inputs = page.query_selector_all(
                "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea"
            )
            for el in inputs:
                if len(filled) >= MAX_FIELDS:
                    break
                try:
                    if not el.is_visible():
                        continue
                    key = field_key(page, el)
                    if not key or FORBIDDEN.search(key):
                        continue
                    itype = (el.get_attribute("type") or "").lower()
                    if itype in ("password", "hidden", "submit", "button", "checkbox", "radio", "file"):
                        continue
                    target = None
                    for pat, vkey in FILLABLE:
                        if pat.search(key) and vals.get(vkey):
                            target = vkey
                            break
                    if not target:
                        continue
                    tag = el.evaluate("e => e.tagName.toLowerCase()")
                    if tag == "select":
                        # try matching option by visible text
                        opts = el.query_selector_all("option")
                        for o in opts:
                            if vals[target].lower() in (o.inner_text() or "").lower():
                                el.select_option(index=o.evaluate("e => e.index"))
                                filled.append(key)
                                break
                    else:
                        el.click(timeout=2000)
                        el.fill(vals[target], timeout=3000)
                        filled.append("%s -> %s" % (key.strip()[:40], target))
                    page.wait_for_timeout(400)
                except Exception:
                    continue

            if filled:
                push_shot(jid, shot_b64(page),
                          "Filled %d field(s). Review below — your tap on Submit finishes it." % len(filled))
                set_status(
                    jid, "waiting_user",
                    note=("I filled %d field(s) for you (%s). I stopped before "
                          "any submit button — review everything, then tap it "
                          "yourself. That's the whole remaining job."
                          % (len(filled), ", ".join(f.split(" -> ")[0] for f in filled[:4]))),
                )
            else:
                push_shot(jid, shot_b64(page),
                          "I couldn't find safe fields to fill — the form may need taps only you can do.")
                set_status(
                    jid, "waiting_user",
                    note=("I opened the page but didn't find fields I can safely "
                          "fill (I never touch passwords, SSN, payment, or submit "
                          "buttons). The screenshot shows where you are — take it "
                          "from here."),
                )
            browser.close()
    except Exception as e:
        set_status(jid, "failed", error=str(e)[:300])
        print("job failed:", e)


def shot_b64(page):
    data = page.screenshot(type="png", timeout=15000)
    return base64.b64encode(data).decode()


if __name__ == "__main__":
    main()
