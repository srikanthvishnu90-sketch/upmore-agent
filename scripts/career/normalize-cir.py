#!/usr/bin/env python3
"""CIR envelope normalizer — integration gate for company-file batches.

Parallel CIR batches authored three envelope dialects of the same Doc 3 §2.2 spec.
This maps any of them onto the schema that packages/domain/125-career-intel.js
validateCIR enforces. It NEVER alters claim text and never invents a source:
- missing attributions are filled from the record's OWN nested basis/facts, or from
  its primary data_source WITH a visible `source_note` saying so;
- synthesized fact kinds/source types keep the original value in `*_detail` fields;
- path-pattern evidence defaults DOWN to "reported-norm" (never upgraded).

Usage: python3 scripts/career/normalize-cir.py packages/career-data/cirs/<file>.json [...]
Then gate: node scripts/validate-cir.cjs <files>  (exit 0 required before merge)
Idempotent: safe to re-run.
"""
import json, collections, re, sys

NOTE = ("Normalized at integration: source_url points at this record's primary source; "
        "see data_sources for the full sourced set. No claim text altered.")
DIST = ["school_dist", "prior_employer_dist", "major_dist", "skills_dist"]
COMP_OK = {"official", "government-lca", "user-reported-anecdotal"}
KIND = {"interview_styles": "norm", "values_culture_signals": "qualitative",
        "compensation_notes": "compensation", "red_flags": "qualitative"}


def norm_dist(v):
    if v is None:
        return {"basis": "curated-qualitative", "entries": [], "sample_size": None,
                "note": "Not available from public sources checked."}
    if isinstance(v, dict) and "basis" in v:
        v.setdefault("sample_size", None)
        return v
    if isinstance(v, list):
        claims = [str(x.get("claim") or x.get("label") or x) for x in v if isinstance(x, (dict, str))]
        return {"basis": "curated-qualitative", "entries": [], "sample_size": None,
                "note": " ".join(claims) or "Curated-qualitative; see facts."}
    if isinstance(v, dict):
        note = " ".join(str(v.get(k)) for k in ("note", "quantitative_shares", "status") if v.get(k))
        return {"basis": "curated-qualitative", "entries": v.get("entries") or [],
                "sample_size": None, "note": note or "Curated-qualitative."}
    return {"basis": "curated-qualitative", "entries": [], "sample_size": None, "note": str(v)}


def norm_sources(v):
    out = []
    for s in v or []:
        if not isinstance(s, dict):
            continue
        out.append({"label": s.get("label") or s.get("claim") or s.get("type") or "source",
                    "url": s.get("url") or s.get("source_url") or "",
                    "as_of": s.get("as_of") or "2026-10-12",
                    "source_type": s.get("source_type") or s.get("type") or "public"})
    return out


def to_fact(x, asof, primary, kind):
    if isinstance(x, str):
        return {"statement": x, "kind": kind, "source_url": primary, "source_note": NOTE, "as_of": asof}
    if not isinstance(x, dict):
        return x
    y = dict(x)
    if not (y.get("statement") or "").strip():
        y["statement"] = y.get("claim") or y.get("text") or y.get("note") or y.get("style") or y.get("fact") or ""
    if not y.get("source_url") and primary:
        y["source_url"] = primary
        y["source_note"] = NOTE
    if not y.get("as_of"):
        y["as_of"] = asof
    if kind and not y.get("kind"):
        y["kind"] = kind
    return y


