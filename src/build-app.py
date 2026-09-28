#!/usr/bin/env python3
"""Build the full Upmore app: inject upmore-data.json into the template."""
import base64
import hashlib
import json, pathlib
import re

HERE = pathlib.Path(__file__).parent
data = json.loads((HERE / "data" / "upmore-data.json").read_text())
tpl = (HERE / "upmore-app-template.html").read_text()
ph = "<!--__UPMORE_DATA__-->"
assert ph in tpl, "placeholder missing from template"

# Owner direction 2026-09-23: credit cards are out of the product entirely.
# Retired routes are never displayed anywhere in the app (both list paths
# filter status !== "retired"), so drop them from the served bundle entirely.
# They stay in the source JSON + DB as retired for audit.
# FIX (finance-eval): keep a compact retired name->category lookup so the Guide
# can answer "How do I start with <retired provider>?" honestly ("that's
# retired") instead of pretending it never existed.
retired = [(r.get("provider"), r.get("category")) for r in data.get("routes", [])
           if r.get("status") == "retired" and r.get("provider")]
data["routes"] = [r for r in data.get("routes", []) if r.get("status") != "retired"]
data["retired_providers"] = retired

# Normalize list-valued copy fields to display strings. The template renders
# them inline; a raw JS array would stringify with bare commas ("a.,b").
for r in data.get("routes", []):
    for k in ("catches", "requirements"):
        v = r.get(k)
        if isinstance(v, list):
            r[k] = "; ".join(str(x).strip().rstrip(";") for x in v if str(x).strip())

# JSON with </script> escaped so the inline data can't break the page
payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</script>", "<\\/script>")
script = "<script>\nconst UPMORE_DATA = " + payload + ";\n</script>"
out = tpl.replace(ph, script, 1)

# Keep the hardcoded marketing/copy counts in sync with the real data
n_routes = len(data.get("routes", []))
n_researched = sum(1 for r in data.get("routes", []) if r.get("status") == "researched")
n_steps = sum(len(r.get("steps") or []) for r in data.get("routes", []))
out = out.replace("Search 535 ways to earn…", f"Search {n_routes} ways to earn…")
out = out.replace("(535 routes, 4,953 playbook", f"({n_routes} routes, {n_steps:,} playbook")
out = out.replace("I can look up any of the 535 routes in the catalog",
                  f"I can look up any of the {n_routes} routes in the catalog")
out = out.replace("the real 535-route catalog", f"the real {n_routes}-route catalog")
out = out.replace('"Rebate/Incentive":"tag"',
                  '"Rebate/Incentive":"tag", "Credit Card Bonus":"card",'
                  ' "UGC Video":"gift", "User Testing":"flask", "Promo Arbitrage":"chart",'
                  ' "Buyback/Resale":"gift", "Mystery Shopping":"tag"')
assert "535" not in out.split("const UPMORE_DATA")[0], "stale 535 count remains in template copy"

# Vendor supabase-js inline so the app has zero external script dependencies
js_ph = "<!--__SUPABASE_JS__-->"
assert js_ph in out, "supabase placeholder missing from template"
vendor = (HERE / "vendor" / "supabase-js.min.js").read_text()
assert "createClient" in vendor, "vendored supabase-js looks wrong"
out = out.replace(js_ph, "<script>\n" + vendor + "\n</script>", 1)

# Content-Security-Policy (audit M1): the app is 100% inline scripts, so hash
# each <script> block and emit a strict script-src. Any future inline script
# is picked up automatically at build time; a hash mismatch fails closed
# (browser blocks the script) rather than silently weakening the policy.
script_hashes = []
for m in re.finditer(r"<script>(.*?)</script>", out, re.S):
    digest = hashlib.sha256(m.group(1).encode("utf-8")).digest()
    script_hashes.append("'sha256-" + base64.b64encode(digest).decode() + "'")
assert script_hashes, "no inline script blocks found for CSP hashing"
csp = (
    "default-src 'self'; "
    # Plaid Link loads its SDK + iframe from cdn.plaid.com (SPEC 08). This is
    # the only external script/frame source allowed; everything else stays hashed.
    "script-src " + " ".join(script_hashes) + " https://cdn.plaid.com; "
    # Service worker (sw.js) registers from the same origin; worker-src falls
    # back to script-src, whose hashes only cover inline scripts, so without
    # this the SW registration is blocked by CSP (QA 2026-09-27).
    "worker-src 'self'; "
    "frame-src https://cdn.plaid.com; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self' https://mrwngntwmnaqrqhupvlt.supabase.co wss://mrwngntwmnaqrqhupvlt.supabase.co https://cdn.plaid.com https://*.plaid.com; "
    "object-src 'none'; base-uri 'self'; form-action 'self'"
)
out = out.replace("<head>", "<head>\n<meta http-equiv=\"Content-Security-Policy\" content=\"" + csp + "\">", 1)

dest = HERE / "upmore-app.html"
dest.write_text(out)
print(f"built {dest} ({dest.stat().st_size} bytes)")

# Publish to repo root for Vercel: index.html + sw.js
root = HERE.parent
(root / "index.html").write_text(out)
print(f"published {root / 'index.html'}")
sw_src = HERE / "sw.js"
if sw_src.exists():
    import subprocess
    try:
        build = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=HERE, capture_output=True, text=True).stdout.strip() or "dev"
    except Exception:
        build = "dev"
    sw_text = sw_src.read_text().replace("__BUILD__", build)
    (root / "sw.js").write_text(sw_text)
    print(f"published {root / 'sw.js'} (cache {build})")
icons_src = HERE / "icons"
if icons_src.is_dir():
    import shutil
    icons_dst = root / "icons"
    shutil.rmtree(icons_dst, ignore_errors=True)
    shutil.copytree(icons_src, icons_dst)
    n = len(list(icons_src.iterdir()))
    assert n > 0, "no icons to publish"
    print(f"published {icons_dst} ({n} icons)")
