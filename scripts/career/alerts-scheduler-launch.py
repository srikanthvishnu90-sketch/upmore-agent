#!/usr/bin/env python3
"""Launcher for the alerts scheduler (Depth Lane D, 2026-10-16).

Fetches the Upmore project's API keys in-process through the vault
surrogate (the same pattern as the gauntlet tooling), resolves the
gauntlet test user's id from the product's own GoTrue admin records,
and execs the node scheduler with both values in its environment only.
The service key is never written to disk, never logged, never printed.
"""
import http.client as _hc
import json, os, sys, time, urllib.request, urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response  # noqa: E402

REF = "mrwngntwmnaqrqhupvlt"  # Upmore prod — the career product's own project
BASE = f"https://{REF}.supabase.co"
EMAIL = "gauntlet-test@upmore.test"  # the gauntlet test account — the ONLY user in scope
HERE = os.path.dirname(os.path.abspath(__file__))


def http_get(url, headers):
    req = urllib.request.Request(url, method="GET")
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode()


req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/api-keys", method="GET")
add_surrogate_to_request(req, "custom.supabase", allowed_hosts=["api.supabase.com"])
with urllib.request.urlopen(req, timeout=60) as r:
    keys = read_json_response(r)
SERVICE = next(k["api_key"] for k in keys if k.get("name") == "service_role")

uid, last_err = None, None
for _attempt in range(6):
    try:
        st, raw = http_get(BASE + "/auth/v1/admin/users?per_page=10&filter=" + EMAIL,
                           {"apikey": SERVICE, "Authorization": "Bearer " + SERVICE})
    except _hc.IncompleteRead as e:  # egress drops chunked reads intermittently; salvage + retry
        partial = (e.partial or b"").decode() if isinstance(e.partial, (bytes, bytearray)) else ""
        if EMAIL in partial and '"id"' in partial:
            raw, st = partial, 200
        else:
            last_err = "incomplete read"; time.sleep(2); continue
    except Exception as e:  # noqa: BLE001
        last_err = str(e); time.sleep(2); continue
    if st == 200:
        match = [u for u in json.loads(raw).get("users", []) if (u.get("email") or "").lower() == EMAIL]
        if len(match) == 1:
            uid = match[0]["id"]; break
        last_err = f"expected one test user, found {len(match)}"
    else:
        last_err = f"admin users HTTP {st}"
    time.sleep(2)
if not uid:
    print(f"alerts-scheduler-launch: could not resolve the test user ({last_err})", file=sys.stderr)
    sys.exit(3)

env = dict(os.environ)
env["SUPABASE_SERVICE_KEY"] = SERVICE
env["ALERTS_USER_ID"] = uid
node = "/usr/bin/node"
os.execve(node, [node, os.path.join(HERE, "alerts-scheduler.mjs"), *sys.argv[1:]], env)
