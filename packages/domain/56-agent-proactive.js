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

    function feed(input, opts) {
      const o = opts || {}, now = o.now || dayMs(input.today) + 12 * 3600000, out = { kind: "event", safety: [], commitments: [], watches: [], proactive: [], sources: {} };
      const Save = mod("AgentSave"), Earn = mod("AgentEarn"), News = mod("AgentNews"), Monitors = mod("AgentMonitors"), Voice = mod("AgentVoice");
      const compose = (kind, fields) => { if (!Voice) return { bubbles: [fields.finding ? `${fields.finding} ${fields.offer}` : fields.first_line || fields.text] }; return Voice.compose(kind, fields, {}); };
      // Monitors (Codex): findings with evidence rows; fraud-shaped ones are safety, the rest proactive with their rule as the reason.
      if (Monitors && input.transactions) {
        const m = Monitors.runAll({ today: input.today, transactions: input.transactions, isLive: input.isLive !== false, balance: input.balance, buffer: input.buffer, knownMerchants: input.knownMerchants, subscriptions: input.subscriptions, cancelClaims: input.cancelClaims, deadlines: input.deadlines, statesLived: input.statesLived, lastSearched: input.lastSearched, accounts: input.accounts_live });
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
      // Fraud and scam shapes are safety: they beat everything (doc 01 decision order).
      for (const s of input.safety || []) out.safety.push(s);
      for (const p of out.proactive) { if (p.text && typeof p.text === "string" && /possible fraud|unauthorized|card-skimming/i.test(p.text)) { out.safety.push({ text: p.text, key: p.key }); p.suppressed_as_safety = true; } }
      out.proactive = out.proactive.filter(p => !p.suppressed_as_safety).sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || (a.priority || 3) - (b.priority || 3) || (a.deadline || Infinity) - (b.deadline || Infinity) || (b.amount_cents || 0) - (a.amount_cents || 0) || a.key.localeCompare(b.key));
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
    return { feed, digest, offerText };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentProactive;
