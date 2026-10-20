#!/usr/bin/env python3
"""Import BLS OEWS metropolitan-area wages for the offer benchmark (WO-036).

Input: the OEWS "metropolitan and nonmetropolitan area" file (MSA_M20xx_dl.xlsx from bls.gov/oes/tables.htm, or a .csv
with the same columns so the unit test runs on a tiny fixture). Output: only the occupations and metros named in
packages/career-data/datasets/pay-maps.json, with employment and the annual 25th, 50th and 75th percentiles.
BLS marks a wage at or above its top band with "#" and a suppressed estimate with "*"; neither becomes a number.
    python3 scripts/career/datasets/import-oews.py <file> packages/career-data/datasets/bls-oews-metro.json "May 2024"
"""
import csv, json, pathlib, sys

MAPS = pathlib.Path(__file__).resolve().parents[3] / "packages/career-data/datasets/pay-maps.json"
NEED = ["AREA", "AREA_TITLE", "OCC_CODE", "OCC_TITLE", "TOT_EMP", "A_PCT25", "A_MEDIAN", "A_PCT75"]


def wage(v):
    """An annual wage, or (None, flag): '#' is at or above BLS's top band, '*' or '**' is not released."""
    s = str(v if v is not None else "").replace(",", "").strip()
    if s == "#":
        return None, "top_coded"
    try:
        n = float(s)
        return (round(n), None) if n > 0 else (None, "not_released")
    except ValueError:
        return None, "not_released"


def metro_for(area, title, metros):
    for m in metros:
        if str(area).strip() == m["oews_area"]:
            return m["key"]
    # A vintage that renumbers an area keeps its principal city first in the title ("New York-Newark-Jersey City, ...").
    first = str(title or "").split("-")[0].split(",")[0].strip().lower()
    for m in metros:
        if first and first == m["oews_first_city"].lower():
            return m["key"]
    return None


def import_rows(rows, maps, period):
    socs = {o["soc"]: o for o in maps["occupations"]}
    cells = []
    for r in rows:
        soc = str(r.get("OCC_CODE") or "").strip()
        if soc not in socs:
            continue
        metro = metro_for(r.get("AREA"), r.get("AREA_TITLE"), maps["metros"])
        if not metro:
            continue
        cell = {"soc": soc, "occupation": str(r.get("OCC_TITLE") or "").strip(), "metro": metro,
                "area": str(r.get("AREA") or "").strip(), "area_title": str(r.get("AREA_TITLE") or "").strip(),
                "employment": None, "flags": []}
        try:
            cell["employment"] = int(float(str(r.get("TOT_EMP") or "").replace(",", "")))
        except ValueError:
            pass
        for k, col in (("p25", "A_PCT25"), ("median", "A_MEDIAN"), ("p75", "A_PCT75")):
            v, flag = wage(r.get(col))
            cell[k] = v
            if flag:
                cell["flags"].append(f"{k}_{flag}")
        cells.append(cell)
    cells.sort(key=lambda c: (c["metro"], c["soc"]))
    return {"reference_period": period, "cells": cells}


def rows_from_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            yield {k.upper(): v for k, v in r.items()}


def rows_from_xlsx(path):
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True).active
    it = ws.iter_rows(values_only=True)
    header = [str(h or "").upper() for h in next(it)]
    idx = {k: header.index(k) for k in NEED}
    for row in it:
        yield {k: row[i] for k, i in idx.items()}


def main():
    src, out, period = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = rows_from_csv(src) if src.endswith(".csv") else rows_from_xlsx(src)
    got = import_rows(rows, json.loads(MAPS.read_text()), period)
    with open(out) as f:
        doc = json.load(f)
    doc.update({"status": "imported", "source_file": src.split("/")[-1], **got})
    with open(out, "w") as f:
        json.dump(doc, f, indent=1)
    print(json.dumps({"cells": len(got["cells"])}))


if __name__ == "__main__":
    main()
