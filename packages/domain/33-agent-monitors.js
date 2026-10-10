  /* ================= Agent monitors: the proactive loop (SPEC.md "The proactive loop") =================
     PURE and deterministic. Code finds things; the model never does. Each
     monitor reads the user's own rows and returns findings. A finding always
     carries the rows that prove it, so every number on a card traces back to
     transactions the user can open.

     Runs nightly in the agent-nightly edge function and on app open, from the
     same file. "today" is always passed in.

     Input transactions: { id, posted_at: "YYYY-MM-DD", amount (negative =
     money out), merchant_raw, is_pending, is_transfer, account_id }.

     A finding: {
       key            stable id, so the same finding is never raised twice
       kind           which monitor raised it
       capabilityId   what the agent would do about it
       title, detail  plain words
       counterparty, amount, dueOn
       evidence       { rule, rows: [{ id, date, amount, merchant }], computed }
     } */
  const AgentMonitors = (() => {
    const DAY = 86400000;
    const toUtc = ymd => {
      const p = String(ymd || "").slice(0, 10).split("-").map(Number);
      return (p.length === 3 && p.every(n => isFinite(n)) && p[1] >= 1 && p[1] <= 12 && p[2] >= 1 && p[2] <= 31)
        ? Date.UTC(p[0], p[1] - 1, p[2]) : null;
    };
    const toYmd = ms => new Date(ms).toISOString().slice(0, 10);
    const addDays = (ymd, n) => { const t = toUtc(ymd); return t === null ? null : toYmd(t + n * DAY); };
    const daysBetween = (a, b) => { const x = toUtc(a), y = toUtc(b); return (x === null || y === null) ? null : Math.round((y - x) / DAY); };
    // Month stepping with day clamping: Jan 31 + 1 month is Feb 28/29.
    function addMonths(ymd, n) {
      const p = String(ymd).slice(0, 10).split("-").map(Number);
      const first = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
      const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      return toYmd(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(p[2], dim)));
    }
    const cents = v => Math.round(v * 100) / 100;
    const usd = v => "$" + Math.abs(Number(v)).toFixed(2);
    const median = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

    function merchantKey(raw) {
      let s = String(raw || "").toLowerCase();
      s = s.replace(/^(sq \*|paypal \*|tst\*|amzn\*|amazon\*|pp\*|sp \*)\s*/i, "");
      s = s.replace(/\s+#?\d{3,}.*$/, ""); // trailing store numbers and references
      return s.replace(/[^a-z0-9]+/g, " ").trim();
    }
    const TRANSFER_RE = /transfer|credit[\s-]?card[\s-]?(payment|autopay)|card[\s-]?autopay|\bautopay\b|\bzelle\b|\bach (credit|debit) transfer\b/i;
    const FEE_RE = /(overdraft|insufficient fund|nsf fee|late fee|late payment fee|maintenance fee|monthly service fee|service charge|atm fee|foreign transaction fee|returned item|nonsufficient)/i;
    // Things that repeat but are not subscriptions.
    const NOT_A_SUBSCRIPTION_RE = /\b(coffee|cafe|café|espresso|restaurant|pizzeria|pizza|burger|taco|burrito|bakery|diner|chipotle|starbucks|dunkin|mcdonald|wendy|chick[\s-]?fil|subway|panera|shell|chevron|exxon|uber|lyft|parking|payroll|salary)\b/i;
    const PAYROLL_RE = /payroll|salary|wages|direct\s*dep|\bdir dep\b|paycheck/i;

    // Normalises raw rows: numeric amounts, posted and dated only.
    function clean(transactions) {
      return (Array.isArray(transactions) ? transactions : []).map(t => {
        if (!t) return null;
        const amount = Number(t.amount), date = String(t.posted_at || "").slice(0, 10);
        if (!isFinite(amount) || toUtc(date) === null) return null;
        const merchant = String(t.merchant_raw || "").trim() || "Unknown";
        return {
          id: String(t.id != null ? t.id : (t.provider_id != null ? t.provider_id : "")),
          date, amount, merchant, key: merchantKey(merchant), accountId: t.account_id || null,
          pending: !!t.is_pending,
          transfer: !!t.is_transfer || TRANSFER_RE.test(merchant),
          excluded: !!t.is_excluded,
        };
      }).filter(Boolean);
    }
    const spend = txs => txs.filter(t => !t.pending && !t.transfer && !t.excluded && t.amount < 0);
    const proof = t => ({ id: t.id, date: t.date, amount: t.amount, merchant: t.merchant });

    /* ---- Recurring charges ----
       Per merchant, charges are clustered by amount (within 5% or $1); a
       cluster is recurring when at least 75% of the gaps between its charges
       fall in the same interval band. */
    const BANDS = [["weekly", 6, 8, 7], ["biweekly", 13, 15, 14], ["monthly", 27, 32, 30],
      ["quarterly", 88, 93, 91], ["yearly", 360, 370, 365]];
    const bandOf = g => { const b = BANDS.find(x => g >= x[1] && g <= x[2]); return b ? b[0] : null; };
    const stepOf = name => BANDS.find(x => x[0] === name)[3];

    function recurring(transactions, today) {
      const byMerchant = {};
      spend(clean(transactions)).forEach(t => { (byMerchant[t.key] = byMerchant[t.key] || []).push(t); });
      const out = [];
      Object.keys(byMerchant).sort().forEach(key => {
        const txs = byMerchant[key];
        if (!key || txs.length < 2 || NOT_A_SUBSCRIPTION_RE.test(txs[0].merchant)) return;
        const clusters = [];
        txs.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
          const amt = Math.abs(t.amount);
          let c = clusters.find(x => Math.abs(x.amount - amt) <= Math.max(x.amount * 0.05, 1));
          if (!c) { c = { amount: amt, txs: [] }; clusters.push(c); }
          c.txs.push(t);
        });
        clusters.forEach(c => {
          if (c.txs.length < 2) return;
          const gaps = [];
          for (let i = 1; i < c.txs.length; i++) gaps.push(daysBetween(c.txs[i - 1].date, c.txs[i].date));
          const bands = gaps.map(bandOf).filter(Boolean);
          if (!bands.length) return;
          const counts = {};
          bands.forEach(b => { counts[b] = (counts[b] || 0) + 1; });
          const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0];
          if (counts[top] / gaps.length < 0.75) return;
          const last = c.txs[c.txs.length - 1];
          const next = top === "monthly" ? addMonths(last.date, 1)
            : top === "quarterly" ? addMonths(last.date, 3)
            : top === "yearly" ? addMonths(last.date, 12)
            : addDays(last.date, stepOf(top));
          const sinceLast = daysBetween(last.date, today);
          out.push({
            key, merchant: last.merchant, amount: cents(Math.abs(last.amount)), interval: top,
            occurrences: c.txs.length,
            confidence: c.txs.length >= 4 ? 0.95 : c.txs.length === 3 ? 0.8 : 0.6,
            firstDate: c.txs[0].date, lastDate: last.date, nextDate: next,
            // Two or more missed intervals: it has probably already ended.
            dormant: sinceLast !== null && sinceLast > 2 * stepOf(top),
            rows: c.txs.map(proof),
          });
        });
      });
      return out;
    }

    const PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
    const yearly = r => cents(r.amount * PER_YEAR[r.interval]);

    // 1. A repeating charge that isn't on the user's tracked list yet.
    function newSubscriptions(input) {
      const known = new Set((input.knownMerchants || []).map(merchantKey));
      return recurring(input.transactions, input.today)
        .filter(r => !r.dormant && !known.has(r.key) && daysBetween(r.firstDate, input.today) <= 120)
        .map(r => ({
          key: `new_subscription:${r.key}:${r.firstDate}`,
          kind: "new_subscription", capabilityId: "subscriptions.cancel",
          title: `New repeating charge: ${r.merchant}`,
          detail: `${usd(r.amount)} ${r.interval}, ${r.occurrences} charges since ${r.firstDate}. Next one is expected ${r.nextDate}. Over 12 months that is ${usd(yearly(r))} (a projection, not a saving).`,
          counterparty: r.merchant, amount: r.amount, dueOn: r.nextDate,
          evidence: { rule: "Same merchant, same amount within 5%, evenly spaced charges.",
            rows: r.rows, computed: { interval: r.interval, occurrences: r.occurrences, next_expected: r.nextDate, twelve_month_projection: yearly(r) } },
        }));
    }

    // 2. A repeating charge whose latest amount is above what it used to be.
    function priceRises(input) {
      const byMerchant = {};
      spend(clean(input.transactions)).forEach(t => { (byMerchant[t.key] = byMerchant[t.key] || []).push(t); });
      const out = [];
      Object.keys(byMerchant).sort().forEach(key => {
        const txs = byMerchant[key].slice().sort((a, b) => a.date.localeCompare(b.date));
        if (!key || txs.length < 4 || NOT_A_SUBSCRIPTION_RE.test(txs[0].merchant)) return;
        const gaps = [];
        for (let i = 1; i < txs.length; i++) gaps.push(daysBetween(txs[i - 1].date, txs[i].date));
        const band = bandOf(median(gaps));
        if (!band || gaps.filter(g => bandOf(g) === band).length / gaps.length < 0.75) return;
        const last = txs[txs.length - 1], before = txs.slice(-4, -1);
        const was = median(before.map(t => Math.abs(t.amount))), now = Math.abs(last.amount);
        // The earlier price has to have been steady, or "rise" means nothing.
        if (before.some(t => Math.abs(Math.abs(t.amount) - was) > Math.max(was * 0.02, 0.25))) return;
        const up = cents(now - was);
        if (up < 0.5 || now <= was * 1.05) return;
        if (daysBetween(last.date, input.today) > 45) return;
        out.push({
          key: `price_rise:${key}:${last.date}`,
          kind: "price_rise", capabilityId: "subscriptions.price_rise_alert",
          title: `${last.merchant} went up ${usd(up)}`,
          detail: `${usd(was)} before, ${usd(now)} on ${last.date}. At ${band} billing that is ${usd(up * PER_YEAR[band])} more over 12 months (a projection).`,
          counterparty: last.merchant, amount: up, dueOn: null,
          evidence: { rule: "Latest charge is more than 5% and $0.50 above a steady earlier price.",
            rows: before.concat([last]).map(proof),
            computed: { previous_price: cents(was), new_price: cents(now), increase: up, interval: band } },
        });
      });
      return out;
    }

    // 3. A free trial about to become a paid charge.
    function trialsConverting(input) {
      const out = [];
      (input.subscriptions || []).forEach(s => {
        if (!s || s.status === "cancelled" || s.billing_interval !== "trial" || !s.next_billing_date) return;
        const days = daysBetween(input.today, s.next_billing_date);
        if (days === null || days < 0 || days > 7) return;
        const amount = Number(s.amount);
        out.push({
          key: `trial_converting:${s.id}:${String(s.next_billing_date).slice(0, 10)}`,
          kind: "trial_converting", capabilityId: "subscriptions.trial_guard",
          title: `${s.merchant} trial ends ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days"}`,
          detail: `The first charge${isFinite(amount) && amount > 0 ? " of " + usd(amount) : ""} lands ${String(s.next_billing_date).slice(0, 10)} unless it is cancelled first.`,
          counterparty: s.merchant, amount: isFinite(amount) && amount > 0 ? amount : null,
          dueOn: String(s.next_billing_date).slice(0, 10),
          evidence: { rule: "A trial you track, ending within 7 days.", rows: [],
            computed: { subscription_id: s.id, trial_ends: String(s.next_billing_date).slice(0, 10), days_left: days } },
        });
      });
      return out;
    }

    /* 4. The same merchant charging the same amount twice on the same day,
          where no refund has already come back. The dispute window is 60 days
          from the statement; the agent works to day 45 from the charge. */
    function duplicateCharges(input) {
      const txs = clean(input.transactions).filter(t => !t.pending && !t.transfer && !t.excluded);
      const groups = {};
      txs.filter(t => t.amount < 0).forEach(t => {
        const k = `${t.key}|${Math.abs(t.amount).toFixed(2)}|${t.date}|${t.accountId || ""}`;
        (groups[k] = groups[k] || []).push(t);
      });
      const out = [];
      Object.keys(groups).sort().forEach(k => {
        const g = groups[k];
        if (g.length < 2 || !g[0].key) return;
        const each = Math.abs(g[0].amount);
        // Tiny repeat charges (parking meters, vending, transit taps) are
        // usually real. They are left for the user's own review screen.
        if (each < 1) return;
        const refunds = txs.filter(t => t.amount > 0 && t.key.replace(/\b(refund|credit|reversal|return)\b/g, "").trim() === g[0].key
          && Math.abs(t.amount - each) < 0.01 && t.date >= g[0].date).length;
        const extra = g.length - 1 - refunds;
        if (extra < 1) return;
        const age = daysBetween(g[0].date, input.today);
        if (age === null || age > 60) return;
        out.push({
          key: `duplicate_charge:${g[0].key}:${g[0].date}:${each.toFixed(2)}`,
          kind: "duplicate_charge", capabilityId: "recovery.duplicate_charge_dispute",
          title: `${g[0].merchant} charged you ${g.length} times on ${g[0].date}`,
          detail: `${g.length} charges of ${usd(each)} on the same day${refunds ? `, ${refunds} already refunded` : ""}. If ${extra === 1 ? "one is" : extra + " are"} a mistake, that is ${usd(each * extra)} to get back. Dispute by ${addDays(g[0].date, 45)}.`,
          counterparty: g[0].merchant, amount: cents(each * extra), dueOn: addDays(g[0].date, 45),
          evidence: { rule: "Same merchant, same amount, same day, same account, not already refunded.",
            rows: g.map(proof), computed: { charges: g.length, refunds_seen: refunds, disputed_amount: cents(each * extra), dispute_by: addDays(g[0].date, 45), window_closes: addDays(g[0].date, 60) } },
        });
      });
      return out;
    }

    /* 5. Low balance ahead: walks the balance forward through the repeating
          charges due before the next payday (or 14 days) and reports the first
          day it drops under the buffer. Income that has not landed is never
          assumed. */
    function lowBalanceAhead(input) {
      const balance = Number(input.balance);
      if (!isFinite(balance) || input.balance === null || input.balance === undefined) return [];
      const buffer = isFinite(Number(input.buffer)) ? Number(input.buffer) : 100;
      const pays = clean(input.transactions).filter(t => !t.pending && t.amount > 0 && PAYROLL_RE.test(t.merchant))
        .map(t => t.date).sort();
      let horizon = addDays(input.today, 14), nextPay = null;
      if (pays.length >= 2) {
        const gaps = [];
        for (let i = 1; i < pays.length; i++) gaps.push(daysBetween(pays[i - 1], pays[i]));
        const step = Math.round(median(gaps));
        if (step >= 6 && step <= 32) {
          nextPay = addDays(pays[pays.length - 1], step);
          while (nextPay <= input.today) nextPay = addDays(nextPay, step);
          if (nextPay < horizon) horizon = nextPay;
        }
      }
      const due = [];
      recurring(input.transactions, input.today).filter(r => !r.dormant).forEach(r => {
        let d = r.nextDate, guard = 0;
        while (d && d <= input.today && guard++ < 60) {
          d = r.interval === "monthly" ? addMonths(d, 1) : r.interval === "quarterly" ? addMonths(d, 3)
            : r.interval === "yearly" ? addMonths(d, 12) : addDays(d, stepOf(r.interval));
        }
        if (d && d > input.today && d <= horizon) due.push({ date: d, amount: r.amount, merchant: r.merchant, basedOn: r.rows.length });
      });
      due.sort((a, b) => a.date.localeCompare(b.date) || a.merchant.localeCompare(b.merchant));
      let running = balance, low = null;
      const walked = due.map(c => { running = cents(running - c.amount); const row = Object.assign({ balance_after: running }, c); if (low === null && running < buffer) low = row; return row; });
      if (!low) return [];
      return [{
        key: `low_balance:${low.date}`,
        kind: "low_balance", capabilityId: "banking.low_balance_forecast",
        title: `Balance drops to ${low.balance_after < 0 ? "-" : ""}${usd(low.balance_after)} on ${low.date}`,
        detail: `You have ${usd(balance)} now. ${walked.length} repeating charge${walked.length === 1 ? "" : "s"} totalling ${usd(walked.reduce((s, c) => s + c.amount, 0))} ${walked.length === 1 ? "is" : "are"} due by ${horizon}${nextPay ? " (your next expected payday)" : ""}. After ${low.merchant} on ${low.date} you would be under your ${usd(buffer)} buffer.`,
        counterparty: null, amount: cents(buffer - low.balance_after), dueOn: low.date,
        evidence: { rule: "Current balance minus repeating charges due before the next payday. No income is assumed.",
          rows: [], computed: { balance_now: cents(balance), buffer, horizon, next_payday: nextPay, upcoming: walked } },
      }];
    }

    // 6. A bank fee the bank may reverse if asked.
    function bankFees(input) {
      return spend(clean(input.transactions))
        .filter(t => FEE_RE.test(t.merchant) && daysBetween(t.date, input.today) <= 60)
        .map(t => ({
          key: `bank_fee:${t.id || t.date + ":" + t.amount}`,
          kind: "bank_fee", capabilityId: "recovery.bank_fee_reversal",
          title: `${usd(t.amount)} bank fee on ${t.date}`,
          detail: `"${t.merchant}". Banks often reverse a fee when asked. Upmore can write the request.`,
          counterparty: null, amount: cents(Math.abs(t.amount)), dueOn: null,
          evidence: { rule: "A posted charge whose description names a bank fee.", rows: [proof(t)], computed: {} },
        }));
    }

    /* 7. A charge from a merchant after the user cancelled it. This is what
          turns a "cancelled" claim back into an open problem. */
    function chargedAfterCancel(input) {
      const charges = spend(clean(input.transactions));
      const out = [];
      (input.cancelClaims || []).forEach(c => {
        if (!c || !c.merchant) return;
        const since = String(c.created_at || "").slice(0, 10);
        const k = merchantKey(c.merchant);
        const hits = charges.filter(t => (t.key === k || t.key.startsWith(k + " ") || k.startsWith(t.key + " ")) && t.date > since);
        if (!hits.length) return;
        const total = cents(hits.reduce((s, t) => s + Math.abs(t.amount), 0));
        out.push({
          key: `charged_after_cancel:${c.id || k}:${hits[0].date}`,
          kind: "charged_after_cancel", capabilityId: "recovery.services_not_delivered",
          title: `${c.merchant} charged you after you cancelled`,
          detail: `Cancelled ${since}. ${hits.length} charge${hits.length === 1 ? "" : "s"} since, totalling ${usd(total)}. Dispute by ${addDays(hits[0].date, 45)}.`,
          counterparty: c.merchant, amount: total, dueOn: addDays(hits[0].date, 45),
          evidence: { rule: "A posted charge from the merchant dated after the cancellation.",
            rows: hits.map(proof), computed: { cancelled_on: since, claim_id: c.id || null, dispute_by: addDays(hits[0].date, 45) } },
        });
      });
      return out;
    }

    // 8. Deadlines the user is tracking that fall inside the next 14 days.
    function deadlineWindows(input) {
      return (input.deadlines || []).map(d => {
        if (!d || !d.date) return null;
        const days = daysBetween(input.today, d.date);
        if (days === null || days < 0 || days > 14) return null;
        const amount = Number(d.amount);
        return {
          key: `deadline:${d.source || "deadline"}:${d.id}:${String(d.date).slice(0, 10)}`,
          kind: "deadline", capabilityId: "bills.bill_calendar",
          title: `${d.name} is due ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days"}`,
          detail: `${String(d.date).slice(0, 10)}${isFinite(amount) && amount > 0 ? ". " + usd(amount) + " at stake" : ""}${d.notes ? ". " + d.notes : ""}.`,
          counterparty: d.merchant || null, amount: isFinite(amount) && amount > 0 ? amount : null,
          dueOn: String(d.date).slice(0, 10),
          evidence: { rule: "A deadline you entered, within 14 days.", rows: [], computed: { deadline_id: d.id, days_left: days } },
        };
      }).filter(Boolean);
    }

    const STATE_NAMES = Object.freeze({ AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
      CT: "Connecticut", DE: "Delaware", DC: "Washington, DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
      IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
      MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
      NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
      OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
      TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" });

    /* 9. Unclaimed property: every state the user has lived in, searched on
          signup and again every quarter. Searching is free and always will be. */
    function unclaimedSearchDue(input) {
      const states = Array.from(new Set((input.statesLived || []).map(s => String(s || "").toUpperCase()).filter(s => STATE_NAMES[s]))).sort();
      const last = input.lastSearched || {};
      return states.map(st => {
        const when = last[st] ? String(last[st]).slice(0, 10) : null;
        const due = when ? addMonths(when, 3) : input.today;
        if (due === null || due > input.today) return null;
        return {
          key: `unclaimed_search:${st}:${when ? due : "first"}`,
          kind: "unclaimed_search", capabilityId: "recovery.unclaimed_property_search",
          title: when ? `Time to search ${STATE_NAMES[st]} for unclaimed money again` : `Search ${STATE_NAMES[st]} for unclaimed money`,
          detail: when
            ? `Last searched ${when}. States take in new unclaimed money all year, so Upmore checks each quarter. Searching and claiming are free.`
            : `You lived in ${STATE_NAMES[st]}, and it hasn't been searched yet. Searching and claiming are free.`,
          counterparty: st, amount: null, dueOn: due,
          evidence: { rule: "Each state you lived in, searched on signup and every 3 months after.", rows: [],
            computed: { state: st, last_searched: when, due } },
        };
      }).filter(Boolean);
    }

    /* 10. Overlap: paying for several services that do the same job. Only
           well-known services are named; nothing is inferred about use. */
    const SAME_JOB = Object.freeze({
      "Video streaming": ["netflix", "hulu", "disney", "max", "hbo", "paramount", "peacock", "apple tv", "discovery", "starz", "showtime", "youtube tv", "sling", "fubo"],
      "Music streaming": ["spotify", "apple music", "tidal", "pandora", "youtube music", "amazon music", "deezer"],
      "Cloud storage": ["dropbox", "icloud", "google one", "onedrive", "box"],
      "Meal kits": ["hellofresh", "blue apron", "home chef", "factor", "everyplate"],
    });
    function overlaps(input) {
      const rec = recurring(input.transactions, input.today).filter(r => !r.dormant);
      const out = [];
      Object.keys(SAME_JOB).forEach(job => {
        const hits = [];
        rec.forEach(r => {
          const name = SAME_JOB[job].find(n => (" " + r.key + " ").includes(" " + n + " "));
          if (name && !hits.some(h => h.name === name)) hits.push({ name, r });
        });
        if (hits.length < 3) return;
        hits.sort((a, b) => a.name.localeCompare(b.name));
        const monthly = cents(hits.reduce((s, h) => s + h.r.amount * PER_YEAR[h.r.interval] / 12, 0));
        out.push({
          key: `overlap:${job}:${hits.map(h => h.name).join("+")}`,
          kind: "overlap", capabilityId: "subscriptions.overlap_finder",
          title: `${hits.length} ${job.toLowerCase()} services at once`,
          detail: `${hits.map(h => `${h.r.merchant} ${usd(h.r.amount)}`).join(", ")}. Together about ${usd(monthly)} a month. Whether you use them all is yours to say.`,
          counterparty: null, amount: monthly, dueOn: null,
          evidence: { rule: "Three or more active repeating charges from services of the same kind.",
            rows: hits.map(h => h.r.rows[h.r.rows.length - 1]), computed: { kind: job, services: hits.map(h => h.r.merchant), monthly_total: monthly } },
        });
      });
      return out;
    }

    /* 11. A balance above the deposit insurance limit. FDIC and NCUA insure
           $250,000 per depositor, per institution, per ownership category.
           Only one account at a time is known here, so this flags a single
           account over the limit and says what it cannot see. */
    const DEPOSIT_INSURANCE_LIMIT = 250000;
    function overInsuranceLimit(input) {
      return (Array.isArray(input.accounts) ? input.accounts : []).map(a => {
        const bal = Number(a && a.balance);
        if (!a || !isFinite(bal) || bal <= DEPOSIT_INSURANCE_LIMIT) return null;
        if (/invest|brokerage|ira|401|retire|credit|loan|mortgage/i.test(String(a.name || "") + " " + String(a.type || ""))) return null;
        const over = cents(bal - DEPOSIT_INSURANCE_LIMIT);
        return {
          key: `over_insurance_limit:${a.id}`,
          kind: "over_insurance_limit", capabilityId: "banking.deposit_insurance_check",
          title: `${a.name || "An account"} is over the deposit insurance limit`,
          detail: `${usd(bal)} in one account. Deposit insurance covers ${usd(DEPOSIT_INSURANCE_LIMIT)} per person, per bank, per ownership type, so ${usd(over)} may be uninsured. Joint accounts and other accounts at the same bank change the math; Upmore can only see this one.`,
          counterparty: null, amount: over, dueOn: null,
          evidence: { rule: "An account balance above $250,000.", rows: [],
            computed: { account: a.name || a.id, balance: cents(bal), limit: DEPOSIT_INSURANCE_LIMIT, over } },
        };
      }).filter(Boolean);
    }

    /* 12. Buy now, pay later: every plan in progress and when its next
           instalment is expected, from the payments already made. */
    const BNPL_RE = /\b(affirm|klarna|afterpay|sezzle|zip ?pay|quadpay|paypal pay in 4|pay in 4|shop ?pay installments?)\b/i;
    function payLaterPlans(input) {
      const byPlan = {};
      spend(clean(input.transactions)).filter(t => BNPL_RE.test(t.merchant)).forEach(t => {
        const k = `${t.key}|${Math.abs(t.amount).toFixed(2)}`;
        (byPlan[k] = byPlan[k] || []).push(t);
      });
      const plans = Object.keys(byPlan).sort().map(k => {
        const txs = byPlan[k].sort((a, b) => a.date.localeCompare(b.date));
        if (txs.length < 2) return null;
        const gaps = [];
        for (let i = 1; i < txs.length; i++) gaps.push(daysBetween(txs[i - 1].date, txs[i].date));
        const step = Math.round(median(gaps));
        if (step < 6 || step > 32) return null;
        const last = txs[txs.length - 1];
        const next = step >= 27 ? addMonths(last.date, 1) : addDays(last.date, step);
        // Most plans are four payments. Past four, or once the next date is
        // well behind us, the plan has most likely finished.
        if (daysBetween(next, input.today) > step) return null;
        return { merchant: last.merchant, amount: cents(Math.abs(last.amount)), paid: txs.length, every_days: step, next, rows: txs.map(proof) };
      }).filter(Boolean);
      if (!plans.length) return [];
      plans.sort((a, b) => a.next.localeCompare(b.next));
      const total = cents(plans.reduce((s, p) => s + p.amount, 0));
      return [{
        key: `pay_later:${plans.map(p => AgentMonitors_key(p.merchant) + p.amount.toFixed(2)).join("+")}:${plans[0].next}`,
        kind: "pay_later", capabilityId: "debt.buy_now_pay_later_tracker",
        title: `${plans.length} pay-later plan${plans.length === 1 ? "" : "s"} in progress`,
        detail: `${plans.map(p => `${p.merchant} ${usd(p.amount)}, next expected ${p.next}`).join("; ")}. Next instalments total ${usd(total)}. How many payments are left isn't in your bank data.`,
        counterparty: null, amount: total, dueOn: plans[0].next,
        evidence: { rule: "Evenly spaced equal payments to a pay-later provider.",
          rows: plans.reduce((all, p) => all.concat(p.rows), []),
          computed: { plans: plans.map(p => ({ merchant: p.merchant, amount: p.amount, payments_seen: p.paid, every_days: p.every_days, next_expected: p.next })) } },
      }];
    }
    const AgentMonitors_key = raw => merchantKey(raw).replace(/\s+/g, "_");

    /* ---- Cash flow forecast: the balance walked forward, day by day ----
       Not a finding: a view. Starts from the real balance and applies only
       what has a record behind it: repeating charges at their usual amount
       and paychecks at their usual amount and rhythm. Everyday spending is
       NOT included, and the result says so, because any figure for it would
       be a guess.
       returns null when there is no balance, else
       { from, to, start, end, low: { date, balance }, events, assumptions } */
    function cashFlowForecast(input, days) {
      const start = Number(input.balance);
      if (input.balance === null || input.balance === undefined || !isFinite(start) || toUtc(input.today) === null) return null;
      const horizon = addDays(input.today, Math.max(1, Math.min(365, days || 90)));
      const events = [];
      const stepDate = (d, r) => r.interval === "monthly" ? addMonths(d, 1) : r.interval === "quarterly" ? addMonths(d, 3)
        : r.interval === "yearly" ? addMonths(d, 12) : addDays(d, stepOf(r.interval));
      const rec = recurring(input.transactions, input.today).filter(r => !r.dormant);
      rec.forEach(r => {
        let d = r.nextDate, guard = 0;
        while (d && d <= input.today && guard++ < 400) d = stepDate(d, r);
        while (d && d <= horizon && guard++ < 400) {
          events.push({ date: d, amount: -r.amount, what: r.merchant, basis: `${r.occurrences} past charges, ${r.interval}` });
          d = stepDate(d, r);
        }
      });
      const pays = clean(input.transactions).filter(t => !t.pending && t.amount > 0 && PAYROLL_RE.test(t.merchant))
        .sort((a, b) => a.date.localeCompare(b.date));
      let payNote = "No regular paycheck was found, so no income is included.";
      if (pays.length >= 3) {
        const gaps = [];
        for (let i = 1; i < pays.length; i++) gaps.push(daysBetween(pays[i - 1].date, pays[i].date));
        const step = Math.round(median(gaps));
        const usual = median(pays.slice(-3).map(p => p.amount));
        const steady = pays.slice(-3).every(p => Math.abs(p.amount - usual) <= usual * 0.1);
        if (step >= 6 && step <= 32 && steady) {
          let d = addDays(pays[pays.length - 1].date, step), guard = 0;
          while (d <= input.today && guard++ < 400) d = addDays(d, step);
          while (d <= horizon && guard++ < 400) {
            events.push({ date: d, amount: cents(usual), what: pays[pays.length - 1].merchant, basis: `${pays.length} past paychecks, every ${step} days` });
            d = addDays(d, step);
          }
          payNote = `Paychecks of ${usd(usual)} every ${step} days, as your last ${pays.length} show.`;
        } else {
          payNote = "Your paychecks vary too much to project, so no income is included.";
        }
      }
      events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount || a.what.localeCompare(b.what));
      let bal = cents(start), low = { date: input.today, balance: bal };
      events.forEach(e => { bal = cents(bal + e.amount); e.balance_after = bal; if (bal < low.balance) low = { date: e.date, balance: bal }; });
      return {
        from: input.today, to: horizon, start: cents(start), end: bal, low, events,
        assumptions: [
          `${rec.length} repeating charge${rec.length === 1 ? "" : "s"} at ${rec.length === 1 ? "its" : "their"} usual amount.`,
          payNote,
          "Everyday spending like groceries and gas is not included. This is what is already committed, not a prediction.",
        ],
      };
    }

    /* ---- Did a cancellation hold? ----
       A cancellation is only real when the next bill date passes with no
       charge. This gives the verdict for one claim:
         charged    the merchant charged after the cancellation
         watching   too early to say, or the bank data doesn't reach far enough
         confirmed  the bill date plus two days passed with no charge
         unknown    there is no bill date to check against
       dataThrough is the last calendar day the transactions are known to
       cover. Without it nothing is ever confirmed. */
    const STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12, annual: 12 };
    const STEP_DAYS = { weekly: 7, biweekly: 14 };
    function cancelClaimVerdict(claim, transactions, today, dataThrough) {
      const c = claim || {};
      const since = String(c.created_at || "").slice(0, 10);
      if (!c.merchant || toUtc(since) === null || toUtc(today) === null) {
        return { status: "unknown", reason: "The cancellation record is incomplete.", charges: [], expected: null, confirmOn: null };
      }
      const k = merchantKey(c.merchant);
      const charges = spend(clean(transactions))
        .filter(t => (t.key === k || t.key.startsWith(k + " ") || k.startsWith(t.key + " ")) && t.date > since)
        .sort((a, b) => a.date.localeCompare(b.date)).map(proof);
      if (charges.length) {
        return { status: "charged", reason: `${c.merchant} charged ${usd(charges[0].amount)} on ${charges[0].date}, after the cancellation on ${since}.`,
          charges, expected: c.expected_billing_date || null, confirmOn: null };
      }
      let expected = c.expected_billing_date ? String(c.expected_billing_date).slice(0, 10) : null;
      if (expected && toUtc(expected) === null) expected = null;
      // A bill date on or before the cancellation has already happened; the
      // one to watch is the next cycle.
      const interval = String(c.billing_interval || "").toLowerCase();
      let guard = 0;
      while (expected && expected <= since && guard++ < 400) {
        if (STEP_MONTHS[interval]) expected = addMonths(expected, STEP_MONTHS[interval]);
        else if (STEP_DAYS[interval]) expected = addDays(expected, STEP_DAYS[interval]);
        else expected = null;
      }
      if (!expected) {
        return { status: "unknown", reason: "There's no next bill date on record to check against.", charges: [], expected: null, confirmOn: null };
      }
      const grace = addDays(expected, 2), confirmOn = addDays(grace, 1);
      if (today <= grace) {
        return { status: "watching", reason: `Watching for a charge on ${expected}. It can be confirmed on ${confirmOn}.`, charges: [], expected, confirmOn };
      }
      const through = String(dataThrough || "").slice(0, 10);
      if (toUtc(through) === null || through < grace) {
        return { status: "watching", reason: `The bank data doesn't reach ${grace} yet, so it can't be confirmed.`, charges: [], expected, confirmOn };
      }
      return { status: "confirmed", reason: `No charge from ${c.merchant} between ${since} and ${grace}. The bill date ${expected} passed.`, charges: [], expected, confirmOn };
    }

    /* ---- Did the money come back? ----
       A dispute or a refund request that was sent is not money received. This
       looks for the credit itself: the same amount, to the cent, dated on or
       after the day the request was sent, from the same merchant — or, for a
       bank fee, described as a fee refund or reversal.
       request: { merchant, amount, sentOn, isBankFee }
       returns { status: "landed" | "waiting", credit } */
    const FEE_CREDIT_RE = /(fee|overdraft|nsf|service charge).*(refund|revers|credit|waiv|courtesy|adjust)|(refund|revers|credit|waiv|courtesy|adjust).*(fee|overdraft|nsf|service charge)/i;
    const CREDIT_WORDS_RE = /\b(refund|credit|reversal|reversed|return|rebate|adjustment|dispute)\b/g;
    function recoveryVerdict(request, transactions) {
      const r = request || {};
      const amount = Number(r.amount), sent = String(r.sentOn || "").slice(0, 10);
      if (!(amount > 0) || toUtc(sent) === null) return { status: "waiting", credit: null };
      const k = merchantKey(r.merchant);
      const credit = clean(transactions)
        .filter(t => !t.pending && !t.excluded && t.amount > 0 && t.date >= sent && Math.abs(t.amount - amount) < 0.005)
        .filter(t => {
          if (r.isBankFee) return FEE_CREDIT_RE.test(t.merchant);
          if (!k) return false;
          const tk = t.key.replace(CREDIT_WORDS_RE, " ").replace(/\s+/g, " ").trim();
          return tk === k || tk.startsWith(k + " ") || k.startsWith(tk + " ");
        })
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      return credit ? { status: "landed", credit: proof(credit) } : { status: "waiting", credit: null };
    }

    const ALL = Object.freeze([newSubscriptions, priceRises, trialsConverting, duplicateCharges,
      lowBalanceAhead, bankFees, chargedAfterCancel, deadlineWindows, unclaimedSearchDue, overlaps,
      overInsuranceLimit, payLaterPlans]);
    const PRIORITY = Object.freeze({ charged_after_cancel: 1, duplicate_charge: 1, low_balance: 1, trial_converting: 1,
      bank_fee: 2, price_rise: 2, deadline: 2, pay_later: 2, over_insurance_limit: 2,
      new_subscription: 3, overlap: 3, unclaimed_search: 3 });
    // Monitors that read bank transactions. They must never run on sample data.
    const NEEDS_LIVE = Object.freeze(["new_subscription", "price_rise", "duplicate_charge", "low_balance",
      "bank_fee", "charged_after_cancel", "overlap", "over_insurance_limit", "pay_later"]);

    /* Runs every monitor. One monitor failing never stops the others, and its
       failure is reported rather than hidden.
       input: { today, transactions, isLive, balance, buffer, knownMerchants,
                subscriptions, cancelClaims, deadlines, statesLived, lastSearched }
       returns { findings, errors } with findings soonest-deadline first. */
    function runAll(input) {
      const inp = input || {};
      if (toUtc(inp.today) === null) return { findings: [], errors: [{ monitor: "all", message: "today is required" }] };
      const safe = Object.assign({}, inp, { transactions: inp.isLive ? (inp.transactions || []) : [],
        balance: inp.isLive ? inp.balance : null, accounts: inp.isLive ? (inp.accounts || []) : [] });
      const findings = [], errors = [], seen = new Set();
      ALL.forEach(fn => {
        try {
          fn(safe).forEach(f => { if (!seen.has(f.key)) { seen.add(f.key); findings.push(f); } });
        } catch (e) { errors.push({ monitor: fn.name, message: String((e && e.message) || e) }); }
      });
      // Money at risk with a clock on it comes first; tidy-ups come last.
      // Inside a group: soonest date, then largest amount.
      findings.forEach(f => { f.priority = PRIORITY[f.kind] || 3; });
      findings.sort((a, b) => a.priority - b.priority
        || String(a.dueOn || "9999").localeCompare(String(b.dueOn || "9999"))
        || (Number(b.amount) || 0) - (Number(a.amount) || 0) || a.key.localeCompare(b.key));
      return { findings, errors };
    }

    return { merchantKey, clean, recurring, newSubscriptions, priceRises, trialsConverting,
      duplicateCharges, lowBalanceAhead, bankFees, chargedAfterCancel, deadlineWindows,
      unclaimedSearchDue, overlaps, overInsuranceLimit, payLaterPlans, cashFlowForecast,
      cancelClaimVerdict, recoveryVerdict, runAll, NEEDS_LIVE, addDays, addMonths, daysBetween };
  })();
