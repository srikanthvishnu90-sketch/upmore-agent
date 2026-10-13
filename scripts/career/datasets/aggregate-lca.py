#!/usr/bin/env python3
"""Aggregate DOL H-1B LCA disclosure data to ONLY the CIR companies (finisher lane C).

Input: an OFLC LCA disclosure file (.xlsx from dol.gov performance-data page, or .csv
with the same columns — csv exists so unit tests can run on a tiny fixture).
Output: aggregate JSON only (counts by SOC/title + annualized wage stats per company).
No raw rows are retained. Employer matching is by distinctive normalized substring,
documented in MATCHERS; ambiguous generic names are deliberately not matched.
"""
import csv, json, re, statistics, sys
from collections import Counter, defaultdict

# company_id -> list of normalized employer-name substrings (normalized: upper, no punctuation)
MATCHERS = {
    "airbnb": ["AIRBNB"],
    "amazon": ["AMAZON COM", "AMAZON WEB SERVICES", "AMAZONCOM", "AMAZON CORPORATE"],
    "anduril": ["ANDURIL"],
    "bain": ["BAIN COMPANY"],
    "bcg": ["BOSTON CONSULTING GROUP"],
    "blackstone": ["BLACKSTONE"],
    "citadel-securities": ["CITADEL SECURITIES"],
    "coinbase": ["COINBASE"],
    "datadog": ["DATADOG"],
    "de-shaw": ["D E SHAW"],
    "deloitte-consulting": ["DELOITTE CONSULTING", "DELOITTE LLP", "DELOITTE TOUCHE"],
    "duolingo": ["DUOLINGO"],
    "evercore": ["EVERCORE"],
    "figma": ["FIGMA"],
    "goldman-sachs-ibd": ["GOLDMAN SACHS"],
    "google": ["GOOGLE"],
    "hudson-river-trading": ["HUDSON RIVER TRADING"],
    "jane-street": ["JANE STREET"],
    "jpmorgan-ibd": ["JPMORGAN", "JP MORGAN", "JPMORGANCHASE"],
    "kkr": ["KKR "],
    "lazard": ["LAZARD"],
    "mckinsey": ["MCKINSEY"],
    "microsoft": ["MICROSOFT"],
    "millennium": ["MILLENNIUM MANAGEMENT", "MILLENNIUM ADVISORS"],
    "morgan-stanley-ibd": ["MORGAN STANLEY"],
    "notion": ["NOTION LABS"],
    "palantir": ["PALANTIR"],
    "plaid": ["PLAID"],
    "point72": ["POINT72"],
    "ramp": ["RAMP BUSINESS", "RAMP INC"],
    "snowflake": ["SNOWFLAKE"],
    "stripe": ["STRIPE"],
    "two-sigma": ["TWO SIGMA"],
}

def normalize_name(name):
    return re.sub(r"[^A-Z0-9 ]", " ", str(name or "").upper()).split()

def match_company(employer_name):
    norm = " " + " ".join(normalize_name(employer_name)) + " "
    for cid, subs in MATCHERS.items():
        for s in subs:
            if s.strip() and s in norm:
                return cid
    return None

def annualize(wage, unit):
    try:
        w = float(wage)
    except (TypeError, ValueError):
        return None
    if w <= 0:
        return None
    u = str(unit or "").strip().lower()
    if u.startswith("year"):
        return w
    if u.startswith("hour"):
        return w * 2080
    if u.startswith("month"):
        return w * 12
    if u.startswith("bi-week") or u.startswith("biweek"):
        return w * 26
    if u.startswith("week"):
        return w * 52
    return None

