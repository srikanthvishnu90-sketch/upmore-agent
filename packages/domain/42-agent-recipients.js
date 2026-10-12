  /* Recipient memory and resolution for every person-to-person money flow (Rail 1, BUILD-STATUS): pay (AgentSend,
     PAY-001/PAY-002), split (AgentSplit, PAY-004), and AgentMoney.resolveRecipient for anything else that names a person.
     One layer, so a name means the same person in every flow and the same safety rules apply everywhere.
       resolve(query)  exact handle, then a saved nickname (exactly), then full name, then first name. Two or more matches at the first step that matches
                       ask "Which Marcus: Marcus L or Marcus T?" and nothing is staged. A handle within two edits of a saved
                       one (@sarah_m vs @sarah-m), or a name one edit from a saved one, is named and asked about, never
                       silently resolved. No match is a stranger.
       identity        the follow-up a flow keeps in its state: choose (answer to "Which Marcus"), lookalike (YES for the
                       saved one, NEW for someone else), and the stranger path: who (the app and handle), then the handle
                       typed back exactly, then the flow's full card. A saved recipient skips all of it.
       nicknames       the person's own word for someone ("mom" for Anita Srikanth), migration 20261012020000. Matched
                       exactly, never fuzzily: "mum" is not "mom", and a family word is still never offered as a look-alike
                       name. A nickname is set only by an explicit message ("mom is Anita Srikanth", "save Anita as mom"),
                       restated back and saved on a yes, and only for someone already saved (or confirmed by read-back in the
                       same send and kept with SAVE). It is a word: no digits, nothing handle-shaped. Cards show the real
                       name with it: "Anita Srikanth (mom, @anitas)".
       book.save()     only with evidence: a completed send (the debit posted, or the rail confirmed with a reference) or an
                       explicitly confirmed save (handle typed back, then SAVE). A name in a message is never saved. Rows go
                       to an outbox the host writes to public.saved_recipients (migration 20261011020000).
     A row is one handle on one app. Rows the user saved under the same display name are one person with a handle per app
     (Sam on Venmo and Sam on Zelle), because the display name is the user's own label; every card names the handle.
     Pure: no I/O. Loads before AgentMoney (54), AgentSend (64) and AgentSplit (70). */
  const AgentRecipients = (() => {
    const CHANNELS = ["imessage", "sms", "whatsapp", "in-app"];
    const SOURCES = ["completed_send", "confirmed"];
    const RAILS = { venmo: "Venmo", zelle: "Zelle", cash_app: "Cash App", paypal: "PayPal" };
    const TTL = 10 * 60000;
    const normHandle = h => String(h || "").trim().toLowerCase().replace(/^[@$]/, ""); // punctuation counts: @sarah_m and @sarah-m are different accounts
    const normName = s => String(s || "").toLowerCase().replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
    const title = s => String(s || "").trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const KIN = /^(mom|mum|mama|mother|dad|papa|father|sis|sister|bro|brother|grandma|grandpa|nana|wife|husband|hubby|son|daughter|aunt|uncle|cousin)$/;
    // Optimal string alignment: a swapped pair of letters is one edit ("sma" is one edit from "sam").
    function editDistance(a, b) {
      const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
      for (let j = 1; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      return d[m][n];
    }
    const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/, PHONE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
    const looksLikeHandle = q => { const s = String(q || "").trim(); return /^[@$][\w.-]{1,40}$/.test(s) || EMAIL.test(s) || PHONE.test(s) || (/^[\w.-]{3,40}$/.test(s) && /[_.\d-]/.test(s)); };
    const railOf = text => { const m = /\b(venmo|zelle|cash ?app|cashapp|paypal)\b/i.exec(String(text || "")); return m ? (/cash/i.test(m[1]) ? "cash_app" : m[1].toLowerCase()) : null; };
    const railName = id => RAILS[id] || id;
    const railFor = h => /^\$/.test(String(h || "")) ? "cash_app" : EMAIL.test(String(h || "")) || PHONE.test(String(h || "")) ? "zelle" : null;
    const handlesOf = p => p.handles ? Object.values(p.handles) : p.handle ? [p.handle] : [];
    // Nicknames (migration 20261012020000): lowercase letters, a space or an apostrophe, 2 to 24 characters, at most three
    // words. Words that answer a card can never be someone's nickname.
    const NICK_SHAPE = /^[a-z][a-z' ]*[a-z]$/;
    const NICK_RESERVED = /^(y|ya|yes|yeah|yep|yup|ok|okay|sure|confirm|no|nope|nah|new|save|stop|cancel|details?|more|terms|never ?mind|nvm|me|myself|i|you|we|us|they|them|him|her|it|everyone|everybody|all|nobody|someone|somebody|anyone|the|a|an|my)$/;
    const nickNorm = s => String(s == null ? "" : s).trim().toLowerCase().replace(/^["'“‘]+|["'”’.!?]+$/g, "").replace(/^(?:my|our|the)\s+/, "").replace(/\s+/g, " ").trim();
    // Why a word cannot be a nickname, or null when it can. Never identity digits, never a handle.
    function nicknameError(raw) {
      const t = String(raw == null ? "" : raw).trim(), n = nickNorm(t);
      if (!n) return { reason: "empty", text: "What should the nickname be?" };
      if (/\d/.test(n)) return { reason: "digits", text: "A nickname is a word, not a number. I never save numbers as names." };
      if (/[@$_.]/.test(n) || EMAIL.test(t) || PHONE.test(t) || looksLikeHandle(n)) return { reason: "handle_shaped", text: `"${t}" looks like a handle, not a nickname. A nickname is the word you call them, like "mom".` };
      if (n.length < 2 || n.length > 24 || !NICK_SHAPE.test(n) || n.split(" ").length > 3) return { reason: "shape", text: "A nickname is a short word or two, letters only, like \"mom\" or \"big sis\"." };
      if (NICK_RESERVED.test(n)) return { reason: "reserved", text: `"${n}" can't be a nickname: I read it as a reply to a card.` };
      return null;
    }
    // The real name with the nickname and the handle, as every card shows a saved person: "Anita Srikanth (mom, @anitas)".
    const display = p => { if (!p) return ""; const tags = [p.nickname || null, p.handle && p.handle !== p.name ? p.handle : null].filter(Boolean); return `${p.name}${tags.length ? ` (${tags.join(", ")})` : ""}`; };
    const isKin = s => KIN.test(nickNorm(s));

    // Rows of public.saved_recipients as the flows read them: one person per display name, a handle per app.
    function fromRows(rows) {
      const out = [], byName = new Map();
      const sorted = (rows || []).filter(r => r && (r.handle || r.display_name)).slice().sort((a, b) => String(b.last_used_at || "").localeCompare(String(a.last_used_at || "")));
      for (const r of sorted) {
        const key = r.display_name ? normName(r.display_name) : null;
        let p = key ? byName.get(key) : null;
        if (!p) { p = { id: r.id || null, name: r.display_name || r.handle, handle: r.handle || null, handles: {}, rails: [], channel: r.channel || null, source: r.source, saved: true, last_used_at: r.last_used_at || null, row_ids: [], nickname: null, nicknames: [], nickname_rows: [], history: [] }; out.push(p); if (key) byName.set(key, p); }
        p.row_ids.push(r.id || null);
        // A nickname a row carries belongs to the person; one the rules refuse (a hand-edited row) is ignored, never matched.
        if (r.nickname && !nicknameError(r.nickname)) { const n = nickNorm(r.nickname); if (!p.nicknames.includes(n)) p.nicknames.push(n); if (!p.nickname) p.nickname = n; if (r.id) p.nickname_rows.push(r.id); }
        if (r.rail && r.handle && !p.handles[r.rail]) { p.handles[r.rail] = r.handle; p.rails.push(r.rail); }
        if (r.source === "completed_send") p.source = "completed_send";
      }
      return out;
    }
    // The same person as seen on one app: the handle the card shows is the handle on the rail the money goes by.
    function forRail(p, rail) {
      if (!p || !rail || !p.handles || !p.handles[rail]) return p;
      return Object.assign({}, p, { handle: p.handles[rail], rails: [rail] });
    }
    // A label per candidate that tells them apart: the name, then the handle, then the app.
    function labels(cands) {
      const by = f => { const ls = cands.map(f); return new Set(ls.map(l => l.toLowerCase())).size === ls.length ? ls : null; };
      // Look-alike names always show their handles (response-style corpus 1.04), so the person picks a handle, not a name.
      return by(p => `${p.name}${p.handle ? ` (${p.handle})` : ""}`) || cands.map(p => `${p.name}${p.handle ? ` (${p.handle})` : ""}${p.rails && p.rails[0] ? ` on ${railName(p.rails[0])}` : ""}`);
    }
    const orList = xs => xs.length <= 2 ? xs.join(" or ") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
    function ambiguous(raw, cands) {
      const first = looksLikeHandle(raw) ? raw.trim() : title(raw);
      return { status: "ambiguous", candidates: cands, ask: `Which ${first}: ${orList(labels(cands))}?` };
    }

    function resolve(query, people, opts) {
      const o = opts || {};
      if (o.unavailable) return { status: "unavailable", ask: "I can't read your saved recipients right now, so I can't pay or request from anyone yet. Nothing was changed." };
      const raw = String(query || "").trim();
      if (!raw) return { status: "missing", ask: "Who should I send it to?" };
      const list = people || [], qh = normHandle(raw), qn = normName(raw);
      // 1. Exact handle (on any app the person is saved on; the card then uses that app). A bare word ("marcus") is read as a
      // name first, so a handle that happens to equal a first name never beats asking which Marcus.
      const byHandle = [];
      for (const p of list) for (const [rail, h] of p.handles ? Object.entries(p.handles) : [[null, p.handle]]) if (h && normHandle(h) === qh) byHandle.push(rail ? forRail(p, rail) : p);
      const handleShaped = looksLikeHandle(raw);
      if (handleShaped && byHandle.length === 1) return { status: "saved", person: byHandle[0], matched_by: "handle" };
      if (handleShaped && byHandle.length > 1) return ambiguous(raw, byHandle);
      // 2. A nickname, exactly ("mom" is the person's own word for Anita Srikanth; "mum" is not "mom"). When the same word is
      // also someone else's name, the person is asked which: a nickname never silently beats a real name.
      const nq = nickNorm(raw);
      const byNick = handleShaped || !nq ? [] : list.filter(p => (p.nicknames || (p.nickname ? [p.nickname] : [])).includes(nq));
      if (byNick.length) {
        const others = list.filter(p => !byNick.includes(p) && (normName(p.name) === qn || normName(p.name).startsWith(qn + " ") || (p.aliases || []).some(a => normName(a) === qn)));
        if (byNick.length === 1 && !others.length) return { status: "saved", person: byNick[0], matched_by: "nickname" };
        return ambiguous(raw, byNick.concat(others));
      }
      // 3. Full name (or a full alias).
      // A handle-shaped query is only ever a handle: "@sarah_m" must not match the name "Sarah M" once punctuation is gone.
      const byFull = handleShaped ? [] : list.filter(p => normName(p.name) === qn || (p.aliases || []).some(a => normName(a) === qn));
      if (byFull.length === 1) return { status: "saved", person: byFull[0], matched_by: "full_name" };
      if (byFull.length > 1) return ambiguous(raw, byFull);
      // 4. First name (or the leading words of the full name).
      const byFirst = qn && !handleShaped ? list.filter(p => normName(p.name).startsWith(qn + " ")) : [];
      if (byFirst.length === 1) return { status: "saved", person: byFirst[0], matched_by: "first_name" };
      if (byFirst.length > 1) return ambiguous(raw, byFirst);
      // A bare word that is nobody's name but is exactly one saved handle without its "@".
      if (byHandle.length === 1) return { status: "saved", person: byHandle[0], matched_by: "handle" };
      if (byHandle.length > 1) return ambiguous(raw, byHandle);
      // 5. Look-alikes are named, never resolved (names and handles only: a nickname matches exactly or not at all).
      if (looksLikeHandle(raw)) {
        for (const p of list) for (const h of handlesOf(p)) { const d = editDistance(qh, normHandle(h)); if (d >= 1 && d <= 2) return { status: "lookalike", suspect: p, distance: d, query: raw, handle: raw, ask: `${raw} is not on file, but it is ${d === 1 ? "one character" : "two characters"} away from ${p.name} (${h}). Did you mean ${p.name}? If this is someone new, say NEW and I'll confirm them in full.` }; }
      } else if (qn.length >= 3 && !KIN.test(qn)) {
        // A family word ("mom", "dad", "sis") is a relationship, not a misspelled name: never offer "Tom" for "mom".
        for (const p of list) { const n = normName(p.name), f = n.split(" ")[0]; if ((f.length >= 3 && editDistance(qn, f) === 1) || editDistance(qn, n) === 1) return { status: "lookalike", suspect: p, distance: 1, query: raw, handle: null, ask: `I don't have ${title(raw)} on file, but ${p.name}${p.handle ? ` (${p.handle})` : ""} is one letter away. Did you mean ${p.name}? If ${title(raw)} is someone new, say NEW and I'll confirm them in full.` }; }
      }
      // 6. A stranger.
      return { status: "stranger", query: raw, name: looksLikeHandle(raw) ? null : title(raw), handle: looksLikeHandle(raw) ? raw : null };
    }

    // The follow-up a flow keeps in its snapshot. Two mismatches stop it; never mind stops it; ten minutes stop it.
    // "never mind" alone, or at the end of an answer ("the uber driver nvm"), drops the question (response-style corpus 1.08).
    const DROP = /^\s*(no|n|nope|stop|cancel|never ?mind|nvm|forget it|scratch that)\s*[.!?]*\s*$|\b(nvm|never ?mind|forget it)\s*[.!?]*\s*$/i;
    const NEW = /^\s*(new|it'?s new|someone new|someone else|a new one|new person|new recipient)\s*[.!]*\s*$/i;
    const YES = /^\s*(y|yes|yep|yeah|yup|correct|right|that'?s (him|her|them|right))\s*[.!]*\s*$/i;
    function handleIn(text) {
      const s = String(text || "").trim().replace(/^(it'?s|its|they'?re|their|handle is|handle:?)\s+/i, "");
      for (const w of s.split(/\s+/)) { const t = w.replace(/[,;!?]+$/, "").replace(/\.$/, ""); if (/^[@$][\w.-]{1,40}$/.test(t) || EMAIL.test(t)) return t; }
      const phone = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/.exec(s); if (phone) return phone[1].trim();
      return null;
    }
    function identityStart(spec, now) {
      const s = spec || {}, rail = s.rail || railFor(s.handle);
      const stage = s.candidates ? "choose" : s.suspect ? "lookalike" : s.handle && rail ? "readback" : "handle";
      const st = { id: `idn-${now}-${normHandle(s.handle || s.name || "x").replace(/[^a-z0-9]+/g, "")}`, stage, name: s.name || null, handle: s.handle || null, rail, suspect: s.suspect || null, candidates: s.candidates || null, ask: s.ask || null, brief: !!s.brief, started_at: now, misses: 0 };
      return { state: st, text: identityAsk(st, s.lead || null) };
    }
    function identityAsk(st, lead) {
      const who = st.name || st.handle || "them", L = lead ? lead + " " : "";
      if (st.stage === "choose" || st.stage === "lookalike") return lead || st.ask;
      if (st.stage === "handle" && st.handle && !st.rail) return `${L}Which app is ${st.handle} on: Venmo, Cash App or PayPal?`;
      // The question comes last, as a question (response-style corpus 1.02); with no name, "their", never a made-up name.
      const poss = st.name ? `${st.name}'s` : st.handle ? `${st.handle}'s` : "their";
      if (st.stage === "handle" && st.rail) return `${L}New recipients are confirmed in full, every time. What's ${poss} ${railName(st.rail)} ${st.rail === "zelle" ? "email or phone" : "handle"}?`;
      if (st.stage === "handle" && st.brief) return `${L}What's ${poss} Venmo, Cash App, PayPal or Zelle handle, or phone number?`;
      if (st.stage === "handle") return `${L}New recipients are confirmed in full, every time. What's ${poss} Venmo, Cash App, PayPal or Zelle (like "venmo @${normName(who).split(" ")[0] && st.name ? normName(who).split(" ")[0] : "name"}")?`;
      return `${L}New recipient: ${st.name ? st.name + ", " : ""}${railName(st.rail)} ${st.handle}. I can't see who owns that account, so check the name and photo in ${railName(st.rail)} first. Then type the handle back exactly to confirm it's them.`;
    }
    // One reply. Returns { state, outcome, text, person? }: ask (still going), confirmed (the handle was typed back; person is
    // ready for the flow's full card), use_saved (the saved person was chosen), dropped or expired (nothing was set up).
    function identityStep(st, text, now) {
      if (!st) return { state: null, outcome: "nothing_pending", text: "There's nothing waiting on you." };
      if (now - st.started_at > TTL) return { state: null, outcome: "expired", text: "That expired. Nothing was set up. Say it again to start over." };
      const t = String(text || "").trim();
      if (DROP.test(t)) return { state: null, outcome: "dropped", text: "Okay. Nothing was set up." };
      if (st.stage === "choose") {
        const pick = choose(st.candidates, t);
        if (pick) return { state: null, outcome: "use_saved", person: pick, text: null };
        return { state: st, outcome: "ask", text: st.ask };
      }
      if (st.stage === "lookalike") {
        if (NEW.test(t)) { const next = Object.assign({}, st, { stage: st.handle && st.rail ? "readback" : "handle", suspect: null, name: st.handle ? null : st.name }); return { state: next, outcome: "ask", text: identityAsk(next, null) }; }
        if (YES.test(t) || normName(t) === normName(st.suspect.name)) return { state: null, outcome: "use_saved", person: st.suspect, text: null };
        return { state: st, outcome: "ask", text: `Did you mean ${st.suspect.name}? Reply YES for ${st.suspect.name}, NEW if this is someone else, or NO to stop.` };
      }
      if (st.stage === "handle") {
        const h = handleIn(t), r = railOf(t) || railFor(h);
        const next = Object.assign({}, st, { handle: h || st.handle, rail: st.rail || r });
        if (!next.handle || !next.rail) return { state: next, outcome: "ask", text: identityAsk(next, null) };
        next.stage = "readback"; next.misses = 0;
        return { state: next, outcome: "ask", text: identityAsk(next, null) };
      }
      if (st.stage === "readback") {
        const typed = (handleIn(t) || t).trim();
        if (typed.toLowerCase() === String(st.handle).toLowerCase()) return { state: null, outcome: "confirmed", text: null, person: { id: null, name: st.name || st.handle, handle: st.handle, rails: [st.rail], saved: false, history: [], readback_id: st.id, new_recipient: true } };
        const misses = st.misses + 1;
        if (misses >= 2) return { state: null, outcome: "dropped", text: `That doesn't match ${st.handle} again, so I stopped. Nothing was set up.` };
        return { state: Object.assign({}, st, { misses }), outcome: "ask", text: `That doesn't match ${st.handle}. Type the handle exactly as it appears in ${railName(st.rail)}, or say never mind.` };
      }
      return { state: null, outcome: "dropped", text: "Okay. Nothing was set up." };
    }
    // An answer to "Which Marcus": a full name, a handle, or the part that tells them apart ("T", "the cash app one").
    function choose(cands, text) {
      // "the first", "2", "the last one" pick by the order the question listed them (response-style corpus 1.04).
      const ord = /^\s*(?:the\s+)?(first|1st|1|one|second|2nd|2|two|third|3rd|3|three|last)(?:\s+one)?\s*[.!]*\s*$/i.exec(String(text || ""));
      if (ord && cands && cands.length) { const w = ord[1].toLowerCase(), i = /^(first|1st|1|one)$/.test(w) ? 0 : /^(second|2nd|2|two)$/.test(w) ? 1 : /^(third|3rd|3|three)$/.test(w) ? 2 : cands.length - 1; if (cands[i]) return cands[i]; }
      const r = resolve(text, cands); if (r.status === "saved") return r.person;
      const t = normName(text).replace(/^(the\s+)?/, "").replace(/\s+one$/, "");
      const hits = (cands || []).filter(p => { const parts = normName(p.name).split(" "); return parts.length > 1 && parts.slice(1).join(" ") === t; });
      if (hits.length === 1) return hits[0];
      const byRail = (cands || []).filter(p => (p.rails || []).includes(railOf(text)));
      return byRail.length === 1 && railOf(text) ? byRail[0] : null;
    }
    // Whether a reply belongs to the follow-up (so the router sends it here and not to the model).
    function identityAccepts(st, text) {
      if (!st) return false;
      const t = String(text || "").trim();
      if (DROP.test(t)) return true;
      if (t.split(/\s+/).length > 6) return false;
      if (st.stage === "choose") return !!choose(st.candidates, t);
      if (st.stage === "lookalike") return NEW.test(t) || YES.test(t) || normName(t) === normName(st.suspect.name);
      return !!handleIn(t) || (st.stage === "handle" && !!railOf(t) && t.split(/\s+/).length <= 2) || (st.stage === "readback" && /^[\w.@$+-]{2,40}$/.test(t));
    }

    // The recipient book a flow is given: people (saved rows plus any directory the host supplies), resolve, save, outbox.
    function book(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const people = fromRows(o.rows).concat((o.people || []).map(p => Object.assign({}, p)));
      const outbox = [];
      const iso = () => new Date(clock()).toISOString();
      const find = (handle, rail) => people.find(p => (p.handles ? (rail ? [p.handles[rail]] : Object.values(p.handles)) : [p.handle]).some(h => h && normHandle(h) === normHandle(handle)));
      // Evidence decides whether a save is allowed. A mention, a staged-but-unsent handoff or a model's guess is not evidence.
      function evidenceRef(ev) {
        if (!ev || !SOURCES.includes(ev.kind)) return { ok: false, reason: "no_evidence", text: "I only save someone after money has actually reached them, or after you type their handle back and say SAVE." };
        if (ev.kind === "completed_send") {
          if (ev.transaction_id && ev.posted) return { ok: true, ref: `txn:${ev.transaction_id}` };
          if (ev.reference && ev.outcome === "sent") return { ok: true, ref: `ref:${ev.reference}` };
          return { ok: false, reason: "not_completed", text: "That send hasn't completed, so I haven't saved them." };
        }
        if (ev.approved === true && ev.readback === true && ev.confirmation_id) return { ok: true, ref: `readback:${ev.confirmation_id}` };
        return { ok: false, reason: "not_confirmed", text: "I only save someone after you type their handle back and say SAVE." };
      }
      // Whether `person` may carry the nickname: the word itself, then the rest of the book. A nickname that is someone
      // else's name is refused (it would make "send sam 40" ambiguous); one that is someone else's nickname is a move, which
      // the caller restates before it happens.
      function nicknameCheck(person, raw) {
        const bad = nicknameError(raw); if (bad) return Object.assign({ ok: false }, bad);
        const n = nickNorm(raw);
        const named = people.find(p => p !== person && (normName(p.name) === n || normName(p.name).split(" ")[0] === n));
        if (named) return { ok: false, reason: "name_clash", text: `"${n}" is already how ${named.name} is found by name, so it can't be a nickname for someone else.` };
        const holder = people.find(p => p !== person && (p.nicknames || (p.nickname ? [p.nickname] : [])).includes(n)) || null;
        const same = !!person && (person.nicknames || (person.nickname ? [person.nickname] : [])).includes(n);
        return { ok: true, nickname: n, holder, same, replacing: person && person.nickname && person.nickname !== n ? person.nickname : null };
      }
      // A nickname is written only for a saved row (paid before, or confirmed by read-back and SAVE) and only on the person's
      // explicit yes to the restated nickname. It replaces the person's earlier nickname and moves it off anyone else.
      function setNickname(person, raw, approval) {
        if (!approval || approval.approved !== true) return { ok: false, reason: "not_approved", text: "I only save a nickname after you say yes to it." };
        if (!person || !person.saved) return { ok: false, reason: "not_saved", text: "I only save a nickname for someone you've already paid or confirmed." };
        const target = (person.nickname_rows || [])[0] || (person.row_ids || []).find(Boolean) || person.id || null;
        if (!target) return { ok: false, reason: "not_saved", text: "I only save a nickname for someone you've already paid or confirmed." };
        const c = nicknameCheck(person, raw); if (!c.ok) return c;
        if (c.same) return { ok: true, op: "none", nickname: c.nickname, person };
        const clear = [];
        if (c.holder) { clear.push(...(c.holder.nickname_rows || [])); c.holder.nicknames = (c.holder.nicknames || []).filter(x => x !== c.nickname); c.holder.nickname = c.holder.nicknames[0] || null; }
        clear.push(...(person.nickname_rows || []).filter(id => id !== target));
        Object.assign(person, { nickname: c.nickname, nicknames: [c.nickname], nickname_rows: [target] });
        const row = { op: "nickname", row_id: target, nickname: c.nickname, clear_row_ids: clear, display_name: person.name };
        outbox.push(row);
        return { ok: true, op: "nickname", row, person, moved_from: c.holder ? c.holder.name : null, replaced: c.replacing };
      }
      function save(entry, evidence) {
        const e = entry || {}, ev = evidenceRef(evidence);
        if (!ev.ok) return ev;
        const handle = e.handle ? String(e.handle).trim() : null, name = e.name ? String(e.name).trim() : null, rail = e.rail && RAILS[e.rail] ? e.rail : null, channel = e.channel || o.channel || null;
        if (!handle && !name) return { ok: false, reason: "no_identity", text: "There's no name or handle to save." };
        if (/\d{13,}/.test(handle || "") || /\d{9,}/.test(name || "")) return { ok: false, reason: "identity_digits", text: "That looks like an account or card number. I never store those." };
        if (channel && !CHANNELS.includes(channel)) return { ok: false, reason: "channel", text: "Unknown channel." };
        const existing = handle ? find(handle, rail) : people.find(p => normName(p.name) === normName(name));
        // A nickname rides on a save only when the person said SAVE to it, restated ("keep them as \"mom\""), and never on
        // a save that evidence alone made (a send that landed).
        let nick = null;
        if (e.nickname) {
          if (evidence.kind !== "confirmed") return { ok: false, reason: "nickname_needs_confirmation", text: "I only save a nickname after you say SAVE to it." };
          const c = nicknameCheck(existing || null, e.nickname);
          if (!c.ok) return c;
          if (c.holder) return { ok: false, reason: "nickname_taken", text: `"${c.nickname}" already means ${c.holder.name}, so I didn't save it. Nothing was saved.` };
          nick = c.nickname;
        }
        if (existing && existing.saved) {
          existing.last_used_at = iso(); if (evidence.kind === "completed_send") existing.source = "completed_send";
          const row = { op: "touch", handle: handle || existing.handle, display_name: existing.name, rail: rail || (existing.rails || [])[0] || null, source: existing.source, evidence_ref: ev.ref, channel, last_used_at: existing.last_used_at };
          outbox.push(row);
          if (nick) setNickname(existing, nick, { approved: true });
          return { ok: true, op: "touch", row, person: existing };
        }
        const person = existing || { id: null, name: name || handle, handle, rails: rail ? [rail] : [], history: [] };
        Object.assign(person, { saved: true, source: evidence.kind, channel, last_used_at: iso() });
        if (nick) Object.assign(person, { nickname: nick, nicknames: [nick] });
        if (handle && rail) { person.handles = Object.assign({}, person.handles || {}, { [rail]: handle }); if (!person.rails.includes(rail)) person.rails.push(rail); }
        delete person.readback_id; delete person.new_recipient;
        if (!existing) people.push(person);
        const row = { op: "insert", handle, display_name: name || handle, rail, source: evidence.kind, evidence_ref: ev.ref, channel, last_used_at: person.last_used_at };
        if (nick) row.nickname = nick;
        outbox.push(row);
        return { ok: true, op: "insert", row, person };
      }
      return { people, unavailable: !!o.unavailable, resolve: q => resolve(q, people, { unavailable: o.unavailable }), save, find, nicknameCheck, setNickname, drain: () => outbox.splice(0), outbox };
    }
    // A nickname message, or null. Only these shapes:
    //   "save Anita as mom", "remember anita srikanth as my mom"   explicit: always answered
    //   "mom is Anita Srikanth", "anita is my mom", "my mom is anita" the family word is the nickname; answered when the other
    //                                                                 side is a saved person, or a capitalized full name
    // so ordinary talk ("mom is sick", "my wife is at work") falls through to the assistant. A question is never one.
    // Any other nickname ("landlord", "bestie") is set with "save X as Y". Returns { name, nick, explicit, proper }.
    const NICK_SAVE = /^\s*(?:please\s+)?(?:save|remember|nickname|label)\s+(.+?)\s+as\s+(?:my\s+|our\s+)?(.+?)\s*[.!]*\s*$/i;
    const NICK_IS = /^\s*(.+?)\s+(?:is|=)\s+(.+?)\s*[.!]*\s*$/i;
    const wordsOk = s => { const w = String(s || "").trim().split(/\s+/); return w.length >= 1 && w.length <= 4 && w.every(x => /^[@$]?[\w.'’-]+$/.test(x)); };
    function parseNickname(text) {
      const t = String(text || "").trim();
      if (!t || /\?/.test(t) || t.length > 80) return null;
      const s = NICK_SAVE.exec(t);
      if (s) return wordsOk(s[1]) && wordsOk(s[2]) ? { name: s[1].trim(), nick: s[2].trim(), explicit: true, proper: true } : null;
      const m = NICK_IS.exec(t); if (!m) return null;
      const a = m[1].trim().replace(/^(?:my|our)\s+/i, ""), b = m[2].trim().replace(/^(?:my|our)\s+/i, "");
      if (!wordsOk(a) || !wordsOk(b)) return null;
      const kA = isKin(a), kB = isKin(b);
      if (kA === kB) return null;
      const name = kA ? b : a;
      // "Anita Srikanth" as typed: every word capitalized and at least two words reads as a person's full name.
      const proper = name.split(/\s+/).length >= 2 && name.split(/\s+/).every(w => /^[A-Z][a-z'’-]+$/.test(w));
      return { name, nick: kA ? a : b, explicit: false, proper };
    }

    // The nickname conversation: one message names it, the reply restates it in full, a yes saves it (the host writes the
    // outbox row to public.saved_recipients.nickname). Nothing is inferred: no yes, no nickname. State is snapshot() for a
    // stateless host. Returns null from start() when the message is not about a saved person after all (it falls through).
    function nicknames(opts) {
      const o = opts || {}, bk = o.book, clock = o.clock || (() => Date.now());
      let pending = (o.state && o.state.pending) || null; // { name, nick, key, row_ids, at, moved_from, replaced }
      const keyOf = p => (p.row_ids || []).filter(Boolean).join(",") || p.id || normName(p.name);
      const findAgain = k => bk.people.find(p => keyOf(p) === k) || null;
      function start(text) {
        const ask = parseNickname(text); if (!ask || !bk) return null;
        pending = null;
        if (bk.unavailable) return { outcome: "unavailable", reason: "recipients_unreadable", text: resolve("", [], { unavailable: true }).ask };
        const r = bk.resolve(ask.name);
        // "mom is sick" is ordinary talk: an "is" message is about a nickname only when the other side is a saved person or a
        // full name as typed ("mom is Anita Srikanth").
        if (r.status !== "saved" && !ask.explicit && !ask.proper) return null;
        const nickWord = nickNorm(ask.nick) || ask.nick;
        if (r.status === "ambiguous") return { outcome: "ask", reason: "ambiguous", text: `${r.ask} Say it again with the full name, like "save ${r.candidates[0].name} as ${nickWord}". Nothing was saved.` };
        if (r.status === "lookalike") return { outcome: "ask", reason: "lookalike", text: `I don't have ${title(ask.name)} saved, so I didn't save "${nickWord}". Did you mean ${r.suspect.name}? Then say "save ${r.suspect.name} as ${nickWord}".` };
        if (r.status !== "saved") return { outcome: "refuse", reason: "not_saved", text: `I don't have ${looksLikeHandle(ask.name) ? ask.name : title(ask.name)} saved, so I didn't save "${nickWord}". Nicknames go on people you've already paid or confirmed; once you have, say it again.` };
        const p = r.person;
        if (!p.saved) return { outcome: "refuse", reason: "not_saved", text: `${p.name} isn't saved yet, so I didn't save "${nickWord}". Nicknames go on people you've already paid or confirmed.` };
        const c = bk.nicknameCheck(p, ask.nick);
        if (!c.ok) return { outcome: "refuse", reason: c.reason, text: `${c.text} Nothing was saved.` };
        if (c.same) return { outcome: "already_done", reason: "nickname_same", text: `"${c.nickname}" already means ${display(p)}. Nothing changed.` };
        pending = { name: p.name, nick: c.nickname, key: keyOf(p), at: clock(), moved_from: c.holder ? c.holder.name : null, replaced: c.replacing };
        const extra = [c.holder ? `"${c.nickname}" means ${c.holder.name} now; this moves it.` : null, c.replacing ? `It replaces "${c.replacing}".` : null].filter(Boolean).join(" ");
        return { outcome: "confirm_nickname", reason: "nickname", nickname: c.nickname, person: p.name, text: `Save "${c.nickname}" as your name for ${p.name}${p.handle ? ` (${p.handle})` : ""}? Then "send ${c.nickname} 20" goes to ${p.name}.${extra ? " " + extra : ""} Reply YES to save it or NO.` };
      }
      const YES_N = /^\s*(y|ya|yes|yep|yeah|yup|ok|okay|sure|confirm|save|save it|do it)\s*[.!]*\s*$/i;
      function reply(text) {
        const pd = pending; if (!pd) return { outcome: "nothing_pending", text: "There's nothing waiting on you." };
        if (/^\s*(wait|hold on|hang on|one sec|details?|more)\s*[.!]*\s*$/i.test(String(text || "")) && clock() - pd.at <= TTL) return { outcome: "held", text: `Holding it. Nothing saved yet. Reply YES to save "${pd.nick}" for ${pd.name}, or NO.` };
        pending = null;
        if (clock() - pd.at > TTL) return { outcome: "expired", text: `That expired, so "${pd.nick}" wasn't saved. Nothing changed. Say it again to start over.` };
        if (!YES_N.test(String(text || ""))) return { outcome: "declined", text: `Okay, I didn't save "${pd.nick}". Nothing changed.` };
        const p = findAgain(pd.key);
        if (!p || p.name !== pd.name) return { outcome: "changed", text: `${pd.name} is no longer saved as before, so I didn't save "${pd.nick}". Nothing changed.` };
        const sv = bk.setNickname(p, pd.nick, { approved: true });
        if (!sv.ok) return { outcome: "not_saved", text: `${sv.text} Nothing was saved.` };
        return { outcome: "nickname_saved", nickname: pd.nick, row: sv.row || null, text: `Saved: "${pd.nick}" is ${display(p)}.` };
      }
      return { start, reply, parse: parseNickname, snapshot: () => ({ pending }), awaiting_input: false,
        get pending() { return pending ? { nickname: pending.nick, recipient: pending.name } : null; } };
    }
    return { book, resolve, fromRows, forRail, choose, editDistance, looksLikeHandle, railOf, railName, identityStart, identityStep, identityAccepts, handleIn, normHandle, nicknameError, nickNorm, display, isKin, parseNickname, nicknames, CHANNELS, SOURCES, RAILS, TTL };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentRecipients;
