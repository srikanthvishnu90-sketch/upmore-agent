/* 146-career-intake.js — Wedge intake lane (owner strategy narrowing, 2026-10-13).
 *
 * ONE intake engine for candidate names, from the three compliant sources:
 *   (a) pasted names — one per line, or CSV (with or without a header row);
 *   (b) the user's own LinkedIn export — Connections.csv, parsed by 122
 *       (the export-only path, R-B11; never a sign-in, never a scrape);
 *   (c) a forwarded email — the named person/firm parsed from its signature.
 *
 * Pipeline: parse -> dedupe by name+firm+office -> employment-currency
 * check (a person known to have departed is flagged at intake, never
 * silently carried as current) -> honest running counts surfaced at every
 * stage: received -> deduped -> current -> ready. Parse failures are
 * reported per line and never swallow the good rows. Pure: no I/O, no
 * network; callers hand text in and records come out.
 *
 * Real-input run (2026-10-13, the 56 real bankers in
 * tests/fixtures/real-people-finance-v1.cjs) exposed two gaps, both fixed
 * here and replay-tested in tests/career-intake-real-data.test.cjs:
 *  - Currency is per-record data, not only a caller-supplied departed
 *    list: a CSV may carry Currency + Currency Note columns. A record
 *    whose currency is stale or uncertain is flagged (currency_stale /
 *    currency_unverified) and leaves the current + ready counts — it is
 *    NOT a departure, and the file's own note is preserved on the record.
 *  - Email labels are data too: an Email Status column is carried
 *    verbatim-normalized (published | verified | inferred_held |
 *    not_found). An address with no stated status defaults to
 *    "unverified" — the lane never upgrades, guesses, or enriches.
 */
"use strict";
const Profile122 = (() => { try { return typeof CareerProfile !== "undefined" ? CareerProfile : require("./122-career-profile.js"); } catch { return null; } })();

