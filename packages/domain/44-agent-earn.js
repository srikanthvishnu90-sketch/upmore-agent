  /* Earn engine (Instinct spec doc 08). Pure and deterministic. Earning means
     claimable dollars: bonuses, benefits, found money, rewards, referrals,
     side income. Same loop as save: detect, quantify, act, verify, book. The
     distinct risk is wasting the user's time for pennies, so every play
     carries its time cost next to the dollars and an effective hourly rate
     where time is the price. Requirement trackers are data (a checklist plus
     evidence queries against transactions). Deadlines feed the operating
     model's follow-ups: hard alerts 7 days and 1 day out. No auto-enrollment,
     no contacting other people; T3 minimum for anything that acts. Loads
     after AgentMonitors (unclaimed search cadence) and, when present,
     AgentSave (the shared rate module for E7). */
  const AgentEarn = (() => {
    const DAY = 86400000;
    const ymd = s => String(s || "").slice(0, 10);
    const days = (a, b) => Math.round((Date.parse(ymd(b) + "T00:00:00Z") - Date.parse(ymd(a) + "T00:00:00Z")) / DAY);
    const cents = d => Math.round(Number(d) * 100);
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const PAYROLL_RE = /payroll|salary|wages|direct\s*dep|\bdir dep\b|paycheck/i;
    const BONUS_RE = /\b(bonus|promotional credit|promo credit|welcome (bonus|credit)|new account bonus)\b/i;
    const M = () => { if (typeof AgentMonitors === "undefined") throw new Error("AgentMonitors must be loaded before AgentEarn"); return AgentMonitors; };
    const key = s => M().merchantKey(s);
    const opp = (play, k, fields) => Object.assign({ play, key: k, expected_cents: 0, expected_monthly_cents: 0, time_minutes: 0, estimate: true, confidence: "medium", deadlines: [] }, fields);
    const proof = t => ({ id: t.id, date: t.date, amount: t.amount, merchant: t.merchant });
    const hourly = (net_cents, minutes) => minutes > 0 ? divRound(net_cents * 60, minutes) : null;

    // E1 Bank bonuses: the checklist is data; evidence comes from the account's own transactions after the open date.
    function bonuses(input) {
      const txs = M().clean(input.transactions || []).filter(t => !t.pending);
      const out = [];
      for (const b of input.bonuses || []) {
        const acct = txs.filter(t => t.accountId === b.account_id && t.date >= ymd(b.opened_on));
        const paid = acct.find(t => t.amount > 0 && BONUS_RE.test(t.merchant) && cents(t.amount) === b.amount_cents);
        const reqs = (b.requirements || []).map(r => {
          if (r.kind === "direct_deposit") { const rows = acct.filter(t => t.amount > 0 && PAYROLL_RE.test(t.merchant) && (!r.min_each_cents || cents(t.amount) >= r.min_each_cents)); const got = rows.reduce((s, t) => s + cents(t.amount), 0); return { kind: r.kind, need_cents: r.amount_cents, have_cents: got, met: got >= r.amount_cents, by: ymd(r.by), rows: rows.map(proof) }; }
          if (r.kind === "debit_count") { const rows = acct.filter(t => t.amount < 0 && !t.transfer && !/fee/i.test(t.merchant)); return { kind: r.kind, need: r.count, have: rows.length, met: rows.length >= r.count, by: ymd(r.by), rows: rows.map(proof) }; }
          if (r.kind === "min_balance") { const hist = (input.balance_history || []).filter(h => h.account_id === b.account_id && h.date >= ymd(b.opened_on)); const ok = hist.filter(h => h.balance_cents >= r.amount_cents).length; return { kind: r.kind, need_cents: r.amount_cents, need_days: r.days, have_days: ok, met: hist.length ? ok >= r.days : null, by: ymd(r.by), rows: [], note: hist.length ? null : "no balance history for this account; cannot verify" }; }
          return { kind: r.kind, met: null, by: ymd(r.by), note: "unknown requirement kind" };
        });
        const allMet = reqs.length > 0 && reqs.every(r => r.met === true), unknown = reqs.some(r => r.met === null);
        const deposit = reqs.filter(r => r.kind === "direct_deposit" || r.kind === "min_balance").reduce((s, r) => s + (r.need_cents || 0), 0);
        const deadlines = reqs.filter(r => !r.met && r.by).map(r => ({ what: `${b.bank} bonus: ${r.kind.replace(/_/g, " ")}`, on: r.by }));
        if (b.early_closure_until) deadlines.push({ what: `${b.bank}: keep the account open (early-closure fee)`, on: M().addDays(ymd(b.early_closure_until), -30), note: "30 days before the early-closure window ends" });
        const status = paid ? "paid" : allMet ? (b.payout_expected_by && ymd(b.payout_expected_by) < input.today ? "overdue" : "earned_awaiting_payout") : unknown ? "unknown" : "in_progress";
        out.push(opp("E1_bonus", `bank_bonus:${b.id}`, { title: `${b.bank} ${money(b.amount_cents)} bonus: ${status.replace(/_/g, " ")}`, capability_id: "EARN-002", tier: "T1", status, expected_cents: paid ? 0 : b.amount_cents, confidence: allMet ? "high" : "medium",
          requirements: reqs, time_minutes: b.time_minutes || 30, effective_return_bps: deposit > 0 ? divRound(b.amount_cents * 10000, deposit) : null, deadlines,
          action: paid ? null : status === "overdue" ? { type: "chase_payout", capability_id: "EARN-002", note: "Requirements met and the payout date passed; the user contacts the bank with this evidence." } : { type: "track", capability_id: "EARN-002" },
          evidence: { rule: "Requirements checked against the account's own transactions after the open date.", rows: reqs.flatMap(r => r.rows), computed: { paid: paid ? proof(paid) : null, deposit_required_cents: deposit } },
          verify: { how: "a bonus credit of the stated amount posts to the account" } }));
      }
      return out;
    }

    // E2 Employer benefits: match, ESPP, HSA seed, stipends. Dollars per year being left, as arithmetic on stated terms.
    function benefits(input) {
      const b = input.benefits; if (!b) return [];
      const out = [], salary = b.salary_cents || 0;
      if (b.match && salary && Number.isFinite(b.match.up_to_pct) && Number.isFinite(b.match.rate_pct) && Number.isFinite(b.contribution_pct) && b.contribution_pct < b.match.up_to_pct) {
        const left = divRound(salary * (b.match.up_to_pct - b.contribution_pct) * b.match.rate_pct, 10000);
        out.push(opp("E2_benefits", "employer_match_gap", { title: `${money(left)} a year of employer match not captured`, capability_id: "SAVE-019", tier: "T2", expected_cents: left, expected_monthly_cents: divRound(left, 12), confidence: "high", time_minutes: 10,
          action: { type: "raise_contribution", capability_id: "SAVE-019", to_pct: b.match.up_to_pct, note: "A draft change to the contribution election; the user submits it in the plan portal." },
          evidence: { rule: "Salary times the uncaptured match band times the match rate.", rows: [], computed: { salary_cents: salary, contribution_pct: b.contribution_pct, match_up_to_pct: b.match.up_to_pct, match_rate_pct: b.match.rate_pct } }, verify: { how: "the next payroll shows the new contribution percent" } }));
      }
      if (b.espp && salary && b.espp.enrolled !== true && Number.isFinite(b.espp.discount_pct) && Number.isFinite(b.espp.max_pct)) {
        const worth = divRound(salary * b.espp.max_pct * b.espp.discount_pct, 10000);
        const deadlines = b.espp.window_closes ? [{ what: "ESPP enrollment window closes", on: ymd(b.espp.window_closes) }] : [];
        out.push(opp("E2_benefits", "espp_not_enrolled", { title: `Your ESPP discount is worth about ${money(worth)} a year and you're not enrolled`, capability_id: "EARN-006", tier: "T1", expected_cents: worth, confidence: "medium", time_minutes: 15, deadlines,
          action: { type: "enroll_reminder", capability_id: "EARN-006", note: "Discount captured at purchase if sold at once; holding adds market risk the user decides on." },
          evidence: { rule: "Salary times the maximum contribution percent times the purchase discount; an estimate of the discount alone.", rows: [], computed: { salary_cents: salary, max_pct: b.espp.max_pct, discount_pct: b.espp.discount_pct } }, verify: { how: "enrollment confirmed and the first purchase posts" } }));
      }
      if (b.hsa_seed_cents > 0 && b.hsa_enrolled !== true) out.push(opp("E2_benefits", "hsa_seed_unclaimed", { title: `${money(b.hsa_seed_cents)} HSA employer seed not claimed`, capability_id: "EARN-005", tier: "T1", expected_cents: b.hsa_seed_cents, confidence: "high", time_minutes: 10, action: { type: "enroll_reminder", capability_id: "SAVE-020" }, evidence: { rule: "Stated employer HSA contribution with no HSA enrollment.", rows: [], computed: {} }, verify: { how: "the HSA shows the employer deposit" } }));
      for (const s of b.stipends || []) { const left = (s.amount_cents || 0) - (s.used_cents || 0); if (left > 0) out.push(opp("E2_benefits", `stipend_unused:${key(s.name)}`, { title: `${money(left)} of the ${s.name} stipend unused`, capability_id: "EARN-005", tier: "T1", expected_cents: left, confidence: "high", time_minutes: 15, deadlines: s.expires_on ? [{ what: `${s.name} stipend expires`, on: ymd(s.expires_on) }] : [], action: { type: "claim_reminder", capability_id: "EARN-005" }, evidence: { rule: "Stipend amount minus what was reimbursed.", rows: [], computed: { amount_cents: s.amount_cents, used_cents: s.used_cents || 0 } }, verify: { how: "the reimbursement posts" } })); }
      return out;
    }

    // E3 Found money: unclaimed search cadence (from the monitors), settlements and recalls matched against the user's own merchants and states. A wrong-person match is worse than a missed one.
    function foundMoney(input) {
      const out = [], txs = M().clean(input.transactions || []);
      const merchants = new Set(txs.map(t => t.key).filter(Boolean));
      const states = new Set((input.statesLived || []).map(s => String(s).toUpperCase()));
      for (const f of M().unclaimedSearchDue({ today: input.today, statesLived: input.statesLived || [], lastSearched: input.lastSearched || {} }))
        out.push(opp("E3_found", f.key, { title: f.title, capability_id: "EARN-007", tier: "T0", expected_cents: 0, confidence: "low", time_minutes: 10, due_on: f.dueOn, action: { type: "search", capability_id: "EARN-007", note: "Searching and claiming are free; the user signs the claim. Any hit is verified by name and address before it is shown." }, evidence: f.evidence, verify: { how: "a claim paid by the state" } }));
      for (const s of input.settlements || []) {
        if (!s || ymd(s.claim_deadline) < input.today || (s.status && s.status !== "open")) continue;
        const stateOk = !(s.eligibility_states || []).length || [...states].some(st => s.eligibility_states.includes(st));
        const hits = (s.eligibility_merchants || []).map(key).filter(k => k && [...merchants].some(m => m === k || m.startsWith(k + " ") || k.startsWith(m + " ")));
        if (!stateOk || !hits.length) continue;
        const rows = txs.filter(t => hits.some(k => t.key === k || t.key.startsWith(k + " "))).slice(0, 5).map(proof);
        out.push(opp("E3_found", `settlement:${s.id}`, { title: `${s.name}: you likely qualify (claim by ${ymd(s.claim_deadline)})`, capability_id: "EARN-008", tier: "T3", expected_cents: s.typical_payout_cents || 0, confidence: s.proof_required && s.proof_required !== "none" ? "medium" : "low", time_minutes: s.proof_required && s.proof_required !== "none" ? 25 : 10,
          deadlines: [{ what: `${s.name} claim deadline`, on: ymd(s.claim_deadline) }], proof_required: s.proof_required || "none", claim_url: s.claim_url || null,
          action: { type: "file_claim", capability_id: "EARN-008", note: "Likely, not certain: the settlement's own eligibility rules decide. The user files; the agent prepares the form from the evidence rows." },
          evidence: { rule: "Purchases at a named merchant in the eligibility window and a state in the eligible list.", rows, computed: { merchants_matched: hits, states_ok: stateOk } }, verify: { how: "the settlement payment posts" } }));
      }
      for (const r of input.recalls || []) {
        const k = key(r.merchant || ""), rows = txs.filter(t => k && (t.key === k || t.key.startsWith(k + " ")) && (!r.purchased_after || t.date >= ymd(r.purchased_after)) && (!r.amount_cents || Math.abs(cents(t.amount)) === r.amount_cents)).map(proof);
        if (!rows.length) continue;
        out.push(opp("E3_found", `recall:${r.id}`, { title: `${r.product} recall: refund of ${money(r.refund_cents || 0)} available`, capability_id: "EARN-015", tier: "T3", expected_cents: r.refund_cents || 0, confidence: "medium", time_minutes: 20, deadlines: r.deadline ? [{ what: `${r.product} recall refund deadline`, on: ymd(r.deadline) }] : [],
          action: { type: "file_refund", capability_id: "EARN-015" }, evidence: { rule: "A purchase at the recall's merchant matching the recall's date window or amount.", rows, computed: {} }, verify: { how: "the refund posts" } }));
      }
      return out;
    }

    // E4 Rewards: points are a currency with an issuer-set rate; the real redemption rate is the number, never the marketing rate.
    function rewards(input) {
      const out = [];
      for (const p of input.rewards || []) {
        if (!(p.points > 0)) continue;
        const real = divRound(p.points * (p.real_cents_per_point_x100 || 0), 100), marketing = p.marketing_cents_per_point_x100 ? divRound(p.points * p.marketing_cents_per_point_x100, 100) : null;
        const fields = { capability_id: "EARN-011", tier: "T0", expected_cents: real, confidence: "high", time_minutes: 5, points: p.points, real_cents: real, marketing_cents: marketing, program: p.program };
        const best = (p.transfer_partners || []).filter(t => t.cents_per_point_x100 > (p.real_cents_per_point_x100 || 0)).sort((a, b) => b.cents_per_point_x100 - a.cents_per_point_x100)[0];
        if (p.expires_on && days(input.today, p.expires_on) <= 60 && days(input.today, p.expires_on) >= 0)
          out.push(opp("E4_rewards", `points_expiring:${key(p.program)}`, Object.assign({ title: `${p.points.toLocaleString("en-US")} ${p.program} points (${money(real)} at the real rate) expire ${ymd(p.expires_on)}`, deadlines: [{ what: `${p.program} points expire`, on: ymd(p.expires_on) }], action: { type: "redeem_before_expiry", capability_id: "EARN-012", note: best ? `Transfer to ${best.partner} values them at ${money(divRound(p.points * best.cents_per_point_x100, 100))}.` : "Redeem at the real rate; no transfer beats it." }, evidence: { rule: "Points with an expiry within 60 days, valued at the stated real redemption rate.", rows: [], computed: { real_cents_per_point_x100: p.real_cents_per_point_x100, marketing_cents_per_point_x100: p.marketing_cents_per_point_x100 || null } }, verify: { how: "the redemption or transfer posts before the expiry" } }, fields)));
        else if (best) out.push(opp("E4_rewards", `transfer_sweet_spot:${key(p.program)}`, Object.assign({ title: `${p.program}: transferring to ${best.partner} is worth ${money(divRound(p.points * best.cents_per_point_x100, 100) - real)} more than cash`, capability_id: "EARN-012", expected_cents: divRound(p.points * best.cents_per_point_x100, 100) - real, confidence: "medium", action: { type: "transfer_suggestion", capability_id: "EARN-012", note: "Only worth it if the user would make that redemption anyway." }, evidence: { rule: "A transfer partner rate above the cash rate.", rows: [], computed: { partner: best.partner, partner_rate_x100: best.cents_per_point_x100 } }, verify: { how: "the transfer and redemption post" } }, fields, { expected_cents: divRound(p.points * best.cents_per_point_x100, 100) - real })));
        else out.push(opp("E4_rewards", `points_balance:${key(p.program)}`, Object.assign({ title: `${p.points.toLocaleString("en-US")} ${p.program} points are worth ${money(real)}${marketing && marketing !== real ? ` (not the ${money(marketing)} the program advertises)` : ""}`, action: null, evidence: { rule: "Points valued at the stated real redemption rate.", rows: [], computed: {} }, verify: { how: "n/a: information" } }, fields)));
      }
      return out;
    }

    // E5 Referrals: inventory and payout tracking. Sharing a link is always the user's move (T3, reviewed message); contacts are never touched.
    function referrals(input) {
      const txs = M().clean(input.transactions || []), out = [];
      for (const r of input.referrals || []) {
        const pending = (r.referred || []).filter(x => x.status === "signed_up" || x.status === "qualified");
        const paidRows = (r.referred || []).filter(x => x.status === "paid").map(x => txs.find(t => t.amount > 0 && /referral|refer/i.test(t.merchant) && cents(t.amount) === (r.payout_cents || 0) && t.date >= ymd(x.signed_up_on))).filter(Boolean).map(proof);
        out.push(opp("E5_referrals", `referral:${key(r.account)}`, { title: `${r.account} pays ${money(r.payout_cents || 0)} per referral${pending.length ? `; ${pending.length} pending` : ""}`, capability_id: pending.length ? "EARN-004" : "EARN-003", tier: "T3", expected_cents: pending.length * (r.payout_cents || 0), confidence: pending.length ? "medium" : "low", time_minutes: 5, link: r.link || null, pending: pending.map(x => ({ name: x.name, status: x.status, since: ymd(x.signed_up_on), expected_by: x.payout_expected_by ? ymd(x.payout_expected_by) : null })),
          deadlines: pending.filter(x => x.payout_expected_by).map(x => ({ what: `${r.account} referral payout for ${x.name} expected`, on: ymd(x.payout_expected_by) })),
          action: { type: "share_link_reviewed", capability_id: "EARN-003", note: "User-initiated only; the agent drafts, the user sends to people they choose." }, evidence: { rule: "Program terms as stated; payouts matched to referral credits in the transactions.", rows: paidRows, computed: { paid_seen: paidRows.length } }, verify: { how: "a referral credit of the stated amount posts" } }));
      }
      return out;
    }

    // E6 Side income: effective hourly rate from the requirement structure, cash-out fees included; pings only at a payout threshold.
    function sideIncome(input) {
      const out = [];
      for (const a of input.earn_apps || []) {
        const net = (a.payout_cents || 0) - (a.cashout_fee_cents || 0), rate = hourly(net, a.minutes_required || 0);
        const reached = Number.isFinite(a.earned_cents) && Number.isFinite(a.threshold_cents) && a.earned_cents >= a.threshold_cents;
        out.push(opp("E6_side_income", `earn_app:${key(a.name)}`, { title: reached ? `${a.name}: you've crossed the ${money(a.threshold_cents)} cash-out threshold` : `${a.name}: ${rate === null ? "no stated time cost" : money(rate) + " an hour effective"} after fees`, capability_id: "EARN-013", tier: reached ? "T1" : "T0", expected_cents: reached ? a.earned_cents - (a.cashout_fee_cents || 0) : net, confidence: reached ? "high" : "low", time_minutes: reached ? 5 : (a.minutes_required || 0), effective_hourly_cents: rate, net_cents: net, threshold_reached: reached, // once the threshold is crossed the time is already spent; cashing out costs minutes
          action: reached ? { type: "cash_out_reminder", capability_id: "EARN-013" } : null, evidence: { rule: "Payout minus cash-out fee, divided by the stated time to earn it.", rows: [], computed: { payout_cents: a.payout_cents, cashout_fee_cents: a.cashout_fee_cents || 0, minutes_required: a.minutes_required || 0, earned_cents: a.earned_cents || 0, threshold_cents: a.threshold_cents || null } }, verify: { how: "the cash-out posts" } }));
      }
      return out;
    }

    function detect(input) {
      if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.today || ""))) throw new Error("today is required (YYYY-MM-DD)");
      const opportunities = [].concat(bonuses(input), benefits(input), foundMoney(input), rewards(input), referrals(input), sideIncome(input));
      // E7 shares the rate module with the save engine rather than duplicating it.
      if (typeof AgentSave !== "undefined") for (const o of AgentSave.idleCash(input)) opportunities.push(Object.assign({}, o, { play: "E7_yield", shared_with: "P4_rate", time_minutes: 10, expected_cents: 0 }));
      for (const o of opportunities) o.effective_hourly_cents = o.effective_hourly_cents !== undefined ? o.effective_hourly_cents : hourly(o.expected_cents || o.expected_monthly_cents * 12, o.time_minutes);
      return { today: input.today, opportunities, deadlines: deadlines(opportunities, input.today), estimated_cents: opportunities.reduce((s, o) => s + (o.expected_cents || 0), 0), time_minutes: opportunities.reduce((s, o) => s + (o.time_minutes || 0), 0), note: "Estimates with their time cost. Nothing is booked until a verify step confirms the credit posted." };
    }

    // Deadline scheduler: every deadline the plays carry, with the two hard alert days (7 and 1 days out) and whether one fires today.
    function deadlines(opportunities, today) {
      const out = [];
      for (const o of opportunities) for (const d of o.deadlines || []) {
        const left = days(today, d.on); if (left < 0) { out.push({ key: o.key, what: d.what, on: d.on, days_left: left, status: "missed", fires_today: false }); continue; }
        out.push({ key: o.key, what: d.what, on: d.on, days_left: left, alert_days: [M().addDays(d.on, -7), M().addDays(d.on, -1)], fires_today: left === 7 || left === 1 || left === 0, status: left === 0 ? "today" : "upcoming", note: d.note || null });
      }
      return out.sort((a, b) => a.days_left - b.days_left || a.key.localeCompare(b.key));
    }

    // Verify: the credit itself, in the transactions, on or after the day the play was acted on.
    function verify(o, later) {
      const l = later || {}, txs = M().clean(l.transactions || []).filter(t => !t.pending && t.amount > 0 && (!l.since || t.date >= ymd(l.since)));
      const no = reason => ({ verified: false, reason });
      const find = (re, amount) => txs.find(t => re.test(t.merchant) && (amount == null || cents(t.amount) === amount));
      let hit = null;
      if (o.play === "E1_bonus") hit = find(BONUS_RE, o.expected_cents || (o.evidence && o.evidence.computed && o.evidence.computed.paid ? cents(o.evidence.computed.paid.amount) : null));
      else if (o.play === "E3_found" && o.key.startsWith("settlement:")) hit = find(/settlement|class action|claims? admin/i, null);
      else if (o.play === "E3_found" && o.key.startsWith("recall:")) hit = find(/recall|refund/i, o.expected_cents || null);
      else if (o.play === "E3_found") hit = find(/unclaimed|state treasur|comptroller/i, null);
      else if (o.play === "E5_referrals") hit = find(/referral|refer/i, null);
      else if (o.play === "E6_side_income") hit = find(new RegExp(o.key.split(":")[1].replace(/\s+/g, ".*"), "i"), null);
      else if (o.play === "E2_benefits") { const p = l.benefits; if (!p) return no("no later benefits data"); if (o.key === "employer_match_gap") return p.contribution_pct >= o.evidence.computed.match_up_to_pct ? { verified: true, verified_cents: o.expected_cents, evidence: { contribution_pct: p.contribution_pct } } : no("contribution election unchanged"); if (o.key === "espp_not_enrolled") return p.espp && p.espp.enrolled === true ? { verified: true, verified_cents: 0, evidence: { enrolled: true }, note: "enrolled; dollars verify as purchases post" } : no("not enrolled"); return no("no verify step for this benefit"); }
      else if (o.play === "E4_rewards") return l.redeemed_cents > 0 ? { verified: true, verified_cents: l.redeemed_cents, evidence: { redeemed_cents: l.redeemed_cents } } : no("no redemption recorded");
      else return no("no verify step for this play");
      return hit ? { verified: true, verified_cents: cents(hit.amount), evidence: proof(hit) } : no("no matching credit has posted");
    }

    // The earnings ledger: expected vs verified never mixed; a time-cost column so the weekly summary can say "$340 found this month, about 40 minutes of your actions".
    function ledger(initial) {
      const entries = Array.isArray(initial) ? initial.slice() : [];
      return {
        entries,
        book(o, v, at) {
          if (!v || v.verified !== true) throw new Error("The earnings ledger books verified credits only.");
          const existing = entries.find(e => e.key === o.key && e.verified_at === ymd(at)); if (existing) return existing;
          const e = { play: o.play, key: o.key, expected_cents: o.expected_cents || 0, verified_cents: v.verified_cents || 0, time_minutes: o.time_minutes || 0, verified_at: ymd(at), evidence: v.evidence || null }; entries.push(e); return e;
        },
        summary(from, to) { const rows = entries.filter(e => (!from || e.verified_at >= ymd(from)) && (!to || e.verified_at <= ymd(to))); return { verified_cents: rows.reduce((s, e) => s + e.verified_cents, 0), time_minutes: rows.reduce((s, e) => s + e.time_minutes, 0), count: rows.length }; },
        message(from, to) { const s = this.summary(from, to); return s.count ? `${money(s.verified_cents)} found${from ? ` since ${ymd(from)}` : ""}, about ${s.time_minutes} minutes of your actions, verified.` : null; }
      };
    }

    // Queue: verified first, then expected dollars weighted by confidence and divided by time, so a $5 play that costs an hour sinks.
    const WEIGHT = { high: 1, medium: 0.6, low: 0.3 };
    function rank(opportunities, book) {
      const verified = new Map((book && book.entries || []).map(e => [e.key, e]));
      const score = o => { const v = verified.get(o.key); if (v) return 1e12 + v.verified_cents; const dollars = (o.expected_cents || 0) + (o.expected_monthly_cents || 0) * 12; return dollars * (WEIGHT[o.confidence] || 0.3) / (1 + (o.time_minutes || 0) / 60); };
      return opportunities.slice().sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key)).map(o => { const v = verified.get(o.key); return Object.assign({}, o, { verified: !!v, score: score(o), estimate: !v, reason: v ? `verified: ${money(v.verified_cents)}` : `${money((o.expected_cents || 0) + (o.expected_monthly_cents || 0) * 12)} a year estimated, about ${o.time_minutes || 0} minutes (${o.confidence} confidence)` }); });
    }
    return { detect, deadlines, verify, ledger, rank, bonuses, benefits, foundMoney, rewards, referrals, sideIncome, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentEarn;
