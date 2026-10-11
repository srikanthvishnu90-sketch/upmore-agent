  /* Earn engine (Instinct spec doc 08). Pure and deterministic. Every play
     carries the time cost next to the dollars, so the engine never sends the
     user chasing pennies. Found money is surfaced only after the name and
     address verification step; a wrong-person match is never shown as money.
     Nothing enrolls, shares or files on its own: actions are T3 minimum,
     referral messages are user-reviewed, and the earnings ledger keeps
     expected and verified dollars apart. */
  const AgentEarnEngine = (() => {
    const DAY = 86400000;
    const toMs = ymd => Date.parse(ymd + "T00:00:00Z");
    const days = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
    const floor = (a, b) => Math.floor(a / b);
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const hourly = (cents, minutes) => minutes > 0 ? Math.round(cents * 60 / minutes) : null;
    const candidate = (play, key, subtype, cents, confidence, extra) => Object.assign({
      play, key, subtype, expected_cents: cents, confidence, estimate: true, id: `${play}:${subtype}:${key}` }, extra || {});
    const DIRECT_DEPOSIT = /payroll|direct dep|\bdir dep\b|salary|wages|paycheck|gusto|adp\b|paychex|rippling/i;

    // E1 bank bonuses: the requirement checklist is tracked against the user's actual transactions.
    function bonuses(input) {
      const out = [], today = input.today;
      for (const e of input.enrolled_bonuses || []) {
        const offer = (input.offers || []).find(o => o.id === e.offer_id);
        if (!offer) continue;
        const txs = input.transactions.filter(t => t.account_id === e.account_id && t.posted_at >= e.opened_on);
        const req = offer.requirements || {}, checks = [];
        if (req.direct_deposit_cents) {
          const dd = txs.filter(t => t.amount > 0 && (t.is_direct_deposit || DIRECT_DEPOSIT.test(t.merchant_raw))).reduce((s, t) => s + Math.round(t.amount * 100), 0);
          checks.push({ requirement: "direct_deposit", needed_cents: req.direct_deposit_cents, have_cents: dd, met: dd >= req.direct_deposit_cents, by: req.by });
        }
        if (req.debit_count) {
          const n = txs.filter(t => t.amount < 0 && !t.is_transfer && t.is_card !== false).length;
          checks.push({ requirement: "debit_count", needed: req.debit_count, have: n, met: n >= req.debit_count, by: req.by });
        }
        if (req.min_balance_cents) {
          const acct = (input.accounts || []).find(a => a.id === e.account_id);
          const held = acct && acct.balance_cents >= req.min_balance_cents;
          checks.push({ requirement: "min_balance", needed_cents: req.min_balance_cents, have_cents: acct ? acct.balance_cents : null, met: !!held, hold_days: req.hold_days || 0, by: req.by });
        }
        const posted = txs.find(t => t.amount > 0 && Math.round(t.amount * 100) === offer.bonus_cents && /bonus/i.test(t.merchant_raw));
        const allMet = checks.length > 0 && checks.every(c => c.met);
        const deadline = req.by || null, left = deadline ? days(today, deadline) : null;
        const closure = offer.early_closure_days ? { ends_on: new Date(toMs(e.opened_on) + offer.early_closure_days * DAY).toISOString().slice(0, 10), fee_cents: offer.early_closure_fee_cents || 0 } : null;
        out.push(candidate("E1_bank_bonus", `bonus:${offer.id}`, posted ? "bonus_posted" : allMet ? "requirements_met" : "in_progress", offer.bonus_cents, "high", {
          checks, deadline, days_left: left, bonus_posted: !!posted, posted_txn: posted ? posted.id : null, early_closure: closure,
          time_cost_minutes: offer.time_cost_minutes || 45, effective_hourly_cents: hourly(offer.bonus_cents, offer.time_cost_minutes || 45),
          effective_return_bps: req.min_balance_cents ? floor(offer.bonus_cents * 10000 * 365, req.min_balance_cents * Math.max(1, req.hold_days || 90)) : null,
          action: { capability_id: "EARN-002", tier: "T1", describe: posted ? "bonus posted; keep the account open past the early-closure window" : "track the remaining requirements" },
          verification: posted ? { verified_cents: offer.bonus_cents, txn: posted.id } : null }));
      }
      for (const o of (input.offers || []).filter(o => !(input.enrolled_bonuses || []).some(e => e.offer_id === o.id))) {
        const req = o.requirements || {};
        out.push(candidate("E1_bank_bonus", `offer:${o.id}`, "available", o.bonus_cents, "medium", {
          requirements: req, time_cost_minutes: o.time_cost_minutes || 45, effective_hourly_cents: hourly(o.bonus_cents, o.time_cost_minutes || 45),
          early_closure_fee_cents: o.early_closure_fee_cents || 0, action: { capability_id: "EARN-001", tier: "T3", describe: "open the account yourself; the agent prepares the checklist, never applies for you" } }));
      }
      return out;
    }

    // E2 employer benefits: dollars left on the table, from the payroll fixture.
    function benefits(input) {
      const p = input.payroll; if (!p) return [];
      const out = [], salary = p.salary_cents || 0;
      if (p.match && salary) {
        const capPct = p.match.cap_pct || 0, contrib = p.match.employee_contrib_pct || 0, matchPct = p.match.match_pct || 100;
        const missingPct = Math.max(0, capPct - contrib);
        if (missingPct > 0) out.push(candidate("E2_benefits", "benefit:401k_match", "match_left", floor(salary * missingPct * matchPct, 10000), "high",
          { per: "year", computed: { cap_pct: capPct, contributing_pct: contrib, match_pct: matchPct }, time_cost_minutes: 10, action: { capability_id: "SAVE-019", tier: "T3", describe: `raise your 401k contribution to ${capPct}% to capture the full match` } }));
      }
      if (p.espp && salary && !p.espp.enrolled) {
        const pct = Math.min(p.espp.max_contrib_pct || 10, 10), disc = p.espp.discount_pct || 0;
        out.push(candidate("E2_benefits", "benefit:espp", "espp_not_enrolled", floor(salary * pct * disc, 10000), "high",
          { per: "year", window: { opens: p.espp.window_open, closes: p.espp.window_close }, computed: { contrib_pct: pct, discount_pct: disc },
            time_cost_minutes: 15, action: { capability_id: "EARN-006", tier: "T3", describe: "enroll during the window; discount is captured on each purchase date" } }));
      }
      if (p.hsa_seed_cents && !p.hsa_enrolled) out.push(candidate("E2_benefits", "benefit:hsa_seed", "hsa_seed_unclaimed", p.hsa_seed_cents, "high", { per: "year", time_cost_minutes: 10, action: { capability_id: "EARN-005", tier: "T3", describe: "enroll in the HSA to receive the employer seed" } }));
      for (const s of p.stipends || []) if (!s.used) out.push(candidate("E2_benefits", `benefit:stipend:${norm(s.name).replace(/ /g, "_")}`, "stipend_unused", s.cents, "high", { per: s.per || "year", time_cost_minutes: s.time_cost_minutes || 10, action: { capability_id: "EARN-005", tier: "T2", describe: `claim the ${s.name}` } }));
      return out;
    }

    // E3 found money: unclaimed property needs the name AND an address on record to match before it is money; class actions match purchase history.
    function foundMoney(input) {
      const out = [], me = input.user || {};
      const names = (me.names || []).map(norm), addrs = (me.past_addresses || []).map(norm);
      for (const h of input.unclaimed_hits || []) {
        const nameOk = names.includes(norm(h.name_on_record)), addrOk = addrs.some(a => a && norm(h.address_on_record).includes(a.split(" ")[0]) && norm(h.address_on_record).includes(a.split(" ").slice(-1)[0]));
        if (nameOk && addrOk) out.push(candidate("E3_found_money", `unclaimed:${h.state}:${h.id}`, "unclaimed_property", h.amount_cents, "high",
          { verification: { name: true, address: true }, state: h.state, claim_url: h.claim_url || null, time_cost_minutes: 20, effective_hourly_cents: hourly(h.amount_cents, 20),
            action: { capability_id: "EARN-007", tier: "T3", describe: "file the state claim yourself from the prepared form" } }));
        else out.push({ play: "E3_found_money", key: `unclaimed:${h.state}:${h.id}`, subtype: "needs_verification", expected_cents: 0, surfaced: false,
          verification: { name: nameOk, address: addrOk }, reason: "name or address on the state record does not match the user; not shown as money" });
      }
      const slug = typeof AgentSaveEngine !== "undefined" ? AgentSaveEngine.slugOf : () => null;
      for (const s of input.settlements || []) {
        const hits = input.transactions.filter(t => t.amount < 0 && t.posted_at >= s.window_from && t.posted_at <= s.window_to && (s.merchant_keys || []).includes(slug(t.merchant_raw, Math.round(-t.amount * 100)) || norm(t.merchant_raw)));
        if (!hits.length) continue;
        out.push(candidate("E3_found_money", `settlement:${s.id}`, "class_action", s.payout_cents_est || 0, "medium",
          { deadline: s.deadline, days_left: days(input.today, s.deadline), evidence: hits.map(t => ({ id: t.id, date: t.posted_at, amount: t.amount, merchant: t.merchant_raw })),
            time_cost_minutes: s.time_cost_minutes || 10, effective_hourly_cents: hourly(s.payout_cents_est || 0, s.time_cost_minutes || 10),
            action: { capability_id: "EARN-008", tier: "T3", describe: "file the claim with the purchase evidence attached" } }));
      }
      return out;
    }

    // E4 rewards: points valued at real redemption rates, never marketing rates; expiring balances flagged.
    function rewards(input) {
      const out = [];
      for (const p of input.points || []) {
        const real = Math.round(p.balance * (p.cents_per_point_real || 0)), marketing = Math.round(p.balance * (p.cents_per_point_marketing || p.cents_per_point_real || 0));
        const exp = p.expires_on ? days(input.today, p.expires_on) : null;
        out.push(candidate("E4_rewards", `points:${norm(p.program).replace(/ /g, "_")}`, exp !== null && exp <= 60 ? "expiring" : "valuation", real, "high",
          { balance: p.balance, real_value_cents: real, marketing_value_cents: marketing, overstated_by_cents: Math.max(0, marketing - real), expires_on: p.expires_on || null, days_left: exp,
            time_cost_minutes: 5, action: { capability_id: exp !== null && exp <= 60 ? "EARN-012" : "EARN-011", tier: "T0", describe: exp !== null && exp <= 60 ? "redeem before expiry" : "value at the real rate" } }));
      }
      return out;
    }

    // E5 referrals: an inventory the user acts on; the agent never contacts anyone.
    function referrals(input) {
      return (input.referrals || []).map(r => candidate("E5_referrals", `referral:${norm(r.program).replace(/ /g, "_")}`, "available", r.payout_cents, "medium",
        { link: r.link || null, time_cost_minutes: 5, sharing: "user-initiated only; message reviewed before any send", action: { capability_id: "EARN-003", tier: "T3", describe: "share the link yourself after reviewing the message" } }));
    }

    // E6 side income: earn apps rated by effective hourly rate with cash-out fees included; alert only when a payout unlocks.
    function sideIncome(input) {
      const out = [];
      for (const a of input.earn_apps || []) {
        const net = (a.payout_cents || 0) - (a.cashout_fee_cents || 0), rate = hourly(net, a.est_minutes || 0);
        out.push(candidate("E6_side_income", `earnapp:${norm(a.app).replace(/ /g, "_")}:${norm(a.offer).replace(/ /g, "_")}`, "offer", net, "low",
          { effective_hourly_cents: rate, est_minutes: a.est_minutes || null, cashout_fee_cents: a.cashout_fee_cents || 0, honest_note: rate !== null && rate < 1000 ? `pays about $${(rate / 100).toFixed(2)}/hour after fees` : null,
            time_cost_minutes: a.est_minutes || 0, action: { capability_id: "EARN-013", tier: "T0", describe: "your call; the rate is shown honestly" } }));
        if (a.balance_cents !== undefined && a.cashout_threshold_cents !== undefined && a.balance_cents >= a.cashout_threshold_cents)
          out.push(candidate("E6_side_income", `earnapp:${norm(a.app).replace(/ /g, "_")}:cashout`, "payout_unlocked", a.balance_cents - (a.cashout_fee_cents || 0), "high",
            { balance_cents: a.balance_cents, threshold_cents: a.cashout_threshold_cents, time_cost_minutes: 3, action: { capability_id: "EARN-013", tier: "T3", describe: "cash out to checking" } }));
      }
      return out;
    }

    function detect(input) {
      if (!input || !Array.isArray(input.transactions) || !input.today) throw new Error("detect needs transactions and today.");
      return [...bonuses(input), ...benefits(input), ...foundMoney(input), ...rewards(input), ...referrals(input), ...sideIncome(input)];
    }

    // Deadlines are hard alerts 7 days out and 1 day out, fed to the loop as commitments.
    function deadlineAlerts(candidates, today) {
      const out = [];
      for (const c of candidates) {
        const d = c.deadline || (c.early_closure && c.early_closure.ends_on) || c.expires_on;
        if (!d) continue;
        const left = days(today, d);
        if (left === 7 || left === 1) out.push({ key: `deadline:${c.key}:${left}d`, capability_id: "CORE-007", due_at: today, urgent: left === 1,
          text: `${left === 1 ? "Tomorrow" : "In 7 days"}: ${c.key} deadline ${d}${c.expected_cents ? ` ($${(c.expected_cents / 100).toFixed(2)})` : ""}.`, reason: "a real deadline" });
        if (c.early_closure && days(today, c.early_closure.ends_on) === 30) out.push({ key: `closure:${c.key}:30d`, capability_id: "CORE-007", due_at: today, urgent: false, text: `30 days until the early-closure window on ${c.key} ends (${c.early_closure.ends_on}); closing before then costs $${(c.early_closure.fee_cents / 100).toFixed(2)}.`, reason: "a real deadline" });
      }
      return out;
    }

    // Earnings ledger: expected vs verified dollars plus the minutes spent, never mixed.
    function ledger(state) {
      const s = state && typeof state === "object" ? state : { entries: [] };
      s.entries = s.entries || [];
      return {
        state: s,
        book(c, at) {
          if (!c || !Number.isSafeInteger(c.expected_cents)) throw new Error("A booking needs a candidate with an integer expected amount.");
          const existing = s.entries.find(e => e.id === c.id); if (existing) return existing;
          const e = { id: c.id, play: c.play, key: c.key, booked_at: at || null, expected_cents: c.expected_cents, verified_cents: null, verified_at: null, time_cost_minutes: c.time_cost_minutes || 0, status: "expected" };
          s.entries.push(e); return e;
        },
        verify(id, cents, at, evidence) {
          const e = s.entries.find(x => x.id === id); if (!e) throw new Error("Unknown ledger entry.");
          if (!Number.isSafeInteger(cents)) throw new Error("A verified amount is an observed integer, never an estimate.");
          e.verified_cents = cents; e.verified_at = at || null; e.verification = evidence || null; e.status = cents > 0 ? "verified" : "did_not_pay"; return e;
        },
        summary(sinceIso) {
          const rows = s.entries.filter(e => e.status === "verified" && (!sinceIso || (e.verified_at || "") >= sinceIso));
          const verified = rows.reduce((n, e) => n + e.verified_cents, 0), minutes = rows.reduce((n, e) => n + (e.time_cost_minutes || 0), 0);
          const expected = s.entries.filter(e => e.status === "expected").reduce((n, e) => n + e.expected_cents, 0);
          return { verified_cents: verified, minutes, expected_unverified_cents: expected,
            message: verified ? `$${(verified / 100).toFixed(2)} found${sinceIso ? " this period" : ""}, about ${minutes} minutes of your actions.` : "Nothing verified yet." };
        }
      };
    }
    return { detect, deadlineAlerts, ledger, hourly };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentEarnEngine;
