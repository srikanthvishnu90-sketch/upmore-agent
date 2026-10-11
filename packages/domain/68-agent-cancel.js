  /* Cancel a subscription end to end from a text (Instinct spec docs 01, 07, 11, 16; depth protocol docs/depth/BILL-003.md;
     real-world C73). The dialogue, the route choice and the outcome rules over AgentSave (the inventory from the
     user's own charges), AgentMonitors (the claim verdict from the feed), AgentCards (the confirmation card), AgentLoop
     (tiers, confirmation, idempotency) and DataGuard (merchant text is data). Nothing here drives a browser or talks
     to a merchant: the connectors the session is given do: read("subscription_terms", {merchant}) for the provider's
     account read, read("merchant_record", {merchant}) for the read-back, the loop's write for the approved run,
     resume(run_id, code) for an OTP continuation, verify for the read-back. A cancellation is done when the merchant's
     record says cancelled and the next charge is gone; the feed confirms it after the billing date passes. Loads after
     AgentMonitors, AgentRecovery, AgentSave, AgentCards, AgentLoop, DataGuard. */
  const AgentCancel = (() => {
    const CAPABILITY = "BILL-003", DAY = 86400000, OTP_TTL_MS = 30 * 60000, GRACE_DAYS = 2;
    const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
    const addMonths = (d, n) => { const x = new Date(d + "T00:00:00Z"); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); x.setUTCDate(Math.min(day, new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate())); return x.toISOString().slice(0, 10); };

    // S02: the purchase channel from the charge descriptor. A store-billed subscription cannot be cancelled on the merchant's site.
    const STORE = [[/\b(apple\.com\/bill|apple\.com\/us|itunes|apl\*|app ?store)\b/i, "app_store"], [/\b(google \*|google play|googleplay|gooogle)\b/i, "play_store"], [/\b(amzn digital|amazon channels|prime video channels)\b/i, "marketplace"]];
    function channelOf(descriptor) { const d = String(descriptor || ""); for (const [re, ch] of STORE) if (re.test(d)) return ch; return "vendor"; }
    const keyOf = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    // S01: "cancel netflix" against the inventory built from the user's own charges; "that" resolves against the thread.
    function parse(text) {
      const t = String(text || "").trim();
      const batch = /\b(the ones|all the ones|everything|anything)\b.*\b(don'?t use|unused|not using|never use)\b/i.test(t) || /\bcancel (all|everything)\b/i.test(t);
      const that = /\b(cancel|stop|end|kill)\s+(that|it|this)\b/i.test(t) && !/\b(cancel|stop|end|kill)\s+(that|it|this)\s+[a-z]{3,}/i.test(t.replace(/\b(thing|one|subscription|sub)\b/gi, ""));
      const m = /\b(?:cancel|stop paying( for)?|end|kill|get rid of|unsubscribe( from)?)\s+(?:my\s+|the\s+)?([A-Za-z0-9][A-Za-z0-9 .&'+-]{0,40}?)(?=\s+(?:subscription|sub|plan|membership|account|please|now|today)\b|\s*[,.!?]|$)/i.exec(t);
      const merchant = that ? null : m ? m[m.length - 1].trim() : null;
      return { text: t, merchant: merchant && !/^(that|it|this|the ones)$/i.test(merchant) ? merchant : null, that, batch, undo: /^\s*(undo|resubscribe|put it back|reactivate)\b/i.test(t), status: /\b(did (it|that) work|is it (cancelled|canceled|done)|did you cancel|status of)\b/i.test(t), savings: /\b(how much (have|did) you sav|what (have|did) you sav|savings so far)/i.test(t) };
    }
    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const Save = typeof AgentSave !== "undefined" ? AgentSave : null, Mon = typeof AgentMonitors !== "undefined" ? AgentMonitors : null, Cards = typeof AgentCards !== "undefined" ? AgentCards : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Guard = typeof DataGuard !== "undefined" ? DataGuard : null;
      if (!Save || !Mon || !Cards || !Loop) throw new Error("AgentCancel needs AgentSave, AgentMonitors, AgentCards and AgentLoop loaded.");
      const conn = o.connectors; if (!conn || typeof conn.read !== "function") throw new Error("AgentCancel needs connectors with read, write, verify and resume.");
      const log = Array.isArray(o.log) ? o.log : [];
      // The run result is kept per idempotency key so the outcome rules can read it; the loop only keeps the reference.
      const runs = {};
      const wrapped = { read: (k, p) => conn.read(k, p), write: async (id, p, key) => { const r = await conn.write(id, p, key); runs[key] = r; return r; }, verify: (id, key, ref) => conn.verify(id, key, ref) };
      const loop = Loop.create({ registry: o.registry, connectors: wrapped, clock, log, memory: o.memory || null, control: o.control || null, envelopes: [], confirm_ttl_ms: o.confirm_ttl_ms || 10 * 60000, guard: Guard, compliance: o.compliance || null, partners: o.partners || {} });
      const cards = Cards.create({ clock, transcript: o.transcript });
      const directory = o.directory || {}; // merchant key -> { kind: "portal" | "store" | "guided", verified, human_only, steps, url }
      const cases = []; // one per cancellation: { merchant, key, route, terms, card_id, request, run, claim, state, otp }
      const lessons = {}; // merchant key -> failures
      let pending = null, queue = [], last_mentioned = o.last_mentioned || null;
      const say = (outcome, text, extra) => Object.assign({ outcome, text }, extra || {});
      async function readOr(kind, params) { try { const r = await conn.read(kind, params || {}); if (!r || !r.source || !r.as_of) return null; return r; } catch (_) { return null; } }

      // The save engine's inventory, plus store-billed subscriptions (Apple, Google, marketplace descriptors) that the
      // merchant-level detector does not list but that bill every month all the same.
      function inventory() {
        const inv = Save.subscriptions({ transactions: o.transactions || [], today: ymd(clock()) }).inventory.slice();
        const by = {};
        for (const tx of o.transactions || []) { const raw = String(tx.merchant_raw || tx.merchant || ""); if (channelOf(raw) === "vendor" || !(Number(tx.amount) < 0)) continue; (by[raw] = by[raw] || []).push(tx); }
        for (const [raw, rows] of Object.entries(by)) {
          if (rows.length < 2) continue;
          const sorted = rows.slice().sort((a, b) => String(a.posted_at).localeCompare(String(b.posted_at))), last = sorted[sorted.length - 1];
          const gaps = sorted.slice(1).map((r, i) => Math.round((Date.parse(String(r.posted_at).slice(0, 10) + "T00:00:00Z") - Date.parse(String(sorted[i].posted_at).slice(0, 10) + "T00:00:00Z")) / DAY));
          if (!gaps.every(g => g >= 25 && g <= 36)) continue;
          const amount_cents = Math.round(Math.abs(Number(last.amount)) * 100), name = raw.replace(/^(apple\.com\/bill|apple\.com\/us|itunes|apl\*|google \*|google play)\s*/i, "").trim() || raw;
          if (inv.some(s => keyOf(s.merchant) === keyOf(name))) continue;
          inv.push({ key: keyOf(name), merchant: name, amount_cents, interval: "monthly", monthly_cents: amount_cents, annual_cents: amount_cents * 12, since: String(sorted[0].posted_at).slice(0, 10), last: String(last.posted_at).slice(0, 10), next: addMonths(String(last.posted_at).slice(0, 10), 1), occurrences: rows.length, rows: sorted.map(r => ({ id: r.id, date: String(r.posted_at).slice(0, 10), amount: Number(r.amount), merchant: raw, merchant_raw: raw })), channel: channelOf(raw) });
        }
        return inv;
      }
      function resolve(query) {
        const inv = inventory(), q = keyOf(query);
        if (!q) return { none: true, inventory: inv };
        const hits = inv.filter(s => { const k = keyOf(s.merchant); return k === q || k.includes(q) || q.includes(k) || k.split(" ")[0] === q.split(" ")[0]; });
        if (hits.length === 1) return { one: hits[0], inventory: inv };
        if (hits.length > 1) return { many: hits, inventory: inv };
        return { none: true, inventory: inv };
      }
      // S02: route by channel first, then by what the directory knows about the merchant.
      function route(sub) {
        const channel = channelOf(sub.rows && sub.rows.length ? (sub.rows[sub.rows.length - 1].merchant_raw || sub.rows[sub.rows.length - 1].merchant || "") : sub.merchant);
        if (channel !== "vendor") return { kind: "store", channel, text: channel === "app_store" ? "through your Apple subscriptions page, where it is billed" : channel === "play_store" ? "through Google Play, where it is billed" : "through the marketplace that bills it", human_only: true };
        const d = directory[keyOf(sub.merchant)] || directory[keyOf(sub.merchant).split(" ")[0]];
        if (!d) return { kind: "unknown", channel, text: "no known cancellation route yet", human_only: true };
        if (d.human_only || d.kind === "guided") return { kind: "guided", channel, text: `with the steps I'll give you (${d.display_name || sub.merchant} only lets the account holder do it)`, human_only: true, steps: d.steps || [] };
        return { kind: "portal", channel, text: `via ${d.url || sub.merchant}`, human_only: false, verified: d.verified === true };
      }
      // S03: the terms are read from the provider, never assumed. Missing terms mean no card.
      async function terms(sub) {
        const r = await readOr("subscription_terms", { merchant: sub.merchant });
        if (!r || !r.value) return { missing: ["account read"], source: null };
        const f = r.value, missing = [];
        for (const k of ["plan", "access_until", "refund_policy", "next_charge_on"]) if (f[k] === undefined || f[k] === null || f[k] === "") missing.push(k);
        for (const k of ["fee_cents", "remaining_contract_cents"]) if (!Number.isSafeInteger(f[k])) missing.push(k);
        if (clock() - r.as_of > 48 * 3600000) missing.push("fresh read");
        return { missing, facts: f, source: r.source, as_of: r.as_of };
      }
      const undoText = t => t.resubscribe_until ? `Reply "undo" before ${t.resubscribe_until} and I'll resubscribe you at the same rate; after that it is a new signup at the current price.` : "Cancelling cannot be undone from here; a new signup would be at the current price.";

      async function stage(sub, ctx) {
        const r = route(sub), t = await terms(sub);
        if (t.missing.length) return say("needs_terms", `I need ${t.missing.join(", ")} from ${sub.merchant}'s account page before I ask you to confirm; I won't guess the terms.`, { missing: t.missing });
        const f = t.facts, cyc = { monthly: "mo", quarterly: "qtr", yearly: "yr" }[sub.interval] || sub.interval;
        const spec = { action: `Cancel ${sub.merchant} (${f.plan}, ${money(sub.amount_cents)}/${cyc})`, amount_cents: f.fee_cents, counterparty: sub.merchant, direction: "to", fee_cents: 0, total_cents: f.fee_cents, timing: `Last charge ${sub.last}. You keep access until ${f.access_until}; the ${sub.next} charge will not happen`, undo: undoText(f), lines: [`${f.fee_cents ? `Cancellation fee ${money(f.fee_cents)}. ` : ""}${f.remaining_contract_cents ? `Remaining contract ${money(f.remaining_contract_cents)}. ` : ""}Refunds: ${f.refund_policy}.`, r.human_only ? `This one is ${r.text}; I'll walk you through it and watch the ${sub.next} charge.` : `I will cancel ${r.text} and text you the confirmation.`, `Terms per ${t.source} as of ${new Date(t.as_of).toISOString().slice(0, 10)}.`] };
        const base = `${CAPABILITY}:${keyOf(sub.merchant)}:${sub.next}`;
        const done = cases.find(c => c.key.startsWith(base) && ["cancelled", "accepted", "running", "verified"].includes(c.state));
        if (done) return say("already_done", `${sub.merchant} was already cancelled${done.reference ? ` (confirmation ${done.reference})` : ""}; the ${sub.next} charge is being watched. I did not do it again.`);
        // A retry after a failed run is a new attempt under its own key; the loop never re-sends a key it has already written.
        const attempts = cases.filter(c => c.key.startsWith(base) && ["failed", "unknown", "tripwire", "not_confirmed", "otp_expired"].includes(c.state)).length;
        const key = attempts ? `${base}:a${attempts + 1}` : base;
        const request = { capability_id: CAPABILITY, key, idempotency_key: key, params: { merchant: sub.merchant, merchant_key: keyOf(sub.merchant), route: r.kind, channel: r.channel, amount_cents: f.fee_cents, subscription_amount_cents: sub.amount_cents, interval: sub.interval, access_until: f.access_until, next_charge_on: f.next_charge_on }, describe: spec.action, confirm: { action: spec.action, amount: money(f.fee_cents), recipient: sub.merchant, from: "your account", fee: null, when: `access until ${f.access_until}` }, draft_only: r.human_only, amount_cents: f.fee_cents };
        const w = await loop.wake({ kind: "message", request });
        if (w.outcome === "already_done") return say("already_done", w.message);
        if (w.outcome === "blocked") return say("blocked", w.message, { reason: w.reason });
        if (w.outcome !== "awaiting_confirmation") return say(w.outcome, w.message || null);
        const card = cards.issue(spec, { conversation: (ctx && ctx.conversation) || "default", channel: (ctx && ctx.channel) || "in_app" });
        if (!card.ok) { await loop.wake({ kind: "confirmation", confirmation_id: w.confirmation_id, approved: false }); return say("refused", `I could not put up the card: ${card.errors.join("; ")}.`); }
        const kase = { merchant: sub.merchant, key, sub, route: r, terms: f, terms_source: t.source, terms_as_of: t.as_of, card_id: card.card_id, confirmation_id: w.confirmation_id, request, state: "card", created_at: clock(), reference: null, run: null, claim: null, refund: null };
        cases.push(kase); pending = kase; last_mentioned = sub.merchant;
        return say("confirm", card.text, { card_id: card.card_id, merchant: sub.merchant, route: r.kind, fee_cents: f.fee_cents });
      }

      async function start(text, ctx) {
        const p = parse(text);
        if (p.undo) return undo(ctx);
        if (p.status) return status();
        if (p.savings) return savings();
        if (p.batch) { const unused = inventory().filter(s => o.unused ? o.unused.includes(keyOf(s.merchant)) : false); if (!unused.length) return say("ask", "Which ones? I don't have usage data to tell which you don't use; name them and I'll put up one card each."); queue = unused.slice(1); const first = await stage(unused[0], ctx); return Object.assign(first, { queued: queue.map(s => s.merchant), text: `${first.text} (${unused.length} to cancel, one at a time; this is 1 of ${unused.length}.)` }); }
        let query = p.merchant; if (p.that) { if (!last_mentioned) return say("ask", "Cancel which one? Nothing has been mentioned yet."); query = last_mentioned; }
        if (!query) return say("ask", "Cancel what? Name the subscription.");
        const r = resolve(query);
        if (r.many) return say("ask", `Which one: ${r.many.map(s => `${s.merchant} (${money(s.amount_cents)}/${s.interval === "monthly" ? "mo" : s.interval})`).join(" or ")}?`, { candidates: r.many.map(s => s.merchant) });
        if (r.none) return say("ask", `I don't see a ${query} charge on your linked cards${r.inventory.length ? ` (I see ${r.inventory.map(s => s.merchant).join(", ")})` : ""}. Which card is it on, or is it billed through Apple or Google?`, { inventory: r.inventory.map(s => s.merchant) });
        return stage(r.one, ctx);
      }

      // S04/S05/S06: the reply goes to the card layer; a fire becomes the loop's confirmation, and only then the run.
      async function reply(text, ctx) {
        const c = ctx || {}, r = cards.reply(text, { conversation: c.conversation || "default", channel: c.channel || "in_app", card_id: c.card_id });
        const kase = pending;
        if (r.outcome === "fire") {
          if (!kase) return say("nothing_pending", "There is no cancellation waiting on you.");
          pending = null;
          const w = await loop.wake({ kind: "confirmation", confirmation_id: kase.confirmation_id, approved: true });
          const out = await settle(w, kase, c);
          if (queue.length && ["cancelled", "accepted", "guided", "not_confirmed", "tripwire", "failed", "unknown", "otp"].includes(out.outcome) && out.outcome !== "otp") { const nxt = queue.shift(); const n = await stage(nxt, c); return Object.assign(out, { next: n, text: `${out.text} Next: ${n.text}` }); }
          return out;
        }
        if (r.outcome === "declined" || r.outcome === "never_mind" || r.outcome === "correction" || r.outcome === "new_request") { if (kase) { await loop.wake({ kind: "confirmation", confirmation_id: kase.confirmation_id, approved: false }); kase.state = "declined"; pending = null; queue = []; } return say(r.outcome, r.text || (r.outcome === "declined" ? "Okay, not cancelling. Nothing was changed." : "Okay. Nothing happened.")); }
        if (r.outcome === "expired") { if (kase) { await loop.wake({ kind: "confirmation", confirmation_id: kase.confirmation_id, approved: false }); kase.state = "expired"; pending = null; } return say("expired", r.text); }
        return say(r.outcome, r.text, r);
      }

      // S07/S08/S09/S13: what the run means. The receipt says cancelled only when the merchant's record does.
      async function settle(w, kase, ctx) {
        if (w.outcome === "draft_approved") { kase.state = "guided"; kase.claim = claimFor(kase); return say("guided", `${kase.merchant} is ${kase.route.text}. ${kase.route.steps && kase.route.steps.length ? "Steps: " + kase.route.steps.map((s, i) => `${i + 1}. ${s}`).join(" ") + " " : ""}Tell me when it's done; either way I'm watching the ${kase.sub.next} charge and will confirm on ${addDays(kase.sub.next, GRACE_DAYS + 1)}.`, { claim: kase.claim, steps: kase.route.steps || [] }); }
        if (w.outcome === "declined") { kase.state = "declined"; return say("declined", "Okay, not cancelling. Nothing was changed."); }
        if (w.outcome === "expired") { kase.state = "expired"; return say("expired", w.message); }
        const run = kase.run || lastRun(kase);
        if (run && run.status === "otp_required" && !(kase.otp && kase.otp.used_at)) return otpAsk(kase, run);
        if (w.outcome === "unknown") { kase.state = "unknown"; return say("unknown", `${w.message} ${kase.merchant} may still be active; I'll read the account back before anything else.`); }
        if (w.outcome === "failed" && !run) return failure(kase, { category: "rail", error: w.message });
        if (w.outcome !== "confirmed" && w.outcome !== "already_done" && w.outcome !== "failed") return say(w.outcome, w.message || null);
        return readBack(kase, ctx);
      }
      async function readBack(kase) {
        const run = kase.run || lastRun(kase);
        const rec = await readOr("merchant_record", { merchant: kase.merchant });
        const state = rec && rec.value ? rec.value.state : null;
        if (run && run.stopped_at_tripwire) return tripwire(kase, run);
        if (run && run.status === "otp_required") return otpAsk(kase, run);
        if (run && run.ok === false) return failure(kase, run);
        const evidenceText = run && run.confirmation_text ? (Guard ? Guard.wrap(String(run.confirmation_text)).value : String(run.confirmation_text)) : null;
        const hasEvidence = !!(run && run.reference) || !!(evidenceText && /cancell?ed|won'?t be charged|no longer be billed|ends on/i.test(evidenceText));
        if (state !== "cancelled" || !hasEvidence) {
          kase.state = "not_confirmed"; kase.claim = claimFor(kase);
          return say("not_confirmed", `I ran the cancellation at ${kase.merchant} but ${state === "cancelled" ? "could not capture a confirmation" : `the account still reads ${state || "unreadable"}`}, so I am not calling it cancelled. I'll keep the ${kase.sub.next} charge under watch and tell you on ${addDays(kase.sub.next, GRACE_DAYS + 1)} either way; if you see a confirmation email, forward it.`, { claim: kase.claim, record_state: state });
        }
        if (rec.value.next_charge_on) { kase.state = "accepted"; kase.reference = run.reference || null; kase.claim = claimFor(kase); return say("accepted", `${kase.merchant} accepted the cancellation${kase.reference ? ` (confirmation ${kase.reference})` : ""}, but its record still shows a charge on ${rec.value.next_charge_on}. I'll watch that date and confirm after it.`, { reference: kase.reference, claim: kase.claim }); }
        kase.state = "cancelled"; kase.reference = run.reference || null; kase.claim = claimFor(kase); kase.cancelled_at = clock();
        const refund = await maybeRefund(kase);
        return say("cancelled", `${kase.merchant} cancelled${kase.reference ? `, confirmation ${kase.reference}` : ""} (${rec.source}, as of ${new Date(rec.as_of).toISOString().slice(0, 16).replace("T", " ")} UTC). You keep access until ${kase.terms.access_until}; the ${kase.sub.next} charge is gone from their record. ${refund ? refund.text + " " : ""}${undoText(kase.terms)} I'll confirm from your statement on ${addDays(kase.sub.next, GRACE_DAYS + 1)}.`, { reference: kase.reference, claim: kase.claim, refund: refund ? refund.request : null, access_until: kase.terms.access_until });
      }
      const lastRun = kase => runs[kase.key] || null;
      const claimFor = kase => ({ merchant: kase.merchant, merchant_key: keyOf(kase.merchant), amount_cents: kase.sub.amount_cents, billing_interval: kase.sub.interval, expected_billing_date: kase.sub.next, grace_days: GRACE_DAYS, status: "open", created_at: ymd(clock()), reference: kase.reference || null, route: kase.route.kind });
      const quoted = s => { const v = Guard ? String(Guard.wrap(String(s)).value) : String(s); return v.replace(/^["\u201c]+|["\u201d]+$/g, ""); };
      function tripwire(kase, run) { kase.state = "tripwire"; return say("tripwire", `I stopped before changing anything: ${kase.merchant} offered "${quoted(run.offer || run.stopped_at_tripwire)}" instead of cancelling, and I don't accept plan changes for you. ${kase.merchant} is still active and nothing changed. Do you want that offer, or should I go on to cancel?`, { offer: run.offer || null, tripwire: run.stopped_at_tripwire }); }
      function otpAsk(kase, run) { kase.state = "otp"; kase.otp = { run_id: run.run_id, expires_at: clock() + OTP_TTL_MS, asked_at: clock() }; pending = null; return say("otp", `${kase.merchant} sent a one-time code to ${run.hint || "you"}. Reply with just the code; I use it once for this run and never keep it. It is good for 30 minutes.`, { run_id: run.run_id }); }
      // S09: the code is a bounded continuation of the approved run. It is never logged, stored or echoed.
      async function otp(code, ctx) {
        const kase = cases.filter(c => c.state === "otp").pop(); if (!kase) return say("nothing_pending", "No code is needed right now.");
        const c = String(code || "").trim(); if (!/^\d{4,8}$/.test(c)) return say("ask", "That doesn't look like the code; reply with just the digits.");
        if (clock() > kase.otp.expires_at) { kase.state = "otp_expired"; return say("otp_expired", `That code window closed after 30 minutes. Say "cancel ${kase.merchant}" again and I'll start a fresh run; nothing changed.`); }
        if (typeof conn.resume !== "function") return failure(kase, { category: "no_resume", error: "the run cannot be resumed here" });
        let run; try { run = await conn.resume(kase.otp.run_id, c); } catch (e) { return failure(kase, { category: "resume_failed", error: String(e && e.message || e) }); }
        kase.run = run; runs[kase.key] = run; kase.otp = Object.assign({}, kase.otp, { used_at: clock() });
        // The approved run continues under its own key: the loop reconciles by read-back, it never writes again.
        if (loop.state === "FOLLOW_UP_SCHEDULED") { const w = await loop.wake({ kind: "follow_up" }); return settle(w, kase, ctx); }
        return readBack(kase, ctx);
      }
      function failure(kase, run) {
        const cat = run.category || "unknown", k = keyOf(kase.merchant); lessons[k] = (lessons[k] || 0) + 1; kase.state = "failed";
        const what = { login_failed: "the login did not work", page_changed: "the merchant's cancellation page has changed and the steps no longer match", human_only: "this one can only be done by the account holder", rail: run.error || "the run did not complete", no_resume: run.error, resume_failed: run.error }[cat] || run.error || "the run did not complete";
        const next = lessons[k] >= 2 ? `I've now failed twice at ${kase.merchant}, so I won't retry blindly; here are the steps to do it yourself, and I'll watch the ${kase.sub.next} charge.` : cat === "login_failed" ? "Check the saved login or sign in once in your browser; then say \"cancel again\" and I'll retry." : "Say \"cancel again\" to retry, or I can give you the steps.";
        return say("failed", `I could not cancel ${kase.merchant}: ${what}. ${kase.merchant} is still active and nothing changed. ${next}`, { category: cat, attempts: lessons[k], retry_allowed: lessons[k] < 2 });
      }
      // S12: refund where the policy allows and a charge just posted. Its credit is tracked, never counted as savings.
      async function maybeRefund(kase) {
        const pol = String(kase.terms.refund_policy || "").toLowerCase(), lastCharge = kase.sub.last, days = Math.round((Date.parse(ymd(clock()) + "T00:00:00Z") - Date.parse(lastCharge + "T00:00:00Z")) / DAY);
        const m = /within (\d+) days?/.exec(pol); const eligible = /prorat|pro-rat/.test(pol) || (m && days <= Number(m[1]));
        if (!eligible) return null;
        const req = { merchant: kase.merchant, charge_date: lastCharge, amount_cents: kase.sub.amount_cents, requested_at: clock(), reference: null, status: "requested" };
        const w = await (typeof conn.requestRefund === "function" ? conn.requestRefund(req).catch(() => null) : null);
        req.reference = w && w.reference ? w.reference : null; req.status = req.reference ? "requested" : "to_request";
        kase.refund = req;
        return { request: req, text: req.reference ? `A refund of ${money(kase.sub.amount_cents)} for the ${lastCharge} charge is requested (ref ${req.reference}); it counts when the credit posts.` : `The ${lastCharge} charge is refundable under their policy; the refund request is the next step.` };
      }
      // S11/S14: the feed is the verifier. A charge after the claim reverses the entry and offers the dispute path.
      function check(transactions, today, dataThrough) {
        const out = [];
        for (const kase of cases) {
          if (!kase.claim || kase.claim.status === "verified" || kase.claim.status === "zombie") continue;
          const v = Mon.cancelClaimVerdict(kase.claim, transactions || [], today || ymd(clock()), dataThrough || today || ymd(clock()));
          if (v.status === "charged") { kase.claim.status = "zombie"; kase.state = "charged_after"; out.push({ merchant: kase.merchant, status: "zombie", text: `${v.reason} That cancellation did not hold: I've reversed the avoided-charge entry${kase.reference ? ` and have confirmation ${kase.reference} to dispute it with` : ""}. Want me to open the dispute?`, charge: v.charges[0] }); }
          else if (v.status === "confirmed" || v.status === "verified") { kase.claim.status = "verified"; kase.claim.verified_on = today; kase.state = "verified"; out.push({ merchant: kase.merchant, status: "verified", text: `${kase.merchant} is confirmed cancelled: no charge on ${kase.claim.expected_billing_date} through ${dataThrough || today} (your statement, as of ${dataThrough || today}). ${money(kase.sub.amount_cents)} per ${kase.sub.interval === "monthly" ? "month" : kase.sub.interval} now counts as saved.` }); }
          else out.push({ merchant: kase.merchant, status: v.status, text: v.reason });
          if (kase.refund && kase.refund.status !== "posted") { const credit = (transactions || []).find(t => t.posted_at >= ymd(kase.refund.requested_at) && Math.round(Number(t.amount || 0) * 100) === kase.refund.amount_cents && keyOf(t.merchant_raw || t.merchant).includes(keyOf(kase.merchant).split(" ")[0])); if (credit) { kase.refund.status = "posted"; kase.refund.posted_on = credit.posted_at; out.push({ merchant: kase.merchant, status: "refund_posted", text: `The ${money(kase.refund.amount_cents)} refund from ${kase.merchant} posted on ${credit.posted_at}.` }); } }
        }
        return out;
      }
      function status() { const kase = cases.filter(c => c.claim).pop(); if (!kase) return say("answer", "I haven't cancelled anything yet."); const cl = kase.claim; const line = cl.status === "verified" ? `${kase.merchant}: confirmed cancelled, no charge through ${cl.verified_on} (your statement).` : cl.status === "zombie" ? `${kase.merchant}: it charged you after the cancellation; the claim is reopened.` : kase.state === "cancelled" ? `${kase.merchant}: cancelled per their record${kase.reference ? ` (confirmation ${kase.reference})` : ""}; I'm watching the ${cl.expected_billing_date} charge and will confirm on ${addDays(cl.expected_billing_date, GRACE_DAYS + 1)}.` : `${kase.merchant}: ${kase.state.replace(/_/g, " ")}; the ${cl.expected_billing_date} charge is under watch.`; return say("answer", line, { state: kase.state, claim: cl }); }
      // S15: verified savings are charges that did not happen after the date passed; everything else is a projection, labeled.
      function savings() {
        const verified = cases.filter(c => c.claim && c.claim.status === "verified"), live = cases.filter(c => c.claim && ["open"].includes(c.claim.status) && ["cancelled", "accepted"].includes(c.state));
        const vsum = verified.reduce((s, c) => s + c.sub.amount_cents, 0), proj = live.reduce((s, c) => s + c.sub.monthly_cents, 0), refunds = cases.filter(c => c.refund && c.refund.status === "posted").reduce((s, c) => s + c.refund.amount_cents, 0);
        return say("answer", `Verified: ${money(vsum)}${verified.length ? ` (${verified.map(c => `${c.merchant} ${money(c.sub.amount_cents)} on ${c.claim.expected_billing_date}, your statement as of ${c.claim.verified_on}`).join("; ")})` : " so far"}. Projected, not yet verified: ${money(proj)} a month${live.length ? ` (${live.map(c => c.merchant).join(", ")}; confirmed only after each billing date passes)` : ""}.${refunds ? ` Refunds received: ${money(refunds)}, counted separately from savings.` : ""}`, { verified_cents: vsum, projected_monthly_cents: proj, refunds_cents: refunds });
      }
      // S14: undo inside the access period is a resubscribe card; after it, honesty.
      async function undo(ctx) {
        const kase = cases.filter(c => c.state === "cancelled" || c.state === "verified").pop(); if (!kase) return say("nothing_to_undo", "Nothing recent to undo.");
        const until = kase.terms.resubscribe_until; const today = ymd(clock());
        if (!until) return say("cannot_undo", `${kase.merchant} can't be reinstated from here; a new signup would be at the current price.`);
        if (today > until) return say("past_window", `${kase.merchant}'s reinstatement window ended ${until}; a new signup would be at the current price.`);
        const card = cards.issue({ action: `Resubscribe to ${kase.merchant} (${kase.terms.plan})`, amount_cents: kase.sub.amount_cents, counterparty: kase.merchant, direction: "to", fee_cents: 0, total_cents: kase.sub.amount_cents, timing: `Same ${money(kase.sub.amount_cents)}/${kase.sub.interval === "monthly" ? "mo" : kase.sub.interval} rate, billing resumes ${kase.sub.next}`, undo: `You can cancel again any time; the same terms apply.` }, { conversation: (ctx && ctx.conversation) || "default", channel: (ctx && ctx.channel) || "in_app" });
        return say("undo_card", card.text, { card_id: card.card_id });
      }
      async function recordRun(key, run) { const kase = cases.find(c => c.key === key); if (kase) kase.run = run; }
      return { start, reply, otp, check, status, savings, undo, parse, resolve, route, inventory, recordRun, cases, loop, cards, get pending() { return pending ? { merchant: pending.merchant, card_id: pending.card_id } : null; } };
    }
    return { create, parse, channelOf, keyOf, CAPABILITY, OTP_TTL_MS, GRACE_DAYS };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentCancel;
