  /* Found money from official sources (cluster K12: C90 class action settlements, C91 unclaimed property, C94 product
     recalls). Three dated datasets, all verified at their source (packages/offers/settlements.json,
     state-unclaimed-search.json, recalls.json):
       - Settlements come from two tiers only (the owner's sourcing law): Tier 1 government (the FTC refunds chart,
         agency releases) and Tier 2 court-appointed administrators (Kroll, JND, Epiq, Angeion, Rust, Simpluris,
         Analytics, CPT), each row carrying its source URL, court and docket, administrator, deadline and checked
         date. Aggregators are never a row's source. A row that cannot be verified does not ship: validate() refuses it.
       - Matching runs against the person's own evidence — their transactions inside the class period, or the
         administrator's notice (ctx.notices) — never against a name alone. A match is "likely, not certain": the
         settlement's own rules and the claim form decide.
       - Claims are PREPARED as packets for the owner's own filing (filing is the owner's legal tap; the agent never
         submits). A filed claim is then tracked: deadline alerts at 30/7/2 days for unfiled matches, and a payout
         watch once the person says they filed.
       - Unclaimed property: the search plan names each state's official portal (verified) or NAUPA's directory
         (unclaimed.org). Property rows reach this module only from a supplied property file (ctx.properties); with no
         file the answer is the plan, honestly — Upmore holds no state database.
       - Recalls: a purchase confirms a recall only when its record names the product (the earn engine's E3 rule);
         a purchase at the right store that does not name it is said as unconfirmed, worth $0, with no claim offered.
     Pure and deterministic. Tests: tests/found-money.test.cjs; edge: tests/edge/found-money-answer.test.ts. */
  const FoundMoney = (() => {
    const DAY = 86400000;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const validYmd = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
    const ymd = s => String(s || "").slice(0, 10);
    const nice = s => validYmd(ymd(s)) ? `${MON[+ymd(s).slice(5, 7) - 1]} ${+ymd(s).slice(8, 10)}, ${ymd(s).slice(0, 4)}` : String(s);
    const days = (a, b) => Math.round((Date.parse(ymd(b) + "T00:00:00Z") - Date.parse(ymd(a) + "T00:00:00Z")) / DAY);
    const money = c => { const v = Math.round(Number(c) || 0), s = Math.abs(v); return (v < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const keyOf = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    const wordsOf = s => keyOf(s).split(" ").filter(Boolean);
    // A transaction record names a merchant when its key starts with the merchant's key (a store suffix may follow).
    const namesMerchant = (txKey, merchantKey) => !!merchantKey && (txKey === merchantKey || txKey.startsWith(merchantKey + " "));
    const txOf = t => ({ id: t.id || t.provider_transaction_id || null, date: ymd(t.date || t.posted_on || t.posted_at), amount_cents: Number.isFinite(t.amount_cents) ? Math.round(t.amount_cents) : Math.round(Number(t.amount) * 100), merchant: String(t.merchant || t.merchant_raw || ""), account: t.account || t.account_id || null });
    const txsOf = rows => (rows || []).map(txOf).filter(t => validYmd(t.date) && t.merchant);
    const proofLine = t => `${t.merchant} charge of ${money(Math.abs(t.amount_cents))} on ${nice(t.date)}`;

    // ---- validation: the sourcing law, enforced as data rules ----
    const ADMIN_TIER2 = ["Kroll", "JND", "Epiq", "Angeion", "Rust", "Simpluris", "Analytics", "CPT"];
    function validateSettlements(data) {
      const problems = [], d = data || {};
      if (!Number.isInteger(d.fresh_days) || d.fresh_days <= 0) problems.push("settlements: fresh_days must be a positive integer");
      const ids = new Set();
      for (const s of d.settlements || []) {
        const tag = `settlement ${s && s.id}`;
        if (!s || !s.id || ids.has(s.id)) problems.push(`${tag}: id missing or duplicated`); ids.add(s && s.id);
        if (![1, 2].includes(s.tier)) problems.push(`${tag}: tier must be 1 (government) or 2 (court-appointed administrator)`);
        if (s.tier === 2 && !ADMIN_TIER2.some(a => String(s.administrator || "").startsWith(a))) problems.push(`${tag}: a tier 2 row's administrator must be a court-appointed administrator on file`);
        if (!/^https:\/\//.test(s.source_url || "") || !validYmd(s.source_checked_on) || !s.checked_how) problems.push(`${tag}: a source URL, a checked date and how it was checked`);
        if (!s.court || !s.docket) problems.push(`${tag}: court and docket are required`);
        if (!/^https:\/\//.test(s.claim_url || "")) problems.push(`${tag}: the claim URL must be the administrator's or agency's own site`);
        if (s.filing === "claim_form" && !validYmd(s.claim_deadline)) problems.push(`${tag}: a claim-form settlement needs a claim deadline`);
        if (s.filing === "automatic" && s.claim_deadline !== null) problems.push(`${tag}: an automatic FTC payment has no claim deadline`);
        if (s.status !== "open") problems.push(`${tag}: only open rows ship`);
      }
      return problems;
    }
    function validateRecalls(data) {
      const problems = [], d = data || {};
      if (!Number.isInteger(d.fresh_days) || d.fresh_days <= 0) problems.push("recalls: fresh_days must be a positive integer");
      for (const r of d.recalls || []) {
        const tag = `recall ${r && r.id}`;
        if (!r || !r.product || !r.merchant || !r.remedy) problems.push(`${tag}: product, merchant and remedy are required`);
        if (!/^https:\/\/www\.cpsc\.gov\//.test(r.source_url || "") || !r.recall_number || !validYmd(r.recall_date) || !validYmd(r.checked_on)) problems.push(`${tag}: the source must be the CPSC notice, with its recall number, recall date and checked date`);
        if (!/^https:\/\//.test(r.claim_url || "")) problems.push(`${tag}: a claim URL is required`);
        if (!["stated_amount", "purchase_price"].includes(r.refund_basis)) problems.push(`${tag}: refund_basis must say where the refund figure comes from`);
        if (r.refund_basis === "stated_amount" && !(r.refund_cents > 0)) problems.push(`${tag}: a stated-amount refund needs its cents`);
      }
      return problems;
    }
    function validateStateSearch(data) {
      const problems = [], d = data || {};
      if (!d.directory || !/^https:\/\/unclaimed\.org/.test(d.directory.url || "") || !validYmd(d.directory.checked_on)) problems.push("state search: the NAUPA directory row needs its URL and checked date");
      for (const s of d.states || []) {
        const tag = `state search ${s && s.state}`;
        if (!s || !/^[A-Z]{2}$/.test(s.state || "") || !s.program) problems.push(`${tag}: a state code and program name are required`);
        if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.gov$/.test(s.official_domain || "") || !/^https:\/\/[a-z0-9.-]+/.test(s.search_url || "") || !(new URL(s.search_url).hostname === s.official_domain || new URL(s.search_url).hostname.endsWith("." + s.official_domain))) problems.push(`${tag}: the search URL must be on the state's official .gov domain`);
        if (!validYmd(s.checked_on) || !s.checked_how) problems.push(`${tag}: a checked date and how it was checked`);
      }
      return problems;
    }

    // ---- what the person is asking ----
    const SETTLE_ASK = /\bclass actions?\b[^.?!]{0,40}\b(?:qualify|claim|file|find|owed|mine|get|check)\b|\bsettlements?\b[^.?!]{0,40}\b(?:qualify|claim|file|owed|mine)\b|\bqualify for\b[^.?!]{0,30}\bsettlements?\b/i;
    const UNCLAIMED_ASK = /\bstate (?:is|are) holding (?:money|funds|property|anything)\b|\bunclaimed (?:property|money|funds|cash)\b|\bholding (?:money|funds|anything) for me\b|\bmoney (?:the state|a state) (?:owes|has|is holding)\b/i;
    const RECALL_ASK = /\brecall(?:ed|s)?\b/i;
    const OWNS = /\b(?:anything|something|any of (?:my|the)|my|i own|i bought|we own|been)\b/i;
    function namedRow(message, rows, extra) {
      const t = " " + keyOf(message) + " ";
      return (rows || []).find(r => (extra(r) || []).some(w => w && t.includes(" " + w + " "))) || null;
    }
    function kind(message, ctx) {
      const t = String(message || "");
      if (!t.trim()) return null;
      const c = ctx || {};
      if (/\bi filed\b/i.test(t) && namedRow(t, (c.settlements || {}).settlements, r => [wordsOf(r.name)[0], ...wordsOf(r.name)])) return "settlement_filed";
      if (/\bnotice\b/i.test(t) && namedRow(t, (c.settlements || {}).settlements, r => wordsOf(r.name))) return "settlements_notice";
      if (/\b(?:prepare|build|make)\b[^.?!]{0,30}\bclaim\b|\bclaim packet\b|\bprepare (?:the|my|that)\b/i.test(t) && namedRow(t, (c.settlements || {}).settlements, r => wordsOf(r.name))) return "settlement_packet";
      if (/\bclaim (?:it|that|the)\b|\bprepare (?:the|my) claim\b/i.test(t) && (c.properties || []).length) return "property_packet";
      if (SETTLE_ASK.test(t)) return "settlements";
      if (UNCLAIMED_ASK.test(t)) return "unclaimed_search";
      if (RECALL_ASK.test(t) && (OWNS.test(t) || /\bprepare\b/i.test(t) || /\brecall(?:ed)?\b[^.?!]{0,20}\?$/.test(t))) return "recalls";
      return null;
    }

    // ---- C90: settlements ----
    function matchSettlements(ctx) {
      const c = ctx || {}, today = c.today, txs = txsOf(c.transactions), notices = new Set((c.notices || []).map(n => String(n).toLowerCase()));
      const matches = [], nearMisses = [];
      for (const s of ((c.settlements || {}).settlements || [])) {
        if (s.status !== "open") continue;
        if (s.claim_deadline && validYmd(s.claim_deadline) && s.claim_deadline < today) continue;
        const period = s.class_period || null;
        const inPeriod = t => !period || ((!period.from || t.date >= period.from) && (!period.to || t.date <= period.to));
        const merchantKeys = (s.eligibility_merchants || []).map(keyOf).filter(Boolean);
        const bought = txs.filter(t => merchantKeys.some(k => namesMerchant(keyOf(t.merchant), k)));
        const inside = bought.filter(inPeriod);
        const hasNotice = notices.has(String(s.id).toLowerCase()) || notices.has(keyOf(s.name).toLowerCase());
        if (!hasNotice && !inside.length) {
          if (bought.length && period) nearMisses.push({ row: s, reason: `your ${bought[0].merchant} purchase on ${nice(bought[0].date)} is outside its class period (${period.from ? nice(period.from) : "any date"} to ${period.to ? nice(period.to) : "now"})` });
          continue;
        }
        matches.push({ row: s, tier: hasNotice ? "notice" : "purchase", evidence: inside.slice(0, 3), days_left: s.claim_deadline ? days(today, s.claim_deadline) : null });
      }
      return { matches, nearMisses };
    }
    function settlementLine(m, i) {
      const s = m.row;
      if (s.filing === "automatic") return `${i + 1}. ${s.name}: ${s.payout_summary}. There is no claim to file — if you qualify, it arrives on its own. Nothing for you to submit, and anyone who asks for money or account details to "release" it is running a scam. Details: ${s.claim_url}.`;
      const ev = m.tier === "notice" ? "You have the administrator's notice, which is the administrator identifying you as a class member." : s.class_period ? `Your ${proofLine(m.evidence[0])} falls inside the class period (${nice(s.class_period.from)} to ${nice(s.class_period.to)}).` : `Your ${proofLine(m.evidence[0])} is a payment to the service this settlement covers; this one has no class period — eligibility turns on whether your information was in the breach, which the administrator's notice confirms.`;
      return `${i + 1}. ${s.name} (${s.case_name}, ${s.docket}): ${s.payout_summary}. ${ev} Claim by ${nice(s.claim_deadline)} at ${s.claim_url}.`;
    }
    function settlementsText(ctx) {
      const data = (ctx || {}).settlements || {}, { matches, nearMisses } = matchSettlements(ctx);
      const checked = (data.settlements || []).map(s => s.source_checked_on).sort().slice(-1)[0];
      const stale = checked && days(checked, ctx.today) > (data.fresh_days || 30);
      const source = `From the settlement directory verified ${checked ? "on " + nice(checked) : ""} against the administrators' own sites and the FTC refunds chart; every row carries its court, docket and administrator. Nothing has been filed.${stale ? ` That check is over ${data.fresh_days} days old, so confirm the deadline on the site before filing.` : ""}`;
      if (!matches.length) {
        const lines = [`None of the ${(data.settlements || []).length} open settlements in the directory matches your linked purchases.`];
        for (const n of nearMisses) lines.push(`One didn't match: ${n.row.name} — ${n.reason}.`);
        lines.push("If you got a notice about any of them, tell me which and I'll match on the notice instead — a notice is the administrator naming you, which is stronger than a purchase.");
        lines.push(source);
        return lines.join("\n");
      }
      const lines = [`${matches.length === 1 ? "One open settlement matches" : matches.length + " open settlements match"} your evidence:`];
      matches.forEach((m, i) => lines.push(settlementLine(m, i)));
      const fileable = matches.filter(m => m.row.filing === "claim_form");
      if (fileable.length) lines.push(`Say "prepare the ${wordsOf(fileable[0].row.name)[0].toLowerCase()} claim" and I'll build the packet with your evidence. You file it yourself on the administrator's site — filing is your tap, and the form is signed under penalty of perjury, so only file where the attestation is true.`);
      lines.push("Likely, not certain: the settlement's own eligibility rules decide, and payouts come only after final approval.");
      lines.push(source);
      return lines.join("\n");
    }
    function claimPacket(row, match, person) {
      const s = row, m = match || { tier: "purchase", evidence: [], days_left: null };
      const lines = [
        `Claim packet — ${s.name}. Prepared for you to file; nothing has been submitted.`,
        `- File at: ${s.claim_url} (${s.administrator}).`,
        `- Deadline: ${nice(s.claim_deadline)}${Number.isInteger(m.days_left) ? ` (${m.days_left} days left)` : ""}.`,
        `- Case: ${s.case_name}, ${s.docket}, ${s.court}.`,
        `- Who qualifies: ${s.eligibility}`,
        `- Proof the form asks for: ${s.proof_required}`,
      ];
      for (const t of m.evidence || []) lines.push(`- Your evidence: ${proofLine(t)}${s.class_period ? ` — inside the class period (${nice(s.class_period.from)} to ${nice(s.class_period.to)})` : ""}.`);
      if (m.tier === "notice") lines.push("- Your evidence: the administrator's notice you received — have its Claimant ID in front of you; the online form opens with it.");
      if (person && person.name) lines.push(`- Name on the claim: ${person.name} (exactly as on the notice or account).`);
      lines.push(`- Expected: ${s.payout_summary}. Paid only after final approval${s.final_approval_hearing ? ` (hearing ${nice(s.final_approval_hearing)})` : ""} and any appeals, so this is months, not days.`);
      lines.push("- You sign the claim form under penalty of perjury. File only if every statement on it is true for you.");
      lines.push("File it, then tell me \"I filed it\" — I'll keep the claim on watch for the payment and flag you before any later deadline on it.");
      return { settlement_id: s.id, text: lines.join("\n"), claim_url: s.claim_url, deadline: s.claim_deadline, expected: s.payout_summary };
    }
    // Deadline alerts for unfiled matches / tracked claims: hard alerts at 30, 7 and 2 days out, and on the day.
    function deadlineAlerts(rows, today) {
      const out = [];
      for (const s of rows || []) {
        if (!s || !validYmd(s.claim_deadline)) continue;
        const left = days(today, s.claim_deadline);
        out.push({ id: s.id || s.settlement_id, what: `${s.name} claim deadline`, on: s.claim_deadline, days_left: left, alert_days: [30, 7, 2], fires_today: [30, 7, 2, 0].includes(left), status: left < 0 ? "missed" : left === 0 ? "today" : "upcoming" });
      }
      return out.sort((a, b) => a.days_left - b.days_left);
    }
    function filedText(row, ctx) {
      const hearing = row.final_approval_hearing ? ` The settlement's final approval hearing is ${nice(row.final_approval_hearing)}; payments come after approval and any appeals.` : "";
      return `Recorded: you filed the ${row.name} claim. If the site gave you a confirmation number, paste it here and I'll keep it with the claim — I don't have one from the site myself, and I won't invent one.${hearing} I'm watching your linked accounts for the administrator's payment (${row.administrator}); when it posts I'll show it against this claim. If nothing has posted 30 days after final approval, ask me to check and I'll pull the administrator's status page: ${row.claim_url}.`;
    }

    // ---- C91: unclaimed property ----
    function searchPlan(ctx) {
      const c = ctx || {}, data = c.stateSearch || {}, person = c.person || {};
      const states = (c.states || []).map(s => String(s).toUpperCase());
      if (!person.name || !states.length) return { text: "I can build the search, but I need the name the accounts were in and the states you've lived in — say, \"search unclaimed property for <your name> in IL and CA\". Each state is searched separately, under your name and your old addresses in that state." };
      const lines = [`Here's the search for ${person.name}, state by state. It is free everywhere: no state charges to search or to claim, so any site asking for a fee to search is not the state — close it.`];
      for (const st of states) {
        const row = (data.states || []).find(x => x.state === st);
        if (row) lines.push(`- ${row.state_name}: ${row.program} — search "${person.last}, ${person.first}" at ${row.search_url}. You can also check a claim's status there with its Claim ID.`);
        else lines.push(`- ${st}: I don't have a verified portal on file for that state, so go through NAUPA's directory at ${data.directory.url} — it links to ${st}'s official government program. Most states can also be searched at once on MissingMoney.com, NAUPA's free multi-state search.`);
      }
      const props = (c.properties || []).filter(p => states.includes(String(p.state || "").toUpperCase()));
      if (props.length) {
        lines.push(`The property file shows ${props.length} possible ${props.length === 1 ? "match" : "matches"} under that name. A match is only yours if the reported address is one you lived at:`);
        for (const p of props) lines.push(`- ${money(p.amount_cents)} from ${p.holder}, reported at ${p.address}, ${p.city}, ${p.state} (property ${p.id}, reported ${p.reported_on}).`);
        lines.push(`Say "claim the ${props[0].holder}" and I'll build the claim packet with the documents the state asks for. You file it on the state's site — filing is your tap.`);
      } else {
        lines.push("I don't hold a state property database, so the hits themselves are on those pages: run each search, and tell me what you find — I'll build the claim packet for anything that's yours and keep the claim ID and timeline with it.");
      }
      return { text: lines.join("\n"), properties: props };
    }
    function propertyPacket(prop, ctx) {
      const c = ctx || {}, data = c.stateSearch || {};
      const row = (data.states || []).find(x => x.state === prop.state);
      const where = row ? `${row.program} at ${row.search_url}` : `the state's official program, linked from NAUPA's directory at ${data.directory.url}`;
      const timeline = row && row.timeline_note ? row.timeline_note : "The state doesn't publish a processing time on its site, so I won't guess one; the claim ID is how you track it.";
      const lines = [
        `Claim packet — unclaimed property ${prop.id} (${prop.state}). Prepared for you to file; nothing has been submitted.`,
        `- File at: ${where}. Filing is free.`,
        `- The property: ${money(prop.amount_cents)} from ${prop.holder}, reported at ${prop.address}, ${prop.city}, ${prop.state} (reported ${prop.reported_on}).`,
        "- You'll enter: the property ID and your name exactly as it appears on your ID, then sign the state's claim form.",
        "- Documents states ask for: a government photo ID, and proof you lived at the reported address (an old utility bill, lease or bank statement with that address). Identity numbers are typed by you, inside the state's own form — never in this chat.",
        `- Timeline: ${timeline}`,
        "File it, then tell me the claim ID the site gives you — I'll keep it with this packet and check the status with you. I can't see the state's answer myself.",
      ];
      return { property_id: prop.id, text: lines.join("\n") };
    }

    // ---- C94: recalls ----
    function matchRecalls(ctx) {
      const c = ctx || {}, txs = txsOf(c.transactions);
      const confirmed = [], unconfirmed = [], confirmedByRecall = new Map();
      const rows = ((c.recalls || {}).recalls || []).filter(r => !(r.deadline && ymd(r.deadline) < c.today));
      const atMerchantOf = r => { const mk = keyOf(r.merchant); return txs.filter(t => namesMerchant(keyOf(t.merchant), mk) && (!r.purchased_after || t.date >= ymd(r.purchased_after)) && (!r.purchased_before || t.date <= ymd(r.purchased_before))); };
      for (const r of rows) {
        const merchantWords = new Set(wordsOf(r.merchant));
        // The words a purchase record must name to confirm the product: the row's match_words when it gives them (the
        // identifying core — brand and product type), else every word of the product beyond the merchant's own name.
        const productWords = (r.match_words && r.match_words.length ? r.match_words.map(keyOf) : wordsOf(r.product).filter(w => !merchantWords.has(w)));
        const named = atMerchantOf(r).filter(t => productWords.length > 0 && productWords.every(w => wordsOf(t.merchant).includes(w)));
        if (named.length) { confirmed.push({ row: r, evidence: named.slice(0, 3) }); const set = confirmedByRecall.get(r.recall_number) || new Set(); named.forEach(t => set.add(t.merchant + "|" + t.date + "|" + t.amount_cents)); confirmedByRecall.set(r.recall_number, set); }
      }
      const unconfirmedUsed = new Map();
      for (const r of rows) {
        const used = new Set([...(confirmedByRecall.get(r.recall_number) || []), ...(unconfirmedUsed.get(r.recall_number) || [])]);
        const rest = atMerchantOf(r).filter(t => !used.has(t.merchant + "|" + t.date + "|" + t.amount_cents));
        if (rest.length) { unconfirmed.push({ row: r, evidence: rest.slice(0, 3) }); const set = unconfirmedUsed.get(r.recall_number) || new Set(); rest.forEach(t => set.add(t.merchant + "|" + t.date + "|" + t.amount_cents)); unconfirmedUsed.set(r.recall_number, set); }
      }
      return { confirmed, unconfirmed };
    }
    function recallsText(ctx) {
      const data = (ctx || {}).recalls || {}, { confirmed, unconfirmed } = matchRecalls(ctx);
      const checked = (data.recalls || []).map(r => r.checked_on).sort().slice(-1)[0];
      const source = `From the recall directory I checked ${checked ? "on " + nice(checked) : ""} against the CPSC's own notices. Nothing has been claimed.`;
      const lines = [];
      if (confirmed.length) {
        lines.push(`${confirmed.length === 1 ? "One of your purchases matches" : confirmed.length + " of your purchases match"} an open recall:`);
        for (const m of confirmed) {
          const r = m.row, t = m.evidence[0];
          const expected = r.refund_basis === "stated_amount" ? r.refund_cents : Math.abs(t.amount_cents);
          lines.push(`- ${r.product}: your ${proofLine(t)}. ${r.agency === "U.S. Consumer Product Safety Commission (CPSC)" ? "CPSC" : r.agency} recall ${r.recall_number} (${nice(r.recall_date)}). ${r.hazard} The remedy: ${r.remedy} Expected back on a refund: ${money(expected)}. Start it at ${r.claim_url}.`);
        }
        lines.push("Say \"prepare the recall claim\" and I'll lay out exactly what to send. You submit it — claiming is your tap.");
      }
      for (const m of unconfirmed) lines.push(`One purchase may match but isn't confirmed: your ${proofLine(m.evidence[0])} doesn't name the product, and a purchase at the right store can be anything that store sells. Check the product itself (${m.row.product}; model numbers: ${(m.row.models || []).join(", ")}) before claiming anything — I won't put a dollar on an unconfirmed match.`);
      if (!confirmed.length && !unconfirmed.length) lines.push(`Nothing in your linked purchases matches the ${(data.recalls || []).length} recalls in the directory. The directory only holds verified CPSC notices I have checked, so a miss here is not an all-clear — the full list is the CPSC's at cpsc.gov/Recalls.`);
      lines.push(source);
      return lines.join("\n");
    }
    function remedyPacket(row, match) {
      const t = (match.evidence || [])[0] || {};
      const expected = row.refund_basis === "stated_amount" ? row.refund_cents : Math.abs(t.amount_cents || 0);
      const lines = [
        `Recall claim packet — ${row.product}. Prepared for you to submit; nothing has been sent.`,
        `- Recall: ${row.agency} ${row.recall_number}, announced ${nice(row.recall_date)}. Notice: ${row.source_url}.`,
        `- Your purchase: ${t.merchant ? proofLine(t) : "the purchase on file"}.`,
        `- The remedy: ${row.remedy}`,
        `- Expected back: ${money(expected)}${row.refund_basis === "purchase_price" ? " (your full purchase price)" : ""}.`,
        `- Start at: ${row.claim_url}.`,
        "- Stop using the product now, and keep it (unplugged, away from children) until the manufacturer's instructions say to dispose of it.",
        "Submit it, then tell me what reference they give you — I'll watch your linked accounts for the refund and check it against this packet when it posts.",
      ];
      return { recall_id: row.id, text: lines.join("\n") };
    }

    function answer(message, ctx) {
      const c = ctx || {}, k = kind(message, c);
      if (!k) return null;
      if (k === "settlements" || k === "settlements_notice") {
        let cc = c;
        if (k === "settlements_notice") { const row = namedRow(message, (c.settlements || {}).settlements, r => wordsOf(r.name)); cc = { ...c, notices: [...(c.notices || []), row.id] }; }
        const mm = matchSettlements(cc);
        return { kind: "settlements", text: settlementsText(cc), ...mm, alerts: deadlineAlerts(mm.matches.filter(m => m.row.filing === "claim_form").map(m => m.row), c.today) };
      }
      if (k === "settlement_packet") {
        const row = namedRow(message, (c.settlements || {}).settlements, r => wordsOf(r.name));
        if (!row) return null;
        const m = matchSettlements(c).matches.find(x => x.row.id === row.id) || { tier: "purchase", evidence: [], days_left: row.claim_deadline ? days(c.today, row.claim_deadline) : null };
        const packet = claimPacket(row, m, c.person);
        return { kind: k, text: packet.text, packet };
      }
      if (k === "settlement_filed") {
        const row = namedRow(message, (c.settlements || {}).settlements, r => wordsOf(r.name));
        if (!row) return null;
        return { kind: k, text: filedText(row, c), settlement_id: row.id };
      }
      if (k === "unclaimed_search") { const plan = searchPlan(c); return { kind: k, text: plan.text, properties: plan.properties }; }
      if (k === "property_packet") {
        const prop = namedRow(message, c.properties, p => wordsOf(p.holder)) || (c.properties || [])[0];
        if (!prop) return null;
        const packet = propertyPacket(prop, c);
        return { kind: k, text: packet.text, packet };
      }
      if (k === "recalls") {
        const mm = matchRecalls(c);
        if (/\bprepare\b/i.test(message) && mm.confirmed.length) { const named = mm.confirmed.find(m => wordsOf(m.row.product).some(w => wordsOf(message).includes(w))) || mm.confirmed[0]; const packet = remedyPacket(named.row, named); return { kind: "recall_packet", text: packet.text, packet }; }
        return { kind: k, text: recallsText(c), ...mm };
      }
      return null;
    }
    return { validateSettlements, validateRecalls, validateStateSearch, kind, matchSettlements, claimPacket, deadlineAlerts, filedText, searchPlan, propertyPacket, matchRecalls, remedyPacket, answer };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = FoundMoney;
