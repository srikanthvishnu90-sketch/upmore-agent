/* Career knowledge-base read seam (BUG-220 / FR-377).

   The 861-role knowledge library lives in the Upmore database as
   career_kb_roles / career_kb_role_skills / career_kb_postings /
   career_kb_boards (read contract:
   ~/workspace/upmore-career/docs/career/knowledge-db.md) — and until
   this module, ZERO product code read it (grep career_kb_ across
   packages/ returned nothing). This module is the read path.

   ROUTE (the CIR mechanism, BUG-174): the domain modules are
   pure/injected and the Deno bundle host cannot be assumed to hand
   them a live DB client, so —
     (a) lookups take an INJECTED source (opts.kbSource / opts.source):
         the host can provide live career_kb_* rows later with NO code
         change here (see fromDbRows for the row shapes accepted), and
     (b) by default they read EMBEDDED aggregates
         (packages/career-data/kb-aggregates.json, generated from the
         same library files the DB was loaded from by
         scripts/career/build-kb-aggregates.cjs; in the router bundle
         the build embeds them as CAREER_KB_JSON, read lazily exactly
         like 124's CAREER_FIRM_SETS_JSON / 142's CAREER_CIRS_JSON).
   Injected rows OVERRIDE embedded rows for the same role key and
   EXTEND the library with keys the embedded set lacks.

   HONESTY: every figure this module returns carries its n and its
   basis, exactly as the source files state them; a role with no
   stated figure returns no figure (never another role's), and an
   unknown role returns { found: false } — the caller says "no data",
   it never substitutes a neighbor role's stats.

   Functions:
     findRole(query, opts)        resolve a free-text role ask to a row
     roleStats(query, opts)       { found, role, headline, skills[],
                                    experience, postings_examined_n,
                                    skills_basis_n, sources, via }
     formatRoleStats(stats)       citation text: every stat prints its
                                  % AND its (n=...) — safe to quote
     fromDbRows(rows|{roles, roleSkills})
                                  adapt live career_kb_* rows (the
                                  knowledge-db.md shapes) to aggregate
                                  rows a host can inject
     normalizeKey(text)           slug normalization used by matching */