def aggregate(rows):
    """rows: iterable of dicts with EMPLOYER_NAME, SOC_TITLE, JOB_TITLE,
    WAGE_RATE_OF_PAY_FROM, WAGE_UNIT_OF_PAY, CASE_STATUS."""
    per = {}
    matched = 0
    total = 0
    for r in rows:
        total += 1
        cid = match_company(r.get("EMPLOYER_NAME"))
        if not cid:
            continue
        matched += 1
        c = per.setdefault(cid, {"company_id": cid, "lca_cases": 0, "statuses": Counter(),
                                 "soc_titles": Counter(), "job_titles": Counter(), "wages": []})
        c["lca_cases"] += 1
        if r.get("CASE_STATUS"):
            c["statuses"][str(r["CASE_STATUS"]).strip()] += 1
        if r.get("SOC_TITLE"):
            c["soc_titles"][str(r["SOC_TITLE"]).strip()] += 1
        if r.get("JOB_TITLE"):
            c["job_titles"][str(r["JOB_TITLE"]).strip()] += 1
        w = annualize(r.get("WAGE_RATE_OF_PAY_FROM"), r.get("WAGE_UNIT_OF_PAY"))
        if w:
            c["wages"].append(w)
    companies = []
    for cid in sorted(per):
        c = per[cid]
        wages = sorted(c["wages"])
        companies.append({
            "company_id": cid,
            "lca_cases": c["lca_cases"],
            "case_statuses": dict(c["statuses"].most_common()),
            "top_soc_titles": [{"soc_title": k, "cases": v} for k, v in c["soc_titles"].most_common(5)],
            "top_job_titles": [{"job_title": k, "cases": v} for k, v in c["job_titles"].most_common(5)],
            "wage_annualized_usd": ({"n": len(wages), "median": round(statistics.median(wages)),
                                     "p25": round(wages[len(wages) // 4]), "p75": round(wages[3 * len(wages) // 4])}
                                    if wages else None),
        })
    return {"rows_scanned": total, "rows_matched_to_cir_companies": matched, "companies": companies}

def rows_from_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)

def rows_from_xlsx(path):
    """Fast streaming reader: zip + iterparse over the sheet XML (openpyxl read_only
    took >20 min on the 79MB FY2025 Q4 file in this environment; this takes ~1 min).
    Only the needed columns are materialized, by header name."""
    import re as _re, zipfile
    import xml.etree.ElementTree as ET
    NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    need = ["EMPLOYER_NAME", "SOC_TITLE", "JOB_TITLE", "WAGE_RATE_OF_PAY_FROM", "WAGE_UNIT_OF_PAY", "CASE_STATUS"]
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        with z.open("xl/sharedStrings.xml") as f:
            for _ev, el in ET.iterparse(f, events=("end",)):
                if el.tag == NS + "si":
                    shared.append("".join(t.text or "" for t in el.iter(NS + "t")))
                    el.clear()
    sheet = next(n for n in z.namelist() if _re.match(r"xl/worksheets/sheet1\.xml$", n))
    def col_idx(ref):
        letters = _re.match(r"([A-Z]+)", ref).group(1)
        n = 0
        for ch in letters:
            n = n * 26 + (ord(ch) - 64)
        return n - 1
    header = {}
    with z.open(sheet) as f:
        for _ev, row in ET.iterparse(f, events=("end",)):
            if row.tag != NS + "row":
                continue
            cells = {}
            for c in row.iter(NS + "c"):
                if c.get("t") == "inlineStr":  # openpyxl-written files use inline strings, no <v>
                    is_el = c.find(NS + "is")
                    cells[col_idx(c.get("r"))] = "".join(t.text or "" for t in is_el.iter(NS + "t")) if is_el is not None else ""
                    continue
                v = c.find(NS + "v")
                if v is None:
                    continue
                val = shared[int(v.text)] if c.get("t") == "s" else v.text
                cells[col_idx(c.get("r"))] = val
            if not header:
                header = {name: i for i, name in cells.items()}
                cols = {k: header[k] for k in need}
            else:
                yield {k: cells.get(i) for k, i in cols.items()}
            row.clear()

def main():
    src, out = sys.argv[1], sys.argv[2]
    rows = rows_from_csv(src) if src.endswith(".csv") else rows_from_xlsx(src)
    agg = aggregate(rows)
    with open(out, "w") as f:
        json.dump(agg, f, indent=1)
    print(json.dumps({k: agg[k] for k in ("rows_scanned", "rows_matched_to_cir_companies")}))

if __name__ == "__main__":
    main()
