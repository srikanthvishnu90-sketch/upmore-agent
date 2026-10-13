  /* Proactive feed (Instinct spec docs 01, 07, 08, 10, 11): the seam between
     the engines and the operating model. It runs the save engine, the earn
     engine, the news brain and the monitors over the user's data and turns
     their findings into the loop's inputs: safety (fraud patterns), standing
     watches (breaking news on an owned name, deadlines firing today),
     commitments (deadlines coming due), and proactive items (the ranked
     queue, each with the reason the user cares and a real deadline when one
     exists). The loop's decision order and proactivity budget decide what is
     said; nothing here sends. Every message is composed through the voice
     layer, so it is linted before it exists. Also the weekly money minute:
     one digest, skimmable, numbers only, verified and estimated never mixed.
     Loads after AgentMonitors, AgentSave, AgentEarn, AgentNews, AgentVoice. */
  const AgentProactive = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const dayMs = ymd => Date.parse(String(ymd).slice(0, 10) + "T00:00:00Z");
    const have = name => typeof globalThis !== "undefined" && typeof globalThis[name] !== "undefined" ? globalThis[name] : (typeof window !== "undefined" ? window[name] : undefined);
    const mod = name => { try { return eval(name); } catch (e) { return undefined; } };
    // Monitor findings whose date is money lost if missed: these may bypass the proactivity budget (doc 01).
    // A new subscription's next charge is information, not a deadline: it rides the budget like everything else.
    const DEADLINE_KINDS = new Set(["trial_converting", "duplicate_charge", "charged_after_cancel", "deadline", "pay_later"]);
    // C28 missed-payment consequences: a small explicit table by bill kind. The kind is inferred from the bill's
    // merchant words and ledger category; the words are these table entries only, never invented per message.
    const BILL_CATEGORIES = new Set(["utilities", "subscriptions", "insurance", "housing", "debt_payment", "other"]);
    const BILL_KIND_OF = [
      ["credit_card", /credit card|card payment|card autopay|\bvisa\b|\bmastercard\b|\bamex\b|american express|discover card|capital one/i, null],
      ["utility", /electric|power|water|gas co|utility|utilities|comcast|xfinity|verizon|at&t|t-mobile|internet|broadband|mobile/i, "utilities"],
      ["subscription", /netflix|spotify|hulu|disney|apple|google one|microsoft|adobe|prime|peloton|nytimes|planet fit|subscription|membership/i, "subscriptions"],
    ];
    function billKind(merchant, category) {
      const m = String(merchant || "");
      for (const [kind, re] of BILL_KIND_OF) if (re.test(m)) return kind;
      if (category === "debt_payment") return "credit_card";
      for (const [kind, , cat] of BILL_KIND_OF) if (cat && category === cat) return kind;
      return "generic";
    }
    const BILL_CONSEQUENCES = Object.freeze({
      credit_card: "a late fee and a penalty APR apply",
      utility: "a late fee applies, and your service could be cut off",
      subscription: null, // filled with the merchant: what stops is the service itself, named below
      generic: "a late fee applies",
    });
    function billConsequence(kind, merchant) {
      return kind === "subscription" ? `${merchant} stops until you pay` : BILL_CONSEQUENCES[kind] || BILL_CONSEQUENCES.generic;
    }

    function feed(input, opts) {
      const o = opts || {}, now = o.now || dayMs(input.today) + 12 * 3600000, out = { kind: "event", safety: [], commitments: [], watches: [], proactive: [], sources: {} };
      const Save = mod("AgentSave"), Earn = mod("AgentEarn"), News = mod("AgentNews"), Monitors = mod("AgentMonitors"), Voice = mod("AgentVoice");
      const compose = (kind, fields) => { if (!Voice) return { bubbles: [fields.finding ? `${fields.finding} ${fields.offer}` : fields.first_line || fields.text] }; return Voice.compose(kind, fields, {}); };
      // Monitors (Codex): findings with evidence rows; fraud-shaped ones are safety, the rest proactive with their rule as the reason.
      if (Monitors && input.transactions) {
        // The monitors read dollar balances; the feed is given accounts in cents (proactive.ts mapAccounts). Only USD
        // checking and savings can be over the deposit-insurance limit, and each carries its source and as-of so the
        // finding can say where the balance came from. Before this, nothing reached the check (found building PROACTIVE).
        const deposits = list => (list || []).filter(a => a && ["checking", "savings"].includes(a.kind) && (!a.currency || a.currency === "USD") && Number.isSafeInteger(a.balance_cents)).map(a => ({ id: a.id, name: a.name, type: a.kind, balance: a.balance_cents / 100, source: a.source || null, as_of: a.as_of || null }));
        const m = Monitors.runAll({ today: input.today, transactions: input.transactions, isLive: input.isLive !== false, balance: input.balance, buffer: input.buffer, knownMerchants: input.knownMerchants, subscriptions: input.subscriptions, cancelClaims: input.cancelClaims, deadlines: input.deadlines, statesLived: input.statesLived, lastSearched: input.lastSearched, accounts: input.accounts_live || deposits(input.accounts) });
        out.sources.monitors = { findings: m.findings.length, errors: m.errors };
        for (const f of m.findings) {
          if (f.kind === "low_balance" || f.kind === "charged_after_cancel") out.watches.push({ key: f.key, text: f.title + ". " + f.detail, reason: f.kind === "low_balance" ? "you asked me to watch your balance" : "you asked me to confirm this cancellation held", evidence: f.evidence, capability_id: f.capabilityId });
          else out.proactive.push({ key: f.key, text: f.title + ". " + f.detail, reason: f.evidence && f.evidence.rule ? f.evidence.rule : f.kind, deadline: f.dueOn && DEADLINE_KINDS.has(f.kind) ? dayMs(f.dueOn) : null, next_on: f.dueOn || null, amount_cents: f.amount != null ? Math.round(f.amount * 100) : null, evidence: f.evidence, capability_id: f.capabilityId, priority: f.priority || 3 });
        }
      }
      // Save engine: the ranked queue, each with the reason and estimate labeled; verified entries come first by construction.
      if (Save && input.transactions) {
        const r = Save.detect({ today: input.today, transactions: input.transactions, accounts: input.accounts || [], bills: input.bills || [], debts: input.debts || [], extra_payment_cents: input.extra_payment_cents, reference_apy_bps: input.reference_apy_bps });
        const q = Save.rank(r.opportunities, input.savings_ledger || null);
        out.sources.save = { opportunities: r.opportunities.length, estimated_monthly_cents: r.estimated_monthly_cents };
        for (const item of q) { const c = compose("proactive", { finding: item.title + ".", offer: item.action && item.action.type ? offerText(item) : "Want the details?", reason: item.reason }); out.proactive.push({ key: "save:" + item.key, text: c.bubbles.join(" "), reason: item.reason, deadline: item.due_on ? dayMs(item.due_on) : null, amount_cents: item.expected_monthly_cents || item.one_time_cents || 0, verified: !!item.verified, capability_id: item.capability_id, tier: item.tier, evidence: item.evidence, play: item.play }); }
      }
      // Earn engine: deadlines firing today are watches; deadlines ahead are commitments; the queue is proactive with time cost.
      if (Earn) {
        const r = Earn.detect(Object.assign({ today: input.today, transactions: input.transactions || [] }, input.earn || {}, { accounts: input.accounts || [], reference_apy_bps: input.reference_apy_bps }));
        out.sources.earn = { opportunities: r.opportunities.length, deadlines: r.deadlines.length };
        for (const d of r.deadlines) { if (d.status === "missed") continue; const text = `${d.what}: ${d.days_left === 0 ? "today" : d.days_left === 1 ? "tomorrow" : "in " + d.days_left + " days"} (${d.on}).`; if (d.fires_today) out.watches.push({ key: "deadline:" + d.key + ":" + d.on, text, reason: "you asked me to track this deadline", deadline: dayMs(d.on) }); else out.commitments.push({ key: "deadline:" + d.key + ":" + d.on, due_at: dayMs(d.on) - 7 * DAY, text, ask: null, act: false }); }
        for (const item of Earn.rank(r.opportunities, input.earnings_ledger || null)) { if (item.play === "E7_yield" && Save) continue; if (!item.action) continue; const c = compose("proactive", { finding: item.title + ".", offer: offerText(item), reason: item.reason }); out.proactive.push({ key: "earn:" + item.key, text: c.bubbles.join(" "), reason: item.reason, deadline: item.deadlines && item.deadlines.length ? Math.min(...item.deadlines.map(x => dayMs(x.on))) : null, amount_cents: item.expected_cents || 0, time_minutes: item.time_minutes, verified: !!item.verified, capability_id: item.capability_id, tier: item.tier, play: item.play }); }
      }
      // News: owned-name material events are standing watches (the user holds the name); brief items wait for the brief.
      if (News && input.stories && input.stories.length) {
        const r = News.run(input.stories, input.news_user || {}, { now, quiet: input.quiet });
        out.sources.news = { clusters: r.clusters.length, alerts: r.decisions.filter(d => d.decision === "alert").length };
        for (const d of r.decisions.filter(d => d.decision === "alert")) { const a = News.alert(d, input.news_user); if (a.text) out.watches.push({ key: "news:" + d.cluster.id, text: a.text, reason: "you hold this name", urgent: true }); }
        out.brief = News.brief(r);
      }
      // Alerts (doc 02 ALRT): today's detectors and the user's own watches, already quiet-hours filtered and bundled; safety stays safety.
      const Alerts = mod("AgentAlerts"), fromAlerts = new Set();
      if (Alerts && input.transactions) {
        const a = Alerts.run({ today: input.today, transactions: input.transactions, accounts: input.accounts_live || input.accounts, rules: input.rules, buffer_cents: input.buffer_cents, large_threshold_cents: input.large_threshold_cents, events: input.events, renewals: input.renewals, watches: input.watches, quiet: input.quiet }, { now });
        out.sources.alerts = { firings: a.firings, held: a.held.length, quiet: a.quiet };
        for (const s of a.safety) out.safety.push(s);
        for (const w of a.watches) out.watches.push(w);
        for (const p of a.proactive) { fromAlerts.add(p.key); out.proactive.push(Object.assign({ priority: 2 }, p)); }
        out.held = a.held;
      }
      // Big-purchase radar (capability C8): every recurring debit at or over the large-charge line due within 7 days,
      // from the ledger's own recurrence detection (57-agent-ledger.js recurringCalendar — the same calendar the brief
      // and the recap read), listed in ONE finding with each date and amount, days ahead of the charge, so a yearly
      // premium, the rent or a tuition bill never lands as a surprise. The line is the person's own large-charge
      // threshold when they set one (large_threshold_cents, the ALRT-002 line), else $500. A renewal alert (ALRT-005)
      // or a save-engine annual-renewal note for the same charge on the same day is this listing, not a second finding.
      const Ledger = mod("AgentLedger");
      if (Ledger && input.transactions) {
        const threshold = Number.isInteger(input.large_threshold_cents) ? input.large_threshold_cents : 50000;
        const calItems = Ledger.recurringCalendar(input.transactions, input.today, 7).items;
        const items = calItems.filter(i => i.direction === "debit" && i.amount_cents >= threshold && i.on >= input.today);
        if (items.length) {
          const absorbed = p => p.amount_cents != null && p.deadline != null && items.some(i => i.amount_cents === p.amount_cents && p.deadline === dayMs(i.on));
          out.proactive = out.proactive.filter(p => !((/^renewal:/.test(p.key) || /annual_renewal/.test(p.key)) && absorbed(p)));
          out.proactive.push({ key: "upcoming_large:" + items.map(i => `${i.merchant}|${i.on}|${i.amount_cents}`).join("|"),
            text: `Big charges coming up: ${items.map(i => `${i.merchant} ${money(i.amount_cents)} on ${i.on}`).join(", ")}. Each is over the ${money(threshold)} line, so none of them lands as a surprise.`,
            reason: "a large charge is coming", deadline: dayMs(items[0].on), next_on: items[0].on,
            amount_cents: items.reduce((s, i) => s + i.amount_cents, 0), capability_id: "ALRT-005", priority: 4,
            evidence: { rule: "Recurring debits at or over the large-charge line due within 7 days (ledger recurrence).", rows: [], computed: { threshold_cents: threshold, items: items.map(i => ({ merchant: i.merchant, on: i.on, amount_cents: i.amount_cents, cadence: i.cadence })) } } });
          out.sources.radar = { upcoming: items.length, threshold_cents: threshold };
        }
        // Bill due-date reminders (capability C28): EVERY detected recurring bill due exactly 3 days from today —
        // monthly bills under the radar line included — gets one reminder for that cycle, with its amount, its due
        // date and the exact missed-payment consequence for its kind (BILL_DUE below: a small explicit table by
        // kind, inferred from the merchant/category; never worded per message). A bill the radar above is already
        // listing for the same charge (same merchant, date and amount), or one a renewal alert already carries at
        // the same amount and deadline, is NOT reminded again: one charge is never pushed twice. Only a renewal
        // alert suppresses — a status finding that merely names the same charge (a pay-later plan in progress)
        // is not a due-date reminder and never takes this one's place.
        // The reminder is a standing cadence the person asked for ("never let a bill surprise me"), so it carries
        // cadence_requested like the deadlines do; quiet hours in plan() still hold it. Bill categories only:
        // groceries, dining, transport, shopping and the like are spending, not bills.
        const dueIn3 = new Date(dayMs(input.today) + 3 * DAY).toISOString().slice(0, 10);
        const billItems = calItems.filter(i => i.direction === "debit" && i.on === dueIn3 && BILL_CATEGORIES.has(i.category)
          && !items.some(r => r.merchant === i.merchant && r.on === i.on && r.amount_cents === i.amount_cents)
          && !out.proactive.some(p => (/^renewal:/.test(p.key) || /annual_renewal/.test(p.key)) && p.amount_cents === i.amount_cents && p.deadline === dayMs(i.on)));
        for (const i of billItems) {
          const kind = billKind(i.merchant, i.category), consequence = billConsequence(kind, i.merchant);
          out.proactive.push({ key: `bill_due_3d:${i.merchant}|${i.on}|${i.amount_cents}`,
            text: `${i.merchant} ${money(i.amount_cents)} is due in 3 days, on ${i.on}. If it's missed, ${consequence}.`,
            reason: "a bill is due in 3 days", deadline: dayMs(i.on), next_on: i.on, amount_cents: i.amount_cents,
            capability_id: "ALRT-005", priority: 2, cadence_requested: true,
            evidence: { rule: "Every detected recurring bill is reminded 3 days ahead, with the missed-payment consequence for its kind (explicit table by bill kind).", rows: [], computed: { merchant: i.merchant, on: i.on, amount_cents: i.amount_cents, cadence: i.cadence, category: i.category, bill_kind: kind, consequence } } });
        }
        if (billItems.length) out.sources.bill_due = { due_in_3_days: billItems.length, on: dueIn3 };
      }
      // Fraud and scam shapes are safety: they beat everything (doc 01 decision order). The shape is the rule that fired
      // (its reason), never the finding's words: those carry the merchant's descriptor, and a merchant named
      // "UNAUTHORIZED ..." must not turn a new-subscription note into a safety alert that skips quiet hours and the budget.
      for (const s of input.safety || []) out.safety.push(s);
      for (const p of out.proactive) { if (typeof p.reason === "string" && /possible fraud|unauthorized|card-skimming/i.test(p.reason)) { out.safety.push({ text: p.text, key: p.key }); p.suppressed_as_safety = true; } }
      // One charge is one finding: an overdraft fee is a monitor finding, a save-engine refund and (on the day) an alert,
      // and the budget would spend three days saying it. A finding whose charges are all cited by one already kept is
      // dropped. The longest-lived source is kept (the save queue reads every row on file, a monitor 60 days, an alert
      // today only), so the key the person was told under is the one that comes back the next day. A second finding
      // under a key already kept is never said (plan sends a key once), so it claims no charge.
      const rowIds = p => ((p.evidence && p.evidence.rows) || []).map(r => r == null ? "" : typeof r === "object" ? String(r.id != null ? r.id : r.transaction_id != null ? r.transaction_id : "") : String(r)).filter(Boolean);
      const lives = p => /^save:/.test(p.key) ? 0 : fromAlerts.has(p.key) ? 2 : 1;
      const cited = new Set(), kept = new Set();
      out.proactive = out.proactive.map((p, i) => ({ p, i })).sort((a, b) => lives(a.p) - lives(b.p) || a.i - b.i).filter(({ p }) => {
        if (p.suppressed_as_safety || kept.has(p.key)) return false;
        const ids = rowIds(p);
        if (ids.length && ids.every(id => cited.has(id))) return false;
        kept.add(p.key); ids.forEach(id => cited.add(id)); return true;
      }).map(x => x.p);
      out.proactive = out.proactive.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || (a.priority || 3) - (b.priority || 3) || (a.deadline || Infinity) - (b.deadline || Infinity) || (b.amount_cents || 0) - (a.amount_cents || 0) || a.key.localeCompare(b.key));
      out.commitments.sort((a, b) => a.due_at - b.due_at);
      return out;
    }
    function offerText(item) {
      const t = item.action && item.action.type;
      return { cancel_one: "Want me to set up the cancellation? You approve it before anything happens.", cancel_or_downgrade: "Want to cancel, downgrade, or keep it?", stop_fee: "Want the refund request drafted, or the waiver setting changed?", refund_request: "Want the refund request drafted? You send it.", transfer_suggestion: "Want to move it? One confirmation.", negotiation_script: "Want the script and the retention number?", plan: "Want the plan?", enroll_autopay: "Want autopay turned on? One confirmation.", decide_before_renewal: "Keep, cancel, or switch to monthly?", track: "I'll keep tracking it.", chase_payout: "Want me to draft the note to the bank?", raise_contribution: "Want the election change drafted?", enroll_reminder: "Want the enrollment steps?", claim_reminder: "Want the claim steps?", search: "Want me to run the search? It's free.", file_claim: "Want the claim form prepared from your purchases?", file_refund: "Want the refund form prepared?", redeem_before_expiry: "Want the redemption options?", transfer_suggestion_points: "Want the transfer math?", share_link_reviewed: "Want to share your link? You pick who.", cash_out_reminder: "Want the cash-out steps?" }[t] || "Want the details?";
    }
    // Weekly money minute: one digest, numbers only, verified and estimated kept apart.
    function digest(input, feedOut, opts) {
      const o = opts || {}, lines = [];
      const sl = input.savings_ledger, el = input.earnings_ledger;
      if (sl) { const s = sl.summary(); lines.push(`Verified savings: ${money(s.verified_monthly_cents)} a month${s.verified_one_time_cents ? ` plus ${money(s.verified_one_time_cents)} one-time` : ""}.`); const m = sl.message(o.since, input.today); if (m) lines.push(m); }
      if (el) { const s = el.summary(o.since, input.today); if (s.count) lines.push(`${money(s.verified_cents)} found this period, about ${s.time_minutes} minutes of your actions, verified.`); }
      const est = (feedOut.proactive || []).filter(p => !p.verified);
      if (est.length) lines.push(`Estimated, not yet booked: ${money(est.reduce((s, p) => s + (p.amount_cents || 0), 0))} across ${est.length} open item${est.length === 1 ? "" : "s"}; the top one: ${est[0].text}`);
      if (feedOut.commitments && feedOut.commitments.length) lines.push(`Coming due: ${feedOut.commitments.slice(0, 3).map(c => c.text).join(" ")}`);
      if (feedOut.brief && feedOut.brief.count) lines.push(`News on your money: ${feedOut.brief.items.slice(0, 2).map(i => i.title).join("; ")}.`);
      if (!lines.length) lines.push("Nothing to report this week. No verified changes, no open items, no deadlines.");
      return { text: lines.join("\n"), lines };
    }
    // Item 5, a connection that stopped updating (ACCT-005: one calm note, one escalation, then quiet). Two different
    // things, said differently: the bank's own date on an account (balance_as_of, from SimpleFIN) is more than 3 days old
    // while Upmore did read SimpleFIN in the last day, so the link between SimpleFIN and the bank needs the person (fixed on
    // SimpleFIN Bridge, where they connected it); or no read of SimpleFIN has been saved for more than 2 days. Today the
    // rows the agent reads are saved only when the person taps "Refresh connected bank" in the app (agent-workflows
    // sync_finances; nothing refreshes them on a schedule), so that note says so and names the button. Accounts of one
    // institution are one note. Keys carry the stuck date, so a connection that recovers and breaks again is said again;
    // the second note comes at 10 days, then nothing.
    // accounts: agent_financial_accounts rows (account_id, name, institution, balance_as_of, fetched_at, status).
    function connections(accounts, now) {
      const DAYMS = 86400000, out = [], live = (accounts || []).filter(a => a && a.status !== "disconnected");
      const ms = v => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
      const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const dateOf = t => { const d = new Date(t); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
      const days = t => Math.floor((now - t) / DAYMS);
      const fetched = live.map(a => ms(a.fetched_at)).filter(x => x !== null);
      const lastRead = fetched.length ? Math.max(...fetched) : null;
      if (lastRead !== null && now - lastRead > 2 * DAYMS) {
        const d = days(lastRead), level = d >= 10 ? 2 : 1, key = `connection:refresh:${new Date(lastRead).toISOString().slice(0, 10)}:${level}`;
        out.push({ key, kind: "connection_refresh", capability_id: "ACCT-005", text: `${level === 2 ? "Still: your" : "Your"} linked accounts were last refreshed ${dateOf(lastRead)} (${d} days ago). I don't refresh them on my own yet, so what I tell you comes from ${dateOf(lastRead)}'s numbers. Tap "Refresh connected bank" in Upmore to bring them up to date.`, account_ids: live.map(a => a.account_id), days: d });
        return out;
      }
      const stuck = live.filter(a => { const b = ms(a.balance_as_of), f = ms(a.fetched_at); return b !== null && f !== null && now - f <= DAYMS && now - b > 3 * DAYMS; });
      const byInst = new Map();
      for (const a of stuck) { const k = a.institution || "your bank"; byInst.set(k, (byInst.get(k) || []).concat([a])); }
      for (const [inst, list] of [...byInst.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
        const oldest = Math.min(...list.map(a => ms(a.balance_as_of))), d = days(oldest), level = d >= 10 ? 2 : 1;
        const names = list.map(a => a.name || "an account").sort(), what = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
        const key = `connection:${list.map(a => a.account_id).sort().join("+")}:${new Date(oldest).toISOString().slice(0, 10)}:${level}`;
        out.push({ key, kind: "connection_bank", capability_id: "ACCT-005", text: `${level === 2 ? "Still not updated: " : ""}${inst} ${what} ${names.length === 1 ? "hasn't" : "haven't"} updated since ${dateOf(oldest)} (${d} days), though I read SimpleFIN today. That usually means the link between SimpleFIN and ${inst} needs you: open SimpleFIN Bridge, where you connected ${inst}, and fix it there. Until then, numbers for ${names.length === 1 ? "that account" : "those accounts"} may be out of date.`, account_ids: list.map(a => a.account_id), days: d });
      }
      return out;
    }
    return { feed, digest, offerText, connections, billKind, billConsequence, BILL_CONSEQUENCES, BILL_CATEGORIES };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentProactive;
