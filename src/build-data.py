"""Normalize the STACK Money Methods workbook into upmore-data.json."""
import openpyxl, json, re

SRC = "/home/hatch/workspace/stack/STACK_Money_Methods_535_Route_Catalog.xlsx"
OUT = "/home/hatch/workspace/stack/data/upmore-data.json"

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

def rows(name):
    ws = wb[name]
    return list(ws.iter_rows(values_only=True))

def clean(v):
    if v is None: return ""
    s = str(v).strip()
    return s

# ---- ranking ----
rank_rows = rows("Earning Difficulty Ranking")
ranking = {}
for r in rank_rows[1:]:
    rid = clean(r[1])
    if not rid: continue
    ranking[rid] = {
        "rank": r[0], "difficulty": r[6], "tier": clean(r[7]),
        "time_to_first": clean(r[8]),
    }

# ---- playbooks ----
pb_rows = rows("Provider Playbooks")
playbooks = {}
for r in pb_rows[1:]:
    rid = clean(r[0])
    if not rid: continue
    try: n = int(r[3])
    except: continue
    playbooks.setdefault(rid, []).append({
        "n": n, "text": clean(r[4]),
        "who": "Upmore" if clean(r[5]) == "STACK" else clean(r[5]),
        "done_when": clean(r[6]), "warns": clean(r[7]),
    })
for rid in playbooks:
    playbooks[rid].sort(key=lambda s: s["n"])

# ---- catalog ----
cat_rows = rows("Route Catalog")
routes = []
for r in cat_rows[1:]:
    rid = clean(r[0])
    if not rid: continue
    rk = ranking.get(rid, {})
    routes.append({
        "id": rid,
        "category": clean(r[1]),
        "provider": clean(r[2]),
        "method": clean(r[3]),
        "what": clean(r[4]),
        "reward": clean(r[5]),
        "requirements": clean(r[6]),
        "payout_timing": clean(r[7]),
        "catches": clean(r[8]),
        "url": clean(r[9]),
        "cash_or_credit": clean(r[11]),
        "earnings_class": clean(r[12]),
        "lane": clean(r[13]) or "Standard",
        "status": clean(r[10]),
        "rank": rk.get("rank"), "difficulty": rk.get("difficulty"),
        "tier": rk.get("tier", ""), "time_to_first": rk.get("time_to_first", ""),
        "steps": playbooks.get(rid, []),
    })

routes.sort(key=lambda x: (x["rank"] is None, x["rank"] or 0))

# ---- excluded ----
ex_rows = rows("Excluded")
excluded = [{"topic": clean(r[0]), "why": clean(r[1])} for r in ex_rows[1:] if clean(r[0])]

# ---- categories ----
cats = {}
for x in routes:
    c = cats.setdefault(x["category"], {"name": x["category"], "count": 0, "steps": 0})
    c["count"] += 1; c["steps"] += len(x["steps"])

data = {
    "version": "535-route catalog 2026-09-21",
    "all_status": "CONFIRM OFFICIAL — researched, live terms not yet captured",
    "routes": routes,
    "categories": sorted(cats.values(), key=lambda c: -c["count"]),
    "excluded": excluded,
}

import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
# Normalize any remaining "STACK" mentions in workbook text to the app name
data = json.loads(json.dumps(data).replace("STACK", "Upmore"))
with open(OUT, "w") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

std = [x for x in routes if x["lane"] == "Standard"]
res = [x for x in routes if x["lane"] != "Standard"]
print("routes:", len(routes), "| standard:", len(std), "| restricted:", len(res))
print("with steps:", sum(1 for x in routes if x["steps"]), "| total steps:", sum(len(x["steps"]) for x in routes))
print("tiers:", sorted(set(x["tier"] for x in routes if x["tier"])))
print("top-3 standard:", [(x["rank"], x["provider"], x["method"]) for x in std[:3]])
print("bytes:", os.path.getsize(OUT))
