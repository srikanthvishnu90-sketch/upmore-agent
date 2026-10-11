  /* Split an expense with people, from a text (PAY-004), the second person-to-person flow on the recipient layer (Rail 1).
     "split $90 dinner with marcus and sarah" resolves every name through AgentRecipients exactly as a send does: exact
     handle, then full name, then first name; "Which Marcus: Marcus L or Marcus T?" stages nothing; a look-alike is named;
     a stranger goes through the full identity path (app and handle, then the handle typed back) before any card. Then one
     card for the whole split: each person's exact share on their app, the total and the person's own share. On yes the
     requests are staged for the person to tap Request in each app (a handoff: no rail is written, nothing is sent from
     here), and each request is marked paid only when the matching credit posts. A request is not a completed send, so it
     never saves a stranger; only SAVE does. Loads after AgentRecipients, AgentLoop, AgentMoney, AgentCards. */
  const AgentSplit = (() => {
    const CAPABILITY = "PAY-004", DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    const AMOUNT = /(?:^|[\s:])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\d,.]*\w)/;
    const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
    const REQUEST_RAILS = ["venmo", "cash_app", "paypal", "zelle"];

    function parse(text) {
      const t = String(text || "").trim(), out = { amount_cents: null, names: [], memo: null, ways: null, rail: null, others: null, mine_cents: null, text: t };
      if (!/\bsplit\b/i.test(t)) return out;
      const lower = t.toLowerCase(), forIdx = lower.search(/\bfor\b/);
      let head = forIdx >= 0 ? t.slice(0, forIdx) : t;
      out.memo = forIdx >= 0 ? t.slice(forIdx + 3).trim().replace(/^[\s:,-]+/, "").replace(/[.!?]+$/, "") || null : null;
      const w = /\b(\d+|two|three|four|five|six|seven|eight)\s+ways?\b/i.exec(head);
      if (w) { out.ways = WORDS[w[1].toLowerCase()] || Number(w[1]); head = head.replace(w[0], " "); }
      const m = AMOUNT.exec(head);
      if (m) { const c = Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number((m[2] + "0").slice(0, 2)) : 0); if (Number.isSafeInteger(c) && c > 0) out.amount_cents = c; }
      const rm = /\b(venmo|zelle|cash ?app|paypal)\b/i.exec(head); if (rm) out.rail = /cash/i.test(rm[1]) ? "cash_app" : rm[1].toLowerCase();
      // Splits by percentage or by item are not built (megadoc C06, C11): flagged here, said plainly in stage().
      out.uneven = /\b\d{1,2}\s*\/\s*\d{1,2}\b|\bunevenly\b|\d{1,2}\s*%|\bpercent\b/i.test(t);
      out.itemized = /\b(?:only|just) had\b|\bitemi[sz]e|\bby item\b/i.test(t);
      head = head.replace(/,?\s*\b(?:tip|tax) included\b|,?\s*\bincluding (?:the )?(?:tip|tax)\b|,?\s*\bplus (?:the )?tip\b/gi, " ").replace(/\bunevenly\b|\b\d{1,2}\s*\/\s*\d{1,2}\b/gi, " ");
      const withM = /\b(?:with|between|among|w\/)\s+(.+)$/i.exec(head);
      if (withM) {
        out.names = withM[1].replace(/\b(evenly|equally|even|on (venmo|zelle|cash ?app|paypal)|in (venmo|zelle|cash ?app|paypal)|please|pls)\b/gi, " ")
          .split(/\s*(?:,|\band\b|&|\+)\s*/).map(n => n.replace(/^(my|the)\s+/i, "").replace(/\s+/g, " ").trim()).filter(n => n && !/^(me|myself|i|us)$/i.test(n));
        const before = head.slice(0, withM.index);
        if (!out.memo) { const mm = /(?:\$?\s?[\d,]+(?:\.\d{1,2})?)\s+(?:(?:the|our|that)\s+)?([a-z][\w' -]{1,30}?)\s*$/i.exec(before); if (mm && !/^(split|bill|check)$/i.test(mm[1].trim())) out.memo = mm[1].trim(); }
      }
      if (!out.memo) { const mm = /\bsplit\s+(?:the|our|that)\s+([a-z][\w' -]{1,30}?)\s+(?:\$|\d)/i.exec(head); if (mm) out.memo = mm[1].trim(); }
      // "between me and 3 friends": a count, not a name (response-style corpus 2.01).
      if (out.ways && !out.names.length) out.others = out.ways - 1;
      if (out.names.length === 1) { const n = /^(\d+|two|three|four|five|six|seven|eight)\s+(?:friends|people|others|of (?:them|us)|roommates|guys|coworkers|colleagues)$/i.exec(out.names[0]); if (n) { out.others = WORDS[n[1].toLowerCase()] || Number(n[1]); out.names = []; out.ways = out.others + 1; } }
      // "I pay 50", "my share is 50": the person's own fixed share; the rest is split (corpus 2.02).
      const mine = /\b(?:i(?:'ll| will)?\s+(?:pay|cover)|my (?:share|part|half) is)\s+\$?\s?(\d+(?:\.\d{1,2})?)/i.exec(t);
      if (mine) { const c = Math.round(Number(mine[1]) * 100); if (c > 0 && (!out.amount_cents || c < out.amount_cents)) out.mine_cents = c; }
      return out;
    }

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const Money = typeof AgentMoney !== "undefined" ? AgentMoney : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Rec = typeof AgentRecipients !== "undefined" ? AgentRecipients : null;
      const Cards = typeof AgentCards !== "undefined" ? AgentCards : null, Voice = typeof AgentVoice !== "undefined" ? AgentVoice : null, Guard = typeof DataGuard !== "undefined" ? DataGuard : null;
      if (!Money || !Loop || !Rec) throw new Error("AgentSplit needs AgentMoney, AgentLoop and AgentRecipients loaded.");
      const st = o.state || {}, ls = st.loop || {}, ttl = o.confirm_ttl_ms || 10 * 60000;
      const loop = Loop.create({ registry: o.registry, connectors: o.connectors, clock, log: Array.isArray(ls.log) ? ls.log : [], memory: ls.memory || null, sent: ls.sent, pending: ls.pending || null, control: o.control || null, envelopes: [], confirm_ttl_ms: ttl, guard: Guard, compliance: o.compliance || null, partners: o.partners || {}, kyc: o.kyc || null });
      const book = o.recipients || Rec.book({ people: o.people || [], clock, channel: o.channel || null });
      let pending = st.pending || null, identity = st.identity || null, waiting = st.waiting || null, saveOffers = st.save_offers || [];
      let waitingNames = st.waiting_names || null; // "Who are you splitting it with?" waiting on its answer
      const staged = Array.isArray(st.staged) ? st.staged : [];

      function follow(spec, parsed, resolved, index, reason, extra) {
        const s0 = Rec.identityStart(spec, clock()); identity = s0.state; waiting = { parsed, resolved, index }; pending = null;
        return Object.assign({ outcome: "ask", reason, text: s0.text }, extra || {});
      }
      const who = a => `${a.name}${a.handle && a.handle !== a.name ? ` (${a.handle}${a.readback_id ? ", new" : ""})` : a.readback_id ? " (new)" : ""}`;
      const list = xs => xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
      function cardText(sp, channel) {
        const same = sp.asks.every(a => a.amount_cents === sp.asks[0].amount_cents), oneRail = sp.asks.every(a => a.rail === sp.asks[0].rail);
        const tail = sp.fixed ? `${sp.memo ? ` for ${sp.memo}` : ""}: ${money(sp.total_cents)} total, yours ${money(sp.mine_cents)}` : `${sp.memo ? ` for ${sp.memo}` : ""}: ${money(sp.total_cents)} split ${sp.asks.length + 1} ways, yours ${money(sp.mine_cents)}`;
        const heads = [];
        for (const label of [who, a => a.name]) {
          heads.push(same && oneRail ? `Request ${money(sp.asks[0].amount_cents)} each from ${list(sp.asks.map(label))} in ${Rec.railName(sp.asks[0].rail)}${tail}` : `Request ${list(sp.asks.map(a => `${money(a.amount_cents)} from ${label(a)} in ${Rec.railName(a.rail)}`))}${tail}`);
        }
        for (const head of heads) {
          const f = { head, fee_cents: 0, total_cents: sp.requested_cents, irreversible: false, expiry_ms: ttl, when: "You tap Request in the app; nothing is sent from here" };
          const r = Cards ? Cards.compactText(f, channel || "sms") : { text: `${head}. Reply YES or NO, or DETAILS.`, segments: { segments: 1 } };
          if (r.segments.segments <= 2) return r.text;
        }
        return `Request ${money(sp.requested_cents)} from ${sp.asks.length} people${sp.memo ? ` for ${sp.memo}` : ""}. Reply YES, NO or DETAILS.`;
      }
      const details = sp => `Split ${money(sp.total_cents)}${sp.memo ? ` for ${sp.memo}` : ""} ${sp.asks.length + 1} ways, equal shares on exact cents (any odd cent is yours): you ${money(sp.mine_cents)}, ${sp.asks.map(a => `${who(a)} ${money(a.amount_cents)} by ${Rec.railName(a.rail)} request`).join(", ")}. No fee. Requests are staged for you to tap Request in each app; nothing is sent from here and nobody is charged until they pay. I mark each one paid when the money lands. Reply YES or NO.`;

      async function stage(parsed, resolvedSoFar) {
        if (parsed.uneven && !resolvedSoFar) return { outcome: "not_built", reason: "uneven_not_built", text: "Splits by percentage aren't built yet, so nothing was requested. I can split evenly, or with a fixed share of your own (\"I pay 50\")." };
        if (parsed.itemized && !resolvedSoFar) return { outcome: "not_built", reason: "itemized_not_built", text: "Itemized splits aren't built yet, so nothing was requested. I can split evenly, or with a fixed share of your own (\"I pay 50\")." };
        if (!parsed.amount_cents) return { outcome: "ask", text: "How much was it?" };
        if (!parsed.names.length) {
          // The question keeps the split, so the answer ("dave priya and sam", "just alex") continues it.
          waitingNames = parsed;
          if (parsed.others) {
            const sh = Money.split(parsed.amount_cents, Array.from({ length: parsed.others + 1 }, (_, i) => "#" + i), null, "#0").shares, each = sh[1].share_cents, mine = sh[0].share_cents;
            // An amount that doesn't divide evenly says so, and the extra cent is the person's (corpus 2.03).
            if (mine !== each) return { outcome: "ask", reason: "who", text: `${money(parsed.amount_cents)} doesn't divide evenly: ${money(mine)} for you and ${money(each)} each for the others. Who are the other ${parsed.others}?` };
            return { outcome: "ask", reason: "who", text: `That's ${money(each)} each across ${parsed.others + 1} people. Who are the ${parsed.others}? I'll request ${money(each)} from each.` };
          }
          if (parsed.mine_cents) return { outcome: "ask", reason: "who", text: `So you pay ${money(parsed.mine_cents)} and the rest, ${money(parsed.amount_cents - parsed.mine_cents)}, is split. Between who, and evenly?` };
          return { outcome: "ask", reason: "who", text: "Who are you splitting it with?" };
        }
        waitingNames = null;
        if (parsed.ways && parsed.ways !== parsed.names.length + 1) return { outcome: "ask", reason: "gap", text: `You said ${parsed.ways} ways, but that's ${parsed.names.length + 1} people with you. How many ways, and with whom?` };
        identity = null; waiting = null;
        const resolved = resolvedSoFar ? resolvedSoFar.slice() : parsed.names.map(() => null);
        for (let i = 0; i < parsed.names.length; i++) {
          if (resolved[i]) continue;
          const name = parsed.names[i], r = book.resolve(name);
          if (r.status === "unavailable") return { outcome: "unavailable", reason: "recipients_unreadable", text: r.ask };
          if (r.status === "ambiguous") return follow({ candidates: r.candidates, ask: r.ask }, parsed, resolved, i, "ambiguous", { candidates: r.candidates.map(c => c.name) });
          if (r.status === "lookalike") return follow({ suspect: r.suspect, handle: r.handle, rail: parsed.rail, name: r.handle ? null : r.query, ask: r.ask, lead: r.ask }, parsed, resolved, i, "lookalike");
          if (r.status === "stranger") return follow({ name: r.name, handle: r.handle, rail: parsed.rail, lead: `I don't have ${r.name || name} on file.` }, parsed, resolved, i, "new_recipient", { new_recipient: true });
          if (r.status !== "saved") return { outcome: "ask", text: r.ask || `Who is ${name}?` };
          const p = r.person;
          if (!p.saved && !(p.history && p.history.length)) return follow({ name: p.name, handle: p.handle || null, rail: (p.rails || []).find(x => REQUEST_RAILS.includes(x)) || null, lead: `${p.name} has never been paid or confirmed, so I'll confirm them in full first.` }, parsed, resolved, i, "new_recipient", { new_recipient: true });
          resolved[i] = p;
        }
        const keys = resolved.map(p => (p.handle || p.name).toLowerCase());
        if (new Set(keys).size !== keys.length) return { outcome: "ask", reason: "gap", text: "You named the same person twice. Who else is in the split?" };
        const asks = [];
        for (const p0 of resolved) {
          const rail = parsed.rail && (p0.rails || []).includes(parsed.rail) ? parsed.rail : (p0.rails || []).find(x => REQUEST_RAILS.includes(x));
          if (!rail) return { outcome: "ask", reason: "gap", text: `${p0.name} has no Venmo, Cash App, PayPal or Zelle on file, so I can't stage a request to them. Which app do they use?` };
          const p = Rec.forRail(p0, rail);
          asks.push({ name: p.name, handle: p.handle || null, rail, readback_id: p.readback_id || null, saved: !!p.saved, id: p.id || null });
        }
        // Equal shares (any odd cent is the person's), or the person's fixed share and the rest split among the others.
        const fixed = parsed.mine_cents && parsed.mine_cents < parsed.amount_cents ? parsed.mine_cents : null;
        const keysIdx = fixed ? asks.map((_, i) => "#" + i) : ["me"].concat(asks.map((_, i) => "#" + i));
        const sp0 = Money.split(fixed ? parsed.amount_cents - fixed : parsed.amount_cents, keysIdx, null, fixed ? "#0" : "me");
        asks.forEach((a, i) => { a.amount_cents = sp0.shares[fixed ? i : i + 1].share_cents; });
        let memo = parsed.memo || null, memo_flagged = false;
        if (memo && Guard) memo_flagged = !!Guard.wrap(memo).flagged;
        const sp = { total_cents: parsed.amount_cents, mine_cents: fixed || sp0.shares[0].share_cents, fixed: !!fixed, asks, memo, memo_flagged, requested_cents: asks.reduce((s, a) => s + a.amount_cents, 0) };
        const key = `split:${ymd(clock())}:${parsed.amount_cents}:${asks.map(a => `${a.rail}/${(a.handle || a.name).toLowerCase()}`).sort().join(",")}`;
        if (staged.some(x => x.key === key)) return { outcome: "already_done", text: `That split was already staged today. I did not stage it again. If the requests never went out, say so and I'll restage them.` };
        const request = { capability_id: CAPABILITY, key, idempotency_key: key, draft_only: true, amount_cents: sp.requested_cents, recipient: asks.map(a => a.handle || a.name).join(","),
          params: { total_cents: sp.total_cents, memo, requests: asks.map(a => ({ recipient: a.handle || a.name, rail: a.rail, amount_cents: a.amount_cents })) },
          describe: `Request ${money(sp.requested_cents)} from ${list(asks.map(a => a.name))}`,
          confirm: { action: "Request", amount: money(sp.requested_cents), recipient: list(asks.map(who)), from: "you", fee: null, when: "when they pay" } };
        const r = await loop.wake({ kind: "message", request });
        if (r.outcome === "awaiting_confirmation") { pending = { sp, confirmation_id: r.confirmation_id, key, parsed }; return { outcome: "confirm", confirmation_id: r.confirmation_id, text: cardText(sp), details: details(sp), split: sp }; }
        if (r.outcome === "blocked") return { outcome: "blocked", reason: r.reason, text: r.message };
        return { outcome: r.outcome, text: r.message || null };
      }
      // A new request while a card is live replaces it: the old card is declined in the loop first, so nothing stacks.
      async function start(text) { waitingNames = null; if (pending) { await loop.wake({ kind: "confirmation", confirmation_id: pending.confirmation_id, approved: false }); pending = null; } saveOffers = []; const p = parse(text); return stage(Object.assign(p, { names: expandNames(p.names) })); }
      // "maya jake and sam": a chunk that is not one saved person but whose every word is one becomes one name per word
      // (corpus 2.01, megadoc C01).
      function expandNames(names) {
        const known = w => ["saved", "ambiguous"].includes(book.resolve(w).status);
        return names.flatMap(n => n.includes(" ") && !known(n) && n.split(/\s+/).every(known) ? n.split(/\s+/) : [n]).filter(n => !/^(me|myself|i)$/i.test(n));
      }

      // Stop-on-change: every saved person is looked up again right before staging; a handle that changed or a person who
      // is no longer on file stages nothing and puts up a fresh card.
      function recheck(p) {
        const moved = [];
        for (const a of p.sp.asks) {
          if (a.readback_id) continue;
          const r = book.resolve(a.handle || a.name);
          if (r.status !== "saved") { moved.push(`${a.name} is no longer on file as before`); continue; }
          const now = Rec.forRail(r.person, a.rail);
          if ((now.handle || null) !== a.handle) moved.push(`${a.name}'s handle changed from ${a.handle} to ${now.handle}`);
        }
        return moved;
      }
      async function reply(text) {
        if (waitingNames && !identity && NAMES_ANSWER.test(String(text || ""))) {
          const was = waitingNames; waitingNames = null;
          if (/^\s*(no|nope|never ?mind|nvm|cancel|forget it)\b/i.test(text)) return { outcome: "declined", text: "Okay. Nothing was staged." };
          // "dave priya and sam": a chunk that is not one saved person but whose every word is one becomes one name per word.
          const names = expandNames(String(text).replace(/^\s*(?:just|only|with|me and)\s+/i, "").split(/\s*(?:,|\band\b|&|\+)\s*/i).map(n => n.replace(/[.!]+$/, "").trim()).filter(Boolean));
          return stage(Object.assign({}, was, { names, ways: was.others ? names.length + 1 : was.ways }));
        }
        if (identity) {
          const step = Rec.identityStep(identity, text, clock()); identity = step.state;
          if (step.outcome === "ask") return { outcome: "ask", reason: "identity", text: step.text };
          const w = waiting; waiting = null;
          if (step.outcome === "use_saved" || step.outcome === "confirmed") { const res = w.resolved.slice(); res[w.index] = step.person; return stage(w.parsed, res); }
          return { outcome: step.outcome === "expired" ? "expired" : "declined", text: step.text };
        }
        if (saveOffers.length && /^\s*save( (them|him|her|it|both|all))?\s*[.!]*\s*$/i.test(String(text))) {
          const done = [], failed = [];
          for (const so of saveOffers) { const sv = book.save({ name: so.name, handle: so.handle, rail: so.rail }, { kind: "confirmed", approved: true, readback: true, confirmation_id: so.readback_id }); (sv.ok ? done : failed).push(so.name); }
          saveOffers = [];
          return { outcome: done.length ? "saved" : "not_saved", text: done.length ? `Saved ${list(done)}. Next time they resolve by name.` : "Nothing was saved." };
        }
        const p = pending;
        if (!p) return { outcome: "nothing_pending", text: "There is no split waiting on you." };
        const cls = Voice ? Voice.classify(text, { pending_confirmation: true }) : { type: /^y/i.test(text) ? "confirmation" : "question", approved: /^y/i.test(text) };
        if (cls.type === "correction") {
          const fix = parse(/\bsplit\b/i.test(text) ? text : `split ${text}`), merged = Object.assign({}, p.parsed, { amount_cents: fix.amount_cents || p.parsed.amount_cents, names: fix.names.length ? fix.names : p.parsed.names, text });
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage(merged);
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        if (cls.type === "hold") return { outcome: "held", text: "Holding it. Nothing was sent. Say yes to send the requests as shown, or no to drop them." };
        if (cls.type === "confirmation" && cls.approved === false) { await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return { outcome: "declined", text: "Okay. Nothing was staged." }; }
        if (cls.type === "confirmation" && cls.approved === true) {
          const moved = recheck(p);
          if (moved.length) {
            await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
            const again = await stage(p.parsed);
            return Object.assign({}, again, { outcome: "changed", moved, next: again, text: `Stopped before staging: ${moved.join("; ")}. Nothing was staged.${again.outcome === "confirm" ? ` New card: ${again.text}` : ` ${again.text}`}` });
          }
          const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null;
          if (r.outcome !== "draft_approved") return { outcome: r.outcome, text: r.message || null };
          const sp = p.sp;
          staged.push({ key: p.key, at: clock(), asks: sp.asks.map(a => Object.assign({ paid: null }, a)), memo: sp.memo });
          saveOffers = sp.asks.filter(a => a.readback_id && !a.saved).map(a => ({ name: a.name, handle: a.handle, rail: a.rail, readback_id: a.readback_id }));
          const steps = sp.asks.map(a => `${who(a)} ${money(a.amount_cents)} in ${Rec.railName(a.rail)}`).join(", ");
          return { outcome: "staged", split: sp, save_offered: saveOffers.length > 0, text: `Staged. Tap Request for each: ${steps}${sp.memo ? `, note "${sp.memo}"` : ""}. I'll mark each one paid when the money lands.${saveOffers.length ? ` Reply SAVE to keep ${list(saveOffers.map(s => s.name))} for next time.` : ""}` };
        }
        if (/^\s*(3|details?|more|terms|full terms)\s*[.!?]*\s*$/i.test(String(text))) return { outcome: "details", text: details(p.sp), details: true };
        return { outcome: "ask", text: `Yes or no? ${cardText(p.sp)}` };
      }
      // A request is paid when the matching credit posts: the exact share, on or after the day it was staged, from them.
      function paid(transactions) {
        const out = [];
        for (const s of staged) for (const a of s.asks) {
          if (a.paid) continue;
          const hit = (transactions || []).find(t => { const c = Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100); const from = String(t.merchant_raw || "").toLowerCase(); return c === a.amount_cents && String(t.posted_at).slice(0, 10) >= ymd(s.at) && [a.name, a.handle].filter(Boolean).some(n => from.includes(String(n).toLowerCase().replace(/^[@$]/, "").split(" ")[0])) && !out.some(x => x.transaction_id === t.id); });
          if (hit) { a.paid = String(hit.posted_at).slice(0, 10); out.push({ transaction_id: hit.id, text: `${a.name} paid their ${money(a.amount_cents)}${s.memo ? ` for ${s.memo}` : ""} (posted ${a.paid}).` }); }
        }
        return out;
      }
      const snapshot = () => JSON.parse(JSON.stringify({ loop: loop.snapshot(), pending, identity, waiting, save_offers: saveOffers, staged, waiting_names: waitingNames }));
      // An answer to "Who are you splitting it with?": names only, a few words, no amounts.
      const NAMES_ANSWER = /^\s*(?:just |only |with |me and )?@?[a-z][a-z' .-]*(?:\s*(?:,|\band\b|&|\+|\s)\s*@?[a-z][a-z' .-]*){0,7}\s*[.!]*\s*$/i;
      const accepts = text => (!!identity && Rec.identityAccepts(identity, text)) || (saveOffers.length > 0 && /^\s*save( (them|him|her|it|both|all))?\s*[.!]*\s*$/i.test(String(text || ""))) || (!!waitingNames && !identity && NAMES_ANSWER.test(String(text || "")) && !/^\s*(y|yes|ok|okay|sure)\s*$/i.test(String(text || "")));
      return { start, reply, paid, parse, snapshot, accepts, cardText, loop, staged, recipients: book,
        get pending() { return pending ? { confirmation_id: pending.confirmation_id, amount_cents: pending.sp.requested_cents, recipients: pending.sp.asks.map(a => a.name) } : null; },
        get awaiting_input() { return !!identity || saveOffers.length > 0 || !!waitingNames; } };
    }
    return { create, parse, CAPABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentSplit;
