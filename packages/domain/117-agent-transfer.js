  /* Own-account transfers (PAY-009; real-world C30, and the preventive move C29 stages): "move $500 from
     Everyday Checking to High Yield Savings" stages the money-plans transfer (60-agent-money-plans.js) on a
     confirmation card in chat, and a yes executes it through the loop (43-agent-loop.js) on the injected rail,
     verified by read-back before anything is called done. Pure and deterministic: accounts, connectors, the
     capability registry, compliance and the clock are injected, so the whole path runs in tests on a fake rail.
     The loop's own gates decide what may stage: the registry status, the compliance partner check (a real rail
     needs a licensed money-movement partner and a verified identity) and the confirmation itself. With no
     partner in place the staging stops at that gate with its specific message; nothing is staged that the
     stack cannot honor, and a card is never answered with a success the rail did not confirm. */
  const AgentTransfer = (() => {
    const CAPABILITY = "PAY-009";
    const DAY = 86400000;
    const money = c => "$" + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const KINDS = { checking: "checking", savings: "savings", cash: "cash", money_market: "savings", moneymarket: "savings" };

    // Accounts arrive as bank rows (account_id, name, account_kind, cents) or as domain rows (id, nickname,
    // kind); both normalize to the one shape the money-plans builder reads. Disconnected rows never resolve.
    function normalizeAccounts(rows) {
      return (Array.isArray(rows) ? rows : []).filter(a => a && a.status !== "disconnected").map(a => {
        const id = a.account_id || a.id, name = a.name || a.nickname || id;
        const kind = KINDS[norm(a.account_kind || a.kind).replace(/ /g, "_")] || "other";
        return { id, nickname: name, name, kind, institution: a.institution || null, currency: a.currency || "USD",
          balance_cents: Number.isSafeInteger(a.balance_cents) ? a.balance_cents : null,
          available_cents: Number.isSafeInteger(a.available_cents) ? a.available_cents : undefined, source: a.source || null, as_of: a.as_of || a.balance_as_of || a.fetched_at || null };
      }).filter(a => a.id);
    }

    // One account by the words the person used: its full name, its id, or its kind ("savings", "my checking
    // account"). More than one match is ambiguity, never a guess.
    function resolve(query, accounts) {
      let q = norm(query).replace(/^(my|the)\s+/, "").replace(/\s+account$/, "").trim();
      if (!q) return null;
      const byId = accounts.find(a => a.id === query || norm(a.id) === q);
      if (byId) return { account: byId };
      const exact = accounts.filter(a => norm(a.name) === q);
      if (exact.length === 1) return { account: exact[0] };
      if (exact.length > 1) return { ambiguous: exact };
      const kind = KINDS[q.replace(/ /g, "_")];
      if (kind) { const ks = accounts.filter(a => a.kind === kind); if (ks.length === 1) return { account: ks[0] }; if (ks.length > 1) return { ambiguous: ks }; }
      const part = accounts.filter(a => q.length >= 3 && (norm(a.name).includes(q) || norm(`${a.institution || ""} ${a.name}`).includes(q)));
      if (part.length === 1) return { account: part[0] };
      if (part.length > 1) return { ambiguous: part };
      return null;
    }

    // "move/transfer/shift $A from X to Y", or "... to Y" with the source inferred only when exactly one other
    // deposit account could fund it. Send/pay verbs are person flows and never parse here.
    function parse(text) {
      const t = String(text || "");
      if (!/\b(move|transfer|shift)\b/i.test(t)) return null;
      const amt = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(t) || /\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)\b/i.exec(t);
      const amount_cents = amt ? Math.round(Number(amt[1].replace(/,/g, "")) * 100) : null;
      const fromM = /\bfrom\s+(.+?)(?=\s+to\s+|$)/i.exec(t);
      const toM = /\bto\s+(.+?)\s*[.!?]*\s*$/i.exec(t);
      const clean = s => s ? s.replace(/\s+(please|now|today|for me)\s*$/i, "").trim() : null;
      const from_query = fromM ? clean(fromM[1]) : null, to_query = toM ? clean(toM[1]) : null;
      if (!from_query && !to_query) return null;
      return { amount_cents, from_query, to_query, text: t };
    }
    const intent = text => { const p = parse(text); return !!p && !!(p.from_query || p.to_query); };

    // Both ends resolved to distinct own accounts, or the precise gap: which end is missing or ambiguous.
    function resolveMove(parsed, accounts) {
      const p = parsed || {};
      let to = null, from = null;
      if (p.to_query) { const r = resolve(p.to_query, accounts); if (r && r.ambiguous) return { ambiguous: { which: "to", options: r.ambiguous } }; if (r) to = r.account; }
      if (p.from_query) { const r = resolve(p.from_query, accounts); if (r && r.ambiguous) return { ambiguous: { which: "from", options: r.ambiguous } }; if (r) from = r.account; }
      if (to && !from) {
        const others = accounts.filter(a => a.id !== to.id && (a.kind === "checking" || a.kind === "savings" || a.kind === "cash"));
        const fund = to.kind === "savings" ? others.filter(a => a.kind === "checking") : to.kind === "checking" ? others.filter(a => a.kind === "savings") : others;
        if (fund.length === 1) from = fund[0];
      }
      if (from && !to) {
        const others = accounts.filter(a => a.id !== from.id && (a.kind === "checking" || a.kind === "savings" || a.kind === "cash"));
        if (others.length === 1) to = others[0];
      }
      if (!to) return { missing: "to" };
      if (!from) return { missing: "from" };
      if (from.id === to.id) return { same: true };
      return { from, to };
    }

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const Plans = typeof AgentMoneyPlans !== "undefined" ? AgentMoneyPlans : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Voice = typeof AgentVoice !== "undefined" ? AgentVoice : null, Guard = typeof DataGuard !== "undefined" ? DataGuard : null;
      if (!Plans || !Loop) throw new Error("AgentTransfer needs AgentMoneyPlans and AgentLoop loaded.");
      const st = o.state || {}, ls = st.loop || {};
      const log = Array.isArray(ls.log) ? ls.log : [], memoryInit = ls.memory || null;
      const loop = Loop.create({ registry: o.registry, connectors: o.connectors, clock, log, memory: memoryInit, sent: ls.sent, pending: ls.pending || null, control: o.control || null, envelopes: o.envelopes || [], confirm_ttl_ms: o.confirm_ttl_ms || 10 * 60000, guard: Guard, compliance: o.compliance || null, partners: o.partners || {}, kyc: o.kyc || null });
      let pending = st.pending || null; // { confirmation_id, request, amount_cents, from_name, to_name, from_id, to_id, timing }
      const readAccounts = async () => normalizeAccounts(typeof o.accounts === "function" ? await o.accounts() : o.accounts);

      const names = list => list.map(a => a.name).join(", ");
      function cardText(p) {
        const when = p.timing === "instant" ? "Between your own accounts at the same bank it lands instantly." : "Between banks it lands in 1-2 business days.";
        return `Move ${money(p.amount_cents)} from ${p.from_name} to ${p.to_name}? No fee. ${when} You can move it back the same way any time. Reply YES to move it, or NO to drop it.`;
      }
      function detailsText(p, accounts) {
        const from = accounts.find(a => a.id === p.from_id);
        const avail = from ? (Number.isSafeInteger(from.available_cents) ? from.available_cents : from.balance_cents) : null;
        return `Move ${money(p.amount_cents)} from ${p.from_name} to ${p.to_name}. No fee; ${p.timing === "instant" ? "lands instantly" : "lands in 1-2 business days"}; fully reversible by moving it back.${Number.isSafeInteger(avail) ? ` ${p.from_name} has ${money(avail)} available, so this leaves ${money(avail - p.amount_cents)}.` : ""} Reply YES to move it, or NO to drop it.`;
      }

      async function stage(parsed) {
        const p = parsed || {};
        const accounts = await readAccounts();
        if (!accounts.length) return { outcome: "unavailable", reason: "accounts_unreadable", text: "I can't read your linked accounts right now, so I can't set that up. Nothing was moved." };
        if (!Number.isSafeInteger(p.amount_cents) || p.amount_cents <= 0) return { outcome: "ask", reason: "amount", text: "How much should I move?" };
        const mv = resolveMove(p, accounts);
        if (mv.ambiguous) return { outcome: "ask", reason: "account", text: `Which ${mv.ambiguous.which === "to" ? "account should it go to" : "account should it come from"}? You have ${names(mv.ambiguous.options)}. Name one and I'll put up the card.` };
        if (mv.missing) return { outcome: "ask", reason: "account", text: mv.missing === "to" ? `Move it to which account? I can see ${names(accounts)}.` : `Move it from which account? I can see ${names(accounts)}.` };
        if (mv.same) return { outcome: "ask", reason: "account", text: "Those are the same account. Name two different accounts and I'll put up the card." };
        const built = Plans.ownTransfer({ from: mv.from.id, to: mv.to.id, amount_cents: p.amount_cents }, { accounts, today: ymd(clock()) });
        if (built.ask) return { outcome: "ask", reason: "account", text: built.ask };
        if (built.stop) return { outcome: "stop", reason: built.reason, text: built.text };
        const r = await loop.wake({ kind: "message", request: built.request });
        if (r.outcome === "awaiting_confirmation") {
          pending = { confirmation_id: r.confirmation_id, request: built.request, amount_cents: p.amount_cents, from_id: mv.from.id, to_id: mv.to.id, from_name: mv.from.name, to_name: mv.to.name, timing: built.request.confirm.timing || null, leaves_cents: built.leaves_cents };
          return { outcome: "confirm", confirmation_id: r.confirmation_id, text: cardText(pending), transfer: { amount_cents: pending.amount_cents, from: pending.from_name, to: pending.to_name } };
        }
        if (r.outcome === "already_done") { pending = null; return { outcome: "already_done", text: r.message }; }
        if (r.outcome === "blocked") { pending = null; return { outcome: "blocked", reason: r.reason, text: r.message }; }
        return Object.assign({ outcome: r.outcome, text: r.message || null }, r);
      }

      // A new request while a card is live replaces it: the old card is declined in the loop first, so nothing stacks.
      async function start(text) {
        if (pending) { await loop.wake({ kind: "confirmation", confirmation_id: pending.confirmation_id, approved: false }); pending = null; }
        const p = parse(text);
        if (!p) return { outcome: "ask", reason: "unread", text: "Say it like \"move $500 from checking to savings\" and I'll put up the card." };
        return stage(p);
      }

      // True only when the words name a move between two of the person's own accounts: the router's gate for
      // taking the message deterministically, so a transfer to a person is never captured here.
      async function matches(text) {
        const p = parse(text);
        if (!p || !Number.isSafeInteger(p.amount_cents)) return false;
        const accounts = await readAccounts();
        const mv = resolveMove(p, accounts);
        return !!(mv.from && mv.to);
      }

      function settle(r, p) {
        if (r.outcome === "confirmed") return { outcome: "confirmed", text: r.message, reference: r.outcome_record && r.outcome_record.reference || null, transfer: { amount_cents: p.amount_cents, from: p.from_name, to: p.to_name } };
        if (r.outcome === "unknown") return { outcome: "unknown", text: r.message };
        if (r.outcome === "failed") return { outcome: "failed", text: r.message };
        if (r.outcome === "declined") return { outcome: "declined", text: r.message };
        return Object.assign({ outcome: r.outcome, text: r.message || null }, r);
      }

      async function reply(text) {
        const p = pending;
        if (!p) return { outcome: "nothing_pending", text: "There is no transfer waiting on you." };
        const t = String(text || "");
        // A fresh restatement of a move (the yes-after-edit gate) is a correction, never an approval of the old
        // card: the old card is dropped and the new one staged for its own yes.
        if (await matches(t)) {
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage(parse(t));
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        let cls = Voice ? Voice.classify(t, { pending_confirmation: true }) : { type: /^\s*y/i.test(t) ? "confirmation" : "question", approved: /^\s*y/i.test(t) };
        // An amount correction without a restatement ("make it $300", "$300 instead") corrects the card the
        // same way: re-stage the same two accounts at the new amount, for a fresh yes.
        const amtM = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(t) || /\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)\b/i.exec(t);
        const newAmt = amtM ? Math.round(Number(amtM[1].replace(/,/g, "")) * 100) : null;
        if (cls.type !== "confirmation" && newAmt && newAmt !== p.amount_cents && /\b(make it|instead|change|actually|no,)\b/i.test(t)) cls = { type: "correction", amount_only: true };
        if (cls.type === "correction") {
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage({ amount_cents: cls.amount_only ? newAmt : p.amount_cents, from_query: p.from_name, to_query: p.to_name, text: t });
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        if (cls.type === "hold") return { outcome: "held", text: `Holding it. Nothing moved. Say yes to move ${money(p.amount_cents)} from ${p.from_name} to ${p.to_name}, or no to drop it.` };
        if (cls.type === "confirmation" && cls.approved === false) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return settle(r, p); }
        if (cls.type === "confirmation" && cls.approved === true) {
          // Stop-on-change: the move is rebuilt from the accounts as they stand now. If it no longer clears
          // (the money left, an account closed), nothing moves and the card comes down.
          const accounts = await readAccounts();
          const rebuilt = Plans.ownTransfer({ from: p.from_id, to: p.to_id, amount_cents: p.amount_cents }, { accounts, today: ymd(clock()) });
          if (!rebuilt.request) {
            await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
            return { outcome: "changed", text: `Stopped before moving: ${rebuilt.text || rebuilt.ask || "the accounts changed"}. Nothing was moved.` };
          }
          const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null;
          // A stale yes never fires: the card expired, nothing moved, and a fresh card goes up for a fresh yes.
          if (r.outcome === "expired") {
            const again = await stage({ amount_cents: p.amount_cents, from_query: p.from_name, to_query: p.to_name, text: t });
            if (again.outcome === "confirm") return Object.assign({}, again, { expired: true, text: `That card expired, so nothing was moved. Here's a fresh one: ${again.text}` });
            return { outcome: "expired", text: `That card expired, so nothing was moved. ${again.text || ""}`.trim() };
          }
          return settle(r, p);
        }
        if (/^\s*(3|details?|more|terms|full terms)\s*[.!?]*\s*$/i.test(t)) return { outcome: "details", text: detailsText(p, await readAccounts()), details: true };
        return { outcome: "ask", text: `Yes or no? ${cardText(p)}` };
      }

      const snapshot = () => JSON.parse(JSON.stringify({ loop: loop.snapshot(), pending }));
      return { start, reply, parse, intent, matches, snapshot, loop,
        get pending() { return pending ? { confirmation_id: pending.confirmation_id, amount_cents: pending.amount_cents, recipient: pending.to_name, from: pending.from_name } : null; },
        get awaiting_input() { return false; } };
    }
    return { create, parse, intent, resolveMove, normalizeAccounts, CAPABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentTransfer;