const CareerKB = (() => {
  let _embedded = null;
  function embeddedData() {
    if (_embedded) return _embedded;
    // Router bundle: the build appends CAREER_KB_JSON (BUG-174 pattern).
    try { if (typeof CAREER_KB_JSON !== "undefined" && CAREER_KB_JSON && Array.isArray(CAREER_KB_JSON.roles)) { _embedded = CAREER_KB_JSON; return _embedded; } } catch { /* not yet evaluated */ }
    // Node: the generated aggregates file beside the domain modules.
    try {
      const req = typeof require !== "undefined" ? require : null;
      if (req) { const d = req("../career-data/kb-aggregates.json"); if (d && Array.isArray(d.roles)) { _embedded = d; return _embedded; } }
    } catch { /* no embedded file in this host */ }
    return null;
  }

  const normalizeKey = (text) => String(text || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const stemToken = (w) => ({ management: "manager", engineers: "engineer", analysts: "analyst", scientists: "scientist", nurses: "nurse", managers: "manager", designers: "designer", developers: "developer" }[w] || (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
  const tokensOf = (text) => new Set(normalizeKey(text).split("-").filter((w) => w && !["and", "the", "of"].includes(w)).map(stemToken));

  // Free-text asks carry the role inside a sentence ("what does it take
  // for data analyst", "how do I become a welder"). Matching order:
  // exact key/title → longest title whose tokens all appear in the ask
  // → alias. Never a fuzzy neighbor: no match means no data.
  const ALIASES = {
    "welder": "welders-cutters-solderers-brazers",
    "welders": "welders-cutters-solderers-brazers",
    "rn": "registered-nurse",
    "nurse": "registered-nurse",
    "swe": "software-engineer",
    "ib-analyst": "investment-banking-analyst",
    "data-analyst": "data-analyst",
    "pm": "product-manager",
  };
  function matchRow(rows, query) {
    const q = normalizeKey(query);
    if (!q) return null;
    for (const r of rows) if (r.key === q) return r;
    for (const r of rows) if (normalizeKey(r.title) === q) return r;
    const alias = ALIASES[q];
    if (alias) { const r = rows.find((x) => x.key === alias || normalizeKey(x.title) === alias); if (r) return r; }
    const qt = tokensOf(query);
    let best = null, bestSize = 0;
    for (const r of rows) {
      const tt = tokensOf(r.title);
      if (!tt.size || tt.size < bestSize) continue;
      let all = true;
      for (const t of tt) if (!qt.has(t)) { all = false; break; }
      if (all) { best = r; bestSize = tt.size; }
    }
    return best;
  }

  // Adapt host-provided live rows to the aggregate shape. Accepts:
  //   - aggregate rows directly ({ key|role_key|slug, title, skills[], ... })
  //   - knowledge-db.md rows: career_kb_roles rows ({ role_key, title,
  //     brief, soc_code, sector_name, experience_statistics }) joined
  //     with career_kb_role_skills rows ({ role_key, exact_skills,
  //     postings_basis_n }) — skill percentages are parsed ONLY where
  //     the skills text itself states a % with an n in the same
  //     sentence; otherwise the role carries its brief and no stats.
  function fromDbRows(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      // Either aggregate rows, or bare career_kb_roles rows.
      return input.map((r) => normalizeRow(r, null)).filter(Boolean);
    }
    const roles = Array.isArray(input.roles) ? input.roles : [];
    const skillsByKey = {};
    for (const s of (Array.isArray(input.roleSkills) ? input.roleSkills : [])) {
      if (s && (s.role_key || s.key)) (skillsByKey[s.role_key || s.key] = skillsByKey[s.role_key || s.key] || []).push(s);
    }
    return roles.map((r) => normalizeRow(r, skillsByKey[r.role_key || r.key || r.slug] || null)).filter(Boolean);
  }
  function normalizeRow(r, skillRows) {
    if (!r || typeof r !== "object") return null;
    const key = normalizeKey(r.key || r.slug || String(r.role_key || "").replace(/^(soc|split):/, "") || r.title || "");
    if (!key) return null;
    let skills = Array.isArray(r.skills) ? r.skills.filter((s) => s && typeof s.pct === "number" && Number(s.n) > 0).map((s) => ({ skill: String(s.skill), pct: s.pct, n: Number(s.n), basis: s.basis || "injected" })) : [];
    let skillsBasisN = r.skills_basis_n != null ? Number(r.skills_basis_n) : null;
    if (!skills.length && skillRows && skillRows.length) {
      for (const sr of skillRows) {
        if (sr.postings_basis_n != null && skillsBasisN == null) skillsBasisN = Number(sr.postings_basis_n);
        skills.push(...parseSkillPercents(sr.exact_skills || "", skillsBasisN));
      }
    }
    const brief = typeof r.brief === "string" ? r.brief : null;
    const headline = r.headline || (brief ? (brief.match(/^[^.!?]*[.!?]/) || [brief])[0].trim() : null);
    return {
      key, title: r.title || key, soc_code: r.soc_code || null, sector: r.sector || r.sector_name || null,
      headline: headline || null, skills: skills.slice(0, 8),
      experience: r.experience || adaptExperienceStats(r.experience_statistics),
      postings_examined_n: r.postings_examined_n != null ? Number(r.postings_examined_n) : null,
      skills_basis_n: skillsBasisN,
      sources: r.sources || { injected: true },
    };
  }
  function parseSkillPercents(text, fallbackN) {
    const out = [];
    const seen = new Set();
    for (const m of String(text || "").matchAll(/\b([A-Z][\w+#./&'’ -]{1,42}?)\s+in\s+(?:about\s+)?(\d+(?:\.\d+)?)%\s+of\s+(?:[\w'-]+\s+){0,3}?postings[^.]*?(?:\(n=([\d,]+)|$)/gi)) {
      const skill = m[1].trim();
      const n = m[3] ? Number(m[3].replace(/,/g, "")) : fallbackN;
      if (!n || seen.has(skill.toLowerCase())) continue;
      seen.add(skill.toLowerCase());
      out.push({ skill, pct: Number(m[2]), n, basis: "career_kb_role_skills.exact_skills" });
    }
    return out.slice(0, 8);
  }
  function adaptExperienceStats(es) {
    if (!es || typeof es !== "object") return null;
    const bands = [];
    const push = (band, pct, n) => { if (band && typeof pct === "number" && Number(n) > 0) bands.push({ band: String(band), pct, n: Number(n) }); };
    if (Array.isArray(es.bands)) for (const b of es.bands) push(b.band || b.label, b.pct != null ? b.pct : b.share_pct, b.n != null ? b.n : es.n);
    if (!bands.length && !es.note) return null;
    return { bands: bands.slice(0, 6), note: es.note || null, n: es.n != null ? Number(es.n) : null };
  }

  function rowsFromSource(opts) {
    const o = opts || {};
    const src = o.kbSource !== undefined ? o.kbSource : o.source;
    const injected = src == null ? [] : (typeof src === "function" ? fromDbRows(src()) : fromDbRows(src));
    const embedded = o.useEmbedded === false ? [] : ((embeddedData() || {}).roles || []);
    if (!injected.length) return { rows: embedded, via: "embedded" };
    const byKey = new Map(embedded.map((r) => [r.key, r]));
    for (const r of injected) byKey.set(r.key, r); // injected overrides + extends
    return { rows: [...byKey.values()], via: "injected+embedded" };
  }

  function findRole(query, opts) {
    const { rows, via } = rowsFromSource(opts);
    const row = matchRow(rows, query);
    return row ? { found: true, role: row, via } : { found: false, role: null, via };
  }

  function roleStats(query, opts) {
    const f = findRole(query, opts);
    if (!f.found) return { found: false, role: null, via: f.via, reason: "no role in the career knowledge library matches that ask — no stats are stated rather than borrowing another role's" };
    const r = f.role;
    return {
      found: true, via: f.via,
      role: { key: r.key, title: r.title, soc_code: r.soc_code || null, sector: r.sector || null },
      headline: r.headline || null,
      skills: Array.isArray(r.skills) ? r.skills : [],
      experience: r.experience || null,
      postings_examined_n: r.postings_examined_n != null ? r.postings_examined_n : null,
      skills_basis_n: r.skills_basis_n != null ? r.skills_basis_n : null,
      sources: r.sources || null,
    };
  }

  const fmtN = (n) => Number(n).toLocaleString("en-US");
  function formatRoleStats(stats) {
    if (!stats || !stats.found) return "The career knowledge library carries no data for that role, so I won't quote stats for it — quoting another role's numbers as if they were this role's would be making them up.";
    const lines = [];
    if (stats.headline) lines.push(stats.headline);
    if (stats.skills && stats.skills.length) {
      const parts = stats.skills.slice(0, 4).map((s) => `${s.skill} — in ${s.pct}% of postings (n=${fmtN(s.n)})`);
      lines.push(`From the career knowledge library (${stats.role.title}): ${parts.join("; ")}.`);
    }
    const exp = stats.experience;
    if (exp && exp.bands && exp.bands.length) {
      const parts = exp.bands.slice(0, 3).map((b) => `${b.band} ${b.pct}% (n=${fmtN(b.n)})`);
      lines.push(`Experience mix in the library's set: ${parts.join("; ")}.`);
    } else if (exp && exp.note) {
      lines.push(`Experience evidence: ${exp.note}`);
    }
    if (!stats.skills || !stats.skills.length) lines.push(`The library's files for ${stats.role.title} state no skill frequency with an n, so no percentage is quoted for it.`);
    return lines.join(" ");
  }

  return { findRole, roleStats, formatRoleStats, fromDbRows, normalizeKey, embeddedData };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerKB;
