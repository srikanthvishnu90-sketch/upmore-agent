/* Government preparation (cluster K11; owner capabilities C119, C120, C160, C162, C166). Five jobs, all
   PREPARATION: county and IRS rails are not wired, and every filing is the owner's own legal tap, so Upmore
   computes, checks and drafts — the owner submits. Nothing here files, submits or sends anything.
     - C119 property tax appeal: the person's assessed value against comparable assessments on file, a suggested
       assessed value (the comps' median), the equalized reduction and the dollar savings per year at the tax
       rate on file, plus the appeal deadline computed from the notice date (the county window rule on file).
     - C120 homestead exemption: eligibility checked rule by rule against the county rules on file
       (packages/offers/government.json), and the annual savings in dollars (EAV reduction x tax rate).
     - C160 IRS notice: the notice kind on file decoded in plain words, the response deadline computed from
       the notice date, a drafted response, and escalation to a tax professional flagged where the kind or the
       amount demands it. A code not on file is said so, never decoded from a guess.
     - C162 refund tracking: the Where's My Refund state machine (received -> approved -> sent, never
       backwards) over the status on file, the PATH Act hold where it applies, and the deposit detected in
       the person's own transactions when it lands.
     - C166 FBAR: the obligation math — each foreign account at its maximum balance during the year, summed;
       filing is required only when the aggregate EXCEEDS $10,000 — plus the guided filing packet for the
       BSA E-Filing System, which the owner submits himself.
   All reference data is dated official data (packages/offers/government.json); past its fresh_days every
   answer says the rules on file may have changed and names the official page. Pure; tests/government.test.cjs,
   tests/edge/government-answer.test.ts. */
