  /* Money movement (Instinct spec doc 06): the pure half. Rails as data with
     the honest reality (Zelle, Venmo and Cash App have no third-party send
     API; the handoff pattern is a feature), rail selection that quotes the
     free rail first, the send workflow with its fill-the-gaps rules, exact
     confirmations, staged handoff text, receipts that carry their reversal
     contract and mitigation path, the IOU ledger with minimal settle-up, the
     rent and bill cycles, splits on exact cents, and the velocity and
     scam-pattern checks that cannot be talked out of. Everything executes
     through the operating model (43-agent-loop.js): gate, confirm, act,
     verify, remember. No provider is called here; adapters are injected and
     the fake rail in tests simulates confirmation, failure and timeout.
     Loads after MoneyMath (48). The edge wiring (payment_service.ts) is
     Codex's; this module is what it imports. */
  const AgentMoney = (() => {
    const MM = () => { if (typeof MoneyMath === "undefined") throw new Error("MoneyMath must be loaded before AgentMoney"); return MoneyMath; };
    const money = c => MM().format(c);
    const ymd = s => String(s || "").slice(0, 10);
    const DAY = 86400000;
    const days = (a, b) => Math.round((Date.parse(ymd(b) + "T00:00:00Z") - Date.parse(ymd(a) + "T00:00:00Z")) / DAY);

    // The rails reality. executable: the agent can call it through a partner rail when one is live; otherwise handoff: the agent stages it and the user completes it in the app.
    const RAILS = Object.freeze({
      ach: { name: "ACH", mode: "partner", speed: "lands in 1-3 business days", fee_cents: 0, reversible: "reversible only for specific errors (wrong amount, duplicate, unauthorized) inside the bank's return window, usually 2 business days for consumer debits; not a recall button", mitigation: "contact your bank the same day to file an error claim; after the window the recipient must send it back", tier_min: "T3", capability_id: "PAY-010" },
      ach_instant: { name: "instant transfer", mode: "partner", speed: "lands in minutes", fee_cents: null, fee_bps: 175, fee_max_cents: 2500, reversible: "irreversible once received", mitigation: "ask the recipient to send it back; your bank can flag it but cannot pull it", tier_min: "T3", capability_id: "PAY-010" },
      zelle: { name: "Zelle", mode: "handoff", app: "your bank app", speed: "lands in minutes", fee_cents: 0, reversible: "irreversible once received", mitigation: "ask the recipient to send it back; report to your bank within 60 days if it was unauthorized", tier_min: "T3", capability_id: "PAY-012" },
      venmo: { name: "Venmo", mode: "handoff", app: "Venmo", speed: "lands in minutes (Venmo balance), 1-3 days to a bank", fee_cents: 0, reversible: "irreversible once received; instant cash-out to a bank costs the recipient a fee", mitigation: "ask the recipient to send it back; Venmo support can only help if the account was taken over", tier_min: "T3", capability_id: "PAY-013" },
      cash_app: { name: "Cash App", mode: "handoff", app: "Cash App", speed: "lands in minutes", fee_cents: 0, reversible: "irreversible once received", mitigation: "ask the recipient to send it back; cancel is possible only while the payment is still pending", tier_min: "T3", capability_id: "PAY-014" },
      paypal: { name: "PayPal", mode: "handoff", app: "PayPal", speed: "lands in minutes", fee_cents: 0, reversible: "friends-and-family sends are irreversible; goods-and-services carries purchase protection", mitigation: "open a dispute only for goods-and-services; otherwise ask the recipient", tier_min: "T3", capability_id: "PAY-015" },
      wire: { name: "wire", mode: "partner", speed: "same day", fee_cents: 2500, reversible: "irreversible", mitigation: "a recall request through your bank, which the receiving bank may refuse", tier_min: "T5", capability_id: "PAY-011" },
      bill_pay: { name: "bank bill pay", mode: "partner", speed: "electronic in 1-2 days, paper check in 5-7", fee_cents: 0, reversible: "cancellable until it is sent", mitigation: "cancel in bill pay before the send date; after that, the payee refunds", tier_min: "T3", capability_id: "PAY-006" }
    });
    const SCAM = /\b(irs|internal revenue|gift ?cards?|apple cards?|google play cards?|steam cards?|bitcoin atm|crypto atm|wire (it )?urgently|urgent wire|warrant for (your|my) arrest|social security (number|office) (suspended|frozen)|tech support|refund department|overpaid you|send back the difference|romance|i love you|sweetheart|military deployment|customs fee|lottery|you('ve| have) won|prize|sugar (daddy|baby)|pay to release|bail money|grandson in jail|zelle me back)\b/i;
    const feeFor = (rail, amount) => rail.fee_cents !== null && rail.fee_cents !== undefined ? rail.fee_cents : Math.min(MM().pctOf(amount, rail.fee_bps), rail.fee_max_cents || Infinity);

    // Rail selection: reachable rails for the recipient, the user's funding source, speed needed, fee. Free first unless the user asked for speed.
    function selectRail(req, ctx) {
      const c = ctx || {}, partners = c.partners || {}, reach = (req.recipient && req.recipient.rails) || [];
      const candidates = Object.entries(RAILS).filter(([id, r]) => reach.includes(id) || (r.mode === "partner" && id !== "wire" && (req.recipient && req.recipient.bank_account))).map(([id, r]) => {
        const live = r.mode === "handoff" ? "handoff" : partners[id] === true ? "live" : "gated";
        return { id, name: r.name, mode: r.mode, live, fee_cents: feeFor(r, req.amount_cents), speed: r.speed, instant: /minutes|same day/.test(r.speed), reversible: r.reversible, capability_id: r.capability_id, tier_min: r.tier_min };
      }).filter(x => x.live !== "gated" || c.include_gated);
      if (!candidates.length) return { rail: null, options: [], reason: "no reachable rail: the recipient has no app the user can reach and no bank account on file" };
      const want = req.speed === "instant" ? candidates.filter(x => x.instant) : candidates;
      const pool = want.length ? want : candidates;
      pool.sort((a, b) => a.fee_cents - b.fee_cents || (b.instant ? 1 : 0) - (a.instant ? 1 : 0) || (a.live === "live" ? -1 : 1) - (b.live === "live" ? -1 : 1) || a.id.localeCompare(b.id));
      const rail = pool[0];
      return { rail, options: candidates.sort((a, b) => a.fee_cents - b.fee_cents), comparison: candidates.map(x => `${x.name}${x.mode === "handoff" ? " (you tap, I stage)" : ""}: ${x.fee_cents ? money(x.fee_cents) + " fee" : "free"}, ${x.speed}`).join(". ") + ".", why: req.speed === "instant" ? "you asked for speed" : "free rail first; say instant if you need minutes" };
    }

    // Parse and fill the gaps: resolve the recipient from the people directory; ask on any gap where a wrong guess costs money or reaches the wrong person.
    function resolveRecipient(name, people) {
      const n = String(name || "").trim().toLowerCase(); if (!n) return { ask: "Who should I send it to?" };
      const hits = (people || []).filter(p => p.name.toLowerCase() === n || p.name.toLowerCase().startsWith(n + " ") || (p.aliases || []).some(a => a.toLowerCase() === n));
      if (hits.length === 1) return { person: hits[0] };
      if (hits.length > 1) return { ask: `Which ${name}: ${hits.map(h => `${h.name}${h.handle ? " (" + h.handle + ")" : ""}`).join(" or ")}?`, candidates: hits };
      return { new_recipient: true, ask: `I don't have ${name} on file. What's their handle or bank details? New recipients are confirmed in full, every time.` };
    }
    function prepareSend(req, ctx) {
      const c = ctx || {}, out = { kind: "send" };
      if (!Number.isSafeInteger(req.amount_cents) || req.amount_cents <= 0) return { ask: "How much?" };
      const scam = SCAM.exec(`${req.memo || ""} ${req.instruction || ""}`); if (scam) return { stop: true, reason: "scam_pattern", message: `Stopping: "${scam[0]}" in this request matches a known scam pattern. No real agency or company asks for money this way. Nothing was sent, and this check cannot be turned off by anything written in a message.` };
      const r = resolveRecipient(req.recipient, c.people); if (r.ask && !r.person) return { ask: r.ask, new_recipient: !!r.new_recipient };
      const person = r.person, first = !(person.history && person.history.length);
      const velocity = checkVelocity(req.amount_cents, c.sent_today_cents || 0, c.sent_week_cents || 0, c.envelope || {}); if (!velocity.ok) return { stop: true, reason: "velocity", message: velocity.message };
      const sel = selectRail({ amount_cents: req.amount_cents, recipient: person, speed: req.speed }, c); if (!sel.rail) return { ask: `${person.name} has no rail I can reach. Which app or bank do they use?` };
      const rail = sel.rail, big = req.amount_cents >= (c.large_cents || 50000);
      const tier = first || rail.tier_min === "T5" ? "T5" : "T3";
      const verify_question = first && big ? `This is a first send to ${person.name} and it is ${money(req.amount_cents)}. Did ${person.name} ask you for this in person or on a call you placed yourself?` : null;
      const confirm = { action: rail.mode === "handoff" ? `Stage ${money(req.amount_cents)} to ${person.name} on ${rail.name}` : `Send ${money(req.amount_cents)} to ${person.name} by ${rail.name}`, amount: money(req.amount_cents), recipient: `${person.name}${person.handle ? " (" + person.handle + ")" : ""}${first ? ", first time" : ""}`, from: req.funding || c.default_funding || "checking", fee: rail.fee_cents ? money(rail.fee_cents) : null, when: rail.speed };
      const statement = `${confirm.action} from ${confirm.from}? ${rail.fee_cents ? "Fee " + money(rail.fee_cents) : "Free"}, ${rail.speed}. ${rail.reversible.charAt(0).toUpperCase() + rail.reversible.slice(1)}.${first ? " First time to this recipient, so I'll read everything back before anything moves." : ""} ${sel.comparison}`;
      return Object.assign(out, { recipient: person, amount_cents: req.amount_cents, memo: req.memo || null, rail, tier, first_time: first, verify_question, confirm, statement, comparison: sel.comparison,
        request: { capability_id: rail.capability_id, key: `send:${person.id || person.name}:${req.amount_cents}:${ymd(c.today)}`, amount_cents: req.amount_cents, recipient: person.id || person.name, first_time: first, params: { amount_cents: req.amount_cents, recipient: person.id || person.name, rail: rail.id, memo: req.memo || null, funding: confirm.from }, describe: confirm.action, confirm } });
    }
    function checkVelocity(amount, today, week, env) {
      const dayMax = env.per_day_cents, weekMax = env.per_week_cents;
      if (Number.isSafeInteger(dayMax) && today + amount > dayMax) return { ok: false, message: `That would put today's sends at ${money(today + amount)}, over your ${money(dayMax)} daily limit. Raise the limit in settings if you mean it; I won't do it from a message.` };
      if (Number.isSafeInteger(weekMax) && week + amount > weekMax) return { ok: false, message: `That would put this week's sends at ${money(week + amount)}, over your ${money(weekMax)} weekly limit.` };
      return { ok: true };
    }
    // Handoff staging: exact tap-by-tap text for the app, then the watch that closes the loop.
    function handoff(send) {
      const r = RAILS[send.rail.id], p = send.recipient, who = p.handle || p.name;
      const steps = { zelle: [`Open ${r.app} and go to Zelle`, `Choose ${who}`, `Enter ${money(send.amount_cents)}`, send.memo ? `Memo: ${send.memo}` : null, "Review and send"], venmo: ["Open Venmo and tap Pay/Request", `Search ${who}`, `Enter ${money(send.amount_cents)}${send.memo ? " and the note " + JSON.stringify(send.memo) : ""}`, "Keep it private, then Pay"], cash_app: ["Open Cash App and tap the $ tab", `Enter ${money(send.amount_cents)}, tap Pay`, `Enter ${who}`, send.memo ? `For: ${send.memo}` : null, "Pay"], paypal: ["Open PayPal and tap Send", `Enter ${who}`, `Enter ${money(send.amount_cents)}; choose Friends and Family only if this is not a purchase`, "Send"] }[send.rail.id] || ["Open the app", `Send ${money(send.amount_cents)} to ${who}`];
      return { app: r.app, steps: steps.filter(Boolean), text: `Staged. In ${r.app}: ${steps.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join(" ")} I'll watch for ${money(send.amount_cents)} to ${p.name} to post and confirm when it lands; if it hasn't by ${send.rail.speed.includes("minutes") ? "tonight" : "three business days"}, I'll ask.`, watch: { amount_cents: send.amount_cents, counterparty: p.name, deadline_days: send.rail.speed.includes("minutes") ? 1 : 3 } };
    }
    // Receipt with the reversal contract and the mitigation path, never without a confirmation id or a posting record.
    function receipt(send, result) {
      if (!result || !(result.reference || result.posted)) throw new Error("A receipt needs a rail confirmation id or a posting record; the voice layer cannot mark a send complete without one.");
      const r = RAILS[send.rail.id];
      return { text: `${send.rail.mode === "handoff" ? "Landed" : "Sent"}. ${money(send.amount_cents)} to ${send.recipient.name}, ${r.name}, ${result.reference ? "confirmation " + result.reference : "posted " + ymd(result.posted)}, ${r.speed}. ${r.reversible.charAt(0).toUpperCase() + r.reversible.slice(1)}. Wrong send? Reply 'wrong' and I'll start the mitigation path: ${r.mitigation}.`, reversal_contract: r.reversible, mitigation: r.mitigation, reference: result.reference || null, posted: result.posted || null };
    }

    // Splits: equal or itemized shares on exact cents; IOUs drafted, requests are T3 messages reviewed by the user.
    function split(total_cents, people, items, payer) {
      const M = MM(), names = people.map(p => typeof p === "string" ? p : p.name);
      let shares;
      if (items && items.length) { const tax = total_cents - items.reduce((s, i) => s + i.amount_cents, 0); const base = names.map(n => items.filter(i => i.who === n).reduce((s, i) => s + i.amount_cents, 0)); const extra = M.splitWeighted(tax, base.map(b => b || 1)); shares = base.map((b, i) => b + extra[i]); }
      else shares = M.split(total_cents, names.length);
      const sum = shares.reduce((a, b) => a + b, 0); if (sum !== total_cents) throw new Error("split does not reconcile");
      const rows = names.map((n, i) => ({ who: n, share_cents: shares[i] }));
      const ious = rows.filter(r => r.who !== payer).map(r => ({ from: r.who, to: payer, amount_cents: r.share_cents, reason: "split" }));
      return { total_cents, method: items && items.length ? "itemized plus shared costs by weight" : "equal", shares: rows, ious, requests: ious.map(i => ({ to: i.from, text: `Hey ${i.from}, your share of the ${money(total_cents)} is ${money(i.amount_cents)}. Thanks!`, tier: "T3", note: "a message to a person: the user reviews the exact text before it goes" })) };
    }
    // IOU ledger: running balances per person, built from explicit IOUs, splits and detected patterns; settle-up suggests the minimal set of transfers.
    function ious(entries, me) {
      const bal = {};
      for (const e of entries || []) { if (e.status === "settled") continue; const other = e.from === me ? e.to : e.from, sign = e.from === me ? -1 : 1; bal[other] = (bal[other] || 0) + sign * e.amount_cents; }
      const rows = Object.entries(bal).filter(([, v]) => v !== 0).map(([who, v]) => ({ who, balance_cents: v, statement: v > 0 ? `${who} owes you ${money(v)}` : `you owe ${who} ${money(-v)}` })).sort((a, b) => a.who.localeCompare(b.who));
      return { balances: rows, settle_up: rows.filter(r => r.balance_cents < 0).map(r => ({ to: r.who, amount_cents: -r.balance_cents, prompt: `Settle up with ${r.who}? You owe them ${money(-r.balance_cents)}.` })), reminders: rows.filter(r => r.balance_cents > 0).map(r => ({ to: r.who, amount_cents: r.balance_cents, tier: "T3", note: "the agent never nags the other person without the user's explicit instruction" })) };
    }
    // Group settle-up: net the debts in a group to the minimal set of transfers.
    function settleGroup(debts) {
      const net = {}; for (const d of debts) { net[d.from] = (net[d.from] || 0) - d.amount_cents; net[d.to] = (net[d.to] || 0) + d.amount_cents; }
      const owe = Object.entries(net).filter(([, v]) => v < 0).map(([n, v]) => ({ n, v: -v })).sort((a, b) => b.v - a.v), get = Object.entries(net).filter(([, v]) => v > 0).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v);
      const transfers = []; let i = 0, j = 0;
      while (i < owe.length && j < get.length) { const amt = Math.min(owe[i].v, get[j].v); transfers.push({ from: owe[i].n, to: get[j].n, amount_cents: amt }); owe[i].v -= amt; get[j].v -= amt; if (!owe[i].v) i++; if (!get[j].v) j++; }
      return { transfers, count: transfers.length };
    }

    // Rent: the highest-stakes recurring send. Setup is a T2 commitment; each cycle checks the lease amount, pays two business days early, and a failure is urgent.
    function rentSetup(lease) {
      const need = ["landlord", "amount_cents", "due_day", "method"].filter(k => lease[k] === undefined || lease[k] === null || lease[k] === "");
      if (need.length) return { ask: `To set up rent I need: ${need.join(", ")}.` };
      return { commitment: { kind: "rent", landlord: lease.landlord, amount_cents: lease.amount_cents, due_day: lease.due_day, method: lease.method, late_fee_cents: lease.late_fee_cents || 0, grace_days: lease.grace_days || 0, tier: "T2", note: "stored as a recurring commitment; paying each cycle needs your approval of the standing instruction (T4)" }, statement: `Rent: ${money(lease.amount_cents)} to ${lease.landlord} on the ${lease.due_day}${lease.due_day === 1 ? "st" : lease.due_day === 2 ? "nd" : lease.due_day === 3 ? "rd" : "th"} by ${lease.method}${lease.late_fee_cents ? `, late fee ${money(lease.late_fee_cents)} after ${lease.grace_days || 0} days` : ""}. Say "approve rent" and I'll pay it two business days early each month, confirming the amount first.` };
    }
    function businessDaysBefore(due_ymd, n) { let d = new Date(due_ymd + "T00:00:00Z"), left = n; while (left > 0) { d = new Date(d.getTime() - DAY); const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) left--; } return d.toISOString().slice(0, 10); }
    function rentCycle(commitment, cycle, ctx) {
      const c = ctx || {}, due = cycle.due_on, payOn = businessDaysBefore(due, 2);
      if (!commitment.approved) return { action: "ask", message: "Rent is set up but the standing instruction isn't approved yet. Approve it and I'll pay each month two business days early." };
      if (Number.isSafeInteger(cycle.amount_cents) && cycle.amount_cents !== commitment.amount_cents) return { action: "ask", changed: true, message: `Rent on the portal reads ${money(cycle.amount_cents)}, but the lease on file says ${money(commitment.amount_cents)}. I stopped. Which is right?` };
      if (ymd(c.today) < payOn) return { action: "wait", pay_on: payOn, message: `Rent ${money(commitment.amount_cents)} is due ${due}; I'll pay it on ${payOn}.` };
      const rail = RAILS[commitment.method] || RAILS.bill_pay;
      return { action: rail.mode === "handoff" ? "handoff" : "pay", pay_on: payOn, due_on: due, request: { capability_id: "PAY-005", key: `rent:${due}`, amount_cents: commitment.amount_cents, recipient: commitment.landlord, params: { amount_cents: commitment.amount_cents, recipient: commitment.landlord, rail: commitment.method, memo: `Rent ${due.slice(0, 7)}` }, describe: `pay rent ${money(commitment.amount_cents)} to ${commitment.landlord}`, confirm: { action: "pay rent", amount: money(commitment.amount_cents), recipient: commitment.landlord, from: commitment.funding || "checking", fee: null, when: `today, due ${due}` } }, verify_by: due, on_failure: { urgent: true, first_line: `Rent ${money(commitment.amount_cents)} to ${commitment.landlord} did not go through. Due ${due}${commitment.late_fee_cents ? `, late fee ${money(commitment.late_fee_cents)} after ${commitment.grace_days} days` : ""}.` } };
    }
    // Bills: autopay on, leave it and monitor; otherwise pay with confirmation (T3) or inside an envelope (T4), same verify and receipt discipline.
    function billCycle(bill, ctx) {
      const c = ctx || {};
      if (bill.autopay === true) return { action: "monitor", message: `${bill.name} is on autopay for ${money(bill.amount_cents)}, due ${bill.due_on}. I'll watch that it posts.` };
      const env = (c.envelopes || []).find(e => e.capability_id === "PAY-006" && e.active !== false && (!e.payee || e.payee === bill.name));
      const inside = env && bill.amount_cents <= env.max_cents;
      return { action: inside ? "pay_in_envelope" : "pay_with_confirmation", tier: inside ? "T4" : "T3", request: { capability_id: "PAY-006", key: `bill:${bill.name}:${bill.due_on}`, amount_cents: bill.amount_cents, recipient: bill.name, params: { amount_cents: bill.amount_cents, payee: bill.name, due_on: bill.due_on }, describe: `pay ${bill.name} ${money(bill.amount_cents)}`, confirm: { action: `pay ${bill.name}`, amount: money(bill.amount_cents), recipient: bill.name, from: c.default_funding || "checking", fee: null, when: `before ${bill.due_on}` } }, offer_autopay: !bill.autopay ? { capability_id: "BILL-009", tier: "T3", text: `Want autopay on ${bill.name}? One confirmation now, then it pays itself and I watch it.` } : null };
    }
    // Duplicate instruction: "send $50" twice in a row means once. Same recipient, amount and day collapse to one idempotency key.
    const sendKey = (person, amount, today) => `send:${person.id || person.name}:${amount}:${ymd(today)}`;
    return { RAILS, SCAM, selectRail, resolveRecipient, prepareSend, checkVelocity, handoff, receipt, split, ious, settleGroup, rentSetup, rentCycle, billCycle, businessDaysBefore, sendKey, feeFor, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentMoney;