const CareerIntake = (() => {
  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  function baseRecord(o) {
    return { full_name: clean(o.full_name || ""), current_firm: clean(o.current_firm || "") || null,
      title: clean(o.title || "") || null, office: clean(o.office || "") || null,
      email: clean(o.email || "") || null, email_status: o.email_status || null,
      // Graph/outreach projection (wave fix 2026-10-14, D2): the engines
      // downstream (135 graph, 124 outreach) read work_email / source_list /
      // at_company / employment_status. intake() syncs these from the
      // canonical email / sources / flags at the end of the pipeline —
      // without them the handoff silently lost the address, the sources,
      // and the departed status (a departed person came back as a live
      // warm path). Defaults here keep the record shape stable.
      work_email: null, source_list: [], at_company: true, employment_status: null,
      currency_status: o.currency_status || null, currency_note: o.currency_note || null,
      relationship_to_user: clean(o.relationship_to_user || "") || null,
      sources: [], flags: [],
      former_employer_note: o.former_employer_note || null, last_verified_at: o.last_verified_at || null };
  }

  // Email status vocabulary (the research file's labels, normalized).
  // Anything unrecognized with an address present resolves in intake() to
  // "unverified" — never to a stronger claim than the input made.
  function normEmailStatus(v) {
    const s = norm(v);
    if (!s) return null;
    if (s.includes("infer")) return "inferred_held";
    if (/not found|none|missing/.test(s)) return "not_found";
    // Negation guard (Spec 1 §6): a label that says the address was NOT
    // checked must never fall through to the "verif" substring branch below
    // and come out "verified" — "UNVERIFIED" and "not verified" did exactly
    // that before this guard. Fail closed: unverified.
    if (/not|un|never|fail|invalid|pending/.test(s)) return "unverified";
    if (s.includes("publish")) return "published";
    if (s.includes("verif")) return "verified";
    return "unverified";
  }

  // Currency vocabulary: current | stale | uncertain. An unrecognized
  // non-empty currency word resolves to "uncertain" — the safe direction:
  // a record is only counted current when the input actually says so.
  function normCurrencyStatus(v) {
    const s = norm(v);
    if (!s) return null;
    if (/stale|not currently registered|departed|registration ended/.test(s)) return "stale";
    if (s.includes("current")) return "current";
    return "uncertain";
  }

  // Quote-aware splitter for ONE line. Returns null on an unbalanced quote
  // (the caller reports that line as malformed; other lines still parse).
  function splitCsvLine(line) {
    const cells = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    if (inQ) return null;
    cells.push(cur);
    return cells.map((x) => x.trim());
  }

  const HEADER_ALIASES = { name: "full_name", "full name": "full_name", firm: "current_firm", company: "current_firm",
    title: "title", position: "title", office: "office", city: "office", location: "office", email: "email", "email address": "email",
    "email status": "email_status", currency: "currency_status", "currency status": "currency_status", "currency note": "currency_note",
    relationship: "relationship_to_user", "relationship to user": "relationship_to_user" };

  function parsePasted(text) {
    const records = [], errors = [];
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { records, errors, received: 0 };
    const firstCells = splitCsvLine(lines[0]);
    const isHeader = firstCells && firstCells.some((c) => HEADER_ALIASES[norm(c)] === "full_name")
      && firstCells.some((c) => HEADER_ALIASES[norm(c)] === "current_firm");
    if (isHeader) {
      const headers = firstCells.map((c) => HEADER_ALIASES[norm(c)] || null);
      let received = 0;
      lines.slice(1).forEach((line, i) => {
        received++;
        const cells = splitCsvLine(line);
        if (!cells) { errors.push({ where: `line ${i + 2}`, message: "unbalanced quote — row not parsed" }); return; }
        if (cells.length !== headers.length) { errors.push({ where: `line ${i + 2}`, message: `expected ${headers.length} columns, got ${cells.length}` }); return; }
        const rec = baseRecord({});
        headers.forEach((h, j) => { if (h) rec[h] = cells[j] || null; });
        if (rec.email_status) rec.email_status = normEmailStatus(rec.email_status);
        if (rec.currency_status) rec.currency_status = normCurrencyStatus(rec.currency_status);
        if (rec.full_name) { rec.sources = ["pasted"]; records.push(rec); }
        else errors.push({ where: `line ${i + 2}`, message: "no name in row" });
      });
      return { records, errors, received };
    }
    let received = 0;
    lines.forEach((line, i) => {
      received++;
      if (line.includes(",")) {
        const cells = splitCsvLine(line);
        if (!cells) { errors.push({ where: `line ${i + 1}`, message: "unbalanced quote — line not parsed" }); return; }
        const rec = baseRecord({ full_name: cells[0], current_firm: cells[1], title: cells[2], office: cells[3] });
        if (rec.full_name) { rec.sources = ["pasted"]; records.push(rec); }
        return;
      }
      const dash = line.split(/\s+[—–]\s+|\s+-\s+/);
      if (dash.length >= 2) {
        const rec = baseRecord({ full_name: dash[0], current_firm: dash.slice(1).join(" — ") });
        if (rec.full_name) { rec.sources = ["pasted"]; records.push(rec); }
        return;
      }
      const rec = baseRecord({ full_name: line });
      rec.sources = ["pasted"]; records.push(rec);
    });
    return { records, errors, received };
  }

  function parseLinkedIn(csv) {
    const records = [], errors = [];
    if (!Profile122 || typeof Profile122.parseLinkedInConnections !== "function") {
      return { records, errors: [{ where: "linkedin-export", message: "122 connection parser unavailable" }], received: 0 };
    }
    const { connections, errors: parseErrors } = Profile122.parseLinkedInConnections(csv);
    for (const e of parseErrors || []) errors.push({ where: `Connections.csv row ${e.row}`, message: e.reason });
    for (const c of connections) {
      const rec = baseRecord({ full_name: c.name, current_firm: c.company, title: c.position, email: c.email });
      rec.sources = ["linkedin-export"];
      records.push(rec);
    }
    return { records, errors, received: connections.length + (parseErrors || []).length };
  }

  const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
  function parseForwarded(text) {
    const records = [], errors = [];
    const s = String(text || "");
    const lines = s.split(/\r?\n/);
    // Signature block: a sign-off line in the last 10 lines, then the name,
    // then a title/firm line ("Analyst | Evercore" / "Analyst, Evercore").
    let sigIdx = -1;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
      if (/^\s*(best( regards)?|regards|thanks( again)?|thank you|cheers|sincerely|warmly)\s*,?\s*$/i.test(lines[i])) { sigIdx = i; break; }
    }
    if (sigIdx < 0) return { records, errors, received: 0 };
    const tail = lines.slice(sigIdx + 1).map((l) => l.trim()).filter(Boolean);
    if (!tail.length) return { records, errors, received: 0 };
    const rec = baseRecord({ full_name: tail[0] });
    if (!/^[A-Z][a-z]+(?: [A-Z][a-z'.-]+){1,3}$/.test(rec.full_name)) return { records, errors, received: 0 };
    const tf = tail[1] || "";
    const tfParts = tf.split(/\s*\|\s*|\s*,\s*|\s+at\s+/).map((x) => x.trim()).filter(Boolean);
    if (tfParts.length >= 2) { rec.title = tfParts[0]; rec.current_firm = tfParts.slice(1).join(", "); }
    else if (tfParts.length === 1 && !/^(new york|chicago|boston|remote|usa?)$/i.test(tfParts[0])) rec.title = tfParts[0];
    if (tail[2] && /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(tail[2]) && !rec.office) rec.office = tail[2];
    // Self-reported departure: "I left <Firm> in <month>" naming the
    // signature firm — the signature is stale; flag, do not carry as current.
    const dep = s.match(new RegExp(`\\bI (?:left|departed|moved on from)\\s+([A-Z][A-Za-z&' ]+?)(?:\\s+in\\s+(?:${MONTHS})|\\s+last|\\.|,)`, "i"));
    if (dep && rec.current_firm && norm(dep[1]) === norm(rec.current_firm)) {
      rec.flags.push("departed");
      rec.former_employer_note = dep[0].replace(/\s+/g, " ").trim();
    }
    rec.sources = ["forwarded-email"];
    records.push(rec);
    return { records, errors, received: 1 };
  }

  function dedupeKey(r) { return `${norm(r.full_name)}|${norm(r.current_firm || "")}|${norm(r.office || "")}`; }

  function intake(input, opts) {
    input = input || {}; opts = opts || {};
    const raw = [], errors = [];
    let received = 0;
    if (input.pastedText) { const p = parsePasted(input.pastedText); raw.push(...p.records); errors.push(...p.errors); received += p.received; }
    if (input.linkedinConnectionsCsv) { const l = parseLinkedIn(input.linkedinConnectionsCsv); raw.push(...l.records); errors.push(...l.errors); received += l.received; }
    if (input.forwardedEmail) { const f = parseForwarded(input.forwardedEmail); raw.push(...f.records); errors.push(...f.errors); received += f.received; }

    // Dedupe by name+firm+office; merges keep every source and fill gaps
    // from later copies (an export email completes a pasted name).
    const byKey = new Map();
    for (const r of raw) {
      const k = dedupeKey(r);
      if (!byKey.has(k)) { byKey.set(k, r); continue; }
      const keep = byKey.get(k);
      for (const src of r.sources) if (!keep.sources.includes(src)) keep.sources.push(src);
      for (const f of ["current_firm", "title", "office", "email", "email_status", "currency_status", "currency_note", "last_verified_at", "former_employer_note", "relationship_to_user"]) if (!keep[f] && r[f]) keep[f] = r[f];
      for (const fl of r.flags) if (!keep.flags.includes(fl)) keep.flags.push(fl);
    }
    const records = [...byKey.values()];

    // Employment-currency check: known departures flag at intake.
    for (const d of opts.knownDepartures || []) {
      for (const r of records) {
        if (norm(r.full_name) !== norm(d.full_name)) continue;
        if (d.current_firm && r.current_firm && norm(d.current_firm) !== norm(r.current_firm)) continue;
        if (!r.flags.includes("departed")) r.flags.push("departed");
        if (!r.former_employer_note) r.former_employer_note = d.note || "recorded as departed";
      }
    }
    for (const r of records) if (!r.current_firm && !r.flags.includes("needs_firm")) r.flags.push("needs_firm");

    // Per-record resolution. Email labels: an address whose status the
    // input never stated is "unverified" (present, unproven); no address
    // and no stated status is "not_found". Currency: stale / uncertain
    // records are flagged and leave the current counts — flagged for
    // re-verification, not declared departed.
    for (const r of records) {
      if (r.email && !r.email_status) r.email_status = "unverified";
      if (!r.email && !r.email_status) r.email_status = "not_found";
      if (r.currency_status === "stale" && !r.flags.includes("currency_stale")) r.flags.push("currency_stale");
      if (r.currency_status === "uncertain" && !r.flags.includes("currency_unverified")) r.flags.push("currency_unverified");
      // Graph/outreach projection (D2): sync the fields the downstream
      // engines actually read, from the canonical fields resolved above.
      r.work_email = r.email || null;
      r.source_list = [...(r.sources || [])];
      if (r.flags.includes("departed")) { r.at_company = false; r.employment_status = "departed"; }
    }

    const notCurrent = (r) => r.flags.includes("departed") || r.flags.includes("currency_stale") || r.flags.includes("currency_unverified");
    const flagged = records.filter((r) => r.flags.includes("departed"))
      .map((r) => ({ full_name: r.full_name, current_firm: r.current_firm, reason: "departed", note: r.former_employer_note || null }));
    for (const r of records) {
      if (r.flags.includes("currency_stale")) flagged.push({ full_name: r.full_name, current_firm: r.current_firm, reason: "currency_stale", note: r.currency_note || null });
      else if (r.flags.includes("currency_unverified")) flagged.push({ full_name: r.full_name, current_firm: r.current_firm, reason: "currency_unverified", note: r.currency_note || null });
    }
    const current = records.filter((r) => !notCurrent(r));
    const ready = current.filter((r) => r.current_firm);
    return { records, flagged, errors,
      counts: { received, deduped: records.length, duplicates_removed: raw.length - records.length,
        current: current.length, ready: ready.length,
        currency_flagged: records.filter((r) => r.flags.includes("currency_stale") || r.flags.includes("currency_unverified")).length } };
  }

  return { intake, parsePasted, parseLinkedIn, parseForwarded, dedupeKey };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerIntake;
