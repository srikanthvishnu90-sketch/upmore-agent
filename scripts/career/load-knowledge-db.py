#!/usr/bin/env python3
"""Load the career knowledge libraries into the Upmore Supabase project.

Owner order 2026-10-14: "when these tasks are done, implement all of them
into the database."

Sources (all under ~/workspace/your_files/):
  hired-research/   Mega Task 1: 00-taxonomy.md (849 base occupations +
                    market splits), per-role deep files, INDEX.md,
                    corpus/postings.jsonl + corpus/stats.json
  resume-skills/    Mega Task 3: per-role resume+skills files, INDEX.md
  packages/career-data/board-directory.json   Mega Task 2 directory v2

Target: Upmore Supabase ONLY (ref mrwngntwmnaqrqhupvlt), NEW additive
tables career_kb_* created by supabase/migrations/20261015010000_career_
knowledge_base.sql. Loads run through sb.py (Management API, service
role). Idempotent: rows are diffed by content_hash against the DB and
only new/changed rows are written; re-running changes nothing.

Usage:
  load-knowledge-db.py load [--stage test|final] [--log]
  load-knowledge-db.py verify
  load-knowledge-db.py watch [--log]   # poll the two INDEX files; when
                                       # MT1 and MT3 are both complete,
                                       # run the final load + verify

Reports land in ~/workspace/your_files/knowledge-db/.

Transport note: sb.py truncates query OUTPUT at ~4 KB, so the differ
never bulk-downloads keys or hashes. It probes with aggregate counts
over (key, hash) chunks and drills down only where a chunk differs —
the same reason verification queries below return single rows or
short spot reads.
"""
import argparse, hashlib, json, os, re, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
YF = HOME / "workspace/your_files"
HR = YF / "hired-research"
RS = YF / "resume-skills"
REPO = HOME / "workspace/upmore-career"
SB = HOME / "workspace/skills/supabase/bin/sb.py"
REF = "mrwngntwmnaqrqhupvlt"  # Upmore. Never Sporv, never Ring.
REPORT_DIR = YF / "knowledge-db"
REPORTS_LOG = YF / "upmore-agent-reports-log.md"
MIGRATION = REPO / "supabase/migrations/20261015010000_career_knowledge_base.sql"

