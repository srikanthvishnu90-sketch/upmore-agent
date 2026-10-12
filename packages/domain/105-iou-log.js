  /* IOU log in chat (megadoc C05 "jake owes me 20", D08 "log that I owe mom 200", D09 "what do I owe people", D10 "mark
     mom's 200 as paid"). A note of who owes whom, in the person's own words, restated back exactly. It never pays,
     requests or sends anything, never messages the other person, and reads no account.
       command(words, ious, now)   null (not an IOU ask) | { ious (the new list, or null when nothing changes), reply }
       describe(ious)              one line of what is open ("" with none)
     Stored in agent_proactive_settings.ious (20261012050000_ious.sql): { id, name, direction: "i_owe" | "owes_me",
     amount_cents (what is still open), original_cents, note, created_on, status: "open" | "settled", settled_on }. At most
     40; a settled one is dropped first to make room. No run of 9+ digits is kept; the id is base 36.
     Log: "I owe Sam $15 for lunch", "log that I owe Mom 200", "Jake owes me 20", "I lent Maya 40", "I borrowed 50 from
     Dad". Settle: "Jake paid me back", "Jake paid me 10" (part: the rest stays open; more than open is said), "I paid Mom
     back", "mark Mom's 200 as paid". List: "what do I owe people", "who owes me", "how much does Jake owe me", "show my
     IOUs". Forget: "forget the IOU with Jake". No amount is asked, never guessed. Pure. Depth packet IOU. */
  const IouLog = (() => {
    const MAX = 40, MAX_CENTS = 10000000;
    const pad = (n) => String(n).padStart(2, "0");
    const money = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const dayOf = (now) => { const d = new Date(typeof now === "number" ? now : Date.parse(now)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|pls|please|upmore)[,\s]+)*(?:(?:can|could|would) (?:you|u)\s+(?:please\s+)?|please\s+)?/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const AMT = "\\$?(\\d[\\d,]*(?:\\.\\d{1,2})?)(?:\\s*(?:dollars|bucks|usd))?";
    const NAME = "([a-z][a-z'.-]*(?:\\s[a-z][a-z'.-]*){0,2}?)";
    // A name is a person's: never a pronoun, a preposition or a thing ("in taxes", "it to myself", "the irs").
    const BAD_WORD = /\b(?:it|to|in|on|at|of|by|you|u|him|her|them|us|myself|yourself|taxes?|money|anything|everything|nothing|rent|interest|the bank|my card|credit|loan|loans)\b/;
    const NOT_A_NAME = /^(?:it|that|this|them|they|he|she|you|u|me|myself|someone|somebody|anyone|anybody|everyone|everybody|nobody|who|whom|what|people|money|cash|taxes|the irs|irs|rent|my rent|my card|the bank|my bank|on|for|in|back|a|an|the)$/;
    const LOG_WORDS = "(?:log(?: that)?|note(?: that| down that)?|remember(?: that)?|write down(?: that)?|track(?: that)?|keep track(?: that)?|record(?: that)?|fyi)\\s+";
    // Each form: [regex, direction, name group, amount group, note group]
    const FORMS = [
      [new RegExp(`^(?:${LOG_WORDS})?i owe ${NAME} ${AMT}(?: (?:for|from) (.{1,40}))?$`), "i_owe", 1, 2, 3],
      [new RegExp(`^(?:${LOG_WORDS})?i owe ${AMT} to ${NAME}(?: (?:for|from) (.{1,40}))?$`), "i_owe", 2, 1, 3],
      [new RegExp(`^(?:${LOG_WORDS})?i borrowed ${AMT} from ${NAME}(?: (?:for|to pay for) (.{1,40}))?$`), "i_owe", 2, 1, 3],
      [new RegExp(`^(?:${LOG_WORDS})?${NAME} (?:owes|owe) me ${AMT}(?: (?:for|from) (.{1,40}))?$`), "owes_me", 1, 2, 3],
      [new RegExp(`^(?:${LOG_WORDS})?i lent ${NAME} ${AMT}(?: (?:for|to pay for) (.{1,40}))?$`), "owes_me", 1, 2, 3],
      [new RegExp(`^(?:${LOG_WORDS})?i lent ${AMT} to ${NAME}(?: (?:for|to pay for) (.{1,40}))?$`), "owes_me", 2, 1, 3],
      [new RegExp(`^(?:${LOG_WORDS})?${NAME} borrowed ${AMT} from me(?: (?:for|to pay for) (.{1,40}))?$`), "owes_me", 1, 2, 3],
    ];
    // Said back in Upmore's voice: "my sister" is "your sister".
    const yours = (s) => String(s).replace(/\bmy\b/g, "your");
    // "mom" is "Mom", "jake smith" is "Jake Smith"; "my sister" is "your sister", said as the person's own relation.
    const cap = (s) => (/^my\s/.test(String(s)) ? yours(s) : String(s).replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase()));
    const plain = (c) => (c % 100 ? (c / 100).toFixed(2) : String(c / 100));
    const cents = (s) => { const n = Number(String(s).replace(/,/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
    const keyOf = (n) => String(n || "").toLowerCase().replace(/^(?:my|the)\s+/, "").replace(/'s$/, "").trim();
    const scrub = (s) => String(s || "").replace(/\d{9,}/g, "#").replace(/\s+/g, " ").trim().slice(0, 40);
    const open = (list) => (list || []).filter((x) => x && x.status === "open");
    const owed = (x) => `${cap(x.name)} ${x.direction === "i_owe" ? "is owed" : "owes you"} ${money(x.amount_cents)}`;
    const line = (x) => (x.direction === "i_owe" ? `you owe ${cap(x.name)} ${money(x.amount_cents)}` : `${cap(x.name)} owes you ${money(x.amount_cents)}`) + (x.note ? ` (${x.note})` : "");
    const item = (x) => `${cap(x.name)} ${money(x.amount_cents)}${x.note ? ` (${x.note})` : ""}`;
    const NOTE = " It's a note only: nothing was paid, requested or sent.";

    function parseLog(t) {
      for (const [re, direction, ni, ai, noti] of FORMS) {
        const m = re.exec(t);
        if (!m) continue;
        const name = m[ni].trim().replace(/'s$/, "");
        if (NOT_A_NAME.test(name) || BAD_WORD.test(name) || /\b(?:owe|owes|lent|borrowed|me|i)\b/.test(name)) return null;
        return { direction, name, amount_cents: cents(m[ai]), note: m[noti] ? scrub(m[noti]) : "" };
      }
      return null;
    }
    // "i owe mom", "jake owes me money": an IOU with no amount, asked.
    const NO_AMOUNT = new RegExp(`^(?:${LOG_WORDS})?(?:i owe ${NAME}(?: money| some money)?|${NAME} owes me(?: money| some money)?|i lent ${NAME}(?: money| some money)?)$`);

    // How it was paid, said and dropped: "in cash", "on venmo", "already", "yesterday".
    const PAID_HOW = "(?: (?:in |with )?cash| on (?:venmo|zelle|cash app|paypal)| already| yesterday| today| last night)?";
    function settleOf(t) {
      let m;
      // "jake paid me back", "jake paid me 10", "jake paid me back the 20", "jake venmoed me the 20"
      if ((m = new RegExp(`^${NAME} (?:already )?(?:paid|payed|sent|venmoed|zelled|gave) me(?: back)?(?: (?:the )?${AMT})?(?: back)?${PAID_HOW}$`).exec(t))) return { direction: "owes_me", name: m[1], amount_cents: m[2] ? cents(m[2]) : null };
      // "i paid mom back", "i paid back mom", "i paid mom the 200", "i paid mom 50"
      if ((m = new RegExp(`^i (?:paid|payed|sent|venmoed|zelled|gave)(?: back)? ${NAME}(?: back)?(?: (?:the )?${AMT})?(?: back)?$`).exec(t))) return { direction: "i_owe", name: m[1], amount_cents: m[2] ? cents(m[2]) : null };
      // "mark mom's 200 as paid", "mark jake as paid", "mark the iou with jake as settled", "jake and i are square"
      if ((m = new RegExp(`^mark (?:the iou (?:with|from|to) )?${NAME}(?:'s)?(?: (?:iou|debt))?(?: ${AMT})?(?: (?:iou|debt))? (?:as )?(?:paid|settled|done|paid back|square)$`).exec(t))) return { direction: null, name: m[1], amount_cents: m[2] ? cents(m[2]) : null, mark: true };
      if ((m = new RegExp(`^${NAME} and i are (?:square|even|settled|good)$`).exec(t))) return { direction: null, name: m[1], amount_cents: null, mark: true };
      // Paid offline, as people say it (megadoc C10): "sam says he already paid cash", "sam settled up", "sam paid up".
      if ((m = new RegExp(`^${NAME} (?:says|said|told me) (?:he|she|they) (?:already )?(?:paid|paid me|paid me back|paid up|settled up)(?: (?:the )?${AMT})?${PAID_HOW}$`).exec(t))) return { direction: "owes_me", name: m[1], amount_cents: m[2] ? cents(m[2]) : null };
      if ((m = new RegExp(`^${NAME} (?:settled up|paid up|squared up|is paid up)(?: with me)?$`).exec(t))) return { direction: "owes_me", name: m[1], amount_cents: null };
      return null;
    }
    const LIST_ALL = /^(?:show|list|what are)(?: me)? my (?:ious|i\.o\.u\.s|debts to people|iou log)$|^who owes who$|^what do i owe people$|^what do i owe everyone$|^do i owe anyone(?: money)?$|^who do i owe(?: money)?$|^what do i owe(?: anyone| friends| my friends)?$|^who owes me(?: money| anything)?$|^does anyone owe me(?: money| anything)?$|^who still owes me(?: money| anything)?$/;
    const ONE = new RegExp(`^how much (?:does|do) ${NAME} owe me$|^how much do i owe ${NAME}$|^does ${NAME} (?:still )?owe me(?: money| anything)?$|^do i (?:still )?owe ${NAME}(?: money| anything)?$`);
    const FORGET = new RegExp(`^(?:forget|delete|remove|clear|erase)(?: the| my)? (?:iou|ious|debt)s?(?: (?:with|from|to|for) ${NAME})?$|^(?:forget|delete|remove) ${NAME}'s (?:iou|debt)$|^(?:forget|delete|remove|clear|erase) (?:what|that) ${NAME} owes me$|^(?:forget|delete|remove|clear|erase) what i owe ${NAME}$|^(?:clear|delete) (?:all )?my ious$`);

    function command(words, ious, now) {
      // "sam still owes me 40", "i already owe mom 200": the adverb is never part of the name (found by probing, 2026-10-12).
      const still = /\b(?:still|already)\s+(?:owes?)\b/.test(clean(words));
      const t = clean(words).replace(/\b(?:still|already|also|now|actually|really|just)\s+(?=(?:owes?|lent|borrowed)\b)/g, ""), list = (ious || []).filter((x) => x && typeof x === "object"), today = dayOf(now);
      if (!t || t.length > 160) return null;
      if (LIST_ALL.test(t)) {
        const o = open(list);
        if (!o.length) return { ious: null, reply: list.length ? "Nothing is open in your IOU log: everything you logged is marked paid." : "Your IOU log is empty: nobody owes you and you don't owe anyone that you've told me about. Say \"Jake owes me $20\" or \"I owe Mom $200\" to log one." };
        const mine = o.filter((x) => x.direction === "i_owe"), theirs = o.filter((x) => x.direction === "owes_me");
        const sum = (a) => a.reduce((s, x) => s + x.amount_cents, 0);
        const out = [];
        if (/\bowes me\b|\bowe me\b|\bwho owes me\b|\bstill owes\b/.test(t) && !/\bwho owes who\b/.test(t)) out.push(theirs.length ? `Owed to you: ${theirs.map(item).join("; ")}. ${money(sum(theirs))} in all.` : "Nobody owes you anything that you've told me about.");
        else if (/\bi owe\b|\bdo i owe\b|\bwho do i owe\b/.test(t)) out.push(mine.length ? `You owe: ${mine.map(item).join("; ")}. ${money(sum(mine))} in all.` : "You don't owe anyone anything that you've told me about.");
        else {
          if (mine.length) out.push(`You owe: ${mine.map(item).join("; ")}. ${money(sum(mine))} in all.`);
          if (theirs.length) out.push(`Owed to you: ${theirs.map(item).join("; ")}. ${money(sum(theirs))} in all.`);
        }
        out.push("From your IOU log, what you've told me; I don't check it against your accounts.");
        return { ious: null, reply: out.join("\n") };
      }
      let m = ONE.exec(t);
      if (m) {
        const who = m[1] || m[2] || m[3] || m[4], k = keyOf(who);
        if (NOT_A_NAME.test(who) || BAD_WORD.test(who)) return null;
        const o = open(list).filter((x) => keyOf(x.name) === k);
        if (!o.length) return { ious: null, reply: `I don't have an open IOU with ${cap(who)}. Say "${cap(who)} owes me $20" or "I owe ${cap(who)} $20" to log one.` };
        // Both ways with one person: the running balance between them, said after the entries.
        const net = o.reduce((a, x) => a + (x.direction === "owes_me" ? x.amount_cents : -x.amount_cents), 0), both = new Set(o.map((x) => x.direction)).size > 1;
        const bal = both ? ` Net: ${net === 0 ? "you're even" : net > 0 ? `${cap(o[0].name)} owes you ${money(net)}` : `you owe ${cap(o[0].name)} ${money(-net)}`}.` : "";
        return { ious: null, reply: `${((j) => j.charAt(0).toUpperCase() + j.slice(1))(o.map(line).join("; "))}.${bal}\nFrom your IOU log, what you've told me; I don't check it against your accounts.` };
      }
      m = FORGET.exec(t);
      if (m) {
        // The name is whichever form matched; "forget what sam owes me" forgets Sam's only, never the whole log.
        const who = m.slice(1).find(Boolean), dir = /owes me$/.test(t) ? "owes_me" : /^\w+ what i owe /.test(t) ? "i_owe" : null;
        const hit = who ? list.filter((x) => keyOf(x.name) === keyOf(who) && (!dir || x.direction === dir)) : list;
        if (!hit.length) return { ious: null, reply: `I don't have an IOU${who ? ` with ${cap(who)}` : ""}, so nothing changed.` };
        return { ious: list.filter((x) => !hit.includes(x)), reply: `Forgot ${hit.length === 1 ? "the IOU" : `${hit.length} IOUs`}: ${hit.map(line).join("; ")}. Nothing else changed.` };
      }
      const s = settleOf(t);
      if (s && !NOT_A_NAME.test(s.name) && !BAD_WORD.test(s.name)) {
        const k = keyOf(s.name);
        const cands = open(list).filter((x) => keyOf(x.name) === k && (!s.direction || x.direction === s.direction) && (!s.mark || s.amount_cents == null || x.amount_cents === s.amount_cents || x.original_cents === s.amount_cents));
        if (!cands.length) {
          // "mark mom's 200 as paid": the name is Mom, never "Mom's" (megadoc D10, found by the sim).
          const nm = cap(s.name.replace(/'s$/i, ""));
          const what = s.direction === "owes_me" ? `for ${nm} owing you` : s.direction === "i_owe" ? `for you owing ${nm}` : `with ${nm}`;
          return { ious: null, reply: `I don't have an open IOU ${what}${s.amount_cents && s.mark ? ` for ${money(s.amount_cents)}` : ""}, so nothing changed.` };
        }
        if (cands.length > 1 && s.amount_cents == null) return { ious: null, reply: `You have ${cands.length} open IOUs with ${cap(s.name)}: ${cands.map(line).join("; ")}. Which one? Say it with the amount, like "mark ${cap(s.name)}'s ${plain(cands[0].amount_cents)} as paid". Nothing changed.` };
        const x = cands.find((c) => s.amount_cents != null && (c.amount_cents === s.amount_cents || c.original_cents === s.amount_cents)) || cands[0];
        const paid = s.amount_cents == null || s.mark ? x.amount_cents : s.amount_cents;
        if (!(paid > 0)) return null;
        const rest = x.amount_cents - paid;
        const next = list.map((c) => (c !== x ? c : rest > 0 ? Object.assign({}, c, { amount_cents: rest }) : Object.assign({}, c, { status: "settled", settled_on: today })));
        const who = cap(x.name), dir = x.direction === "i_owe" ? `you owed ${who}` : `${who} owed you`;
        if (rest > 0) return { ious: next, reply: `Noted: ${money(paid)} of the ${money(x.amount_cents)} ${dir}${x.note ? ` (${x.note})` : ""} is paid; ${money(rest)} is still open.${NOTE}` };
        return { ious: next, reply: `Marked paid: the ${money(x.amount_cents)} ${dir}${x.note ? ` (${x.note})` : ""}.${rest < 0 ? ` That's ${money(-rest)} more than the IOU said.` : ""}${NOTE}` };
      }
      const log = parseLog(t);
      if (log) {
        if (!(log.amount_cents > 0) || log.amount_cents > MAX_CENTS) return { ious: null, reply: `I couldn't read that amount, so nothing was saved. Say it like "${log.direction === "i_owe" ? `I owe ${cap(log.name)} $20` : `${cap(log.name)} owes me $20`}".` };
        const name = scrub(log.name);
        const entry = { id: `iou-${(typeof now === "number" ? now : Date.parse(now)).toString(36)}`, name, direction: log.direction, amount_cents: log.amount_cents, original_cents: log.amount_cents, note: log.note, created_on: today, status: "open" };
        let kept = list.slice();
        if (kept.length >= MAX) {
          const settled = kept.filter((x) => x.status === "settled");
          if (!settled.length) return { ious: null, reply: `Your IOU log is full (${MAX} open IOUs). Mark one paid or say "forget the IOU with ..." first. Nothing was saved.` };
          kept = kept.filter((x) => x !== settled[0]);
        }
        // "Sam still owes me 40" restates an open IOU of that amount; it is confirmed, never logged twice.
        const same = still ? open(kept).find((x) => keyOf(x.name) === keyOf(name) && x.direction === log.direction && x.amount_cents === log.amount_cents) : null;
        if (same) return { ious: null, reply: `That's in your log already: ${line(same)}, logged ${same.created_on}. Nothing was added.` };
        // A different amount after "still" may be what's left or a new IOU: asked, never added on top.
        const prior = still ? open(kept).filter((x) => keyOf(x.name) === keyOf(name) && x.direction === log.direction) : [];
        if (prior.length) { const was = prior.reduce((a, x) => a + x.amount_cents, 0), diff = was - log.amount_cents; return { ious: null, reply: `Your log has: ${prior.map(line).join("; ")}. Is ${money(log.amount_cents)} what's left, or a new IOU on top? ${log.direction === "owes_me" && diff > 0 ? `Say "${cap(name)} paid me ${plain(diff)}" for what's left` : log.direction === "i_owe" && diff > 0 ? `Say "I paid ${cap(name)} ${plain(diff)}" for what's left` : "Say what was paid"}, or "${log.direction === "owes_me" ? `${cap(name)} owes me ${plain(log.amount_cents)}` : `I owe ${cap(name)} ${plain(log.amount_cents)}`}" for a new one. Nothing was changed.` }; }
        const others = open(kept).filter((x) => keyOf(x.name) === keyOf(name) && x.direction === log.direction);
        const total = others.reduce((a, x) => a + x.amount_cents, 0) + log.amount_cents;
        return { ious: kept.concat([entry]), reply: `Logged: ${line(entry)}.${others.length ? ` With the earlier ${others.length === 1 ? "one" : `${others.length}`}, that's ${money(total)} in all.` : ""}${NOTE}${log.direction === "i_owe" ? ` Say "pay ${name} ${plain(log.amount_cents)}" when you want to send it.` : ""}` };
      }
      m = NO_AMOUNT.exec(t);
      if (m) {
        const who = m[1] || m[2] || m[3];
        if (!who || NOT_A_NAME.test(who.trim()) || BAD_WORD.test(who)) return null;
        return { ious: null, reply: `How much? Say it like "${m[1] ? `I owe ${cap(who)} $20` : `${cap(who)} owes me $20`}". Nothing was saved.` };
      }
      return null;
    }
    function describe(ious) {
      const o = open(ious);
      return o.length ? `IOUs: ${o.map(line).join("; ")}.` : "";
    }
    return { command, describe, MAX };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = IouLog;
