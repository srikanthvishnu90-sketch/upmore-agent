#!/usr/bin/env python3
"""Fetch BLS OEWS metropolitan wages through the BLS Public Data API, for the offer benchmark (WO-036).

www.bls.gov refuses automated downloads of the OEWS files (HTTP 403 from CI, 2026-10-20) unless the request carries a
contact email, and no one's email is sent to a third party without the owner saying so. The Public Data API is BLS's
own programmatic route (https://www.bls.gov/developers/), so this asks it for exactly the series pay-maps.json needs:
for each metro and occupation, employment and the annual 25th, 50th and 75th percentiles. The rows it builds have the
OEWS file's columns, so import-oews.py (and its tests) do the rest unchanged.

Series id (https://www.bls.gov/help/hlpforma.htm#OE): OEU + M (metro) + 7-digit area + 000000 (all industries) +
6-digit SOC + 2-digit data type (01 employment, 12 annual 25th percentile, 13 annual median, 14 annual 75th).
Without a key the API allows 25 series a request and 25 requests a day; BLS_API_KEY (free registration), when set,
allows 50 series and 500 requests.
    python3 scripts/career/datasets/fetch-oews-api.py packages/career-data/datasets/bls-oews-metro.json
"""
import importlib.util, json, os, pathlib, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
MAPS = ROOT / "packages/career-data/datasets/pay-maps.json"
API = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
TYPES = {"01": "TOT_EMP", "12": "A_PCT25", "13": "A_MEDIAN", "14": "A_PCT75"}


def series_id(area, soc, dtype):
    return "OEUM" + str(area).zfill(7) + "000000" + soc.replace("-", "") + dtype


def wanted(maps):
    """Every series pay-maps.json needs, as (series id, area, soc, data type)."""
    return [(series_id(m["oews_area"], o["soc"], t), m["oews_area"], o["soc"], t)
            for m in maps["metros"] for o in maps["occupations"] for t in TYPES]


def value_of(point):
    """The cell as the OEWS file writes it: a number, '#' (at or above BLS's top band) or '*' (not released)."""
    v = str(point.get("value", "")).strip()
    notes = " ".join(str(f.get("text", "")) for f in point.get("footnotes") or [] if isinstance(f, dict)).lower()
    if "equal to or greater than" in notes:
        return "#"
    try:
        float(v.replace(",", ""))
        return v
    except ValueError:
        return "*"


def rows_from_api(series, maps):
    """API series (each {seriesID, data: [{year, period, value, footnotes}]}) to OEWS-file rows, plus the year.
    Only the annual point (period A01) of the newest year present in every answered series is used, so one row never
    mixes years."""
    want = {sid: (area, soc, t) for sid, area, soc, t in wanted(maps)}
    years = [max(int(p["year"]) for p in s.get("data") or [] if p.get("period") == "A01")
             for s in series if s.get("seriesID") in want and any(p.get("period") == "A01" for p in s.get("data") or [])]
    if not years:
        return [], None
    year = min(years)
    titles = {m["oews_area"]: m["label"] for m in maps["metros"]}
    occs = {o["soc"]: o["soc_title"] for o in maps["occupations"]}
    rows = {}
    for s in series:
        key = want.get(s.get("seriesID"))
        if not key:
            continue
        area, soc, t = key
        point = next((p for p in s.get("data") or [] if p.get("period") == "A01" and int(p["year"]) == year), None)
        row = rows.setdefault((area, soc), {"AREA": area, "AREA_TITLE": titles[area], "OCC_CODE": soc, "OCC_TITLE": occs[soc],
                                             "TOT_EMP": "*", "A_PCT25": "*", "A_MEDIAN": "*", "A_PCT75": "*"})
        row[TYPES[t]] = value_of(point) if point else "*"
    return [rows[k] for k in sorted(rows)], year


def fetch(ids, key=None, opener=urllib.request.urlopen):
    size = 50 if key else 25
    out = []
    for i in range(0, len(ids), size):
        body = {"seriesid": ids[i:i + size]}
        if key:
            body["registrationkey"] = key
        req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with opener(req, timeout=60) as r:
            got = json.load(r)
        if got.get("status") != "REQUEST_SUCCEEDED":
            raise SystemExit(f"BLS API refused request {i // size + 1}: {got.get('status')} {got.get('message')}")
        out += got.get("Results", {}).get("series", [])
        time.sleep(1)
    return out


def main():
    out = pathlib.Path(sys.argv[1])
    maps = json.loads(MAPS.read_text())
    ids = [sid for sid, *_ in wanted(maps)]
    series = fetch(ids, os.environ.get("BLS_API_KEY") or None)
    rows, year = rows_from_api(series, maps)
    if not rows:
        raise SystemExit("BLS API returned no annual OEWS data for these series")
    spec = importlib.util.spec_from_file_location("import_oews", pathlib.Path(__file__).with_name("import-oews.py"))
    oews = importlib.util.module_from_spec(spec); spec.loader.exec_module(oews)
    got = oews.import_rows(rows, maps, f"May {year}")
    doc = json.loads(out.read_text())
    doc.update({"status": "imported", "source_file": "BLS Public Data API v2 (OEWS series)", **got})
    out.write_text(json.dumps(doc, indent=1) + "\n")
    print(json.dumps({"series": len(ids), "answered": len(series), "cells": len(got["cells"]), "period": f"May {year}"}))


if __name__ == "__main__":
    main()
