  /* Unclaimed money from the state and from failed banks (overnight C6; owner cards M2-UNCLAIMED-01 state auto-return
     check watch, M2-UNCLAIMED-10 failed bank deposits). Two jobs, both read-only:
       - A state treasurer letter or email: called matching only when its sender's domain is the program's official domain
         on file (packages/offers/unclaimed-programs.json). A mailed letter has no sender to check, so it is never called
         real; a fee, a password or a gift card makes it "can't confirm" whatever else it says.
       - A failed bank: a bank the person names, or one in their linked accounts or history, against the FDIC Failed Bank
         List kept as dated data (packages/offers/failed-banks.json): when it failed, who took the deposits (only what the
         sources say), and the FDIC's 18-month and 10-year rules, each with its source and checked date. A name many
         healthy banks share is never matched from the person's rows and is answered with the failed one's city.
     Upmore searches no FDIC or state records and files no claim; it says where to look. Pure; tests/unclaimed.test.cjs,
     tests/edge/unclaimed-answer.test.ts, depth packet UNCLAIMED. */
  const Unclaimed = (() => {
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const validYmd = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
    const validYm = s => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
    const nice = s => validYmd(s) ? `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}` : validYm(s) ? `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : String(s);
    const dayNum = s => Math.floor(Date.parse(s + "T00:00:00Z") / 86400000);
    const monthsBetween = (from, to) => { const a = from.slice(0, 7).split("-").map(Number), b = to.slice(0, 7).split("-").map(Number); return (b[0] - a[0]) * 12 + (b[1] - a[1]) - (validYmd(from) && validYmd(to) && +to.slice(8, 10) < +from.slice(8, 10) ? 1 : 0); };
    const norm = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
    const has = (text, alias) => (" " + norm(text) + " ").includes(" " + norm(alias) + " ");
    const domainsIn = t => [...String(t).matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map(m => m[1].toLowerCase());
    // One comparison for every sender check: the official domain itself or a subdomain of it, never a lookalike.
    const isOfficial = (d, p) => p.official_domains.some(o => d === o || d.endsWith("." + o));
    const CANT = "I can't confirm this is real; never pay a fee or give a password to claim money.";

    function validate(banks, programs) {
      const problems = [];
      const b = banks || {};
      if (!Number.isInteger(b.fresh_days) || b.fresh_days <= 0) problems.push("failed banks: fresh_days must be a positive integer");
      if (!b.list || !/^https:\/\/www\.fdic\.gov\//.test(b.list.url || "")) problems.push("failed banks: the list must be the FDIC's");
      for (const k of ["unclaimed_months", "state_years"]) {
        const r = (b.rules || {})[k];
        if (!r || !Number.isInteger(r.value) || !r.source || !/^https:\/\//.test(r.source.url || "") || !validYmd(r.checked_on)) problems.push(`failed banks: rule ${k} needs a value, a source and a checked date`);
      }
      const ids = new Set();
      for (const x of b.banks || []) {
        const tag = `failed bank ${x.id}`;
        if (ids.has(x.id)) problems.push(`${tag}: duplicate id`); ids.add(x.id);
        if (!x.name || !Array.isArray(x.aliases) || !x.aliases.length) problems.push(`${tag}: name and aliases`);
        if (!(validYmd(x.closed_on) || validYm(x.closed_on))) problems.push(`${tag}: closed_on must be a date or a month`);
        if (!["all", "substantially_all", "insured", "unknown"].includes(x.deposits)) problems.push(`${tag}: deposits must say what the sources said`);
        if (!x.acquirer || !x.city || !/^[A-Z]{2}$/.test(x.state || "")) problems.push(`${tag}: acquirer, city and state`);
        if (!/^https:\/\/www\.fdic\.gov\//.test(x.page || "") || !validYmd(x.checked_on) || !x.checked_how) problems.push(`${tag}: an FDIC page, a checked date and how it was checked`);
        if (typeof x.ambiguous !== "boolean") problems.push(`${tag}: ambiguous must be true or false`);
      }
      const p = programs || {};
      if (!Number.isInteger(p.fresh_days) || p.fresh_days <= 0) problems.push("unclaimed programs: fresh_days must be a positive integer");
      for (const x of p.programs || []) {
        const tag = `unclaimed program ${x.id}`;
        if (!Array.isArray(x.official_domains) || !x.official_domains.length || x.official_domains.some(d => !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.gov$/.test(d))) problems.push(`${tag}: official_domains must be .gov domains`);
        if (!x.page || !/^https:\/\//.test(x.page.url || "") || !validYmd(x.checked_on) || !(x.method_cards || []).length) problems.push(`${tag}: a page, a checked date and the method card`);
        if (!Array.isArray(x.words) || !x.words.length || !x.stated) problems.push(`${tag}: words and what is stated`);
      }
      return problems;
    }

    // ---- what the person is asking ----
    const FAIL = /\b(?:fail(?:ed|ure|s)?|went under|went bust|collapsed?|shut down|was closed|got closed|closed down|seized|taken over by (?:the )?fdic|fdic)\b/i;
    const FAILED_BANK = /\bfailed banks?\b|\bbanks? (?:that )?(?:fail(?:ed)?|went under|went bust|collapsed|was closed|shut down)\b(?! to\b)/i;
    const FDIC_MINE = /\bfdic\b/i, MINE = /\b(?:fail(?:ed|ure)?|closed|took over|taken over|seized|unclaimed|receiver(?:ship)?)\b/i;
    const LETTER_SUBJECT = /\b(?:unclaimed (?:property|money|funds|cash)|state treasurer|treasurer'?s office|money match|state (?:sent|mailed|owes) me)\b/i;
    const LETTER_ASK = /\b(?:letter|e-?mail|check|cheque|notice|mail(?:ed)?|got|received|sent me|says|real|legit(?:imate)?|scam|fake|genuine|trust|verify)\b|\bfrom\s*:/i;
    function kind(message, data) {
      const t = String(message || "");
      if (!t.trim()) return null;
      const programs = (data && data.programs && data.programs.programs) || [];
      const fromProgram = programs.some(p => domainsIn(t).some(d => isOfficial(d, p)));
      if ((LETTER_SUBJECT.test(t) || fromProgram || programs.some(p => p.words.some(w => has(t, w)))) && LETTER_ASK.test(t)) return "state_letter";
      const banks = (data && data.banks && data.banks.banks) || [];
      const named = banks.some(b => b.aliases.some(a => has(t, a)));
      if (FAILED_BANK.test(t) || (FDIC_MINE.test(t) && MINE.test(t))) return "failed_bank";
      if (named && (FAIL.test(t) || /\b(?:money|account|deposit|savings|cd|balance|safe|ok|okay|still open|in business|trouble)\b/i.test(t))) return "failed_bank";
      return null;
    }

    // ---- failed banks ----
    function bankLine(b, today, rules) {
      const lines = [];
      lines.push(`${b.name} (${b.city}, ${b.state}) failed ${validYm(b.closed_on) ? "in" : "on"} ${nice(b.closed_on)}; the FDIC lists ${b.acquirer} as the acquiring bank (per the FDIC Failed Bank List, checked ${b.checked_on}).`);
      if (b.deposits === "all" || b.deposits === "substantially_all") lines.push(`It took over ${b.deposits === "all" ? "all" : "substantially all"} of the deposits, so money you had there should now be at ${b.acquirer}: ask them first.`);
      else if (b.deposits === "insured") lines.push(`It took over the insured deposits; for anything else, the FDIC's page for the bank says how (${b.page}).`);
      else lines.push(`The sources I have don't say what happened to the deposits; the FDIC's page for the bank does (${b.page}).`);
      const m = monthsBetween(b.closed_on, today);
      if (Number.isFinite(m)) lines.push(m >= rules.unclaimed_months.value
        ? `That was more than ${rules.unclaimed_months.value} months ago, so money nobody claimed has likely gone to the state of the address the bank had for you, where you have ${rules.state_years.value} years to claim it from its unclaimed property office (per ${rules.unclaimed_months.source.title} and ${rules.state_years.source.title}, checked ${rules.unclaimed_months.checked_on}).`
        : `That was less than ${rules.unclaimed_months.value} months ago; money nobody claims within ${rules.unclaimed_months.value} months goes to the state of the address the bank had for you (per ${rules.unclaimed_months.source.title}, checked ${rules.unclaimed_months.checked_on}).`);
      return lines.join(" ");
    }
    function failedBank(message, ctx) {
      const c = ctx || {}, data = c.banks || {}, banks = data.banks || [], rules = data.rules, today = c.today;
      const t = String(message || "");
      const stale = validYmd(today) && banks.length && dayNum(today) - Math.max(...banks.map(b => dayNum(b.checked_on))) > data.fresh_days;
      const out = [];
      // Banks the person named. A name many banks share is answered with the failed one's city, never assumed to be theirs.
      const named = banks.filter(b => b.aliases.some(a => has(t, a)));
      const seen = new Set();
      for (const b of named) {
        if (seen.has(b.name + b.closed_on)) continue; seen.add(b.name + b.closed_on);
        const cityGiven = has(t, b.city) || new RegExp(`\\b${b.state}\\b`).test(t);
        if (b.ambiguous && !cityGiven) out.push(`Many banks are named ${b.aliases.find(a => has(t, a)).replace(/\b\w/g, ch => ch.toUpperCase())}. The one on the FDIC failed bank list is in ${b.city}, ${b.state}; if yours was somewhere else, it isn't this failure. If it was that one: ${bankLine(b, today, rules)}`);
        else out.push(bankLine(b, today, rules));
      }
      // Banks in the person's own linked accounts and history, by a distinctive name only.
      const rowHits = [];
      if (!named.length) {
        for (const b of banks.filter(x => !x.ambiguous)) {
          const aliases = b.aliases.filter(a => norm(a).split(" ").length >= 2);
          const acct = (c.accounts || []).find(a => aliases.some(al => has(a.institution, al) || has(a.name, al)));
          const row = (c.transactions || []).find(r => aliases.some(al => has(r.merchant_raw, al)));
          if (acct || row) rowHits.push({ b, where: acct ? `a linked account at ${label(acct.institution || acct.name)}` : `a ${row.amount_cents < 0 ? "payment to" : "deposit from"} ${label(row.merchant_raw)} on ${nice(String(row.posted_on).slice(0, 10))}` });
        }
        for (const h of rowHits) out.push(`Your linked history has ${h.where}. ${bankLine(h.b, today, rules)}`);
      }
      if (!out.length) {
        const first = banks.map(b => b.closed_on).sort()[0];
        out.push(`I don't see a bank from the FDIC failed bank list in your message${c.accounts || c.transactions ? " or your linked accounts and history" : ""}. My copy has the ${new Set(banks.map(b => b.name + b.closed_on)).size} failures since ${nice(first)} (checked ${banks[0] ? banks[0].checked_on : "never"}); older ones and the full list are at ${data.list.url}. Tell me the bank's name and city and I'll check it.`);
      } else {
        out.push(`I can't search FDIC or state records for you or file a claim. Getting your own money back is free; anyone asking for an upfront fee is a red flag.`);
      }
      if (stale) out.push(`My copy of the list may be missing newer failures; the current list is at ${data.list.url}.`);
      if (rowHits.length) out.push(`From your linked accounts and transactions.`);
      return { kind: "failed_bank", named: named.map(b => b.id), from_rows: rowHits.map(h => h.b.id), text: out.join("\n") };
    }

    // ---- state letters ----
    const RED = [
      [/\b(?:pay|send|wire)\b[^.\n]{0,40}\b(?:fee|charge|tax|deposit)\b|\b(?:processing|release|handling|claim|finder'?s?) fee\b|\bgift cards?\b/i, "asks for a fee to release the money"],
      [/\bpassword\b|\bpasscode\b|\bone[- ]time code\b|\blog ?in with your bank\b/i, "asks for a password or a code"],
    ];
    function stateLetter(message, ctx) {
      const c = ctx || {}, data = c.programs || {}, programs = data.programs || [], t = String(message || "");
      const fromLineEarly = (/^\s*from\s*:(.*)$/im.exec(t) || [])[1] || "";
      const sendersEarly = domainsIn(fromLineEarly).length ? domainsIn(fromLineEarly) : domainsIn(t);
      const program = programs.find(p => p.words.some(w => has(t, w))) || programs.find(p => sendersEarly.some(d => isOfficial(d, p)));
      const reds = RED.filter(([re]) => re.test(t)).map(([, why]) => why);
      const fromLine = (/^\s*from\s*:(.*)$/im.exec(t) || [])[1] || "";
      const senders = domainsIn(fromLine).length ? domainsIn(fromLine) : domainsIn(t);
      const age = program && validYmd(c.today) ? dayNum(c.today) - dayNum(program.checked_on) : 0;
      const cite = program ? `per ${program.page.title}, checked ${program.checked_on}${age > data.fresh_days ? `; that may have changed, so check ${program.page.url} before acting` : ""}` : "";
      if (reds.length) return { kind: "state_letter", real: false, text: `${CANT} This one ${reds.join(" and ")}.${program ? ` Look it up on ${program.page.url} by typing the address yourself, not from a link in the message.` : " Look it up on your state treasurer's unclaimed property site, typed in yourself."}` };
      if (!program) return { kind: "state_letter", real: null, text: `I don't have that state's program on file, so I can't confirm the letter. Look it up on your state treasurer's unclaimed property site by typing the address yourself, not from a link or phone number in the letter. Never pay a fee or give a password to get it.` };
      const ok = senders.filter(d => isOfficial(d, program));
      // An official From line with another address to write to in the body is the classic copy: never matching.
      const elsewhere = [...new Set(domainsIn(t).filter(d => !isOfficial(d, program)))];
      if (senders.length && ok.length === senders.length && elsewhere.length) return { kind: "state_letter", real: false, text: `${CANT} It comes from ${ok[0]} but gives another address to write to (${elsewhere.join(", ")}). Look it up on ${program.page.url} by typing the address yourself.` };
      if (senders.length && ok.length === senders.length) {
        return { kind: "state_letter", real: true, text: [`This matches the official sender on file for ${program.name}: ${ok[0]} (${cite}).`, `On file: ${program.stated}`, `I can't see the amount on the state's records; look it up on ${program.page.url} by typing the address yourself. If a check comes, deposit it and tell me, and I'll look for the deposit.`].join("\n") };
      }
      if (senders.length) return { kind: "state_letter", real: false, text: `${CANT} The sender (${[...new Set(senders)].join(", ")}) isn't the official sender on file for ${program.name} (${program.official_domains.join(" or ")}). Look it up on ${program.page.url} by typing the address yourself.` };
      return { kind: "state_letter", real: null, text: [`A mailed letter has no sender I can check, so I can't confirm it's from ${program.name}. Look it up on ${program.page.url} by typing the address yourself, not from a link or phone number in the letter (${cite}).`, `On file: ${program.stated}`, `Never pay a fee or give a password to get it.`].join("\n") };
    }

    function answer(message, ctx) {
      const c = ctx || {};
      const k = kind(message, c);
      if (k === "state_letter") return stateLetter(message, c);
      if (k === "failed_bank") return failedBank(message, c);
      return { kind: null, text: null };
    }

    return { kind, answer, failedBank, stateLetter, validate, CANT };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Unclaimed;