const Government = (() => {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const validYmd = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
  const dayNum = s => Math.floor(Date.parse(s + "T00:00:00Z") / 86400000);
  const ymdOf = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
  const addDays = (s, n) => ymdOf(dayNum(s) + n);
  const nice = s => validYmd(s) ? `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}` : String(s);
  const niceL = s => validYmd(s) ? `${MONL[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}` : String(s);
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const niceW = s => validYmd(s) ? `${DOW[new Date(Date.parse(s + "T00:00:00Z")).getUTCDay()]} ${niceL(s)}` : String(s);
  const money = c => { const v = Math.round(c); const sign = v < 0 ? "-" : ""; const a = Math.abs(v); return `${sign}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`; };
  const dollars = c => money(c);
  // Exact decimal math on integers: a rate given as a string ("0.0693") or a multiplier ("2.9237").
  const mulRate = (cents, rateStr) => { const s = String(rateStr); const neg = s.startsWith("-"); const [w, f = ""] = (neg ? s.slice(1) : s).split("."); const num = Number(w + f), den = 10 ** f.length; const out = Math.floor((Math.abs(cents) * num + den / 2) / den); return (cents < 0) !== neg ? -out : out; };
  const staleNote = (data, today) => {
    if (!data || !validYmd(today) || !validYmd(data.checked_on)) return "";
    return dayNum(today) - dayNum(data.checked_on) > (data.fresh_days || 90)
      ? ` My copy of these rules was checked ${nice(data.checked_on)} and may have changed; re-check on the official page before you file.` : "";
  };
  const BOUNDARY = "I've prepared this for your filing — you submit it yourself; I don't file with the county, the IRS or FinCEN.";

  function validate(data) {
    const problems = [];
    const d = data || {};
    if (!validYmd(d.checked_on)) problems.push("government: checked_on must be a date");
    if (!Number.isInteger(d.fresh_days) || d.fresh_days <= 0) problems.push("government: fresh_days must be a positive integer");
    const cids = new Set();
    for (const c of d.counties || []) {
      if (cids.has(c.id)) problems.push(`county ${c.id}: duplicate id`); cids.add(c.id);
      const h = c.homestead || {};
      if (!Number.isInteger(h.eav_reduction_dollars) || h.eav_reduction_dollars <= 0) problems.push(`county ${c.id}: homestead EAV reduction must be a positive integer`);
      if (!Array.isArray(h.rules) || !h.rules.length) problems.push(`county ${c.id}: homestead rules missing`);
      if (!h.source || !/^https:\/\//.test(h.source.url || "") || !validYmd(h.checked_on)) problems.push(`county ${c.id}: homestead needs a source and a checked date`);
      const a = c.appeal || {};
      if (!Number.isInteger(a.window_days_from_notice) || a.window_days_from_notice <= 0 || !Array.isArray(a.channels) || !a.channels.length) problems.push(`county ${c.id}: appeal needs a window and channels`);
    }
    const codes = new Set();
    for (const n of d.irs_notices || []) {
      if (codes.has(n.code)) problems.push(`notice ${n.code}: duplicate code`); codes.add(n.code);
      if (!n.plain || !n.action || !n.deadline_text) problems.push(`notice ${n.code}: plain words, action and deadline text required`);
      if (!(n.respond_days === null || (Number.isInteger(n.respond_days) && n.respond_days > 0))) problems.push(`notice ${n.code}: respond_days must be a positive integer or null`);
      if (!n.source || !/^https:\/\/www\.irs\.gov\//.test(n.source.url || "") || !validYmd(n.checked_on)) problems.push(`notice ${n.code}: an irs.gov source and a checked date required`);
    }
    const f = d.fbar || {};
    if (!Number.isInteger(f.threshold_cents) || f.threshold_cents <= 0) problems.push("fbar: threshold_cents must be a positive integer");
    if (!f.due || !Number.isInteger(f.due.month) || !Number.isInteger(f.due.day)) problems.push("fbar: due month and day required");
    if (!f.source || !/^https:\/\//.test(f.source.url || "")) problems.push("fbar: a source required");
    const r = d.refund || {};
    if (JSON.stringify(r.stages) !== JSON.stringify(["received", "approved", "sent"])) problems.push("refund: stages must be received, approved, sent");
    return problems;
  }

  // ---- routing: what is the person asking? ----
  function kind(message) {
    const t = String(message || "").toLowerCase().replace(/[’‘]/g, "'");
    if (!t.trim()) return null;
    if (/\bfbar\b|foreign (?:bank )?account|fincen/.test(t)) return "fbar";
    if (/\b(?:cp ?\d{2,4}[a-z]?|lt ?\d{2}|letter 1058)\b/.test(t) || /\birs (?:sent|letter|notice)\b|letter from the irs|notice from the irs/.test(t)) return "irs_notice";
    if (/\bhomestead\b|homeowner exemption/.test(t)) return "homestead";
    if (/property tax (?:assessment )?appeal|appeal (?:my|the) (?:property tax )?assessment|assessment (?:jumped|went up|increased)/.test(t)) return "property_appeal";
    // Tax refunds only: a merchant refund ("where's my refund from REI") stays with the refund check, which
    // itself refuses tax refunds; this kind needs an explicit tax word next to the refund.
    if (/\b(?:tax|irs|federal|state|illinois) refund\b|\brefund\b[^.]{0,30}\bfrom the (?:irs|state)\b/.test(t)) return "refund_track";
    return null;
  }

  const countyOf = (data, ctx) => (data.counties || []).find(c => c.id === (ctx.county_id || "cook-il")) || (data.counties || [])[0];

  // ---- C119: property tax assessment appeal ----
  function propertyAppeal(message, ctx) {
    const c = ctx || {}, data = c.data || {}, county = countyOf(data, c), p = c.property || null;
    if (!p || !Number.isInteger(p.assessed_cents) || !Array.isArray(c.comps) || !c.comps.length) {
      return { kind: "property_appeal", ready: false, text: `I can build the appeal packet, but I need the figures from your assessment notice and the county record: your assessed value, and the assessed values of comparable homes nearby (same township, similar size). Tell me those, or the property's PIN, and I'll compute the case. ${BOUNDARY}` };
    }
    const comps = c.comps.filter(x => Number.isInteger(x.assessed_cents)).slice().sort((a, b) => a.assessed_cents - b.assessed_cents);
    if (!comps.length) return { kind: "property_appeal", ready: false, text: `The comparable assessments on file have no usable figures, so I won't build a case on them. ${BOUNDARY}` };
    const mid = Math.floor(comps.length / 2);
    const median = comps.length % 2 ? comps[mid].assessed_cents : Math.round((comps[mid - 1].assessed_cents + comps[mid].assessed_cents) / 2);
    const level = county.assessment_level_residential;
    const lines = [];
    lines.push(`Your assessment: market value ${level ? dollars(Math.round(p.assessed_cents / level)) : "on your notice"}, assessed at ${dollars(p.assessed_cents)}${p.prior_assessed_cents ? `, up from ${dollars(p.prior_assessed_cents)} (${(((p.assessed_cents - p.prior_assessed_cents) / p.prior_assessed_cents) * 100).toFixed(1)}%)` : ""}.`);
    lines.push(`Comparable assessments on file (${comps.length}, ${county.name}): ${comps.map(x => `${x.address} at ${dollars(x.assessed_cents)}`).join("; ")}. Their median assessed value is ${dollars(median)}.`);
    let savingsCents = null;
    if (p.assessed_cents > median) {
      const reductionAv = p.assessed_cents - median;
      const reductionEav = p.equalizer ? mulRate(reductionAv, p.equalizer) : reductionAv;
      savingsCents = p.tax_rate ? mulRate(reductionEav, p.tax_rate) : null;
      lines.push(`The packet asks for an assessed value of ${dollars(median)} — a reduction of ${dollars(reductionAv)} in assessed value${p.equalizer ? `, ${dollars(reductionEav)} in equalized assessed value at the ${p.equalizer} equalizer on file` : ""}${savingsCents !== null ? `, worth about ${dollars(savingsCents)} a year at the ${p.tax_rate} tax rate on file` : ""}. That is an estimate from the rate on file; the county sets the final rate.`);
    } else {
      lines.push(`Your assessed value is at or below the comps' median, so a value appeal on these comps would likely raise nothing and could invite a closer look. The packet says so plainly rather than inventing a case.`);
    }
    if (validYmd(p.notice_date)) {
      const deadline = addDays(p.notice_date, county.appeal.window_days_from_notice);
      const left = validYmd(c.today) ? dayNum(deadline) - dayNum(c.today) : null;
      lines.push(`Deadline: the ${county.name} rule on file is ${county.appeal.window_text}. From your notice date (${nice(p.notice_date)}), the Assessor appeal is due ${niceW(deadline)}${left !== null ? (left >= 0 ? ` — ${left} day${left === 1 ? "" : "s"} from today` : ` — that date has passed; the Board of Review window for your township is the next route, on the dates it publishes`) : ""}. Channels: ${county.appeal.channels.join("; ")} (per ${county.appeal.source.title}, checked ${county.appeal.checked_on}).`);
    } else {
      lines.push(`Deadline: the ${county.name} rule on file is ${county.appeal.window_text}. Give me the date on your notice and I'll compute the exact due date.`);
    }
    lines.push(BOUNDARY);
    const stale = staleNote(data, c.today); if (stale) lines.push(stale.trim());
    return { kind: "property_appeal", ready: true, median_comp_cents: median, savings_cents_per_year: savingsCents, text: lines.join("\n") };
  }

  // ---- C120: homestead exemption ----
  function homestead(message, ctx) {
    const c = ctx || {}, data = c.data || {}, county = countyOf(data, c), h = county.homestead, f = c.facts || null;
    if (!f) {
      return { kind: "homestead", ready: false, text: `To check you against the ${county.name} rules on file I need three facts: do you own the home (or hold a lease or contract that makes you pay its property taxes), did you live there as your main home on January 1 of the tax year, and is the ${h.name} already on your property record? ${BOUNDARY}` };
    }
    const checks = [
      ["owns_or_responsible", "you own the property, or a lease or contract makes you responsible for its real estate taxes"],
      ["primary_residence_jan1", "you occupied it as your principal place of residence on January 1 of the tax year"],
      ["not_already_on_record", "the exemption is not already on the property record"],
    ];
    const lines = [];
    const failed = checks.filter(([k]) => f[k] === false), unknown = checks.filter(([k]) => f[k] !== true && f[k] !== false);
    for (const [k, words] of checks) lines.push(`${f[k] === true ? "Met" : f[k] === false ? "Not met" : "Unknown"}: ${words}.`);
    if (f.already_receiving === true) {
      lines.push(`Your property record already shows the ${h.name}, so there is nothing to file; it renews on the record.`);
    } else if (failed.length) {
      lines.push(`On the ${county.name} rules on file (${h.source.title}, checked ${h.checked_on}), you do not qualify yet: ${failed.map(([k, w]) => w).join("; ")}. Filing anyway would be denied, so the packet says not eligible and why.`);
    } else if (unknown.length) {
      lines.push(`I can't finish the check until the unknown items above are answered; I won't guess at eligibility.`);
    } else {
      const rate = c.property && c.property.tax_rate;
      const senior = f.age_65_plus === true ? h.senior_eav_reduction_dollars : 0;
      const totalEav = h.eav_reduction_dollars + senior;
      lines.push(`You meet every ${county.name} rule on file for the ${h.name} (${h.source.title}, checked ${h.checked_on})${senior ? `, plus the Senior Exemption at ${dollars(senior * 100)} of EAV` : ""}. It reduces your equalized assessed value by ${dollars(totalEav * 100)}${rate ? `, worth ${dollars(mulRate(totalEav * 100, rate))} a year at the ${rate} tax rate on file` : ""}. The prepared filing goes to the county assessor; it shows on the property record and on the second-installment bill.`);
      lines.push(BOUNDARY);
    }
    const stale = staleNote(data, c.today); if (stale) lines.push(stale.trim());
    return { kind: "homestead", ready: !unknown.length, eligible: !failed.length && f.already_receiving !== true && !unknown.length, text: lines.join("\n") };
  }

  // ---- C160: IRS notice ----
  const noticeCodeOf = message => {
    const m = /\b(CP)\s?(\d{2,4})([A-Z])?\b/i.exec(String(message || "")) || /\b(LT)\s?(\d{2})\b/i.exec(String(message || "")) || /\bletter\s+(1058)\b/i.exec(String(message || ""));
    if (!m) return null;
    if (m[1] && /^letter$/i.test(m[1])) return "1058";
    return (m[1].toUpperCase() + m[2] + (m[3] || "")).replace(/\s/g, "");
  };
  const noticeDateOf = message => {
    const t = String(message || "");
    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
    if (iso && validYmd(iso[0])) return iso[0];
    const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/.exec(t);
    if (m) { const s = `${m[3]}-${String(MONL.indexOf(m[1]) + 1).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; if (validYmd(s)) return s; }
    return null;
  };
  const amountOf = message => { const m = /\$\s?(\d[\d,]*(?:\.\d{2})?)/.exec(String(message || "")); return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null; };

  function irsNotice(message, ctx) {
    const c = ctx || {}, data = c.data || {};
    const n0 = c.notice || {};
    const code = n0.code || noticeCodeOf(message);
    const date = n0.date || noticeDateOf(message);
    const amount = Number.isInteger(n0.amount_cents) ? n0.amount_cents : amountOf(message);
    if (!code) return { kind: "irs_notice", ready: false, text: `Tell me the notice code at the top of the letter (for example CP2000 or LT11), its date, and the amount it names, and I'll decode it in plain words, compute your deadline, and draft the response. ${BOUNDARY}` };
    const row = (data.irs_notices || []).find(n => n.code === code) || (data.irs_notices || []).find(n => n.code === code.replace(/[A-Z]$/, "")) || null;
    if (!row) {
      return { kind: "irs_notice", ready: false, unknown_code: code, text: [`I don't have notice ${code} on file, so I won't guess what it means. The letter itself states what the IRS wants and the date to act by — that printed date controls.`, `Read the first page for what changed and the amount, and the last page for how to respond; if it mentions a levy, a hearing, or Tax Court, treat it as urgent and take it to a tax professional. Give me its date and the amount and I'll run the deadline clock on the date printed on it.`, BOUNDARY].join("\n") };
    }
    const lines = [];
    lines.push(`${row.code} — ${row.name}. In plain words: ${row.plain}`);
    if (amount !== null) lines.push(`The amount it names is ${dollars(amount)}. Interest keeps accruing on an unpaid balance until it is paid in full.`);
    let deadline = null, left = null;
    if (row.respond_days && date) {
      deadline = addDays(date, row.respond_days);
      left = validYmd(c.today) ? dayNum(deadline) - dayNum(c.today) : null;
      lines.push(`Deadline: ${row.deadline_text}. From the notice date (${nice(date)}), respond by ${niceW(deadline)}${left !== null ? (left >= 0 ? ` — ${left} day${left === 1 ? "" : "s"} from today` : ` — that date has passed. Respond immediately anyway: a late response can still be considered, and for a hearing request an equivalent hearing may be available within a year; call the number on the notice today`) : ""} (per ${row.source.title}, checked ${row.checked_on}).`);
    } else {
      lines.push(`Deadline: ${row.deadline_text}${date ? ` (notice dated ${nice(date)})` : ""}. The date printed on your notice controls (per ${row.source.title}, checked ${row.checked_on}).`);
    }
    lines.push(`What to do: ${row.action}`);
    const escalate = row.escalate === true || (amount !== null && amount >= 1000000);
    if (escalate) lines.push(`Escalation: ${row.escalate ? "this notice kind carries enforcement or court deadlines" : "the amount is large"} — have a tax professional (CPA, enrolled agent or tax attorney) review the response before you send it. I draft; they advise.`);
    const position = c.position === "agree" ? "agree" : c.position === "disagree" ? "disagree" : null;
    let draft = null;
    if (position) {
      draft = ["Response draft (you review, sign and send it yourself):",
        `Re: Notice ${row.code}${date ? ` dated ${niceL(date)}` : ""}${c.tax_year ? `, tax year ${c.tax_year}` : ""}`,
        position === "agree"
          ? `I agree with the changes proposed in the notice${amount !== null ? ` and with the amount of ${dollars(amount)}` : ""}. Please adjust my account as proposed and send a bill for any balance remaining after payments already made.`
          : `I do not agree with ${amount !== null ? `the proposed amount of ${dollars(amount)}` : "the proposed changes"} in the notice. The records enclosed with this response show the figures I reported were correct. Please close the case with no change and confirm in writing. I have kept the originals; enclosed are copies.`,
        "Enclosures: copies of the records that support the figures on the return (never originals)."].join("\n");
      lines.push(draft);
    } else {
      lines.push(`Tell me whether you agree or disagree with it and I'll draft the exact response; the draft never sends itself.`);
    }
    lines.push(`The case stays tracked here until the IRS closes it in writing. ${BOUNDARY}`);
    const stale = staleNote(data, c.today); if (stale) lines.push(stale.trim());
    return { kind: "irs_notice", ready: true, code: row.code, deadline, days_left: left, escalate, draft, text: lines.join("\n") };
  }

  // ---- C162: refund tracking ----
  function refundTrack(message, ctx) {
    const c = ctx || {}, data = c.data || {}, r = c.refund || null, R = data.refund || {};
    if (!r || !R.stages || !R.stages.includes(r.stage)) {
      return { kind: "refund_track", ready: false, text: `I don't have a refund status on file to track yet. Where's My Refund (the IRS tool, and your state's for a state refund) needs your SSN, filing status and the exact refund amount — those digits go into the IRS's own page, never into this chat. Check it there and tell me the stage it shows (return received, refund approved, or refund sent) and I'll track it from there and watch your account for the deposit. ${BOUNDARY.replace("county, the IRS or FinCEN", "the IRS")}` };
    }
    const lines = [];
    const who = r.jurisdiction === "state" ? `Your ${r.state_name || "state"} refund` : "Your federal refund";
    lines.push(`${who} of ${dollars(r.amount_cents)}: ${R.stage_text[r.stage]} (status on file, as of ${r.as_of || "the last check"}).`);
    if (r.stage === "received" && r.claims_eitc_actc) lines.push(R.path_act);
    if (r.stage === "received" && validYmd(r.filed_date)) {
      const typical = addDays(r.filed_date, R.typical_days_efiled || 21);
      lines.push(`You e-filed ${nice(r.filed_date)}; most e-filed refunds with direct deposit arrive in under ${R.typical_days_efiled || 21} days, so the typical window runs to ${niceW(typical)} — that is the IRS's general timing, not a promise for yours.`);
    }
    if (r.stage === "approved" && validYmd(r.expected_date)) lines.push(`The payment date on file is ${niceW(r.expected_date)}.`);
    let landed = null;
    if (r.stage === "sent") {
      const hits = (c.transactions || []).filter(tx => tx.amount_cents === r.amount_cents && (R.deposit_descriptors || []).some(d => String(tx.merchant_raw || "").toUpperCase().includes(d)));
      if (hits.length) {
        landed = hits[0];
        lines.push(`It has landed: ${dollars(landed.amount_cents)} posted to your account on ${nice(String(landed.posted_on).slice(0, 10))} (${landed.merchant_raw}). The tracking closes here — the deposit in your own transactions is the proof.`);
      } else {
        lines.push(`Sent but not yet in your transactions; a bank can take several days to post it. I'll keep watching your account and tell you the moment the ${dollars(r.amount_cents)} deposit lands.`);
      }
    }
    if (r.inconsistent) lines.push(`One caution: the status on file moved backwards (a later stage was recorded before an earlier one), which real refund systems don't do — treat the stage above as unconfirmed until the official tool shows it again.`);
    lines.push(`Status changes get pushed to you as they land. (Per ${R.source.title}, checked ${R.checked_on}.)`);
    const stale = staleNote(data, c.today); if (stale) lines.push(stale.trim());
    return { kind: "refund_track", ready: true, stage: r.stage, landed: !!landed, text: lines.join("\n") };
  }

  // ---- C166: FBAR ----
  function fbar(message, ctx) {
    const c = ctx || {}, data = c.data || {}, F = data.fbar || {};
    let accounts = Array.isArray(c.foreign_accounts) ? c.foreign_accounts.filter(a => Number.isInteger(a.max_balance_cents)) : [];
    if (!accounts.length) {
      // Figures the person states in the message itself: every $ amount is one account's maximum balance.
      const amounts = [...String(message || "").matchAll(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g)].map(m => Math.round(Number(m[1].replace(/,/g, "")) * 100));
      accounts = amounts.map((v, i) => ({ name: `foreign account ${i + 1} (as you stated it)`, max_balance_cents: v }));
    }
    if (!accounts.length) {
      return { kind: "fbar", ready: false, text: `To run the FBAR check I need each foreign account's highest balance during the year, in dollars. The rule on file: ${F.threshold_text || "the aggregate must exceed $10,000"} (per ${F.source ? F.source.title : "FinCEN"}, checked ${F.checked_on || data.checked_on}). List the accounts and their maximum balances and I'll do the math exactly. ${BOUNDARY}` };
    }
    const aggregate = accounts.reduce((s, a) => s + a.max_balance_cents, 0);
    const required = aggregate > F.threshold_cents;
    const year = Number.isInteger(c.report_year) ? c.report_year : (validYmd(c.today) ? +c.today.slice(0, 4) - 1 : null);
    const due = year !== null ? `${year + 1}-${String(F.due.month).padStart(2, "0")}-${String(F.due.day).padStart(2, "0")}` : null;
    const ext = year !== null ? `${year + 1}-${String(F.due.automatic_extension.month).padStart(2, "0")}-${String(F.due.automatic_extension.day).padStart(2, "0")}` : null;
    const lines = [];
    lines.push(`Your foreign accounts at their maximum balances${year !== null ? ` for ${year}` : ""}: ${accounts.map(a => `${a.name} ${dollars(a.max_balance_cents)}`).join("; ")}. Aggregate maximum: ${dollars(aggregate)}.`);
    if (required) {
      lines.push(`That exceeds the ${dollars(F.threshold_cents)} threshold, so an FBAR (${F.form}) is required${year !== null ? ` for ${year}` : ""}. Note the test is the aggregate at its highest combined point measured from each account's own maximum — not a year-end balance, and not per account.`);
      if (due) {
        const left = validYmd(c.today) ? dayNum(ext) - dayNum(c.today) : null;
        lines.push(`Deadline: due ${niceW(due)}; ${F.due.extension_text}, so the last day is ${niceW(ext)}${left !== null ? (left >= 0 ? ` — ${left} day${left === 1 ? "" : "s"} from today` : " — that date has passed; file as soon as possible, late-filing relief exists for non-willful cases and a professional should review it") : ""}.`);
      }
      lines.push(`Filing packet (prepared for your filing): 1) each account's bank name, country, account type and maximum balance above; 2) file on ${F.channel} — ${F.how_url}; 3) keep the BSA confirmation the system returns and send it back here so the filing is tracked to its proof. ${F.penalty_text}`);
    } else {
      lines.push(`That does not exceed the ${dollars(F.threshold_cents)} threshold (the test is exceeds, not reaches — exactly ${dollars(F.threshold_cents)} does not trigger it), so no FBAR is required${year !== null ? ` for ${year}` : ""} on these accounts. If any account's maximum was higher than the figure used here, tell me and I'll rerun it. Keep the balances on record: next year's math starts from them.`);
    }
    lines.push(BOUNDARY);
    const stale = staleNote(data, c.today); if (stale) lines.push(stale.trim());
    return { kind: "fbar", ready: true, aggregate_cents: aggregate, required, text: lines.join("\n") };
  }

  function answer(message, ctx) {
    const c = ctx || {};
    const k = c.kind || kind(message);
    if (k === "property_appeal") return propertyAppeal(message, c);
    if (k === "homestead") return homestead(message, c);
    if (k === "irs_notice") return irsNotice(message, c);
    if (k === "refund_track") return refundTrack(message, c);
    if (k === "fbar") return fbar(message, c);
    return { kind: null, text: null };
  }

  return { kind, answer, propertyAppeal, homestead, irsNotice, refundTrack, fbar, validate, noticeCodeOf, noticeDateOf, BOUNDARY };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Government;
