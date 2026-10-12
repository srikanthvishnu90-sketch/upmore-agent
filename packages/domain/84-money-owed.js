  /* Money owed to the person (overnight duties C2-C4; method cards M2-UNCLAIMED-03, M2-OWED-04, M2-OWED-02,
     M2-UNCLAIMED-04). Upmore finds and drafts; the person sends. Nothing here sends, files, accepts or moves money.
       a. A credit balance on a card (12 CFR 1026.11): a card whose balance is in the person's favor by more than the
          offer book's cfpb.credit_balance.min_cents gets the written refund request and the business-day watch; it is
          resolved when a deposit of exactly that amount posts.
       b. An escrow surplus (12 CFR 1024.17), from the escrow analysis the person pastes: a surplus at or above
          cfpb.escrow.surplus_min_cents is owed within cfpb.escrow.refund_days of the analysis; a cushion above
          cfpb.escrow.cushion_fraction of the yearly escrow bills is flagged; request text and the deposit watch.
       c. A refund notice (PayPal, Venmo, Zelle, a check, an email naming the FTC or a settlement): called real only when
          its sender's domain (or a named administrator's domain) matches a program in packages/offers/refund-programs.json;
          anything else is "I can't confirm this is real; never pay a fee or give a password to claim a refund". Past
          charges inside a program's eligibility window are "you may be in this refund; it arrives by itself", never
          "you are owed".
     Every threshold comes from the offer book (passed in as `book`, an OfferBook.create instance) and is cited with its
     source and checked date, or "may have changed" past its window. Every amount from the person's rows names those rows
     and their as-of date. Pasted text is data: words in it never change a verdict, only the sender, the links, and what
     it asks for do. Pure: rows, text, today, book and programs are passed in. */
  const MoneyOwed = (() => {
    const DAY = 86400000;
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const NEVER = "never pay a fee or give a password to claim a refund";
    const CANT = `I can't confirm this is real; ${NEVER}.`;

    const ymd = s => String(s || "").slice(0, 10);
    const validYmd = s => ISO.test(ymd(s)) && Number.isFinite(Date.parse(ymd(s) + "T00:00:00Z"));
    const dayNum = s => Math.round(Date.parse(ymd(s) + "T00:00:00Z") / DAY);
    const fromDay = n => new Date(n * DAY).toISOString().slice(0, 10);
    const addDays = (s, n) => fromDay(dayNum(s) + n);
    const nice = s => { const [y, m, d] = ymd(s).split("-").map(Number); return `${MONTH_NAMES[m - 1]} ${d}, ${y}`; };
    const money = c => "$" + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
    const cents = s => { const m = String(s).replace(/[$,\s]/g, "").match(/^(\d+)(?:\.(\d{1,2}))?$/); return m ? Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0) : null; };
    // A name as the rows carry it, with any long digit run cut to its last four (identity digits are never repeated).
    const safeName = s => String(s || "").replace(/\d{5,}/g, d => `ending ${d.slice(-4)}`).trim();

    // n business days after a day (weekends skipped; a federal holiday is not known here and is said in the text).
    function addBusinessDays(s, n) {
      let d = dayNum(s), left = n;
      while (left > 0) { d += 1; const w = new Date(d * DAY).getUTCDay(); if (w !== 0 && w !== 6) left -= 1; }
      return fromDay(d);
    }

    // A term from the offer book, with the words to cite it ("per <source>, checked <date>", or "may have changed").
    function rule(book, id, today) {
      if (!book || typeof book.term !== "function") throw new Error("money owed: the offer book is required");
      return book.term(id, today);
    }

    // ---- a. credit balance on a card ----
    const kindOf = a => {
      const k = String((a && a.account_kind) || "unknown").toLowerCase();
      if (k !== "unknown") return k;
      // With no type set, only a name that says card counts ("Rewards Credit Card"); "Credit Union Checking" is not one.
      const n = String((a && a.name) || "");
      return /\b(?:credit card|card)\b/i.test(n) && !/\b(?:checking|savings?|credit union|share|money market|debit)\b/i.test(n) ? "credit" : "unknown";
    };
    const acctName = a => { const n = safeName(a.name || a.account_id || "card"), i = String(a.institution || "").trim(); return i && !n.toLowerCase().includes(i.toLowerCase()) ? `${i} ${n}` : n; };
    const asOf = a => ymd(a.balance_as_of || a.fetched_at);

    function creditRequestText(a, balance, days) {
      return [
        `To ${String(a.institution || "").trim() || "the card issuer"}:`,
        `I am writing to request a refund of the credit balance of ${money(balance)} on my ${acctName(a)} account.`,
        `Under 12 CFR 1026.11(a), please refund it within ${days} business days of receiving this request, by check to my address on file or by deposit to an account I name.`,
        "Name: ____________    Date: ____________",
      ].join("\n");
    }

    // A deposit that pays the balance back: exactly that amount, money in, posted on or after the balance date, on an
    // account other than the card itself. Pending rows do not count.
    function findDeposit(rows, amount, since, notAccount) {
      return (rows || []).filter(r => r && !r.is_pending && validYmd(r.posted_on) && Number(r.amount_cents) === amount &&
        r.account_id !== notAccount && (!since || dayNum(r.posted_on) >= dayNum(since)))
        .sort((x, y) => dayNum(x.posted_on) - dayNum(y.posted_on))[0] || null;
    }

    function creditBalances(input) {
      const { accounts, transactions, book, today } = input || {};
      if (!validYmd(today)) throw new Error("money owed: today must be a date");
      const min = rule(book, "cfpb.credit_balance.min_cents", today), days = rule(book, "cfpb.credit_balance.business_days", today);
      const sentOn = validYmd(input.sent_on) ? ymd(input.sent_on) : today;
      const findings = [], under = [];
      for (const a of accounts || []) {
        if (!a || kindOf(a) !== "credit") continue;
        if (a.currency && String(a.currency).toUpperCase() !== "USD") continue;
        const b = Number(a.balance_cents);
        if (a.balance_cents === null || a.balance_cents === undefined || !Number.isSafeInteger(b) || b <= 0) continue;
        if (!(b > min.value)) { under.push({ account_id: a.account_id, name: acctName(a), balance_cents: b }); continue; }
        const when = asOf(a), deposit = findDeposit(transactions, b, validYmd(when) ? when : null, a.account_id);
        findings.push({
          kind: "credit_balance", account_id: a.account_id, name: acctName(a), closed: a.status === "disconnected",
          balance_cents: b, as_of: validYmd(when) ? when : null, status: deposit ? "resolved" : "owed", deposit,
          request_text: creditRequestText(a, b, days.value),
          watch: { business_days: days.value, from: sentOn, due_by: addBusinessDays(sentOn, days.value), amount_cents: b },
          cite: (min.stale ? min : days.stale ? days : min).cite, stale: min.stale || days.stale,
        });
      }
      return { findings, under, min_cents: min.value };
    }

    function creditText(r) {
      if (!r.findings.length) return null;
      const out = [];
      for (const f of r.findings) {
        const src = `From your linked accounts: ${f.name} balance${f.as_of ? ` as of ${nice(f.as_of)}` : " (no date reported)"}.`;
        if (f.status === "resolved") {
          out.push(`${f.name} showed ${money(f.balance_cents)} in your favor, and a ${money(f.balance_cents)} deposit posted on ${nice(f.deposit.posted_on)} (${safeName(f.deposit.merchant_raw || "deposit")}). That looks like the refund, so this one is done. ${src}`);
          continue;
        }
        out.push([
          `${f.name}${f.closed ? " (no longer connected)" : ""} shows ${money(f.balance_cents)} in your favor. A card issuer must refund a credit balance over ${money(r.min_cents)} within ${f.watch.business_days} business days of a written request (${f.cite}).`,
          "Here's the request to send yourself, through the issuer's secure messages or by mail (I don't send it):",
          f.request_text,
          `If you send it today, the refund is due by ${nice(f.watch.due_by)} (${f.watch.business_days} business days, weekends skipped; a bank holiday adds a day). Ask me after that and I'll look for a ${money(f.balance_cents)} deposit in your linked accounts.`,
          src,
        ].join("\n"));
      }
      return out.join("\n\n");
    }

    // ---- b. escrow surplus ----
    const AMT = String.raw`\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
    // Every distinct amount a label points at; two different numbers for one label is a question, never a pick.
    function amountsFor(text, label) {
      const re = new RegExp(label + String.raw`[^$\d\n]{0,40}` + AMT, "gi"), seen = new Set();
      for (const m of String(text).matchAll(re)) { const c = cents(m[1]); if (c !== null) seen.add(c); }
      return [...seen];
    }
    function parseDate(text) {
      const t = String(text);
      const label = String.raw`(?:analysis|statement|review)\s+date|dated|date of (?:the )?analysis|as of`;
      const iso = t.match(new RegExp(`(?:${label})[^0-9a-z]{0,12}(\\d{4}-\\d{2}-\\d{2})`, "i"));
      if (iso && validYmd(iso[1])) return iso[1];
      const us = t.match(new RegExp(`(?:${label})[^0-9a-z]{0,12}(\\d{1,2})/(\\d{1,2})/(\\d{4})`, "i"));
      if (us) { const s = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`; if (validYmd(s)) return s; }
      const named = t.match(new RegExp(`(?:${label})[^0-9a-z]{0,12}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i"));
      if (named) { const s = `${named[3]}-${String(MONTHS.indexOf(named[1].toLowerCase()) + 1).padStart(2, "0")}-${named[2].padStart(2, "0")}`; if (validYmd(s)) return s; }
      return null;
    }
    // Analyses explain the rule in the same breath ("if the surplus is $50 or more, ..."): a conditional sentence states
    // no amount of the person's own and is left out before reading the numbers.
    const CONDITIONAL = /\b(?:if|unless|whenever|when)\b|\bor (?:more|less|greater)\b|\b(?:greater|less|more) than\b|\bat least\b|\bequal to\b|\bexceeds?\b/i;
    function parseEscrow(text) {
      const t = String(text || "").slice(0, 20000).split(/(?<=[.!?])\s+|\n+/).filter(s => !CONDITIONAL.test(s)).join("\n");
      const one = list => (list.length === 1 ? list[0] : null);
      const surplus = amountsFor(t, String.raw`\bsurplus`), cushion = amountsFor(t, String.raw`\b(?:required |minimum |escrow )?cushion`);
      const yearly = amountsFor(t, String.raw`\b(?:(?:total |anticipated |projected |expected )?(?:yearly|annual|annually|12[- ]month)\s+(?:escrow\s+)?(?:bills|disbursements|payments out|escrow payments out|taxes and insurance))`);
      return {
        surplus_cents: one(surplus), cushion_cents: one(cushion), yearly_cents: one(yearly), analysis_date: parseDate(t),
        no_surplus: /\b(?:no surplus|shortage|deficiency)\b/i.test(t) && !surplus.length,
        conflicts: [surplus.length > 1 && "surplus", cushion.length > 1 && "cushion", yearly.length > 1 && "yearly escrow bills"].filter(Boolean),
      };
    }
    // The book stores one sixth as 0.1667; a value that rounds a unit fraction is read as that exact fraction (1/6), so
    // the cap is yearly / 6 to the cent, never 20 cents high from the rounding.
    const unitOf = v => { const n = Math.round(1 / v); return n > 1 && Math.abs(1 / n - v) < 0.0005 ? n : null; };
    const fractionWords = v => (unitOf(v) ? `1/${unitOf(v)}` : `${(v * 100).toFixed(2)}%`);
    const join = list => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`);

    function escrow(input) {
      const { book, today } = input || {};
      if (!validYmd(today)) throw new Error("money owed: today must be a date");
      const f = input.fields ? Object.assign({ conflicts: [] }, input.fields) : parseEscrow(input.text);
      const minT = rule(book, "cfpb.escrow.surplus_min_cents", today), daysT = rule(book, "cfpb.escrow.refund_days", today), fracT = rule(book, "cfpb.escrow.cushion_fraction", today);
      const r = { kind: "escrow", fields: f, owed: false, cushion_flag: false, status: "unknown", deposit: null, due_by: null, cap_cents: null,
        cite: minT.cite, cite_days: daysT.cite, cite_cushion: fracT.cite, min_cents: minT.value, refund_days: daysT.value, fraction: fracT.value };
      if (f.conflicts && f.conflicts.length) { r.status = "unclear"; return r; }
      if (Number.isSafeInteger(f.yearly_cents) && f.yearly_cents > 0 && Number.isSafeInteger(f.cushion_cents)) {
        const n = unitOf(fracT.value);
        r.cap_cents = n ? Math.floor(f.yearly_cents / n) : Math.round(f.yearly_cents * fracT.value);
        r.cushion_flag = n ? f.cushion_cents * n > f.yearly_cents : f.cushion_cents > r.cap_cents;
      }
      if (Number.isSafeInteger(f.surplus_cents) && f.surplus_cents > 0) {
        r.owed = f.surplus_cents >= minT.value;
        r.status = r.owed ? "owed" : "small";
        if (r.owed && validYmd(f.analysis_date)) {
          r.due_by = addDays(f.analysis_date, daysT.value);
          r.deposit = findDeposit(input.transactions, f.surplus_cents, f.analysis_date, null);
          if (r.deposit) r.status = "resolved";
        }
      } else if (r.cushion_flag) r.status = "cushion";
      else if (f.no_surplus) r.status = "none";
      return r;
    }

    function escrowRequestText(r) {
      const f = r.fields, lines = ["To my mortgage servicer:"];
      lines.push(`I received the escrow account analysis${f.analysis_date ? ` dated ${nice(f.analysis_date)}` : ""}.`);
      if (r.owed) lines.push(`It shows a surplus of ${money(f.surplus_cents)}. Under 12 CFR 1024.17(f)(2), a surplus of ${money(r.min_cents)} or more is refunded within ${r.refund_days} days of the analysis while my payments are current. Please send me the ${money(f.surplus_cents)} refund.`);
      if (r.cushion_flag) lines.push(`It also holds a cushion of ${money(f.cushion_cents)}, more than ${fractionWords(r.fraction)} of the ${money(f.yearly_cents)} in yearly escrow bills (${money(r.cap_cents)}). Under 12 CFR 1024.17(c)(1), please recalculate my escrow payment with a cushion no larger than that.`);
      lines.push("Name: ____________    Loan number (last 4 only): ______    Date: ____________");
      return lines.join("\n");
    }

    function escrowText(r) {
      const f = r.fields;
      const src = `From the escrow analysis you pasted${f.analysis_date ? `, dated ${nice(f.analysis_date)}` : " (I don't see its date)"}.`;
      if (r.status === "unclear") return `Your escrow analysis gives more than one number for the ${r.fields.conflicts.join(" and ")}, so I won't pick one. Paste just the lines with the surplus, the cushion, the yearly escrow bills and the analysis date, and I'll do the math.`;
      if (r.status === "unknown") return `To check an escrow surplus, paste the lines from your servicer's escrow analysis with the surplus, the cushion, the yearly escrow bills and the analysis date. A surplus of ${money(r.min_cents)} or more is refunded within ${r.refund_days} days of the analysis (${r.cite}).`;
      if (r.status === "none") return `Your escrow analysis shows no surplus, so no refund is owed this year. ${src}`;
      const out = [];
      if (r.status === "resolved") return `Your ${money(f.surplus_cents)} escrow surplus looks paid: a ${money(f.surplus_cents)} deposit posted on ${nice(r.deposit.posted_on)} (${safeName(r.deposit.merchant_raw || "deposit")}, from your linked accounts). ${src}`;
      if (r.owed) out.push(`Your servicer owes you the ${money(f.surplus_cents)} escrow surplus: a surplus of ${money(r.min_cents)} or more is refunded within ${r.refund_days} days of the analysis, if your payments are current (${r.cite}).${r.due_by ? ` That's by ${nice(r.due_by)}.` : " The analysis date isn't in what you pasted, so count 30 days from the date on it."}`);
      if (r.status === "small") out.push(`Your surplus is ${money(f.surplus_cents)}, under ${money(r.min_cents)}, so the rule lets the servicer credit it to next year's escrow payments instead of sending a check (${r.cite}).`);
      if (r.cushion_flag) out.push(`Your cushion of ${money(f.cushion_cents)} is above the cap of ${fractionWords(r.fraction)} of yearly escrow bills: ${money(r.cap_cents)} of ${money(f.yearly_cents)} (${r.cite_cushion}). You can ask for a lower monthly payment.`);
      if (r.owed || r.cushion_flag) {
        out.push("Here's the request to send your servicer yourself (I don't send it):");
        out.push(escrowRequestText(r));
        if (r.owed) out.push(r.due_by ? `Ask me after ${nice(r.due_by)} and I'll look for a ${money(f.surplus_cents)} deposit in your linked accounts.` : `Once you know the analysis date, ask me 30 days after it and I'll look for a ${money(f.surplus_cents)} deposit in your linked accounts.`);
      }
      out.push(src);
      return out.join("\n");
    }

    // ---- c. refund programs and notices ----
    function validatePrograms(data) {
      const problems = [], ids = new Set();
      if (!data || !Number.isInteger(data.fresh_days) || data.fresh_days <= 0) problems.push("fresh_days must be a whole number of days");
      for (const p of (data && data.programs) || []) {
        const tag = (p && p.id) || "?";
        if (!p || !/^[a-z0-9][a-z0-9_.-]*$/.test(p.id || "")) problems.push(`${tag}: id must be lowercase words`);
        if (ids.has(p.id)) problems.push(`${tag}: duplicate id`);
        ids.add(p.id);
        if (!p.name) problems.push(`${tag}: no name`);
        if (!p.page || !p.page.title || !/^https:\/\//.test(p.page.url || "")) problems.push(`${tag}: page needs a title and an https link`);
        if (!validYmd(p.checked_on)) problems.push(`${tag}: checked_on must be a date`);
        if (!Array.isArray(p.method_cards) || !p.method_cards.length) problems.push(`${tag}: method_cards must name the cards it comes from`);
        if (!Array.isArray(p.names) || !p.names.length) problems.push(`${tag}: names must list the words that name it`);
        if (!Array.isArray(p.official_domains) || !p.official_domains.length || p.official_domains.some(d => !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(d))) problems.push(`${tag}: official_domains must be bare lowercase domains`);
        if (!Array.isArray(p.administrators) || p.administrators.some(a => !a || !a.name || !Array.isArray(a.domains) || !a.domains.length || a.domains.some(d => !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(d)))) problems.push(`${tag}: administrators must each have a name and bare domains`);
        if (p.expires_after_days !== null && !(Number.isInteger(p.expires_after_days) && p.expires_after_days > 0)) problems.push(`${tag}: expires_after_days must be null or whole days`);
        if (p.eligibility) {
          const e = p.eligibility;
          try { new RegExp(e.merchant_pattern, "i"); } catch { problems.push(`${tag}: eligibility.merchant_pattern does not compile`); }
          if (!validYmd(e.from) || !validYmd(e.to) || dayNum(e.from) > dayNum(e.to)) problems.push(`${tag}: eligibility needs from and to dates in order`);
          if (e.checked_on !== null && !validYmd(e.checked_on)) problems.push(`${tag}: eligibility.checked_on must be null or a date`);
        }
      }
      if (!data || !Array.isArray(data.programs) || !data.programs.length) problems.push("no programs");
      return problems;
    }
    function programCite(data, p, today) {
      const age = dayNum(today) - dayNum(p.checked_on), stale = !(age >= 0 && age <= data.fresh_days);
      return { stale, text: stale ? `per ${p.page.title}, checked ${p.checked_on}; that may have changed, so check ${p.page.url} before acting` : `per ${p.page.title}, checked ${p.checked_on}` };
    }
    const nameRe = n => new RegExp(`(?:^|[^a-z0-9&])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9&])`, "i");

    // A domain as written, or null when it cannot be an exact ASCII domain (punycode or a non-ASCII lookalike).
    function cleanHost(h) {
      const s = String(h || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/:\d+$/, "").replace(/\.$/, "");
      if (!s || /[^a-z0-9.-]/.test(s) || /(?:^|\.)xn--/.test(s)) return null;
      return s;
    }
    const onDomain = (host, d) => host === d || host.endsWith("." + d);

    // Who sent it and where it points. Only "From:" header lines count as senders; in a forwarded message only what
    // follows the last forward marker is the notice (the person who forwarded it is not the sender). What it asks for
    // (a fee, a password) is read from the whole text.
    const FORWARD = /-{2,}\s*(?:forwarded message|original message)\s*-{2,}|begin forwarded message:/i;
    const forwarded = text => { const parts = String(text).split(FORWARD); return parts[parts.length - 1]; };
    function senders(text) {
      const t = forwarded(text), out = [];
      for (const m of t.matchAll(/(?:^|[\s>?!.,;])(?:from|sender|reply-to)\s*:\s*(.+)$/gim)) {
        const addr = m[1].match(/<\s*[^<>@\s]+@([^<>\s]+)\s*>/) || m[1].match(/[^\s<>"'@]+@([^\s<>"',;]+)/);
        out.push(addr ? { raw: m[1].trim(), host: cleanHost(addr[1].replace(/[>.,;]+$/, "")) } : { raw: m[1].trim(), host: null });
      }
      return out;
    }
    // A bare domain counts as a link when it has a path ("ftc-refunds.co/claim") or the text sends the reader to it
    // ("visit ftc-refunds.co"); a company named by its domain in passing ("Amazon.com customers") does not.
    const URLS = /\b(?:https?:\/\/|www\.)([^\s/<>"'()\]]+)/gi;
    const BARE = /(?<![@\w.\/-])((?:[a-z0-9-]+\.)+(?:com|net|org|co|info|io|us|gov|biz|xyz|top|online|site|link|app|me|ly|cc|ru|cn|tk|claims|support))(\/[^\s<>"')]*)?(?![\w-])/gi;
    const SENDS = /\b(?:visit|go to|goto|head to|click|open|log ?in at|sign ?in at|claim (?:it )?(?:at|on)|enter (?:it )?(?:at|on)|accept (?:it )?(?:at|on))\s*:?\s*$/i;
    function links(text) {
      const out = [], s = String(text);
      for (const m of s.matchAll(URLS)) {
        const raw = m[0].toLowerCase().startsWith("www.") ? "www." + m[1] : m[1];
        out.push({ raw, host: cleanHost(raw.replace(/^[^@]*@/, "")) });
      }
      const rest = s.replace(URLS, " ");
      for (const m of rest.matchAll(BARE)) {
        if (m[2] || SENDS.test(rest.slice(Math.max(0, m.index - 24), m.index))) out.push({ raw: m[1], host: cleanHost(m[1]) });
      }
      return out;
    }
    const FEE = /\b(?:processing|release|handling|activation|claim|transfer|admin(?:istrative)?|verification|clearance|unlock(?:ing)?)\s+fees?\b|\bfees?\s+(?:of|to|for)\b[^.\n]{0,40}(?:release|claim|receive|process|unlock)|\b(?:pay|send|wire|deposit|transfer)\b[^.\n]{0,30}\b(?:a\s+)?(?:small\s+)?(?:fee|charge|payment|deposit)\b[^.\n]{0,30}\b(?:to|before|first|release|receive|claim|unlock|process)\b|\bgift\s*cards?\b|\b(?:bitcoin|crypto(?:currency)?|usdt)\b|\bpay\b[^.\n]{0,20}\b(?:tax(?:es)?|shipping)\b[^.\n]{0,20}\b(?:first|before|upfront|up front)\b/i;
    const SECRET = /\bpass(?:word|code)s?\b|\bone[- ]time (?:code|passcode|password)\b|\b(?:verification|security|confirmation|login|log-in|sign-in|2fa|mfa) codes?\b|\bOTP\b|\bPIN\b|\bsocial security\b|\bSSN\b|\brouting number\b|\b(?:full |complete )?(?:bank )?account number\b|\bcard number\b|\bCVV\b|\b(?:log|sign) ?in (?:to|with) your (?:bank|online banking|paypal|venmo|zelle)\b|\bonline banking (?:username|login|credentials)\b|\bcredentials\b/i;
    // What a message asks the reader to do, without the sentences that say what a real refund never asks for ("the FTC
    // never asks for a password"): only a sentence that is itself a "never asks / won't require" statement is dropped,
    // so "don't worry, just pay the fee" still counts.
    function demands(text) {
      return String(text).split(/[.!?;\n]+|\bbut\b/i).filter(s => !(/\b(?:never|will not|won'?t|does not|doesn'?t|do not|don'?t|not)\s+(?:ever\s+)?(?:ask|asks|require|requires|request|requests|need|needs|charge|charges)\b/i.test(s) &&
        !/\b(?:except|only|just|unless|other than|however|although|instead|first|before|until)\b/i.test(s))).join(". ");
    }
    // Every email address in the text (From lines included): each must be on the program's domains.
    function emails(text) {
      return [...String(text).matchAll(/[A-Za-z0-9._%+-]+@([^\s<>"',;()\]]+)/g)].map(m => cleanHost(m[1].replace(/[>.,;:]+$/, "")));
    }
    const NOTICE_DATE = /^[ \t>]*(?:date|sent)\s*:\s*(.+)$/im;
    const EXPIRE = /\b(?:expires?|expiring|accept(?:ed)? (?:it )?(?:by|before)|claim (?:it )?by|void after|must be (?:cashed|deposited|accepted) by)\b[^0-9a-z\n]{0,6}((?:\d{4}-\d{2}-\d{2})|(?:\d{1,2}\/\d{1,2}\/\d{4})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}))/i;
    function readDay(s) {
      const t = String(s || "").trim();
      let m = t.match(/(\d{4})-(\d{2})-(\d{2})/); if (m && validYmd(m[0])) return m[0];
      m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) { const v = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; if (validYmd(v)) return v; }
      m = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
      if (m) { const v = `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`; if (validYmd(v)) return v; }
      return null;
    }

    function checkNotice(text, opts) {
      const { programs: data, today } = opts || {};
      if (!validYmd(today)) throw new Error("money owed: today must be a date");
      const t = String(text || "").slice(0, 20000);
      const named = ((data && data.programs) || []).filter(p => p.names.some(n => nameRe(n).test(t)));
      const program = named.length === 1 ? named[0] : null;
      const from = senders(t), urls = links(forwarded(t));
      const asked = demands(t), asksFee = FEE.test(asked), asksSecret = SECRET.test(asked);
      const contacts = emails(forwarded(t));
      const reasons = [];
      let real = false, matchedBy = null;
      if (named.length > 1) reasons.push("it names more than one refund program, so I can't tell which one it claims to be");
      else if (!program) reasons.push("it doesn't name a refund program I have on file");
      if (asksFee) reasons.push("it asks you to pay something to get your money, which a real refund never does");
      if (asksSecret) reasons.push("it asks for a password, a code or account details, which a real refund never does");
      if (program) {
        const admins = (program.administrators || []).filter(a => nameRe(a.name).test(t));
        const allowed = program.official_domains.concat(...(program.administrators || []).map(a => a.domains));
        const fromOk = from.length > 0 && from.every(s => s.host && allowed.some(d => onDomain(s.host, d)));
        const linksOk = urls.every(u => u.host && allowed.some(d => onDomain(u.host, d)));
        const offContacts = [...new Set(contacts.filter(h => !(h && allowed.some(d => onDomain(h, d))) && !from.some(s => s.host && s.host === h)).map(h => h || "an address I can't read"))];
        if (!from.length) reasons.push(`I can't see who sent it (paste it with its "From:" line); the official sender on file is ${program.official_domains.join(" or ")}`);
        else if (!fromOk) {
          const bad = from.filter(s => !(s.host && allowed.some(d => onDomain(s.host, d)))).map(s => s.host || s.raw);
          reasons.push(`the sender (${[...new Set(bad)].join(", ")}) isn't the official sender on file for ${program.name} (${program.official_domains.join(" or ")})`);
        }
        if (!linksOk) reasons.push(`it links to ${[...new Set(urls.filter(u => !(u.host && allowed.some(d => onDomain(u.host, d)))).map(u => u.host || u.raw))].join(", ")}, which isn't on file for this program`);
        if (offContacts.length) reasons.push(`it gives an address at ${offContacts.join(", ")}, which isn't on file for this program`);
        real = fromOk && linksOk && !offContacts.length && !asksFee && !asksSecret;
        if (real) matchedBy = admins.length && from.some(s => admins.some(a => a.domains.some(d => onDomain(s.host, d)))) ? `administrator ${admins[0].name}` : `sender domain ${from[0].host}`;
      }
      const cite = program ? programCite(data, program, today) : null;
      const sentOn = readDay((forwarded(t).match(NOTICE_DATE) || [])[1]);
      const statedExpiry = real ? readDay((t.match(EXPIRE) || [])[1]) : null;
      const ruleExpiry = program && program.expires_after_days && sentOn ? addDays(sentOn, program.expires_after_days) : null;
      return { kind: "notice", verdict: real ? "REAL" : "CANT_CONFIRM", program: program ? program.id : null, program_name: program ? program.name : null,
        matched_by: matchedBy, reasons, asks_fee: asksFee, asks_secret: asksSecret, senders: from.map(s => s.host), links: urls.map(u => u.host || u.raw),
        expires_on: statedExpiry || ruleExpiry, expiry_from: statedExpiry ? "the notice" : ruleExpiry ? "the program's rule" : null,
        cite: cite ? cite.text : null, stale: cite ? cite.stale : false, text: noticeText(program, real, reasons, cite, matchedBy, statedExpiry || ruleExpiry, sentOn, today) };
    }

    function expiryLine(p, expires, sentOn, today) {
      if (!p) return null;
      if (expires) return dayNum(expires) < dayNum(today) ? `It expired on ${nice(expires)}${sentOn ? ` (sent ${nice(sentOn)})` : ""}; the program's page says what to do about an expired payment.` : `Accept it by ${nice(expires)}${sentOn && p.expires_after_days ? ` (${p.expires_after_days} days after it was sent on ${nice(sentOn)})` : ""}.`;
      if (p.expires_after_days) return `These payments expire ${p.expires_after_days} days after they're sent${p.payments_through ? `, and payments run through ${p.payments_through}` : ""}, so don't sit on it.`;
      return "I don't have an expiry date on file for this program; its page says how long a payment stays open.";
    }

    function noticeText(p, real, reasons, cite, matchedBy, expires, sentOn, today) {
      if (real) {
        return [
          `This matches the official sender on file for ${p.name}: ${matchedBy} (${cite.text}).`,
          expiryLine(p, expires, sentOn, today),
          `Accept or deposit it yourself, in the app or site you open directly, not through a link in the message. Even so, ${NEVER}.`,
        ].filter(Boolean).join("\n");
      }
      const lines = [CANT];
      if (reasons.length) lines.push("Why: " + reasons.join("; ") + ".");
      if (p) {
        lines.push(`Check it yourself on the official page for ${p.name}: ${p.page.url}. On file, it pays by ${join(p.payment_methods)} (${cite.text}).`);
        const e = expiryLine(p, null, null, today);
        if (e && p.expires_after_days) lines.push(`If it is real: ${e.charAt(0).toLowerCase()}${e.slice(1)}`);
      }
      return lines.join("\n");
    }

    // Past charges inside a program's eligibility window: "you may be in this refund; it arrives by itself".
    function programMatches(input) {
      const { transactions, programs: data, today } = input || {};
      if (!validYmd(today)) throw new Error("money owed: today must be a date");
      const rows = (transactions || []).filter(r => r && !r.is_pending && validYmd(r.posted_on) && Number.isSafeInteger(Number(r.amount_cents)));
      const through = rows.map(r => ymd(r.posted_on)).sort().slice(-1)[0] || null;
      const earliest = rows.map(r => ymd(r.posted_on)).sort()[0] || null;
      const out = [];
      for (const p of (data && data.programs) || []) {
        const e = p.eligibility; if (!e) continue;
        const re = new RegExp(e.merchant_pattern, "i");
        const charges = rows.filter(r => Number(r.amount_cents) < 0 && re.test(String(r.merchant_raw || "")));
        if (!charges.length) continue;
        const inside = charges.filter(r => dayNum(r.posted_on) >= dayNum(e.from) && dayNum(r.posted_on) <= dayNum(e.to));
        out.push({ program: p.id, name: p.name, page: p.page, charge: e.charge, inside: inside.length, outside: charges.length - inside.length,
          first: inside.length ? ymd(inside.map(r => r.posted_on).sort()[0]) : null, last: inside.length ? ymd(inside.map(r => r.posted_on).sort().slice(-1)[0]) : null,
          window: { from: e.from, to: e.to, checked: e.checked_on !== null }, earliest, through, cite: programCite(data, p, today), max_cents: p.max_cents, methods: p.payment_methods });
      }
      return out;
    }
    function programText(m) {
      const src = `From your linked accounts, transactions${m.earliest ? ` from ${nice(m.earliest)}` : ""} through ${m.through ? nice(m.through) : "today"}.`;
      const unchecked = m.window.checked ? "" : ` The window dates aren't confirmed on the FTC page yet, so check ${m.page.url} before counting on it.`;
      if (!m.inside) return `You have ${m.charge} in your linked history, but none between ${nice(m.window.from)} and ${nice(m.window.to)}, the window for ${m.name}, and your history here starts ${nice(m.earliest)}, so your rows can't show whether you're in it. Check ${m.page.url}.${unchecked} ${src}`;
      return [
        `You paid ${m.charge} ${m.inside === 1 ? `once, on ${nice(m.first)}` : `${m.inside} times between ${nice(m.first)} and ${nice(m.last)}`}, inside the window for ${m.name} (${nice(m.window.from)} to ${nice(m.window.to)}).`,
        `You may be in this refund${m.max_cents ? ` (up to ${money(m.max_cents)} per eligible customer, ${m.cite.text})` : ` (${m.cite.text})`}; it arrives by itself, by ${join(m.methods)}, so there's nothing to file. Watch for it, and if a notice comes, paste it here and I'll check the sender.${unchecked}`,
        src,
      ].join("\n");
    }

    // ---- what the person is asking ----
    const ESCROW = /\bescrow\b/i;
    const ESCROW_ASK = /\b(?:surplus|cushion|overage|analysis|refund|statement|too much|owe[sd]? me)\b/i;
    const CREDIT = /\b(?:credit balance|negative (?:card |credit card )?balance|(?:card company|card issuer|issuer|credit card company) owes? me|overpaid (?:my |a |the )?(?:credit )?card|balance in my favou?r)\b/i;
    const CLOSED = /\bclosed\b[^.?!\n]{0,40}\bcard\b|\bcard\b[^.?!\n]{0,40}\bclosed\b/i;
    const CLOSED_MONEY = /\b(?:balance|refund|money|owe[sd]?|credit back|leftover|left over)\b/i;
    const OWED = /\b(?:money (?:owed|owing|due) (?:to )?me|(?:who|anyone|anybody|does anyone|is anyone) owes? me(?: money)?|am i owed|owed (?:any )?money|money i'?m owed|refunds? (?:i'?m|am i|i am) owed|any refunds? (?:coming|owed|due|for me|i'?m owed)|(?:refunds?|money) (?:coming|owed|due) to me|ftc refunds?|refunds? (?:watch|check)|am i (?:in|eligible for|part of|getting) (?:any |the |an )?(?:(?:ftc|amazon|prime|at&t|att)\s+){0,3}(?:refund|settlement)s?)\b/i;
    const NOTICE_SUBJECT = /\b(?:ftc|federal trade commission|settlement|class action|refund administrator|claims administrator)\b/i;
    const NOTICE_CARRIER = /\b(?:paypal|venmo|zelle|check|cheque|e-?mail|text|sms|notice|letter|message|payment)\b|\bfrom\s*:|https?:\/\//i;
    const NOTICE_ASK = /\b(?:real|legit(?:imate)?|scam|fake|phishing|genuine|safe|trust|verify|is (?:this|it) (?:from|really)|got|received|getting|sent me|says|said|saying)\b|\bfrom\s*:/i;
    function kind(message) {
      const t = String(message || "");
      if (NOTICE_SUBJECT.test(t) && NOTICE_CARRIER.test(t) && NOTICE_ASK.test(t) && /\b(?:refund|payment|settlement|check|cheque|money)\b/i.test(t)) return "notice";
      if (ESCROW.test(t) && ESCROW_ASK.test(t)) return "escrow";
      if (CREDIT.test(t) || (CLOSED.test(t) && CLOSED_MONEY.test(t))) return "credit_balance";
      if (OWED.test(t)) return "owed";
      return null;
    }

    // Where card balances came from: the newest balance date among the linked accounts.
    function asOfLine(accounts) {
      const days = (accounts || []).map(asOf).filter(validYmd).sort();
      return `From your linked accounts${days.length ? `, balances as of ${nice(days[days.length - 1])}` : " (no balance date reported)"}.`;
    }

    // The whole answer for a chat message; ctx = { today, book, programs, accounts?, transactions? }.
    function answer(message, ctx) {
      const k = kind(message), c = ctx || {};
      if (!k) return { kind: null, text: null };
      if (k === "notice") { const r = checkNotice(message, { programs: c.programs, today: c.today }); return { kind: k, result: r, text: r.text }; }
      if (k === "escrow") { const r = escrow({ text: message, book: c.book, today: c.today, transactions: c.transactions || [] }); return { kind: k, result: r, text: escrowText(r) }; }
      const cb = creditBalances({ accounts: c.accounts || [], transactions: c.transactions || [], book: c.book, today: c.today });
      const parts = [creditText(cb)];
      if (k === "owed") for (const m of programMatches({ transactions: c.transactions || [], programs: c.programs, today: c.today })) parts.push(programText(m));
      const text = parts.filter(Boolean).join("\n\n");
      if (text) return { kind: k, result: cb, text };
      const min = rule(c.book, "cfpb.credit_balance.min_cents", c.today);
      const linked = (c.accounts || []).length;
      const none = !linked
        ? "I don't see a connected card yet, so I can't check for a credit balance. Connect one in the app (Home, then Connect bank) and ask again."
        : `None of your linked cards shows a credit balance over ${money(min.value)} in your favor, so no issuer owes you a refund there (${min.cite}).${cb.under.length ? ` ${cb.under.map(u => `${u.name} has ${money(u.balance_cents)}, at or under that`).join("; ")}.` : ""} ${asOfLine(c.accounts)}`;
      const more = k === "owed" ? " I also check escrow analyses and refund notices: paste one and I'll look." : "";
      return { kind: k, result: cb, text: none + more };
    }

    return { kind, answer, creditBalances, creditText, escrow, escrowText, parseEscrow, checkNotice, programMatches, programText,
      validatePrograms, addBusinessDays, CANT, NEVER };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = MoneyOwed;
