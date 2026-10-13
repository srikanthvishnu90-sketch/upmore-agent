  /* Money plans (Instinct spec docs 06, 07, 02: PAY-003/007/008/009/023/025, SAVE-001/006, SOC-002/005/006/008/010):
     the pure half of requests for money, scheduled and recurring sends, own-account
     transfers, autosave rules, the overdraft-prevention move, failed-payment triage,
     group expenses, shared goals, gifts and the household permission model. Every
     plan produces a loop request with an idempotency key, exact confirm fields and
     the tier the registry assigns; nothing here moves money. A plan that would
     overdraw, exceed a limit or reach a stranger says so instead. Loads after
     MoneyMath and AgentMoney (optional). */
  const AgentMoneyPlans = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const cents = t => Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100);
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const monthOf = s => ymd(s).slice(0, 7);
    const addMonths = (s, n) => { const d = new Date(dayMs(s)); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
    const businessDaysBefore = (s, n) => { let d = ymd(s), left = n; while (left > 0) { d = addDays(d, -1); const w = new Date(dayMs(d)).getUTCDay(); if (w !== 0 && w !== 6) left--; } return d; };
    // People resolve through the one recipient layer (42-agent-recipients.js): exact handle, then full name, then first
    // name; an ambiguous or look-alike name is asked about, never picked. A stored id is looked up directly.
    const Rec = () => { if (typeof AgentRecipients === "undefined") throw new Error("AgentMoneyPlans needs AgentRecipients loaded: every person-to-person flow resolves recipients through one layer."); return AgentRecipients; };
    const person = (people, who) => (people || []).find(p => p.id && p.id === who) || (() => { const r = Rec().resolve(who, people); return r.status === "saved" ? r.person : null; })();
    const askFor = (people, who, fallback) => { const r = Rec().resolve(who, people); return ["ambiguous", "lookalike", "unavailable"].includes(r.status) ? r.ask : fallback; };
    const request = (capability_id, key, params, describe, confirm, extra) => Object.assign({ capability_id, key, idempotency_key: key, params, describe, confirm }, extra || {});
    const acct = (accounts, id) => (accounts || []).find(a => a.id === id || a.nickname === id || a.kind === id) || null;
    // Rails are said by their names ("PayPal", "Cash App"), never by their ids.
    const RAIL_NAMES = { venmo: "Venmo", cash_app: "Cash App", paypal: "PayPal", zelle: "Zelle", ach: "ACH" };
    const railName = r => RAIL_NAMES[r] || String(r).toUpperCase();
    // A day the calendar has: 2026-02-30 is refused, never scheduled for a day that never comes.
    const realDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayMs(s)) && new Date(dayMs(s)).toISOString().slice(0, 10) === s;
    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

    // PAY-003: a request for money. Staged on the rail the person uses (the user taps send on the request), reminders in the tone asked for, settled when the matching credit lands.
    const TONES = { friendly: ["Hey {name}, when you get a sec: {amount} for {what}. No rush!", "Gentle nudge on the {amount} for {what} whenever works."], plain: ["Reminder: {amount} for {what} is still open.", "Second reminder: {amount} for {what}."], firm: ["{name}, the {amount} for {what} is now {days} days old. Can you send it today?", "Final reminder: {amount} for {what}, {days} days outstanding."] };
    function requestMoney(spec, ctx) {
      const c = ctx || {}, p = person(c.people, spec.from); if (!p) return { ask: askFor(c.people, spec.from, `Who is ${spec.from}? I only request money from people in your list, so a wrong name never gets a bill.`) };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      const rail = (p.rails || []).find(r => ["venmo", "cash_app", "paypal", "zelle"].includes(r)) || null;
      const r = { id: `req-${c.today}-${p.id}-${spec.amount_cents}`, from: p.id, name: p.name, amount_cents: spec.amount_cents, what: spec.what || "what you owe", rail, status: "open", created_on: c.today, tone: spec.tone || "friendly", reminders_sent: 0, handoff: rail ? `${railName(rail)} request to ${p.name}${p.handle ? ` (${p.handle})` : ""} for ${money(spec.amount_cents)}, note "${spec.what || "what you owe"}": staged, you tap Request.` : `${p.name} has no request rail on file; I'll draft the message and you pick how to collect.` };
      r.capability_id = "PAY-003"; r.tier = "T3";
      return { request: r, text: r.handoff };
    }
    function reminder(req, today) {
      const days = daysBetween(req.created_on, today), set = TONES[req.tone] || TONES.friendly, n = Math.min(req.reminders_sent, set.length - 1);
      if (req.status !== "open") return null;
      if (days < (req.tone === "firm" ? 3 : 7) * (req.reminders_sent + 1)) return null;
      return { request_id: req.id, text: set[n].replace("{name}", req.name.split(" ")[0]).replace(/\{amount\}/g, money(req.amount_cents)).replace(/\{what\}/g, req.what).replace("{days}", String(days)), tone: req.tone, days_open: days, capability_id: "SOC-009" };
    }
    function settleRequests(requests, transactions, people) {
      const credits = (transactions || []).filter(t => cents(t) > 0), out = [], used = new Set();
      for (const r of requests || []) { if (r.status !== "open") continue; const p = person(people, r.from); const hit = credits.find(t => !used.has(t) && cents(t) === r.amount_cents && ymd(t.posted_at) >= r.created_on && (!p || [p.name, p.handle].filter(Boolean).some(n => String(t.merchant_raw || "").toLowerCase().includes(String(n).toLowerCase().replace("@", ""))))); if (hit) { used.add(hit); r.status = "settled"; r.settled_by = hit.id; r.settled_on = ymd(hit.posted_at); out.push({ request_id: r.id, transaction_id: hit.id, text: `${r.name} paid the ${money(r.amount_cents)} for ${r.what} on ${ymd(hit.posted_at)}.` }); } }
      return out;
    }

    // C13 bridge: the shared-expense ledger. The chat IOU log (105-iou-log.js) holds per-person lines; these plans hold
    // the requests (PAY-003) that collect them. Until this bridge the two never met: a tagged transaction made no
    // line, a request settled without clearing the line. Three seams, all pure:
    //   fromTaggedTransaction(tx, tag)   a posted charge the user tagged as shared (tag.shared_with, tag.paid_by
    //                                    default "me", tag.what) -> ledger lines in the IOU log's own shape, one per
    //                                    person whose share touches the user, dated and sourced from the transaction
    //   requestFromIou(entry, ctx)       an owes_me line -> its PAY-003 request, stamped with the line's id, the source
    //                                    transaction id, and its rail reference: the rail id when staged on a
    //                                    handoff rail (staged, never delivered), or "NOT_WIRED" when the person has
    //                                    no request rail on file
    //   settleIous(ious, requests, txs)  settleRequests over the requests, then the lines those requests name are
    //                                    marked settled against the received payment row (settled_by = its id).
    //                                    No matching received payment: the line stays open, untouched.
    function fromTaggedTransaction(tx, tag) {
      if (!tx || !tag || !Array.isArray(tag.shared_with) || !tag.shared_with.length) return null;
      if (tx.is_pending) return null;
      const total = -cents(tx);
      if (!Number.isSafeInteger(total) || total <= 0) return null;
      const on = ymd(tx.posted_at || tx.posted_on);
      if (!on) return null;
      const payer = tag.paid_by || "me";
      const folks = [payer].concat(tag.shared_with.filter(n => typeof n === "string" && n.trim() && n !== payer));
      if (!folks.includes("me")) folks.push("me"); // the user is always a participant in their own shared expense
      if (folks.length < 2) return null;
      const MM = typeof MoneyMath !== "undefined" ? MoneyMath : null;
      const shares = MM ? MM.split(total, folks.length) : folks.map((_, i) => Math.trunc(total / folks.length) + (i < total % folks.length ? 1 : 0));
      const note = String(tag.what || tx.merchant_raw || "shared expense").replace(/\d{9,}/g, "#").replace(/\s+/g, " ").trim().slice(0, 40);
      const slug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const entries = [];
      folks.forEach((who, i) => {
        if (who === payer || shares[i] <= 0) return;
        const name = payer === "me" ? who : who === "me" ? payer : null;
        if (!name) return; // a share between two other people is their ledger, not the user's
        entries.push({ id: `iou-${tx.id || "tx"}-${slug(name)}`, name, direction: payer === "me" ? "owes_me" : "i_owe", amount_cents: shares[i], original_cents: shares[i], note, created_on: on, status: "open", transaction_id: tx.id || null });
      });
      return { transaction_id: tx.id || null, total_cents: total, payer, shares: folks.map((who, i) => ({ who, cents: shares[i] })), entries };
    }
    function requestFromIou(entry, ctx) {
      if (!entry || typeof entry.name !== "string" || !entry.name) return { ask: "Which IOU? Name the person and the amount." };
      if (entry.direction !== "owes_me") return { ask: `You owe ${entry.name} ${money(entry.amount_cents || 0)} — a request is only for money owed to you. Nothing was staged.` };
      const r = requestMoney({ from: entry.name, amount_cents: entry.amount_cents, what: entry.note || "what you owe" }, ctx || {});
      if (!r.request) return r;
      r.request.iou_id = entry.id || null;
      r.request.source_transaction_id = entry.transaction_id || null;
      r.request.rail_reference = r.request.rail || "NOT_WIRED";
      r.request.delivery = r.request.rail ? "staged" : "NOT_WIRED";
      return r;
    }
    function settleIous(ious, requests, transactions, people) {
      const settled = settleRequests(requests, transactions, people);
      const byId = new Map((requests || []).map(r => [r.id, r]));
      // Partial and overpaying receipts (K6): an exact match settles above; a smaller posted receipt from the
      // same person still counts — it reduces the line and the request, and the rest stays open. A larger one
      // settles the line and the overage is recorded, never silently kept. A receipt row is spent once, ever.
      const partials = [], overpaid = [];
      const used = new Set(settled.map(s => s.transaction_id));
      for (const r of requests || []) (r.settled_by ? used.add(r.settled_by) : null);
      const entryOf = id => (ious || []).find(e => e.id === id);
      for (const r of requests || []) {
        if (r.status !== "open" || !r.iou_id) continue;
        const entry = entryOf(r.iou_id); if (!entry || entry.status !== "open") continue;
        const p = person(people, r.from);
        const names = p ? [p.name, p.handle].filter(Boolean).map(n => String(n).toLowerCase().replace("@", "")) : [String(r.name || "").toLowerCase()];
        const hit = (transactions || []).filter(t => cents(t) > 0 && !used.has(t.id || t) && cents(t) !== r.amount_cents && ymd(t.posted_at) >= r.created_on && names.some(n => n && String(t.merchant_raw || "").toLowerCase().includes(n)))
          .sort((a, b) => ymd(a.posted_at) < ymd(b.posted_at) ? -1 : 1)[0];
        if (!hit) continue;
        used.add(hit.id || hit);
        const got = cents(hit);
        if (got < r.amount_cents) {
          r.amount_cents -= got; entry.amount_cents -= got;
          partials.push({ request_id: r.id, iou_id: r.iou_id, transaction_id: hit.id, paid_cents: got, remaining_cents: r.amount_cents, text: `${r.name} paid ${money(got)} of the ${money(got + r.amount_cents)} for ${r.what} on ${ymd(hit.posted_at)}; ${money(r.amount_cents)} is still open.` });
        } else {
          r.status = "settled"; r.settled_by = hit.id; r.settled_on = ymd(hit.posted_at);
          const over = got - r.amount_cents;
          entry.status = "settled"; entry.settled_on = r.settled_on; entry.settled_by = hit.id; if (over > 0) entry.overpaid_cents = over;
          overpaid.push({ request_id: r.id, iou_id: r.iou_id, transaction_id: hit.id, overpaid_cents: over, text: `${r.name} paid ${money(got)} for ${r.what} on ${ymd(hit.posted_at)} — ${money(over)} more than the ${money(r.amount_cents)} owed; the line is settled and the overage is ${r.name}'s to sort out with you.` });
          settled.push({ request_id: r.id, transaction_id: hit.id, text: `${r.name} paid the ${money(entry.original_cents || got)} for ${r.what} on ${ymd(hit.posted_at)}.` });
        }
      }
      if (!settled.length && !partials.length) return { ious, settled: [], partials: [] };
      const next = (ious || []).map(e => {
        if (e.status !== "open") return e;
        const hit = settled.find(s => { const rq = byId.get(s.request_id); return rq && rq.iou_id === e.id; });
        if (hit) return Object.assign({}, e, { status: "settled", settled_on: byId.get(hit.request_id).settled_on || null, settled_by: hit.transaction_id });
        const part = partials.find(s => s.iou_id === e.id);
        if (part) return Object.assign({}, e, { amount_cents: part.remaining_cents });
        return e;
      });
      return { ious: next, settled: settled.map(s => Object.assign({}, s, { iou_id: (byId.get(s.request_id) || {}).iou_id || null })), partials, overpaid };
    }

    // ---- K6 (C13 / C135 / C181): collections over the sandbox P2P rail, escalating reminders, receipt-only closing ----
    // Real P2P rails (Venmo, Zelle, Cash App, PayPal) have no consumer API, so at the live boundary they are
    // NOT_WIRED, said in those words. What CAN be proven end to end is the staged-send rail from PAY-001/PAY-003
    // work, run here as an explicit sandbox rail: requests are recorded in the rail's own outbox (delivery is
    // verified from that state, never asserted), receipts are posted into the rail's own inbox as feed rows, and
    // a debt closes only when settleIous matches a posted receipt row. A person's say-so ("they paid") is a
    // claim, recorded as a claim; it closes nothing. The sandbox is labeled sandbox everywhere it is named.
    function sandboxRail() {
      const outbox = [], inbox = [];
      return {
        kind: "sandbox_p2p",
        outbox, inbox,
        // Stage-and-deliver a PAY-003 request inside the sandbox: the entry in the outbox IS the delivery record.
        sendRequest(req, on) {
          const entry = { ref: `sbx-${outbox.length + 1}`, request_id: req.id, to: req.name, amount_cents: req.amount_cents, rail: req.rail || null, delivery: "sandbox_delivered", on: on || req.created_on };
          outbox.push(entry);
          req.delivery = "sandbox"; req.sandbox_ref = entry.ref; req.delivered_on = entry.on;
          return entry;
        },
        // A payment arriving: a feed-shaped row in the inbox (posted, never pending), named for its sender so the
        // one receipt matcher (settleRequests) can match it exactly as it matches a bank row.
        postReceipt(spec) {
          const row = { id: spec.id || `sbx-rcpt-${inbox.length + 1}`, account_id: "sandbox", posted_at: spec.on, posted_on: spec.on, amount_cents: spec.amount_cents, merchant_raw: `SANDBOX P2P FROM ${String(spec.from_handle || spec.from_name || "").replace(/^@/, "").toUpperCase()}`, is_pending: false, is_transfer: false };
          inbox.push(row);
          return row;
        },
        feed() { return inbox.slice(); },
        delivered(request_id) { return outbox.find(e => e.request_id === request_id) || null; },
      };
    }
    const NOT_WIRED_LINE = "Real rails are NOT_WIRED: Venmo and Zelle have no consumer API, so nothing was sent on a real rail. These requests went out only on the sandbox P2P rail (labeled sandbox), and each one closes only when its payment posts.";
    // C135: "get everyone who owes me to pay up" — one PAY-003 request per open owes_me line, delivered on the
    // sandbox rail when one is passed, with delivery read back from the rail's own outbox before it is claimed.
    function collectAll(ious, ctx) {
      const c = ctx || {}, rail = c.sandbox_rail || null;
      const openLines = (ious || []).filter(e => e && e.status === "open" && e.direction === "owes_me");
      const requests = [], lines = [], asks = [];
      let total = 0;
      for (const e of openLines) {
        const r = requestFromIou(e, c);
        if (!r.request) { asks.push(r.ask || `I can't stage a request for ${e.name}.`); continue; }
        total += r.request.amount_cents;
        if (rail && r.request.rail) { const sent = rail.sendRequest(r.request, c.today); r.request.delivery_verified = rail.delivered(r.request.id) === sent; }
        else if (rail) { r.request.delivery = "NOT_WIRED"; r.request.delivery_verified = false; }
        requests.push(r.request);
        lines.push(`${r.request.name}: ${money(r.request.amount_cents)} for ${r.request.what}${r.request.rail ? ` on ${railName(r.request.rail)}` : ""}${rail && r.request.sandbox_ref ? ` — sandbox ref ${r.request.sandbox_ref}, delivery verified in the sandbox outbox` : r.request.rail ? " — staged, you tap Request" : " — no request rail on file (NOT_WIRED), draft only"}.`);
      }
      if (!requests.length && !asks.length) return { requests, total_cents: 0, text: "Nobody owes you anything open in your ledger, so there's nothing to collect." };
      const text = [`Collecting ${money(total)} from ${requests.length} ${requests.length === 1 ? "person" : "people"}:`, ...lines, ...asks, NOT_WIRED_LINE, "Reminders follow on a schedule while a request stays open; a debt closes only when the payment actually posts."].join("\n");
      return { requests, total_cents: total, text };
    }
    // Escalating reminders (C135): polite first, plainer second, firm from the third. The schedule: +7 days,
    // +7 more, then every +3 days while the debt stays open. A settled request is never reminded.
    const ESCALATION = ["friendly", "plain", "firm"];
    const REMINDER_INTERVALS = [7, 7, 3];
    function reminderDueOn(req) {
      let d = req.created_on;
      for (let i = 0; i <= (req.reminders_sent || 0); i++) d = addDays(d, REMINDER_INTERVALS[Math.min(i, REMINDER_INTERVALS.length - 1)]);
      return d;
    }
    function dueReminders(requests, today) {
      const out = [];
      for (const req of requests || []) {
        if (!req || req.status !== "open") continue;
        if (today < reminderDueOn(req)) continue;
        const stage = ESCALATION[Math.min(req.reminders_sent || 0, ESCALATION.length - 1)];
        const probe = Object.assign({}, req, { tone: stage });
        const r = reminder(probe, today);
        if (!r) continue;
        req.reminders_sent = (req.reminders_sent || 0) + 1;
        req.tone_stage = stage; req.last_reminder_on = today;
        out.push(Object.assign({}, r, { tone: stage, stage: req.reminders_sent, text: r.text }));
      }
      return out;
    }
    // A "paid" claim with no posted receipt (C135 variant, C13 rule): recorded, and the debt stays open in words
    // and in state. Only settleIous over posted rows closes anything.
    function notePaidClaim(ious, requests, name) {
      const k = String(name || "").toLowerCase();
      const line = (ious || []).find(e => e && e.status === "open" && e.direction === "owes_me" && e.name.toLowerCase() === k);
      const req = (requests || []).find(r => r && r.status === "open" && r.name.toLowerCase() === k);
      if (!line && !req) return { closed: false, text: `I don't have an open debt for ${name}, so there's nothing to close.` };
      const amt = (line || req).amount_cents;
      return { closed: false, text: `Noted: ${name} says they paid the ${money(amt)}. That doesn't close it — a debt closes only when the payment posts. It's still open at ${money(amt)} and I'll keep watching for the receipt.` };
    }
    // C181: family subscription cost-sharing on the same ledger machinery. The plan's members are enumerated
    // from the plan audit the person confirms; the month's charge is a real posted row; each member's share is
    // an IOU line (fromTaggedTransaction, tagged with the service and month) plus its PAY-003 request. Receipts
    // track month to month because each month's charge makes its own lines, settled by settleIous per month.
    function subscriptionShares(spec, ctx) {
      const c = ctx || {};
      const charge = spec.charge || {};
      const tx = { id: charge.id || `sub-${spec.service}-${spec.month}`, account_id: charge.account_id || "chk", posted_at: charge.posted_on, posted_on: charge.posted_on, amount_cents: -Math.abs(charge.amount_cents || 0), merchant_raw: charge.merchant_raw || spec.service, is_pending: false, is_transfer: false };
      const led = fromTaggedTransaction(tx, { shared_with: spec.members || [], paid_by: "me", what: `${spec.plan_label || spec.service} — ${spec.month}` });
      if (!led) return { entries: [], requests: [], text: `I couldn't build the ${spec.service} shares for ${spec.month}: the charge has to be a posted charge with at least one member on the plan.` };
      for (const e of led.entries) { e.kind = "subscription_share"; e.service = spec.service; e.month = spec.month; }
      const requests = led.entries.map(e => requestFromIou(e, c).request).filter(Boolean);
      const per = led.entries.map(e => `${e.name} ${money(e.amount_cents)}`).join(", ");
      const text = `${spec.plan_label || spec.service} is ${money(led.total_cents)} for ${spec.month}, split ${led.shares.length} ways (${led.shares.map(s => `${s.who === "me" ? "you" : s.who} ${money(s.cents)}`).join(", ")}). Cost-share requests: ${per}. Each closes only when that member's payment posts.`;
      return { entries: led.entries, requests, total_cents: led.total_cents, shares: led.shares, text };
    }
    function subscriptionStatus(entries, month) {
      const rows = (entries || []).filter(e => e && e.kind === "subscription_share" && (!month || e.month === month));
      if (!rows.length) return `No cost-share lines for ${month || "that month"}.`;
      const parts = rows.map(e => e.status === "settled" ? `${e.name} paid ${money(e.original_cents)} (posted ${e.settled_on || "—"})` : `${e.name} still owes ${money(e.amount_cents)}`);
      const openTotal = rows.filter(e => e.status === "open").reduce((s, e) => s + e.amount_cents, 0);
      return `${rows[0].service} ${month || rows[0].month}: ${parts.join("; ")}.${openTotal ? ` ${money(openTotal)} still open.` : " All settled for the month."}`;
    }

    // PAY-007 / PAY-008: schedule a future payment and cancel it before the rail's cutoff.
    function schedulePayment(spec, ctx) {
      const c = ctx || {};
      const on = spec.on ? ymd(spec.on) : null;
      if (on && !realDay(on)) return { ask: "Which date? I could not read that as a calendar day." };
      if (!on || dayMs(on) <= dayMs(c.today)) return { ask: "Which date? It has to be after today." };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      const p = person(c.people, spec.to); if (!p) return { ask: askFor(c.people, spec.to, `Who is ${spec.to}? Add them first so a scheduled payment never goes to a stranger.`) };
      const rail = spec.rail || (p.bank_account ? "ach" : (p.rails || [])[0] || null), cutoff = rail === "ach" ? businessDaysBefore(on, 1) : addDays(on, -1);
      const s = { id: `sched-${on}-${p.id}-${spec.amount_cents}`, to: p.id, name: p.name, amount_cents: spec.amount_cents, on, rail, cutoff_on: cutoff, memo: spec.memo || null, status: "scheduled", created_on: c.today, capability_id: "PAY-007", tier: "T3" };
      s.text = `Scheduled: ${money(s.amount_cents)} to ${p.name} on ${s.on} by ${rail ? railName(rail) : "a rail you choose"}. You can cancel until ${cutoff}; after that it is in flight. I confirm with you the day before it goes.`;
      return { schedule: s, text: s.text };
    }
    function cancelScheduled(s, today) {
      if (s.status !== "scheduled") return { cancelled: false, text: `That payment is ${s.status}; nothing to cancel.` };
      if (dayMs(today) > dayMs(s.cutoff_on)) return { cancelled: false, in_flight: true, text: `The ${money(s.amount_cents)} to ${s.name} passed its cutoff on ${s.cutoff_on} and is in flight. ${s.rail === "ach" ? "An ACH can be recalled the same day through the bank; I can draft that request." : "I can draft a return request to the recipient."}` };
      s.status = "cancelled"; s.cancelled_on = today;
      return { cancelled: true, text: `Cancelled: ${money(s.amount_cents)} to ${s.name} on ${s.on}. Nothing will be sent.` };
    }
    // The scheduled payments that go out today, as loop requests (the loop still confirms per tier).
    function dueScheduled(schedules, today) {
      return (schedules || []).filter(s => s.status === "scheduled" && s.on === today).map(s => request("PAY-007", `${s.id}:send`, { amount_cents: s.amount_cents, recipient: s.name, rail: s.rail, memo: s.memo }, `Scheduled payment: ${money(s.amount_cents)} to ${s.name}`, { action: "Send", amount: money(s.amount_cents), recipient: s.name, timing: s.rail === "ach" ? "lands in 1-3 business days" : "today" }, { scheduled_id: s.id }));
    }

    // PAY-009: a transfer between the user's own accounts. Never overdraws the source; confirm fields name both ends.
    function ownTransfer(spec, ctx) {
      const c = ctx || {}, from = acct(c.accounts, spec.from), to = acct(c.accounts, spec.to);
      if (!from || !to) return { ask: `Which accounts? I know ${(c.accounts || []).map(a => a.nickname || a.id).join(", ")}.` };
      if (from.id === to.id) return { ask: "Those are the same account." };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      const avail = Number.isInteger(from.available_cents) ? from.available_cents : from.balance_cents;
      if (spec.amount_cents > avail) return { stop: true, reason: "insufficient", text: `${from.nickname || from.id} has ${money(avail)} available; ${money(spec.amount_cents)} would overdraw it. Nothing moved.` };
      const key = `transfer:${from.id}:${to.id}:${spec.amount_cents}:${c.today}`;
      return { request: request("PAY-009", key, { amount_cents: spec.amount_cents, from: from.id, to: to.id, recipient: to.id }, `Move ${money(spec.amount_cents)} from ${from.nickname || from.id} to ${to.nickname || to.id}`, { action: "Move", amount: money(spec.amount_cents), recipient: to.nickname || to.id, from: from.nickname || from.id, timing: from.institution && from.institution === to.institution ? "instant" : "1-2 business days", fee_cents: 0 }, { amount_cents: spec.amount_cents, recipient: to.id }), leaves_cents: avail - spec.amount_cents };
    }

    // SAVE-001: autosave rules. Round-ups on card spend, a payday sweep, a threshold sweep. Each run yields one transfer request with the rows that justify it.
    function autosave(rules, ctx) {
      const c = ctx || {}, rows = (c.transactions || []).map(t => Object.assign({}, t, { amount_cents: cents(t), posted_at: ymd(t.posted_at) })), out = [];
      for (const r of rules || []) {
        if (r.status === "paused") continue;
        const to = acct(c.accounts, r.to), from = acct(c.accounts, r.from); if (!to || !from) { out.push({ rule_id: r.id, skipped: "unknown account" }); continue; }
        const avail = Number.isInteger(from.available_cents) ? from.available_cents : from.balance_cents, floor = Number.isInteger(r.keep_at_least_cents) ? r.keep_at_least_cents : 10000;
        let amount = 0, basis = [], why = "";
        if (r.kind === "round_up") { const period = rows.filter(t => t.amount_cents < 0 && !t.is_transfer && !t.is_pending && (!r.account_id || t.account_id === r.account_id) && t.posted_at > (r.last_run_on || "0000") && t.posted_at <= c.today); amount = period.reduce((s, t) => s + ((100 - (-t.amount_cents % 100)) % 100), 0); basis = period.map(t => t.id); why = `round-ups on ${period.length} purchases since ${r.last_run_on || "the start"}`; }
        else if (r.kind === "payday_sweep") { const pay = rows.find(t => t.amount_cents > 0 && t.posted_at === c.today && /payroll|direct dep|salary/i.test(t.merchant_raw || "")); if (!pay) continue; amount = r.percent_bps ? divRound(pay.amount_cents * r.percent_bps, 10000) : r.amount_cents || 0; basis = [pay.id]; why = r.percent_bps ? `${r.percent_bps / 100} percent of today's ${money(pay.amount_cents)} paycheck` : `your fixed ${money(amount)} on payday`; }
        else if (r.kind === "threshold") { if (avail <= r.above_cents) continue; amount = avail - r.above_cents; basis = []; why = `${from.nickname || from.id} is ${money(amount)} above your ${money(r.above_cents)} line`; }
        if (amount <= 0) continue;
        if (r.max_cents && amount > r.max_cents) amount = r.max_cents;
        if (avail - amount < floor) { const cut = Math.max(0, avail - floor); if (cut <= 0) { out.push({ rule_id: r.id, skipped: `would leave ${from.nickname || from.id} under its ${money(floor)} floor` }); continue; } amount = cut; why += `, trimmed to keep ${money(floor)} in ${from.nickname || from.id}`; }
        const key = `autosave:${r.id}:${c.today}`;
        out.push({ rule_id: r.id, request: request("SAVE-001", key, { amount_cents: amount, from: from.id, to: to.id, recipient: to.id }, `Autosave ${money(amount)} to ${to.nickname || to.id} (${why})`, { action: "Move", amount: money(amount), recipient: to.nickname || to.id, from: from.nickname || from.id, timing: "today", fee_cents: 0 }, { amount_cents: amount, recipient: to.id, evidence: { rows: basis, rule: r.kind, computed: { amount_cents: amount, available_cents: avail, floor_cents: floor } } }) });
      }
      return out;
    }

    // SAVE-006: the overdraft-prevention move. From the first day under the buffer, the smallest transfer from savings that keeps checking above it, with the day it must land.
    function overdraftPrevention(ctx) {
      const c = ctx || {}, L = typeof AgentLedger !== "undefined" ? AgentLedger : null; if (!L) return null;
      const checking = (c.accounts || []).find(a => a.kind === "checking" && !a.hidden), savings = (c.accounts || []).filter(a => a.kind === "savings" && !a.hidden).sort((a, b) => b.balance_cents - a.balance_cents)[0];
      if (!checking || !savings) return null;
      const f = L.cashflowForecast({ today: c.today, accounts: [checking], transactions: c.transactions, rules: c.rules, horizons: [30] }), buffer = Number.isInteger(c.buffer_cents) ? c.buffer_cents : 10000;
      const first = (f.daily || []).find(d => d.balance_cents < buffer); if (!first) return { needed: false, text: `Checking stays above your ${money(buffer)} buffer for the next 30 days.` };
      const savAvail = Number.isInteger(savings.available_cents) ? savings.available_cents : savings.balance_cents, need = buffer - f.low_point.balance_cents, amount = Math.min(need, savAvail), landBy = addDays(first.on, -1);
      // Nothing in savings is not a $0.00 transfer to confirm: say so and ask for nothing.
      if (amount <= 0) return { needed: true, first_below: first, low_point: f.low_point, amount_cents: 0, short_cents: need, land_by: landBy, request: null, text: `Checking goes under your ${money(buffer)} buffer on ${first.on} and bottoms at ${money(f.low_point.balance_cents)} on ${f.low_point.on}. Savings has ${money(savAvail)} available, so there is nothing to move from it; checking is ${money(need)} short of the line.` };
      const key = `overdraft_prevention:${first.on}:${amount}`;
      return { needed: true, first_below: first, low_point: f.low_point, amount_cents: amount, short_cents: need - amount, land_by: landBy, request: request("SAVE-006", key, { amount_cents: amount, from: savings.id, to: checking.id, recipient: checking.id }, `Move ${money(amount)} from ${savings.nickname || savings.id} to ${checking.nickname || checking.id} before ${first.on}`, { action: "Move", amount: money(amount), recipient: checking.nickname || checking.id, from: savings.nickname || savings.id, timing: `by ${landBy}`, fee_cents: 0 }, { amount_cents: amount, recipient: checking.id, deadline: dayMs(landBy), urgent: f.low_point.balance_cents < 0, reason: `checking goes under ${money(buffer)} on ${first.on}` }), text: `Checking goes under your ${money(buffer)} buffer on ${first.on} and bottoms at ${money(f.low_point.balance_cents)} on ${f.low_point.on}. Moving ${money(amount)} from ${savings.nickname || savings.id} by ${landBy} keeps it above the line${need > amount ? `; savings covers ${money(amount)} of the ${money(need)} needed` : ""}.` };
    }

    // PAY-023: failed-payment triage. The cause decides the step; a retry is a new key that names the original, never a blind resend.
    const CAUSES = [[/insufficient|nsf|balance/i, "insufficient_funds"], [/closed|no account|invalid account|account not found/i, "account_closed"], [/routing|account number|details|invalid/i, "wrong_details"], [/limit|velocity|exceed/i, "limit"], [/timeout|unavailable|down|maintenance|rail/i, "rail_down"], [/declined|refused|risk/i, "declined"]];
    function triageFailed(outcome, ctx) {
      const c = ctx || {}, reason = String(outcome.reason || outcome.message || ""), cause = (CAUSES.find(([re]) => re.test(reason)) || [null, "unknown"])[1];
      const amount = outcome.amount_cents || (outcome.params && outcome.params.amount_cents) || 0, from = acct(c.accounts, outcome.params && outcome.params.from) || (c.accounts || []).find(a => a.kind === "checking");
      const avail = from ? (Number.isInteger(from.available_cents) ? from.available_cents : from.balance_cents) : null;
      const plan = { cause, original_key: outcome.idempotency_key || null, amount_cents: amount };
      if (cause === "insufficient_funds") { const nextIncome = c.next_income_on || null; plan.step = avail != null && avail >= amount ? "funds are there now; retry" : nextIncome ? `retry on ${nextIncome} when income lands, or move ${money(amount - (avail || 0))} from savings first` : "fund the account, then retry"; plan.retry_on = avail != null && avail >= amount ? c.today : nextIncome; plan.retry = avail != null && avail >= amount; }
      else if (cause === "account_closed" || cause === "wrong_details") { plan.step = "fix the recipient details with them before any retry; a retry with the same details fails the same way"; plan.retry = false; }
      else if (cause === "limit") { plan.step = "over a limit; split across days or raise the limit with the bank; I will not retry today"; plan.retry = false; }
      else if (cause === "rail_down") { plan.step = "the rail was unavailable; retry in an hour"; plan.retry = true; plan.retry_on = c.today; }
      else if (cause === "declined") { plan.step = "the rail declined it; the bank's reason decides the next step, I do not resend"; plan.retry = false; }
      else { plan.step = "unknown cause; I do not retry blind. Check the bank's message, then tell me"; plan.retry = false; }
      if (plan.retry && outcome.params) plan.request = request(outcome.capability_id || "PAY-001", `${outcome.idempotency_key || "send"}:retry:${c.today}`, Object.assign({}, outcome.params), `Retry: ${outcome.describe || "the failed payment"} (original ${outcome.idempotency_key || "?"})`, outcome.confirm || { action: "Send", amount: money(amount), recipient: outcome.params.recipient || "?" }, { retry_of: outcome.idempotency_key || null });
      plan.text = `${outcome.describe || "The payment"} failed: ${cause.replace(/_/g, " ")}. ${plan.step.charAt(0).toUpperCase() + plan.step.slice(1)}.${plan.request ? " The retry is a new confirmation." : ""}`;
      return plan;
    }

    // PAY-025: allowance or recurring family send. A saved person, a fixed amount, a cadence, a cap; one request per period under its own key.
    function allowance(spec, ctx) {
      const c = ctx || {}, p = person(c.people, spec.to); if (!p) return { ask: askFor(c.people, spec.to, `Who is ${spec.to}? Allowances only go to people in your list.`) };
      if (!(p.history && p.history.length) && !spec.first_send_confirmed) return { ask: `${p.name} has never received money from you. The first send is confirmed in full; after that the allowance runs on its cadence.`, new_recipient: true };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much each time?" };
      if (!["weekly", "biweekly", "monthly"].includes(spec.cadence)) return { ask: "Weekly, every two weeks, or monthly?" };
      if (spec.day != null && !(Number.isInteger(spec.day) && (spec.cadence === "monthly" ? spec.day >= 1 && spec.day <= 31 : spec.day >= 0 && spec.day <= 6))) return { ask: spec.cadence === "monthly" ? "Which day of the month, 1 to 31?" : "Which day of the week?" };
      const a = { id: `allow-${p.id}-${spec.cadence}-${spec.amount_cents}`, to: p.id, name: p.name, amount_cents: spec.amount_cents, cadence: spec.cadence, day: spec.day != null ? spec.day : null, rail: (p.rails || [])[0] || (p.bank_account ? "ach" : null), status: "active", created_on: c.today, max_per_month_cents: spec.max_per_month_cents || null, capability_id: "PAY-025", tier: "T4" };
      // Exact terms, and the truth about running it: envelope autonomy is off, so every send waits for the person's yes.
      const when = a.cadence === "monthly" ? `monthly on the ${ordinal(a.day || 1)}${(a.day || 1) > 28 ? " (the last day in shorter months)" : ""}` : `${a.cadence === "weekly" ? "every" : "every other"} ${WEEKDAYS[a.day != null ? a.day : 5]}`;
      a.text = `Allowance: ${money(a.amount_cents)} to ${p.name} ${when} by ${a.rail ? railName(a.rail) : "a rail you pick"}${a.max_per_month_cents ? `, never more than ${money(a.max_per_month_cents)} a month` : ""}. I ask for your yes before each send.`;
      return { allowance: a, text: a.text };
    }
    // Every other week counts from the allowance's own first day (the first chosen weekday on or after it was set), not
    // from 1970, so the first send is that day, then every 14 days. With no start on file it can't be placed: no send.
    function everyOther(a, today, dow) {
      const want = a.day != null ? a.day : 5;
      if (dow !== want || !a.created_on) return false;
      const startDow = new Date(dayMs(a.created_on)).getUTCDay(), first = addDays(a.created_on, (want - startDow + 7) % 7);
      const days = Math.round((dayMs(today) - dayMs(first)) / DAY);
      return days >= 0 && days % 14 === 0;
    }
    function dueAllowances(list, today, sentThisMonthByAllowance) {
      const out = [];
      for (const a of list || []) {
        if (a.status !== "active") continue;
        const d = new Date(dayMs(today)), dow = d.getUTCDay(), dom = d.getUTCDate(), lastDom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        // A monthly day past the month's end (the 31st in November, the 29th in February 2027) goes on its last day.
        const fires = a.cadence === "weekly" ? dow === (a.day != null ? a.day : 5) : a.cadence === "monthly" ? dom === Math.min(a.day || 1, lastDom) : everyOther(a, today, dow);
        if (!fires) continue;
        const sent = (sentThisMonthByAllowance || {})[a.id] || 0;
        if (a.max_per_month_cents && sent + a.amount_cents > a.max_per_month_cents) { out.push({ allowance_id: a.id, skipped: `this month's ${money(a.max_per_month_cents)} cap would be passed` }); continue; }
        out.push({ allowance_id: a.id, request: request("PAY-025", `${a.id}:${today}`, { amount_cents: a.amount_cents, recipient: a.name, rail: a.rail }, `Allowance: ${money(a.amount_cents)} to ${a.name}`, { action: "Send", amount: money(a.amount_cents), recipient: a.name, timing: a.rail === "ach" ? "lands in 1-3 business days" : "lands in minutes", fee_cents: 0 }, { amount_cents: a.amount_cents, recipient: a.name, cadence_requested: true }) });
      }
      return out;
    }

    // SOC-002 / SOC-005 / SOC-008 / SOC-010: group expenses, shared goals, gifts with a note, and the settled-debts feed that is off unless asked.
    function group(spec) {
      const g = { id: spec.id || `group-${String(spec.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: spec.name, members: spec.members.slice(), expenses: [], goal: spec.goal ? { name: spec.goal.name, target_cents: spec.goal.target_cents, by: spec.goal.by || null, contributions: [] } : null };
      return g;
    }
    function addExpense(g, e) {
      const MM = typeof MoneyMath !== "undefined" ? MoneyMath : null, among = e.among || g.members, shares = MM ? MM.split(e.amount_cents, among.length) : among.map((_, i) => Math.trunc(e.amount_cents / among.length) + (i < e.amount_cents % among.length ? 1 : 0));
      const row = { id: e.id || `exp-${g.expenses.length + 1}`, what: e.what, amount_cents: e.amount_cents, payer: e.payer, on: e.on, shares: among.map((m, i) => ({ who: m, cents: shares[i] })) };
      g.expenses.push(row); return row;
    }
    function groupBalances(g) {
      const net = {}; for (const m of g.members) net[m] = 0;
      for (const e of g.expenses) { net[e.payer] += e.amount_cents; for (const s of e.shares) net[s.who] -= s.cents; }
      const debts = []; for (const e of g.expenses) for (const s of e.shares) if (s.who !== e.payer) debts.push({ from: s.who, to: e.payer, amount_cents: s.cents });
      const M = typeof AgentMoney !== "undefined" ? AgentMoney : null;
      const settle = M ? M.settleGroup(debts).transfers : debts;
      return { balances: g.members.map(m => ({ who: m, net_cents: net[m], statement: net[m] > 0 ? `${m} is owed ${money(net[m])}` : net[m] < 0 ? `${m} owes ${money(-net[m])}` : `${m} is settled` })), settle_up: settle, total_cents: g.expenses.reduce((s, e) => s + e.amount_cents, 0) };
    }
    function goalPlan(g, today) {
      if (!g.goal) return null; const saved = g.goal.contributions.reduce((s, c) => s + c.amount_cents, 0), left = Math.max(0, g.goal.target_cents - saved), months = g.goal.by ? Math.max(1, Math.round(daysBetween(today, g.goal.by) / 30)) : 1;
      const MM = typeof MoneyMath !== "undefined" ? MoneyMath : null, shares = MM ? MM.split(left, g.members.length) : g.members.map(() => Math.trunc(left / g.members.length));
      // Rounded up to the cent, so the monthly amounts reach each share ("gets there" is true, not a cent short).
      const perMonth = shares.map(s => Math.ceil(s / months));
      return { name: g.goal.name, target_cents: g.goal.target_cents, saved_cents: saved, remaining_cents: left, by: g.goal.by, per_member: g.members.map((m, i) => ({ who: m, remaining_cents: shares[i], per_month_cents: perMonth[i] })), text: left ? `${g.goal.name}: ${money(saved)} of ${money(g.goal.target_cents)} in. ${g.members.map((m, i) => `${m} ${money(perMonth[i])}/month`).join(", ")} gets there${g.goal.by ? ` by ${g.goal.by}` : ""}.` : `${g.goal.name} is fully funded.` };
    }
    function contribute(g, who, amount_cents, on, ctx) { g.goal.contributions.push({ who, amount_cents, on }); return request("SOC-005", `goal:${g.id}:${who}:${on}:${amount_cents}`, { amount_cents, recipient: g.goal.account || g.name, from: ctx && ctx.from || null }, `${who}: ${money(amount_cents)} to ${g.goal.name}`, { action: "Move", amount: money(amount_cents), recipient: g.goal.name, timing: "today", fee_cents: 0 }, { amount_cents, recipient: g.goal.account || g.name }); }
    function gift(spec, ctx) {
      const c = ctx || {}, p = person(c.people, spec.to); if (!p) return { ask: askFor(c.people, spec.to, `Who is ${spec.to}?`) };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      if (!spec.occasion) return { ask: "What is the occasion? It goes in the note." };
      const on = spec.on || c.today, note = `${spec.occasion}${spec.message ? ": " + spec.message : ""}`;
      const r = request("SOC-008", `gift:${p.id}:${on}:${spec.amount_cents}`, { amount_cents: spec.amount_cents, recipient: p.name, memo: note, rail: (p.rails || [])[0] || null }, `Gift ${money(spec.amount_cents)} to ${p.name} for ${spec.occasion}`, { action: "Send", amount: money(spec.amount_cents), recipient: p.name, timing: on === c.today ? "today" : `on ${on}`, fee_cents: 0 }, { amount_cents: spec.amount_cents, recipient: p.name, send_on: on, occasion: spec.occasion });
      return { request: r, text: `${money(spec.amount_cents)} to ${p.name} ${on === c.today ? "today" : "on " + on} with the note "${note}". ${on === c.today ? "Confirm and it goes." : "I'll confirm with you that morning."}` };
    }
    function socialFeed(settled, prefs) {
      const on = !!(prefs && prefs.social_feed === true);
      if (!on) return { enabled: false, items: [], text: "The settled-debts feed is off. It stays off unless you turn it on; nothing is shared." };
      return { enabled: true, items: (settled || []).map(s => ({ text: `${s.from} and ${s.to} settled ${s.what || "up"}`, on: s.on })), text: `${(settled || []).length} settled.` };
    }

    // SOC-006: household roles. What each member may see and do; applied to account views and to loop requests.
    const ROLES = { owner: { see: "all", act: "all" }, partner: { see: "shared", act: "shared" }, viewer: { see: "shared", act: "none" }, teen: { see: "own", act: "own_limited" } };
    function household(spec) { return { id: spec.id || "household", members: spec.members.map(m => ({ id: m.id, name: m.name, role: ROLES[m.role] ? m.role : "viewer", limit_cents: m.limit_cents || null })) }; }
    function visibleTo(h, memberId, accounts) {
      const m = h.members.find(x => x.id === memberId); if (!m) return [];
      const r = ROLES[m.role];
      return (accounts || []).filter(a => r.see === "all" || (r.see === "shared" && (a.owners || []).length > 1) || (r.see === "own" && (a.owners || []).length === 1 && (a.owners || [])[0] === memberId) || (a.owners || []).includes(memberId) && r.see !== "shared");
    }
    function mayAct(h, memberId, req, accounts) {
      const m = h.members.find(x => x.id === memberId); if (!m) return { allowed: false, reason: "not in the household" };
      const r = ROLES[m.role]; if (r.act === "all") return { allowed: true };
      if (r.act === "none") return { allowed: false, reason: `${m.name} can see but not act` };
      const from = acct(accounts, req.params && req.params.from); const owners = from ? from.owners || [] : [];
      if (r.act === "shared") return owners.length > 1 && owners.includes(memberId) ? { allowed: true } : { allowed: false, reason: `${m.name} may only act on shared accounts` };
      if (owners.length !== 1 || owners[0] !== memberId) return { allowed: false, reason: `${m.name} may only act on their own account` };
      if (m.limit_cents && (req.params.amount_cents || 0) > m.limit_cents) return { allowed: false, reason: `over ${m.name}'s ${money(m.limit_cents)} limit; the owner approves above it` };
      return { allowed: true };
    }

    return { requestMoney, reminder, settleRequests, fromTaggedTransaction, requestFromIou, settleIous, sandboxRail, collectAll, dueReminders, reminderDueOn, notePaidClaim, subscriptionShares, subscriptionStatus, NOT_WIRED_LINE, schedulePayment, cancelScheduled, dueScheduled, ownTransfer, autosave, overdraftPrevention, triageFailed, allowance, dueAllowances, group, addExpense, groupBalances, goalPlan, contribute, gift, socialFeed, household, visibleTo, mayAct, ROLES, TONES, businessDaysBefore, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentMoneyPlans;