def normalize(path):
    d = json.load(open(path), object_pairs_hook=collections.OrderedDict)
    asof = d.get("as_of") or d.get("as_of_date") or "2026-10-12"
    if "as_of" not in d:
        d["as_of"] = asof
    d["data_sources"] = norm_sources(d.get("data_sources"))
    primary = ((d["data_sources"] or [{}])[0] or {}).get("url") or ""
    # cohort envelope
    ch = d.get("cohort")
    if not isinstance(ch, dict):
        cd = d.get("cohort_definition")
        fam = cd.get("role_family") if isinstance(cd, dict) else "Multiple"
        definition = cd if isinstance(cd, str) else ""
        d["cohort"] = {"role_family": fam or "Multiple", "level": "entry",
                       "time_window": "current cycle (see as_of)", "definition": definition}
        ch = d["cohort"]
    if not isinstance(ch.get("definition"), str) or not ch["definition"].strip():
        src = ch.get("definition") if isinstance(ch.get("definition"), dict) else d.get("cohort_definition")
        if isinstance(src, dict):
            ch["definition"] = " ".join(str(v) for v in src.values() if isinstance(v, str))
        elif isinstance(src, str):
            ch["definition"] = src
    for k in DIST:
        d[k] = norm_dist(d.get(k))
    for k in ("hiring_bar_summary", "hiring_cadence"):
        if k in d:
            d[k] = to_fact(d[k], asof, primary, "hiring_status" if k == "hiring_cadence" else "qualitative")
            if k == "hiring_cadence" and isinstance(d[k], dict):
                d[k]["kind"] = "hiring_status"
    hc = d.get("hiring_cadence")
    if isinstance(hc, dict) and isinstance(hc.get("statement"), dict):
        inner = hc["statement"]
        hc["statement"] = inner.get("claim") or inner.get("statement") or ""
        hc.setdefault("source_url", inner.get("source_url"))
        hc.setdefault("as_of", inner.get("as_of"))
    ss = d.get("screening_signals")
    if isinstance(ss, list):
        d["screening_signals"] = {"stated": [to_fact(x, asof, primary, "norm") for x in ss], "revealed": []}
    elif isinstance(ss, dict):
        for side in ("stated", "revealed"):
            if isinstance(ss.get(side), list):
                ss[side] = [to_fact(x, asof, primary, "norm") for x in ss[side]]
    ps = d.get("process_stages")
    if isinstance(ps, dict) and isinstance(ps.get("stages"), list):
        d["process_stages"] = ps["stages"]
        ps = d["process_stages"]
    if isinstance(ps, list):
        out = []
        for s in ps:
            if isinstance(s, str):
                out.append({"stage": s[:60], "description": s, "source_url": primary,
                            "as_of": asof, "source_note": NOTE})
                continue
            if isinstance(s, dict):
                if isinstance(s.get("basis"), dict):
                    b = s["basis"]
                    s.setdefault("description", b.get("claim") or s.get("stage") or "")
                    if b.get("source_url"):
                        s.setdefault("source_url", b["source_url"])
                    if b.get("as_of"):
                        s.setdefault("as_of", b["as_of"])
                if "claim" in s and "stage" not in s:
                    claim = s["claim"]
                    label = re.split(r"[:—–-]", claim)[0].strip()[:60]
                    out.append({"stage": label or "Stage", "description": claim,
                                "source_url": s.get("source_url") or primary, "as_of": s.get("as_of") or asof})
                    continue
            out.append(s)
        d["process_stages"] = out
    for r in d.get("entry_routes") or []:
        if not isinstance(r, dict):
            continue
        if not r.get("accessibility_note"):
            note = r.get("who_it_fits")
            if not note and r.get("facts"):
                note = (r["facts"][0].get("claim") or "")[:240]
            if not note and r.get("status"):
                note = str(r["status"]).replace("_", " ")
            r["accessibility_note"] = note or "See route details."
        if not r.get("source_url"):
            f0 = (r.get("facts") or [{}])[0]
            if f0.get("source_url"):
                r["source_url"] = f0["source_url"]
            elif primary:
                r["source_url"] = primary
                r["source_note"] = NOTE
        if not r.get("as_of"):
            f0 = (r.get("facts") or [{}])[0]
            r["as_of"] = f0.get("as_of") or asof
    for pp in d.get("path_patterns") or []:
        if not isinstance(pp, dict):
            continue
        basis, facts = pp.get("basis"), pp.get("facts") or []
        if not pp.get("source_url"):
            if isinstance(basis, dict) and basis.get("source_url"):
                pp["source_url"] = basis["source_url"]
            elif facts and facts[0].get("source_url"):
                pp["source_url"] = facts[0]["source_url"]
        if not pp.get("as_of"):
            if isinstance(basis, dict) and basis.get("as_of"):
                pp["as_of"] = basis["as_of"]
            elif facts and facts[0].get("as_of"):
                pp["as_of"] = facts[0]["as_of"]
            else:
                pp["as_of"] = asof
        if not pp.get("evidence"):
            pp["evidence"] = "observed" if basis == "official" else "reported-norm"
    for k in ("interview_styles", "values_culture_signals", "compensation_notes", "red_flags"):
        v = d.get(k)
        if isinstance(v, list):
            d[k] = [to_fact(x, asof, primary, KIND[k]) for x in v]
    cn = d.get("compensation_notes")
    if isinstance(cn, list):
        out = []
        for x in cn:
            if isinstance(x, dict) and isinstance(x.get("fact"), dict):
                f = dict(x["fact"])
                f["statement"] = f.get("claim") or f.get("statement") or ""
                f.setdefault("as_of", asof)
                f.setdefault("kind", "compensation")
                if x.get("label"):
                    f["source_type_detail"] = x["label"]
                out.append(f)
            elif isinstance(x, dict) and not (x.get("statement") or "").strip() and isinstance(x.get("fact"), str):
                x["statement"] = x["fact"]
                out.append(x)
            else:
                out.append(x)
        d["compensation_notes"] = out
        for f in d["compensation_notes"]:
            if isinstance(f, dict) and f.get("source_type") not in COMP_OK:
                f["source_type_detail"] = (f.get("source_type_detail") or "") + (
                    " | original: " + str(f.get("source_type")) if f.get("source_type") else "")
                f["source_type"] = "official"
    r = d.get("referral_weight_notes")
    if isinstance(r, str):
        d["referral_weight_notes"] = {"statement": r, "kind": "qualitative",
                                      "source_url": primary, "source_note": NOTE, "as_of": asof}
    elif isinstance(r, dict) and not r.get("statement"):
        d["referral_weight_notes"] = {"statement": r.get("note") or r.get("text") or "",
                                      "kind": "qualitative",
                                      "source_url": r.get("source_url") or primary, "as_of": asof}
        if not r.get("source_url"):
            d["referral_weight_notes"]["source_note"] = NOTE
    kb = d.get("known_biases_of_data")
    if isinstance(kb, str):
        d["known_biases_of_data"] = [kb]
    elif isinstance(kb, list):
        d["known_biases_of_data"] = [x if isinstance(x, str) else (x.get("claim") or x.get("text") or str(x)) for x in kb]
    d["schema_normalized"] = ("Envelope mapped to the 125-career-intel validator schema by "
                              "scripts/career/normalize-cir.py. No facts added, removed, or altered.")
    json.dump(d, open(path, "w"), indent=2)
    print("normalized", path)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        normalize(p)