# ---------------------------------------------------------------- sb.py
def sb(sql, timeout=900):
    env = dict(os.environ, SUPABASE_REF=REF)
    p = subprocess.run([str(SB), "query", "-"], input=sql, capture_output=True,
                       text=True, env=env, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError(f"sb.py failed rc={p.returncode}: {p.stderr.strip()[:400]} :: {p.stdout.strip()[:400]}")
    out = p.stdout.strip()
    if not out:
        return []
    doc = json.loads(out)
    if isinstance(doc, dict) and doc.get("status", 200) >= 400:
        raise RuntimeError(f"sb.py query error: {out[:400]}")
    return doc.get("result", []) if isinstance(doc, dict) else doc

def sb_retry(sql, tries=3):
    last = None
    for i in range(tries):
        try:
            return sb(sql)
        except Exception as e:
            last = e
            time.sleep(5 * (i + 1))
    raise last

# ---------------------------------------------------------------- sql lit
def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"

def lit_json(v):
    return lit(json.dumps(v, ensure_ascii=False, sort_keys=True)) + "::jsonb"

def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

# ---------------------------------------------------------------- md parse
HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")

def split_blocks(text):
    """Return list of (level, heading, own_text). own_text excludes sub-blocks."""
    blocks, cur = [], None
    for line in text.splitlines():
        m = HEADING_RE.match(line)
        if m:
            if cur:
                blocks.append(cur)
            cur = [len(m.group(1)), m.group(2).strip(), []]
        elif cur is not None:
            cur[2].append(line)
    if cur:
        blocks.append(cur)
    return [(lv, h, "\n".join(t).strip()) for lv, h, t in blocks]

def block_full(blocks, i):
    """Text of block i including all deeper-level children, headings kept."""
    lv, h, own = blocks[i]
    parts = [own] if own else []
    j = i + 1
    while j < len(blocks) and blocks[j][0] > lv:
        parts.append(("#" * blocks[j][0]) + " " + blocks[j][1])
        if blocks[j][2]:
            parts.append(blocks[j][2])
        j += 1
    return "\n\n".join(p for p in parts if p).strip()

def norm_title(t):
    t = t.lower().replace("&", " and ")
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def tokens(t):
    out = set()
    for w in norm_title(t).split():
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.add(w)
    return out

def title_sig(t):
    return " ".join(sorted(tokens(t)))

# ---------------------------------------------------------------- taxonomy
def parse_taxonomy():
    text = (HR / "00-taxonomy.md").read_text(encoding="utf-8")
    part_b = text.split("# PART B", 1)[1] if "# PART B" in text else text
    lines, sector_code, sector_name = {}, None, None
    for raw in part_b.splitlines():
        g = re.match(r"^## (\d{2})\s*[—–-]\s*(.+?)\s*$", raw)
        if g:
            sector_code = g.group(1)
            sector_name = re.sub(r"\s*\(\d+\)\s*$", "", g.group(2)).strip()
            continue
        m = re.match(r"^\| (\d{2}-\d{4}) \| ([^|]+) \| ([^|]+) \|", raw)
        if m:
            soc, title, emp = m.group(1), m.group(2).strip(), m.group(3).strip()
            try:
                emp_v = float(emp.replace(",", ""))
            except ValueError:
                emp_v = None
            lines[soc] = dict(soc=soc, title=title, employment=emp_v,
                              sector_code=sector_code, sector_name=sector_name)
    splits = []
    if "## A2." in text:
        a2 = text.split("## A2.", 1)[1].split("\n# PART B", 1)[0]
        for raw in a2.splitlines():
            m = re.match(r"^\| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|", raw)
            if m:
                parent = re.search(r"\d{2}-\d{4}", m.group(3))
                fnum = re.search(r"\d+", m.group(5))
                if fnum:
                    splits.append(dict(file_no=int(fnum.group(0)),
                                       title=m.group(2).strip(),
                                       parent_soc=parent.group(0) if parent else None))
    return lines, splits

# ---------------------------------------------------------------- MT1 files
EVIDENCE_KEYS = {"2.1": "postings_analyzed", "2.2": "hired_patterns",
                 "2.3": "recruiting_mechanics", "2.4": "timeline",
                 "2.5": "pay_evidence", "2.6": "myths"}

def classify_block(h):
    hu = h.upper()
    if "STATISTICS" in hu or re.search(r"\bBLOCK A\b", hu):
        return "stats"
    if "ACQUISITION" in hu or re.search(r"\bBLOCK B\b", hu):
        return "acq"
    if re.search(r"DON\W?T KNOW", hu) or re.search(r"\bBLOCK C\b", hu):
        return "unknown"
    return None

def parse_mt1(text):
    blocks = split_blocks(text)
    classes = [classify_block(h) for _, h, _ in blocks]
    out = dict(brief=None, evidence={}, experience_statistics=None,
               acquisition_methodology=None, unknown_unknowns=None,
               method_note=None)
    for i, (lv, h, own) in enumerate(blocks):
        hu = h.upper()
        if lv == 2 and re.match(r"1\.", h) and "BRIEF" in hu and out["brief"] is None:
            out["brief"] = block_full(blocks, i)
        elif lv == 2 and re.match(r"2\.", h) and "EVIDENCE" in hu and not out["evidence"]:
            j = i + 1
            while j < len(blocks) and blocks[j][0] > 2:
                num = re.match(r"(2\.\d)(\s|$)", blocks[j][1])
                if num and num.group(1) in EVIDENCE_KEYS \
                        and EVIDENCE_KEYS[num.group(1)] not in out["evidence"]:
                    out["evidence"][EVIDENCE_KEYS[num.group(1)]] = block_full(blocks, j)
                j += 1
            if not out["evidence"] and own:
                out["evidence"] = {"full": own}
        elif lv == 2 and "METHOD" in hu and "ACQUISITION" not in hu \
                and classes[i] is None and out["method_note"] is None:
            out["method_note"] = block_full(blocks, i)
    # depth blocks: absorb following unlabeled same-or-deeper blocks (some
    # files hang the content in sibling "Recipe N" / "Prerequisite N" blocks,
    # and some write the content inline in a long heading line itself)
    def content(idx):
        lv2, h2, _ = blocks[idx]
        head = h2 if len(h2) > 120 else ""
        body = block_full(blocks, idx)
        return (head + "\n\n" + body).strip() if head else body
    for cls, field in (("stats", "experience_statistics"),
                       ("acq", "acquisition_methodology"),
                       ("unknown", "unknown_unknowns")):
        for i, (lv, h, own) in enumerate(blocks):
            if classes[i] == cls and out[field] is None:
                parts = [content(i)]
                j = i + 1
                while j < len(blocks) and blocks[j][0] > lv:
                    j += 1
                while j < len(blocks) and classes[j] is None and blocks[j][0] >= lv:
                    parts.append(content(j))
                    k = j + 1
                    while k < len(blocks) and blocks[k][0] > blocks[j][0]:
                        k += 1
                    j = k
                out[field] = "\n\n".join(p for p in parts if p).strip() or None
                break
    return out

def h1_title(text, kind):
    m = re.search(r"^# .+?—\s*(?:SOC\s+\d{2}-\d{4}|\d+):\s*(.+?)\s*$", text, re.M)
    if m:
        return m.group(1).strip()
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else ""

def researched_on(text):
    m = re.search(r"Researched:\s*([A-Za-z]+ \d{1,2}, \d{4})", text)
    return m.group(1) if m else None

def slugify(t):
    return re.sub(r"[^a-z0-9]+", "-", norm_title(t)).strip("-")

def match_files_to_roles(lines, splits):
    """Build role rows from taxonomy lines + splits and the MT1 files.
    Returns (roles, audit) where audit records every non-obvious decision."""
    files = sorted(p for p in HR.glob("*.md")
                   if p.name not in ("00-taxonomy.md", "INDEX.md", "CLAIMS.md"))
    split_by_no = {s["file_no"]: s for s in splits}
    audit = dict(exact=[], sig=[], fuzzy=[], body_soc=[], soc_filename=[], splits=[], shared=[],
                 duplicates=[], failures=[], conflicts=[])
    file_role = {}      # filename -> role_key (for MT3 pairing)
    primary = {}        # role_key -> file path
    alternate = {}      # role_key -> [file paths]
    split_files = {}    # file_no -> path

    numbered, socfiles = [], []
    for p in files:
        if p.name.startswith("soc-"):
            socfiles.append(p)
        else:
            numbered.append(p)

    title_to_soc, sig_to_soc = {}, {}
    for soc, ln in lines.items():
        title_to_soc.setdefault(norm_title(ln["title"]), soc)
        sig_to_soc.setdefault(title_sig(ln["title"]), soc)

    def assign(role_key, path, how, soc=None):
        if role_key in primary:
            alternate.setdefault(role_key, []).append(path)
            audit["duplicates"].append((soc or role_key, primary[role_key].name, path.name))
        else:
            primary[role_key] = path
            audit[how].append((soc or role_key, path.name))
        file_role[path.name] = role_key

    # numbered files: splits first, then title match
    deferred = []
    for p in numbered:
        m = re.match(r"(\d+)-", p.name)
        no = int(m.group(1)) if m else None
        if no in split_by_no:
            split_files[no] = p
            continue
        text = p.read_text(encoding="utf-8")
        title = h1_title(text, "mt1")
        soc = title_to_soc.get(norm_title(title))
        how = "exact"
        if not soc:
            soc = sig_to_soc.get(title_sig(title))
            how = "sig"
        if soc:
            assign(f"soc:{soc}", p, how, soc)
        else:
            deferred.append((p, title))
    # fuzzy pass for deferred numbered files (lines with a soc- file on disk
    # are claimed by filename below and are never preempted by a guess)
    soc_file_socs = set()
    for p in socfiles:
        mm = re.match(r"soc-(\d{2}-\d{4})-", p.name)
        if mm and mm.group(1) in lines:
            soc_file_socs.add(mm.group(1))
    deferred_files = []
    remaining = [s for s in lines if f"soc:{s}" not in primary and s not in soc_file_socs]
    for p, title in deferred:
        tt = tokens(title)
        best, second = None, 0.0
        for soc in remaining:
            lt = tokens(lines[soc]["title"])
            if not lt:
                continue
            j = len(tt & lt) / max(1, len(tt | lt))
            if best is None or j > best[1]:
                second = best[1] if best else 0.0
                best = (soc, j)
            elif j > second:
                second = j
        if best and best[1] >= 0.6 and best[1] - second >= 0.1:
            assign(f"soc:{best[0]}", p, "fuzzy", best[0])
            remaining.remove(best[0])
        else:
            # Not a failure yet: family files (e.g. 13 Physician, 20 Broker/Agent)
            # are claimed by their lines in the shared pass below. Only files no
            # line claims end up as failures.
            deferred_files.append(p)
    # body-SOC pass: a deferred file that prints exactly one still-unassigned
    # taxonomy SOC code is that occupation's file (short wave-1 titles).
    still = []
    remaining = [s for s in lines if f"soc:{s}" not in primary and s not in soc_file_socs]
    for p in deferred_files:
        text = p.read_text(encoding="utf-8")
        found = set(re.findall(r"\b\d{2}-\d{4}\b", text)) & set(remaining)
        if len(found) == 1:
            soc = next(iter(found))
            assign(f"soc:{soc}", p, "body_soc", soc)
            remaining.remove(soc)
        else:
            still.append(p)
    deferred_files = still
    # soc- files
    for p in socfiles:
        m = re.match(r"soc-(\d{2}-\d{4})-", p.name)
        if not m:
            audit["failures"].append((p.name, "soc- filename without a SOC code"))
            continue
        soc = m.group(1)
        if soc not in lines:
            audit["failures"].append((p.name, f"SOC {soc} not in taxonomy"))
            continue
        assign(f"soc:{soc}", p, "soc_filename", soc)
    # shared coverage: leftover lines claimed by a related file — one that
    # literally prints the line's SOC code or declares its SOC family, and is
    # either unclaimed itself (family files like 13 Physician) or already
    # primary for a sibling line in the same SOC family (first 5 chars).
    used_as_primary = set(primary.values())
    for soc in [s for s in lines if f"soc:{s}" not in primary]:
        cands = []
        for p in numbered + socfiles:
            txt = p.read_text(encoding="utf-8")
            fam = re.search(r"SOC\s+(\d{2}-\d{4})\s+family", txt)
            declares = bool(fam) and fam.group(1)[:5] == soc[:5]
            related = (p in deferred_files or declares
                       or (file_role.get(p.name, "")[4:9] == soc[:5]))
            if (soc in txt or declares) and related:
                tt = tokens(h1_title(txt, "mt1"))
                lt = tokens(lines[soc]["title"])
                overlap = len(tt & lt) / max(1, len(tt | lt))
                score = (4 if declares else 0) + (2 if p in deferred_files else 0) + overlap
                cands.append((score, p))
        cands.sort(key=lambda x: -x[0])
        if cands and (len(cands) == 1 or cands[0][0] - cands[1][0] >= 0.5):
            key = f"soc:{soc}"
            p = cands[0][1]
            if p in used_as_primary:
                audit["shared"].append((soc, p.name))
            else:
                used_as_primary.add(p)
            primary[key] = p
            file_role.setdefault(p.name, key)
        elif cands:
            audit["failures"].append((f"taxonomy {soc}",
                                      f"tied shared-coverage claims: {[(round(s, 2), p.name) for s, p in cands]}"))
        else:
            audit["failures"].append((f"taxonomy {soc} ({lines[soc]['title']})",
                                      "no file found for this taxonomy line"))
    for p in deferred_files:
        if p not in primary.values():
            audit["failures"].append((p.name, "numbered file claimed by no taxonomy line"))
    # splits
    for s in splits:
        p = split_files.get(s["file_no"])
        if p is None:
            audit["failures"].append((f"split file {s['file_no']:02d} ({s['title']})",
                                      "split file not on disk"))
            continue
        slug = re.sub(r"^\d+-", "", p.stem)
        key = f"split:{slug}"
        primary[key] = p
        file_role[p.name] = key
        audit["splits"].append((s["title"], p.name))

    roles = []
    for soc, ln in lines.items():
        key = f"soc:{soc}"
        p = primary.get(key)
        if p is None:
            continue
        text = p.read_text(encoding="utf-8")
        parsed = parse_mt1(text)
        shared = any(s == soc for s, _ in audit["shared"])
        srcs = [dict(file=p.name, bytes=p.stat().st_size, sha256=sha(text),
                     relation="shared" if shared else "primary")]
        for alt in alternate.get(key, []):
            atext = alt.read_text(encoding="utf-8")
            srcs.append(dict(file=alt.name, bytes=alt.stat().st_size,
                             sha256=sha(atext), relation="alternate"))
        slug = slugify(ln["title"]) if shared else re.sub(r"^(soc-\d{2}-\d{4}-|\d+-)", "", p.stem)
        roles.append(dict(
            role_key=key, soc_code=soc, slug=slug, title=ln["title"],
            sector_code=ln["sector_code"], sector_name=ln["sector_name"],
            employment_2024_k=ln["employment"], is_market_split=False,
            parent_soc_code=None, brief=parsed["brief"], evidence=parsed["evidence"],
            experience_statistics=parsed["experience_statistics"],
            acquisition_methodology=parsed["acquisition_methodology"],
            unknown_unknowns=parsed["unknown_unknowns"],
            method_note=parsed["method_note"], full_text=text,
            source_files=srcs, researched_on=researched_on(text),
            source_vintage=f"hired-research library, file researched {researched_on(text) or 'n/d'}",
            _parsed=parsed))
    for s in splits:
        p = split_files.get(s["file_no"])
        if p is None:
            continue
        text = p.read_text(encoding="utf-8")
        parsed = parse_mt1(text)
        slug = re.sub(r"^\d+-", "", p.stem)
        parent = lines.get(s["parent_soc"] or "", {})
        roles.append(dict(
            role_key=f"split:{slug}", soc_code=s["parent_soc"], slug=slug,
            title=s["title"], sector_code=parent.get("sector_code"),
            sector_name=parent.get("sector_name"), employment_2024_k=None,
            is_market_split=True, parent_soc_code=s["parent_soc"],
            brief=parsed["brief"], evidence=parsed["evidence"],
            experience_statistics=parsed["experience_statistics"],
            acquisition_methodology=parsed["acquisition_methodology"],
            unknown_unknowns=parsed["unknown_unknowns"],
            method_note=parsed["method_note"], full_text=text,
            source_files=[dict(file=p.name, bytes=p.stat().st_size,
                               sha256=sha(text), relation="primary")],
            researched_on=researched_on(text),
            source_vintage=f"hired-research library, file researched {researched_on(text) or 'n/d'}",
            _parsed=parsed))
    return roles, audit, file_role

# ---------------------------------------------------------------- MT3 files
MT3_SECTIONS = {"1": "what_gets_picked", "2": "exact_skills", "3": "learn_order",
                "4": "learn_methods", "5": "resume_killers", "6": "keyword_reality"}

def parse_mt3(text):
    blocks = split_blocks(text)
    secs = {}
    for i, (lv, h, own) in enumerate(blocks):
        if lv == 2:
            num = re.match(r"(\d)\.", h)
            if num and num.group(1) in MT3_SECTIONS:
                secs[MT3_SECTIONS[num.group(1)]] = block_full(blocks, i)
    return secs

def keyword_terms(sec6):
    if not sec6:
        return None
    for pat in (r"repeated requirement terms are ([^.]+)\.",
                r"repeated terms are ([^.]+)\.",
                r"requirement terms are ([^.]+)\."):
        m = re.search(pat, sec6, re.I)
        if m:
            items = re.split(r",|\band\b", m.group(1))
            items = [re.sub(r"\s+", " ", x).strip(" .") for x in items]
            items = [re.sub(r"^with\s+", "", x) for x in items]
            items = [x for x in items if 0 < len(x) <= 60]
            if len(items) >= 3:
                return items[:16]
    return None

def build_skills(file_role, file_multi, lines, splits):
    rows, failures, methods, notes = [], [], {}, []
    split_titles = {norm_title(s["title"]): s for s in splits}
    for p in sorted(RS.glob("*.md")):
        if p.name in ("INDEX.md", "00-worker-brief.md"):
            continue
        text = p.read_text(encoding="utf-8")
        secs = parse_mt3(text)
        if len(secs) < 4:
            failures.append((p.name, f"only {len(secs)} of 6 sections parsed"))
            continue
        role_key, method = None, None
        pm = re.search(r"Pairs with:\s*`hired-research/([^`]+)`", text)
        pairs = pm.group(1) if pm else None
        title = h1_title(text, "mt3")
        if pairs and pairs in file_role:
            served = file_multi.get(pairs, [file_role[pairs]])
            if len(served) == 1:
                role_key, method = served[0], "pairs_with"
            else:
                # the paired MT1 file serves several lines (a family file):
                # this MT3 file belongs to the served line it names
                hm = re.search(r"\(SOC\s+(\d{2}-\d{4})\)", text[:600])
                if hm and f"soc:{hm.group(1)}" in served:
                    role_key, method = f"soc:{hm.group(1)}", "pairs_with_served_soc"
                else:
                    hit = None
                    for k in served:
                        if k.startswith("soc:") and (
                                norm_title(lines[k[4:]]["title"]) == norm_title(title)
                                or title_sig(lines[k[4:]]["title"]) == title_sig(title)):
                            hit = k
                            break
                    if hit:
                        role_key, method = hit, "pairs_with_served_title"
                    else:
                        role_key, method = file_role[pairs], "pairs_with_family_anchor"
                        notes.append((p.name, role_key, pairs))
        if role_key is None:
            hm = re.search(r"^# .+?\(SOC\s+(\d{2}-\d{4})\)", text, re.M)
            if hm and hm.group(1) in lines:
                role_key, method = f"soc:{hm.group(1)}", "h1_soc"
        if role_key is None:
            title = h1_title(text, "mt3")
            soc = None
            for ln_soc, ln in lines.items():
                if norm_title(ln["title"]) == norm_title(title):
                    soc = ln_soc
                    break
            if soc:
                role_key, method = f"soc:{soc}", "title_match"
            elif norm_title(title) in split_titles:
                s = split_titles[norm_title(title)]
                role_key, method = None, None
                # resolve via the paired MT1 split file number
                if pairs:
                    role_key, method = file_role.get(pairs), "pairs_with_split"
        if role_key is None:
            failures.append((p.name, f"could not resolve role (pairs_with={pairs!r})"))
            continue
        methods[method] = methods.get(method, 0) + 1
        em = re.search(r"\*\*Evidence note:\*\*\s*(.+?)(?=\n\n|\n---)", text, re.S)
        n1 = re.search(r"Across the (\d+) postings", secs.get("keyword_reality") or "")
        n2 = re.search(r"(\d+) postings (?:read in full|were coded|coded for this file|analyzed)", text)
        n3 = re.search(r"set of (\d+) postings", text)
        n_any = n1 or n2 or n3
        rows.append(dict(
            role_key=role_key, soc_code=role_key[4:11] if role_key.startswith("soc:") else None,
            slug=re.sub(r"^\d+-", "", p.stem).replace("-resume-skills", ""),
            title=h1_title(text, "mt3"),
            what_gets_picked=secs.get("what_gets_picked"),
            exact_skills=secs.get("exact_skills"), learn_order=secs.get("learn_order"),
            learn_methods=secs.get("learn_methods"),
            resume_killers=secs.get("resume_killers"),
            keyword_reality=secs.get("keyword_reality"),
            keyword_terms=keyword_terms(secs.get("keyword_reality")),
            postings_basis_n=int(n_any.group(1)) if n_any else None,
            evidence_note=re.sub(r"\s+", " ", em.group(1)).strip() if em else None,
            pairs_with_file=pairs, full_text=text, source_file=p.name,
            source_bytes=p.stat().st_size,
            source_vintage=f"resume-skills library, file researched {researched_on(text) or 'n/d'}",
            _secs=secs))
    return rows, failures, methods, notes

# ---------------------------------------------------------------- corpus + boards
def build_postings(url_shape_counts=None):
    stats = json.loads((HR / "corpus/stats.json").read_text(encoding="utf-8"))
    vintage = f"corpus/postings.jsonl fetched {stats.get('fetched')}, total {stats.get('total')}"
    rows, bad = [], 0
    known = {"key", "source", "board", "company", "title", "location", "url",
             "posted", "fetched", "cluster", "text"}
    with open(HR / "corpus/postings.jsonl", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                bad += 1
                continue
            posted_at = None
            if r.get("posted"):
                try:
                    from datetime import datetime as _dt
                    posted_at = _dt.fromisoformat(str(r["posted"]).replace("Z", "+00:00")).isoformat()
                except ValueError:
                    posted_at = None
            rows.append(dict(
                posting_key=r.get("key"), source=r.get("source"), board=r.get("board"),
                company=r.get("company"), title=r.get("title"), location=r.get("location"),
                url=r.get("url"), posted_at=posted_at, posted_raw=str(r.get("posted")) if r.get("posted") else None,
                fetched_on=r.get("fetched"), cluster=r.get("cluster"),
                text_excerpt=r.get("text"),
                extra={k: v for k, v in r.items() if k not in known},
                corpus_vintage=vintage, _raw=line))
    # Share the exact domain classifier with the serving path; no duplicate
    # URL grammar in Python. Failure happens before run_load reaches any DB I/O.
    kept = []
    classifier = Path(__file__).resolve().with_name("classify-posting-urls.cjs")
    for offset in range(0, len(rows), 500):
        batch = rows[offset:offset + 500]
        result = subprocess.run(["node", str(classifier)],
                                input=json.dumps([r.get("url") for r in batch]),
                                capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError("posting URL classification failed; no rows loaded")
        shapes = json.loads(result.stdout)
        if not isinstance(shapes, list) or len(shapes) != len(batch) or any(
                not isinstance(s, dict) or s.get("verdict") not in
                ("posting", "not_posting", "unknown") for s in shapes):
            raise ValueError("invalid posting URL classifier output; no rows loaded")
        for row, shape in zip(batch, shapes):
            if url_shape_counts is not None:
                counts = url_shape_counts.setdefault(row.get("source") or "unknown", {})
                counts[shape["verdict"]] = counts.get(shape["verdict"], 0) + 1
            if shape["verdict"] == "not_posting":
                continue
            row["extra"].pop("url_shape", None)
            if shape["verdict"] == "unknown":
                row["extra"]["url_shape"] = "unclassified"
            kept.append(row)
    return kept, bad, vintage

def build_boards():
    doc = json.loads((REPO / "packages/career-data/board-directory.json").read_text(encoding="utf-8"))
    gen = doc.get("meta", {}).get("generated_at")
    rows = []
    for b in doc.get("boards", []):
        rows.append(dict(provider=b.get("provider"), board_token=b.get("board_token"),
                         company=b.get("company"), status=b.get("status"),
                         postings_seen=b.get("postings_seen"),
                         last_verified=b.get("last_verified"), source=b.get("source"),
                         directory_generated_at=gen, _raw=json.dumps(b, sort_keys=True)))
    return rows, gen

# ---------------------------------------------------------------- upsert engine
def row_hash(d, fields):
    return sha(json.dumps({k: d.get(k) for k in fields}, ensure_ascii=False,
                          sort_keys=True, default=str))

TABLES = {
    "career_kb_roles": dict(
        key=["role_key"], batch=12,
        cols=["role_key", "soc_code", "slug", "title", "sector_code", "sector_name",
              "employment_2024_k", "is_market_split", "parent_soc_code", "brief",
              "evidence", "experience_statistics", "acquisition_methodology",
              "unknown_unknowns", "method_note", "full_text", "source_files",
              "researched_on", "source_vintage", "content_hash"],
        jsonb={"evidence", "source_files"}),
    "career_kb_role_skills": dict(
        key=["role_key", "source_file"], batch=30,
        cols=["role_key", "soc_code", "slug", "title", "what_gets_picked",
              "exact_skills", "learn_order", "learn_methods", "resume_killers",
              "keyword_reality", "keyword_terms", "postings_basis_n", "evidence_note",
              "pairs_with_file", "full_text", "source_file", "source_bytes",
              "source_vintage", "content_hash"],
        jsonb={"keyword_terms"}),
    "career_kb_postings": dict(
        key=["posting_key"], batch=250,
        cols=["posting_key", "source", "board", "company", "title", "location",
              "url", "posted_at", "posted_raw", "fetched_on", "cluster",
              "text_excerpt", "extra", "corpus_vintage", "content_hash"],
        jsonb={"extra"}),
    "career_kb_boards": dict(
        key=["provider", "board_token"], batch=200,
        cols=["provider", "board_token", "company", "status", "postings_seen",
              "last_verified", "source", "directory_generated_at", "content_hash"],
        jsonb=set()),
}

def key_of(spec, row):
    return tuple(str(row[k]) for k in spec["key"])

def db_count(table):
    return sb_retry(f"select count(*) as n from public.{table}")[0]["n"]

def chunk_match_count(table, spec, chunk):
    """How many of these (key, hash) pairs exist in the DB exactly as-is.
    One aggregate row out, so the 4 KB sb.py output cap never binds."""
    if len(spec["key"]) == 1:
        vals = ", ".join(f"({lit(k[0])}, {lit(h)})" for k, h in chunk)
        q = (f"select count(*) as n from (values {vals}) s(k, h) "
             f"join public.{table} t on t.{spec['key'][0]} = s.k and t.content_hash = s.h")
    else:
        vals = ", ".join(f"({lit(k[0])}, {lit(k[1])}, {lit(h)})" for k, h in chunk)
        q = (f"select count(*) as n from (values {vals}) s(a, b, h) "
             f"join public.{table} t on t.{spec['key'][0]} = s.a and t.{spec['key'][1]} = s.b "
             f"and t.content_hash = s.h")
    return sb_retry(q)[0]["n"]

def chunk_exceptions(table, spec, chunk):
    """For a small leaf chunk, the keys that are missing or changed."""
    if len(spec["key"]) == 1:
        vals = ", ".join(f"({lit(k[0])}, {lit(h)})" for k, h in chunk)
        q = (f"select s.k as a, null as b, t.content_hash as dbh from (values {vals}) s(k, h) "
             f"left join public.{table} t on t.{spec['key'][0]} = s.k "
             f"where t.{spec['key'][0]} is null or t.content_hash <> s.h")
    else:
        vals = ", ".join(f"({lit(k[0])}, {lit(k[1])}, {lit(h)})" for k, h in chunk)
        q = (f"select s.a as a, s.b as b, t.content_hash as dbh from (values {vals}) s(a, b, h) "
             f"left join public.{table} t on t.{spec['key'][0]} = s.a and t.{spec['key'][1]} = s.b "
             f"where t.{spec['key'][0]} is null or t.content_hash <> s.h")
    out = {}
    for r in sb_retry(q):
        key = (r["a"],) if len(spec["key"]) == 1 else (r["a"], r["b"])
        out[key] = r["dbh"]
    return out

def diff_rows(table, rows):
    """Missing and changed source keys, found by aggregate chunk probes
    (400/chunk) with drill-down leaves of 20 — never a bulk key dump."""
    spec = TABLES[table]
    src = [(key_of(spec, r), r["content_hash"]) for r in rows]
    missing, changed = set(), set()
    for i in range(0, len(src), 400):
        chunk = src[i:i + 400]
        if chunk_match_count(table, spec, chunk) == len(chunk):
            continue
        for j in range(0, len(chunk), 20):
            leaf = chunk[j:j + 20]
            if chunk_match_count(table, spec, leaf) == len(leaf):
                continue
            for k, dbh in chunk_exceptions(table, spec, leaf).items():
                (missing if dbh is None else changed).add(k)
    return missing, changed

def fetch_all_keys(table, spec):
    """Full key list, paginated through single-row string_agg outputs
    (chr(1)-delimited). Only used on the rare orphan path."""
    keys = set()
    if len(spec["key"]) == 1:
        k = spec["key"][0]
        last = ""
        while True:
            rows = sb_retry(
                f"select string_agg(k, chr(1)) as ks from "
                f"(select {k} as k from public.{table} where {k} > {lit(last)} order by {k} limit 100) q")
            ks = rows[0]["ks"] if rows else None
            if not ks:
                break
            part = ks.split("\x01")
            keys |= {(x,) for x in part}
            last = part[-1]
            if len(part) < 100:
                break
    else:
        off = 0
        while True:
            rows = sb_retry(
                f"select {spec['key'][0]} as a, {spec['key'][1]} as b from public.{table} "
                f"order by 1, 2 limit 25 offset {off}")
            if not rows:
                break
            keys |= {(r["a"], r["b"]) for r in rows}
            off += 25
            if len(rows) < 25:
                break
    return keys

def insert_batch(table, spec, rows):
    cols = spec["cols"]
    vals = []
    for r in rows:
        cells = []
        for c in cols:
            v = r.get(c)
            cells.append(lit_json(v) if c in spec["jsonb"] and v is not None else lit(v))
        vals.append("(" + ", ".join(cells) + ")")
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in spec["key"])
    sql = (f"insert into public.{table} ({', '.join(cols)}) values "
           + ", ".join(vals)
           + f" on conflict ({', '.join(spec['key'])}) do update set {updates}, loaded_at = now()")
    sb_retry(sql)

def apply_rows(table, rows, failures):
    spec = TABLES[table]
    for r in rows:
        fields = [c for c in spec["cols"] if c != "content_hash"]
        if table == "career_kb_postings":
            # Derived shape metadata must participate in the idempotency hash.
            r["content_hash"] = row_hash(r, fields)
        elif table == "career_kb_boards":
            r["content_hash"] = sha(r["_raw"])
        else:
            r["content_hash"] = row_hash(r, fields)
    by_key = {}
    for r in rows:
        k = key_of(spec, r)
        if k in by_key:
            failures.append((f"{table}:{k}", "duplicate natural key in sources; first row kept"))
        else:
            by_key[k] = r
    rows = list(by_key.values())
    before = db_count(table)
    missing, changed = diff_rows(table, rows)
    todo = []
    for r in rows:
        k = key_of(spec, r)
        if k in missing:
            todo.append(("insert", r))
        elif k in changed:
            todo.append(("update", r))
    unchanged = len(rows) - len(todo)
    n_orphans = before - (len(rows) - len(missing))
    orphans = []
    if n_orphans > 0:
        orphans = sorted(fetch_all_keys(table, spec) - set(by_key))
    stats = dict(source=len(rows), db_before=before, inserted=0,
                 updated=0, unchanged=unchanged, deleted=len(orphans), orphans=orphans)
    batch = spec["batch"]
    queue = [r for _, r in todo]
    kinds = {id(r): k for k, r in todo}
    i = 0
    while i < len(queue):
        chunk = queue[i:i + batch]
        try:
            insert_batch(table, spec, chunk)
            for r in chunk:
                stats["inserted" if kinds[id(r)] == "insert" else "updated"] += 1
            i += batch
        except Exception as e:
            if len(chunk) > 1:
                batch = max(1, batch // 2)
            else:
                failures.append((f"{table}:{key_of(spec, chunk[0])}", f"insert failed: {e}"))
                i += 1
    for j in range(0, len(orphans), 400):
        chunk = orphans[j:j + 400]
        if len(spec["key"]) == 1:
            cond = f"{spec['key'][0]} in (" + ", ".join(lit(k[0]) for k in chunk) + ")"
        else:
            cond = " or ".join(f"({spec['key'][0]} = {lit(k[0])} and {spec['key'][1]} = {lit(k[1])})" for k in chunk)
        sb_retry(f"delete from public.{table} where {cond}")
    # Post-write verification (added 2026-10-15 after the run-1 role_skills
    # 599->597 silent loss): re-probe every source (key, hash) against the DB.
    # A row the insert loop counted as written but that is not actually there
    # becomes a named failure instead of a silent count difference.
    v_missing, v_changed = diff_rows(table, rows)
    stats["verified_missing"] = len(v_missing)
    stats["verified_changed"] = len(v_changed)
    for k in sorted(v_missing):
        failures.append((f"{table}:{k}", "post-insert verification: source key still missing from DB"))
    for k in sorted(v_changed):
        failures.append((f"{table}:{k}", "post-insert verification: DB hash still differs from source"))
    after = sb_retry(f"select count(*) as n from public.{table}")
    stats["db_after"] = after[0]["n"]
    return stats

def apply_migration():
    sql = MIGRATION.read_text(encoding="utf-8")
    stmts = [s.strip() for s in sql.split(";\n") if s.strip()]
    for s in stmts:
        sb_retry(s if s.endswith(";") else s + ";")
    return len(stmts)

# ---------------------------------------------------------------- load + report
def index_claim(path, pat):
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(pat, text)
    return m.group(0)[:300] if m else None

def run_load(stage):
    ts = datetime.now(timezone.utc)
    failures = []
    lines, splits = parse_taxonomy()
    roles, audit, file_role = match_files_to_roles(lines, splits)
    file_multi = {}
    for r in roles:
        file_multi.setdefault(r["source_files"][0]["file"], []).append(r["role_key"])
    skills, sk_fail, sk_methods, sk_notes = build_skills(file_role, file_multi, lines, splits)
    failures += [(f"roles:{n}", r) for n, r in audit["failures"]]
    failures += [(f"skills:{n}", r) for n, r in sk_fail]
    url_shape_counts = {}
    postings, bad_lines, corpus_vintage = build_postings(url_shape_counts=url_shape_counts)
    boards, boards_gen = build_boards()

    apply_migration()
    stats = {}
    stats["career_kb_roles"] = apply_rows("career_kb_roles", roles, failures)
    stats["career_kb_role_skills"] = apply_rows("career_kb_role_skills", skills, failures)
    stats["career_kb_postings"] = apply_rows("career_kb_postings", postings, failures)
    stats["career_kb_boards"] = apply_rows("career_kb_boards", boards, failures)

    # section coverage from parsed roles
    cov = {}
    for field in ("brief", "experience_statistics", "acquisition_methodology",
                  "unknown_unknowns", "method_note"):
        missing = [r["role_key"] for r in roles if not r.get(field)]
        cov[field] = missing
    ev_missing = [r["role_key"] for r in roles if len(r["evidence"]) < 6]
    kw = sum(1 for s in skills if s.get("keyword_terms"))
    nb = sum(1 for s in skills if s.get("postings_basis_n"))

    rep = []
    rep.append(f"# Knowledge DB reconciliation — {stage} load")
    rep.append(f"\nRun: {ts.isoformat()} · Target: Upmore Supabase ({REF}) via sb.py, service role · Loader: scripts/career/load-knowledge-db.py · Migration: 20261015010000_career_knowledge_base.sql\n")
    rep.append("## Library state on disk at load time")
    rep.append(f"- MT1 hired-research: {len([p for p in HR.glob('*.md') if p.name not in ('00-taxonomy.md','INDEX.md','CLAIMS.md')])} role files; taxonomy lines parsed: {len(lines)}; splits registered: {len(splits)}; roles built: {len(roles)}")
    rep.append(f"  INDEX claim: {index_claim(HR / 'INDEX.md', r'Occupations complete:[^\n]*')}")
    rep.append(f"- MT3 resume-skills: {len([p for p in RS.glob('*.md') if p.name not in ('INDEX.md','00-worker-brief.md')])} role files; skills rows built: {len(skills)}; pairing methods: {sk_methods}")
    rep.append(f"  INDEX claim: {index_claim(RS / 'INDEX.md', r'Files complete: [0-9]+')}")
    rep.append(f"- Corpus: {len(postings)} postings parsed ({bad_lines} unparsable lines); vintage: {corpus_vintage}")
    rep.append(f"- Posting URL shapes by source (known non-postings excluded): {json.dumps(url_shape_counts, sort_keys=True)}")
    rep.append(f"- Boards: {len(boards)} directory rows ({sum(1 for b in boards if b['status'] == 'live')} live); directory generated_at: {boards_gen}")
    rep.append("\n## File-to-role matching audit (MT1)")
    rep.append(f"- exact title matches: {len(audit['exact'])} · token-signature: {len(audit['sig'])} · fuzzy: {len(audit['fuzzy'])} · body-SOC: {len(audit['body_soc'])} · soc-filename: {len(audit['soc_filename'])} · splits: {len(audit['splits'])} · shared-coverage lines: {len(audit['shared'])} · duplicate-file SOCs: {len(audit['duplicates'])}")
    for key, f in audit["sig"]:
        rep.append(f"  - token-signature: {key} <- {f}")
    for key, f in audit["body_soc"]:
        rep.append(f"  - body-SOC: {key} <- {f}")
    for soc, f in audit["shared"]:
        rep.append(f"  - shared: {soc} <- {f}")
    for soc, prim, alt in audit["duplicates"]:
        rep.append(f"  - duplicate: {soc} primary={prim} alternate={alt}")
    for key, f in audit["fuzzy"]:
        rep.append(f"  - fuzzy: {key} <- {f}")
    rep.append("\n## Table results (source vs DB)")
    for t, s in stats.items():
        verdict = "MATCH" if s["db_after"] == s["source"] else "DIFF"
        rep.append(f"- {t}: source {s['source']} · db before {s['db_before']} · inserted {s['inserted']} · updated {s['updated']} · unchanged {s['unchanged']} · orphans deleted {s['deleted']} · db after {s['db_after']} · verified missing {s.get('verified_missing', '?')} · verified changed {s.get('verified_changed', '?')} · **{verdict}**")
        if s["orphans"]:
            rep.append(f"  - orphans: {s['orphans'][:20]}")
    rep.append("\n## Section extraction coverage (roles)")
    for field, missing in cov.items():
        rep.append(f"- {field}: present on {len(roles) - len(missing)}/{len(roles)} roles; missing: {missing[:25]}")
    rep.append(f"- evidence: {len(roles) - len(ev_missing)}/{len(roles)} roles carry all 6 evidence subsections; fewer: {ev_missing[:25]}")
    rep.append(f"- skills keyword_terms extracted: {kw}/{len(skills)} · postings_basis_n present: {nb}/{len(skills)}")
    for fn, rk, pw in sk_notes:
        rep.append(f"- skills family anchor: {fn} -> {rk} (paired MT1 file {pw} serves several lines; this file names none of them, so it anchors to the family's primary line and coexists with any specialty row under the composite key)")
    rep.append("\n## Failures (named, never smoothed)")
    if failures:
        for n, r in failures:
            rep.append(f"- {n}: {r}")
    else:
        rep.append("- none")
    report = "\n".join(rep) + "\n"
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    name = f"reconciliation-{stage}-{ts.strftime('%Y%m%d-%H%M%S')}.md"
    (REPORT_DIR / name).write_text(report, encoding="utf-8")
    (REPORT_DIR / "reconciliation-latest.md").write_text(report, encoding="utf-8")
    summary = dict(stage=stage, ts=ts.isoformat(), report=name, stats={
        t: {k: v for k, v in s.items() if k != "orphans"} for t, s in stats.items()},
        failures=failures, url_shape_counts=url_shape_counts)
    (REPORT_DIR / f"summary-{stage}.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return report, summary

def run_verify():
    out = {}
    for t in TABLES:
        out[t] = sb_retry(f"select count(*) as n from public.{t}")[0]["n"]
    out["roles_by_kind"] = sb_retry("select is_market_split, count(*) as n from public.career_kb_roles group by 1 order by 1")
    out["rls"] = sb_retry("select relname, relrowsecurity from pg_class where relname like 'career_kb%' order by 1")
    out["spot_role"] = sb_retry("select role_key, title, left(brief, 160) as brief_head, jsonb_array_length(source_files) as srcs from public.career_kb_roles where role_key = 'split:investment-banking-analyst'")
    out["spot_skills"] = sb_retry("select role_key, left(exact_skills, 120) as skills_head, keyword_terms from public.career_kb_role_skills where role_key = 'split:investment-banking-analyst'")
    out["spot_posting"] = sb_retry("select posting_key, company, title, board from public.career_kb_postings where board = 'stripe' limit 1")
    out["spot_board"] = sb_retry("select provider, board_token, status, postings_seen from public.career_kb_boards where board_token = 'BoschGroup'")
    out["null_briefs"] = sb_retry("select count(*) as n from public.career_kb_roles where brief is null")[0]["n"]
    return out

def log_entry(stage, summary):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M %Z")
    lines = [f"\n\n## KNOWLEDGE DB — {stage} load ({ts})",
             f"\nTier 2 (product database, loaded by Muse's harness). Report: ~/workspace/your_files/knowledge-db/{summary['report']}"]
    for t, s in summary["stats"].items():
        lines.append(f"- {t}: source {s['source']} -> db {s['db_after']} (inserted {s['inserted']}, updated {s['updated']}, unchanged {s['unchanged']}, orphans deleted {s['deleted']})")
    lines.append(f"- failures: {len(summary['failures'])}" + ("" if not summary["failures"] else " — " + "; ".join(f"{n}: {r}" for n, r in summary["failures"][:10])))
    with open(REPORTS_LOG, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

# ---------------------------------------------------------------- watch
def mt3_state():
    files = [p for p in RS.glob("*.md") if p.name not in ("INDEX.md", "00-worker-brief.md")]
    idx = index_claim(RS / "INDEX.md", r"Files complete: (\d+)")
    n = int(re.search(r"(\d+)", idx).group(1)) if idx else 0
    newest = max((p.stat().st_mtime for p in files), default=0)
    return len(files), n, newest

def watch(log=False, max_hours=8):
    deadline = time.time() + max_hours * 3600
    while time.time() < deadline:
        mt1_ok = "849 of the 849" in (HR / "INDEX.md").read_text(encoding="utf-8")
        nfiles, nidx, newest = mt3_state()
        quiet = time.time() - newest
        print(f"[watch] mt1_complete={mt1_ok} mt3_files={nfiles} mt3_index={nidx} quiet={quiet:.0f}s", flush=True)
        if mt1_ok and nfiles >= 861 and (nidx >= 861 or quiet >= 600):
            report, summary = run_load("final")
            ver = run_verify()
            (REPORT_DIR / "final-verification.json").write_text(json.dumps(ver, indent=1, default=str), encoding="utf-8")
            if log:
                log_entry("final", summary)
            print("[watch] FINAL LOAD COMPLETE", flush=True)
            print(report, flush=True)
            return 0
        time.sleep(240)
    print("[watch] timeout: MT3 not complete within window", flush=True)
    return 2

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("load")
    pl.add_argument("--stage", default="test")
    pl.add_argument("--log", action="store_true")
    sub.add_parser("verify")
    pw = sub.add_parser("watch")
    pw.add_argument("--log", action="store_true")
    args = ap.parse_args()
    if args.cmd == "load":
        report, summary = run_load(args.stage)
        print(report)
        if args.log:
            log_entry(args.stage, summary)
    elif args.cmd == "verify":
        print(json.dumps(run_verify(), indent=1, default=str))
    elif args.cmd == "watch":
        sys.exit(watch(log=args.log))

if __name__ == "__main__":
    main()
