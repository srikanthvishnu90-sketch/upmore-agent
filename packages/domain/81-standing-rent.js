  /* Monthly rent as a standing flow (real-world C110; spec 16 item S16-15 "pay my rent": a standing flow with a monthly
     restated confirmation; PAY-005 for each month's cycle). Owner's automation rule, 2026-10-11: an automation is a
     per-person toggle restated in exact terms (what, how much, how often, from which account), one message turns it
     off, and every run still asks that person for a one-line yes. Nothing moves without a yes, and Upmore never moves
     the money itself: each month's rent is STAGED for the person to send in their own app (Zelle, Venmo, Cash App,
     PayPal), with the same handoff staging the send flow uses (AgentMoney.handoff).

     The dialogue, one session per conversation:
       "pay my rent", no rent on file  -> the one blocking question (who, how much, which day of the month)
       the details                     -> a card that restates the exact terms; YES saves the standing rule, NO saves nothing
       "pay my rent", rent on file     -> this month's card (amount, month, recipient, due date); YES stages it for the
                                          person to send, NO skips the month
       "rent is 1500 now"              -> a card that restates the new terms; nothing changes without a yes
       "stop rent"                     -> off, said plainly
     Every card expires in 10 minutes; a late yes gets a fresh card, never a fired one. The scheduler side (dueSoon) only
     says WHEN a month's card is due to be offered (N days before the due day); it never stages anything.

     Pure: the rule comes in as a row of public.standing_payments, writes go out through drain() as ops the host persists
     before the reply (supabase/functions/_shared/flow_router.ts), and the session restores from snapshot(). Recipients
     resolve through the same book every person-to-person flow uses (42-agent-recipients.js). Loads after MoneyMath,
     AgentMoney and AgentRecipients when they are present. */
  const StandingRent = (() => {
    const DAY = 86400000, TTL = 10 * 60000, ASK_TTL = 30 * 60000, LEAD_DAYS = 3, LATE_DAYS = 10, CAPABILITY = "PAY-005";
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    const dateOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10); // m may overflow into the next year
    const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
    const monthName = ym => MONTHS[Number(String(ym).slice(5, 7)) - 1];
    const fmtDay = d => `${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${Number(d.slice(8, 10))}`;
    const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th");
    const RAIL_NAMES = { zelle: "Zelle", venmo: "Venmo", cash_app: "Cash App", paypal: "PayPal" };
    const APPS = { zelle: "your bank app", venmo: "Venmo", cash_app: "Cash App", paypal: "PayPal" };

    // ---- What a message asks for ----
    const LEAD = String.raw`^\s*(?:hey,?\s+|ok,?\s+|so,?\s+)?(?:please |pls |plz |can you |could you |can u |would you |will you |i need to |i want to |i'?d like to |help me |go ahead and )?`;
    const WHOSE = String.raw`(?:my |the |our |this month'?s |this months |next month'?s |next months |(?:${MONTHS.join("|")})'?s )?`;
    // "pay my rent" (and "pay my rent to Mike $1,450 on the 1st"). "pay sam 900 for rent" is a send to Sam: the rent word
    // there is the memo, so it never matches (the verb must be followed by the rent itself).
    const PAY = new RegExp(`${LEAD}(?:pay|send|do|handle|stage|cover)\\s+${WHOSE}rent\\b`, "i");
    const SETUP = new RegExp(`${LEAD}(?:set ?up|set|put|start|add|schedule|automate|turn on)\\s+(?:my |a |the |our )?(?:monthly |standing |recurring |automatic )?rent\\b(?:\\s+(?:on|to)\\s+auto-?pay\\b)?`, "i");
    const AUTOPAY = /\bauto-?pay|\bautomatic(?:ally)?\b|\bautomate\b|\bwithout (?:asking|me)\b/i;
    const STOP = new RegExp(`${LEAD}(?:stop|cancel|end|turn off|pause|kill|delete|remove|no more)\\s+(?:paying\\s+)?(?:my |the |our )?(?:standing |monthly |recurring )?rent(?:\\s+(?:payments?|cards?|reminders?|setup|set ?up|automation|flow|thing))?\\s*(?:please|pls|now|for now)?\\s*[.!]*\\s*$`, "i");
    const CHANGE = new RegExp(String.raw`^\s*(?:(?:my|the|our)\s+)?rent\s+(?:is|went up to|goes up to|is going up to|went down to|changed to|is now|will be|now)\s+(?:now\s+|going to be\s+)?(?:\$?\s?\d|due\s+(?:on\s+)?(?:the\s+)?(?:\d{1,2}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|tenth|fifteenth|twentieth)\b)|^\s*(?:change|update|set|make|raise|lower|move)\s+(?:my |the |our )?rent(?:\s+(?:amount|day|date|due date))?\s+(?:to|is)\s+(?:\$?\s?\d|the\s+\d|the\s+[a-z]+(?:st|nd|rd|th)\b)`, "i");
    function intent(text) {
      const t = String(text || "").trim();
      if (!t || t.length > 300) return null;
      if (STOP.test(t)) return "stop";
      if (CHANGE.test(t)) return "change";
      if (SETUP.test(t)) return "setup";
      if (PAY.test(t)) return "pay";
      return null;
    }

    // ---- The terms, read from the person's own words; nothing is filled in that they did not write ----
    const ORD_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, fifteenth: 15, twentieth: 20 };
    const HANDLE = /(?:^|[\s,(])(@[\w.-]{2,40}|\$[A-Za-z][\w-]{1,30}|[\w.+-]+@[\w-]+\.[\w.]+|\(?\d{3}\)?[\s.-]\d{3}[\s.-]?\d{4})(?=[\s,.;!?)]|$)/;
    const RAIL = /\b(?:via|on|by|through|with|using|in|over|thru)?\s*(zelle|venmo|cash ?app|paypal)\b/i;
    const NOT_BUILT_RAIL = /\b(?:via|by|through|with|using|thru)?\s*(bill ?pay|ach|bank transfer|wire(?: transfer)?|(?:a |paper |personal )?check|money order|(?:the |their |my |landlord'?s |an? |online |resident )?portal|apartments\.com|rentcafe|zillow|appfolio|buildium)\b/i;
    const FUNDING = /\bfrom\s+(?:my\s+)?((?:[a-z]+\s+)?(?:checking|savings)(?:\s+account)?)\b/i;
    const DAY_NUM = /\b(?:on|by|due|every|each)?\s*(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b(?:\s+(?:of\s+)?(?:the|each|every)\s+month)?/i;
    const DAY_WORD = new RegExp(String.raw`\b(?:on|by|due|every|each)?\s*(?:on\s+)?the\s+(${Object.keys(ORD_WORDS).join("|")}|last day)\b(?:\s+(?:of\s+)?(?:the|each|every)\s+month)?`, "i");
    const DAY_BARE = /\b(?:due|on day|by day)\s+(?:on\s+)?(?:the\s+)?(\d{1,2})\b(?!\s*(?:dollars|bucks|k\b|,\d|\.\d))/i;
    const AMOUNT = /(?:^|[\s:(])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k\b)?(?:\s*(?:dollars|bucks|usd))?(?![\d,.]*\w)/i;
    const NAME_STOP = new Set(("i we our my me the a an to pay send rent rents rent's is it's its it monthly month months every each per and set up setup please pls plz now due on of for via with by from landlord landlady landlords mo make actually change update went goes going will be changed instead wait no yes ok okay sure thanks thx rn hey so just um also but about around usually always at do handle stage cover start add schedule automate turn this next that i'm im who how much which day what new today tomorrow early late again can could would will you u need want like help go ahead checking savings account half only have has got just both between split autopay auto pay dollars bucks " + MONTHS.join(" ").toLowerCase()).split(" "));
    // Words that say who someone is, not their name ("my property manager Dan" is Dan).
    const ROLE = /\b(?:my |our |the )?(?:landlord|landlady|property manager|property management(?: company)?|leasing office|building manager|super)(?:'s)?\b/gi;
    function cents(m) {
      const whole = Number(String(m[1]).replace(/,/g, "")), frac = m[2] ? Number((m[2] + "0").slice(0, 2)) : 0;
      let c = whole * 100 + frac; if (m[3]) c *= 1000;
      return Number.isSafeInteger(c) && c > 0 ? c : null;
    }
    const titleCase = s => /[A-Z]/.test(s) ? s : s.replace(/\b[a-z]/g, ch => ch.toUpperCase());
    const TWO_ACCOUNTS = /\b(?:checking|savings)\b.{0,30}\b(?:and|&|\+|or)\b.{0,12}\b(?:checking|savings)\b|\bhalf (?:each|and half)\b|\bsplit (?:it )?(?:between|across)\b/i;
    function parseTerms(text, opts) {
      const loose = !(opts && opts.loose === false);
      let t = ` ${String(text || "")} `;
      const out = { payee: null, handle: null, amount_cents: null, day: null, rail: null, rail_not_built: null, funding: null, new_payee: /\bnew (?:landlord|account|payee|bank|routing|zelle|handle)\b|\blandlord (?:changed|has a new)\b/i.test(t) };
      const take = (re, f) => { const m = re.exec(t); if (!m) return null; f(m); t = t.slice(0, m.index) + " " + t.slice(m.index + m[0].length); return m; };
      take(HANDLE, m => { out.handle = m[1].trim(); });
      // One account per month: "from savings and checking half each" is asked, never split or guessed.
      if (TWO_ACCOUNTS.test(t)) { out.two_accounts = true; t = t.replace(/\bfrom\s+(?:my\s+)?(?:checking|savings)\b.*$/i, " "); }
      else take(FUNDING, m => { out.funding = m[1].toLowerCase().replace(/\s+account$/, ""); });
      take(RAIL, m => { out.rail = /cash/i.test(m[1]) ? "cash_app" : m[1].toLowerCase(); });
      if (!out.rail) take(NOT_BUILT_RAIL, m => { out.rail_not_built = m[1].toLowerCase().replace(/^(?:the|their|my|landlord'?s|an?|online|resident|paper|personal)\s+/, ""); });
      take(DAY_NUM, m => { out.day = Number(m[1]); }) || take(DAY_WORD, m => { out.day = /last/i.test(m[1]) ? 31 : ORD_WORDS[m[1].toLowerCase()]; }) || take(DAY_BARE, m => { out.day = Number(m[1]); });
      take(AMOUNT, m => { out.amount_cents = cents(m); });
      // Who it goes to: the name after "to", else the words left once every other term is taken out.
      t = t.replace(ROLE, " ");
      const stopWord = w => NAME_STOP.has(w.toLowerCase().replace(/[.']+$/, ""));
      // "...pay mike on zelle", "i pay mike 1450 for rent": the name after "pay" when no "to" names one (found by probing).
      const to = /\bto\s+(?!(?:send|pay|be|the\s+\d)\b)([A-Za-z][\w.'&-]*(?:\s+[A-Za-z][\w.'&-]*){0,5})/i.exec(t) || /\b(?:pay|pays|paying)\s+(?!(?:rent|my|the|it|for|on|via|by|with|a|an|and|monthly|every|each|back|half)\b)([A-Za-z][\w.'&-]*(?:\s+[A-Za-z][\w.'&-]*){0,2})/i.exec(t);
      let words = to ? to[1].replace(/[^A-Za-z.'&\s-]/g, " ").split(/\s+/).filter(Boolean) : loose ? t.replace(/[^A-Za-z.'&\s-]/g, " ").split(/\s+/).filter(Boolean) : [];
      if (!to) words = words.filter(w => !stopWord(w));
      else { while (words.length && stopWord(words[0])) words.shift(); const cut = words.findIndex(stopWord); if (cut >= 0) words = words.slice(0, cut); }
      const name = words.slice(0, 3).join(" ").replace(/^[.'&-]+|[.'&-]+$/g, "").trim();
      if (name && name.length <= 60 && /[A-Za-z]{2,}/.test(name)) out.payee = titleCase(name);
      return out;
    }
    const hasTerms = x => !!(x && (x.payee || x.handle || x.amount_cents || x.day || x.rail || x.funding || x.rail_not_built || x.two_accounts));
    const merge = (a, b) => { const out = Object.assign({}, a || {}); for (const [k, v] of Object.entries(b || {})) if (v !== null && v !== undefined && v !== false) out[k] = v; return out; };

    // ---- The calendar: which month a card is for, and when the scheduler offers it ----
    function cycle(rule, today) {
      const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), d = rule.day_of_month;
      const thisDue = dateOf(y, m, d), nextDue = dateOf(y, m + 1, d);
      if (thisDue >= today) return { due_on: thisDue, month: thisDue.slice(0, 7), days_until: days(today, thisDue), late_days: 0 };
      // Past this month's due day: still this month while it is recent, not staged, and the rule existed before it was due.
      const late = days(thisDue, today), created = rule.created_at ? String(rule.created_at).slice(0, 10) : null;
      if (late <= LATE_DAYS && rule.last_staged_month !== thisDue.slice(0, 7) && created && created <= thisDue) return { due_on: thisDue, month: thisDue.slice(0, 7), days_until: -late, late_days: late };
      return { due_on: nextDue, month: nextDue.slice(0, 7), days_until: days(today, nextDue), late_days: 0 };
    }
    // For the scheduler: the month whose card is due to be OFFERED (lead days before the due day), or null. An offer is a
    // question; nothing is staged until the person says yes to that month's card.
    function dueSoon(rule, today, lead) {
      const r = normRule(rule), n = Number.isInteger(lead) && lead >= 0 && lead <= 14 ? lead : LEAD_DAYS;
      if (!r || r.status !== "active") return null;
      const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
      const thisDue = dateOf(y, m, r.day_of_month), due = thisDue >= today ? thisDue : dateOf(y, m + 1, r.day_of_month), left = days(today, due);
      if (left > n || r.last_staged_month === due.slice(0, 7)) return null;
      return { rule_id: r.id, month: due.slice(0, 7), month_name: monthName(due.slice(0, 7)), due_on: due, days_until: left, amount_cents: r.amount_cents, payee_name: r.payee_name, rail: r.rail, funding: r.funding,
        text: `Rent for ${monthName(due.slice(0, 7))} is due ${fmtDay(due)}: ${money(r.amount_cents)} to ${r.payee_name} on ${RAIL_NAMES[r.rail]}, from ${r.funding}. Want this month's card to send it? Reply YES or NO. Nothing is staged without your yes.` };
    }
    function normRule(row) {
      if (!row || typeof row !== "object") return null;
      const amount_cents = Number(row.amount_cents), day = Number(row.day_of_month);
      if (!Number.isSafeInteger(amount_cents) || amount_cents <= 0 || !Number.isInteger(day) || day < 1 || day > 28 || !RAIL_NAMES[row.rail] || !row.payee_name) return null;
      return { id: row.id || null, kind: "rent", payee_name: String(row.payee_name), payee_handle: row.payee_handle || null, rail: row.rail, amount_cents, day_of_month: day, funding: row.funding || "checking", status: row.status === "stopped" ? "stopped" : "active", last_staged_month: row.last_staged_month || null, created_at: row.created_at || null, updated_at: row.updated_at || null };
    }
    // The one active rent rule among a person's rows (the table allows one; the newest wins if a host ever passes more).
    function activeRule(rows) {
      const live = (rows || []).map(normRule).filter(r => r && r.status === "active");
      live.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
      return live[0] || null;
    }

    const YES = /^\s*(?:y|yes|yep|yeah|yup|ya|ok|okay|sure|confirm|do it|go ahead|send it|set it up|stage it|yes please|yes,? (?:set it up|stage it|do it))\s*[.!]*\s*$/i;
    const NO = /^\s*(?:n|no|nope|nah|no thanks|never ?mind|nvm|forget it|scratch that|cancel|stop|skip|skip it|skip this month|not this month|not now|don'?t)\s*[.!]*\s*$/i;
    const DROP = /^\s*(?:n|no|nope|nah|stop|cancel|never ?mind|nvm|forget it|scratch that|not now)\s*[.!?]*\s*$|\b(?:nvm|never ?mind|forget it)\s*[.!?]*\s*$/i;
    const DETAILS = /^\s*(?:3|details?|more|terms|full terms)\s*[.!?]*\s*$/i;
    const FLOW_VERB = /\b(buy|sell|cancel|split|venmo|zelle|send|pay|transfer|portfolio)\b/i;
    const NEW_REQUEST = /^\s*(?:please\s+|pls\s+|can you\s+|could you\s+)?(?:send|pay|venmo|zelle|cash ?app|paypal|buy|sell|cancel|split|transfer|request|invest)\b\s+\S/i;

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now()), st = o.state || {}, ttl = o.confirm_ttl_ms || TTL;
      const Rec = typeof AgentRecipients !== "undefined" ? AgentRecipients : null, Money = typeof AgentMoney !== "undefined" ? AgentMoney : null;
      const book = o.recipients || (Rec ? Rec.book({ people: o.people || [], clock }) : null);
      let rule = o.rule ? normRule(o.rule) : activeRule(o.rows);
      let asking = st.asking || null, pending = st.pending || null;
      const staged = Array.isArray(st.staged) ? st.staged : [];
      const outbox = [];
      const today = () => o.today || ymd(clock());
      const app = rail => APPS[rail] || "the app";
      const unread = { outcome: "unavailable", reason: "standing_unreadable", text: "I can't read your rent setup right now, so I can't do that yet. Nothing was changed." };

      // The payee, through the same recipient book every person-to-person flow uses: a saved person fills in the handle
      // and the app; anyone else is named as not saved, and the person picks them in their own app.
      function resolvePayee(terms) {
        const q = terms.handle || terms.payee;
        if (!q || !book) return { name: terms.payee || terms.handle, handle: terms.handle || null, rail: terms.rail || null, saved: false, note: null };
        const r = book.resolve(q);
        if (r.status === "ambiguous") return { ask: r.ask, candidates: r.candidates };
        if (r.status === "saved") {
          const p = r.person, rail = terms.rail || (p.rails && p.rails.length === 1 ? p.rails[0] : null);
          const handle = terms.handle || (p.handles && rail ? p.handles[rail] || null : p.handle || null);
          return { name: p.name, handle, rail, saved: !!(handle && p.handles && rail && p.handles[rail]) || (!p.handles && !!p.handle), note: null };
        }
        const near = r.status === "lookalike" && r.suspect ? ` ${r.suspect.name} is saved and looks similar, so check it's the right person.` : "";
        return { name: terms.payee || terms.handle, handle: terms.handle || null, rail: terms.rail || null, saved: false, note: near };
      }
      const terms4 = x => ({ payee_name: x.name, payee_handle: x.handle || null, rail: x.rail, amount_cents: x.amount_cents, day_of_month: x.day, funding: x.funding || o.default_funding || "checking" });
      const restate = x => `${money(x.amount_cents)} to ${x.payee_name} on ${RAIL_NAMES[x.rail]}, monthly on the ${ord(x.day_of_month)}, from ${x.funding}`;
      const ASK_ALL = "Who do you pay rent to, how much, and which day of the month? e.g. 'Mike $1,450 on the 1st via Zelle'";

      // Setup or change: every term the card needs, or the one question that names what is missing.
      function card(terms, mode, lead) {
        const L = lead ? lead + " " : "";
        if (Money && Money.SCAM && Money.SCAM.test(String(terms.text || ""))) { asking = null; return { outcome: "stop", reason: "scam_pattern", text: `That's a scam pattern ("${Money.SCAM.exec(String(terms.text))[0]}"); real landlords don't ask for rent this way. Nothing was set up.` }; }
        if (terms.rail_not_built && !terms.rail) {
          asking = { at: clock(), mode, terms: Object.assign({}, terms, { rail_not_built: null }) };
          return { outcome: "ask", reason: "rent_terms", not_built: "rail", text: `${L}Paying rent by ${terms.rail_not_built} from Upmore isn't built, so nothing was set up. I can stage it each month in Zelle, Venmo, Cash App or PayPal for you to send. Which one does your landlord take?` };
        }
        if (terms.two_accounts) {
          asking = { at: clock(), mode, terms: Object.assign({}, terms, { two_accounts: false, funding: null }) };
          return { outcome: "ask", reason: "rent_terms", text: `${L}Rent comes from one account each month, not two, so nothing was set up. Which one: checking or savings? And who do you pay, how much, and which day of the month? e.g. 'Mike $1,450 on the 1st via Zelle from checking'` };
        }
        const who = terms.payee || terms.handle ? resolvePayee(terms) : null;
        if (who && who.ask) { asking = { at: clock(), mode, terms, candidates: who.candidates.map(c => ({ name: c.name, handle: c.handle || null })) }; return { outcome: "ask", reason: "rent_terms", text: `${L}${who.ask}` }; }
        const rail = (who && who.rail) || terms.rail || null;
        const missing = [];
        if (!who) missing.push("who you pay it to");
        if (!terms.amount_cents) missing.push("how much");
        if (!terms.day) missing.push("which day of the month");
        if (!missing.length && !rail) missing.push("app");
        if (missing.length) {
          asking = { at: clock(), mode, terms };
          if (missing.length === 1 && missing[0] === "app") return { outcome: "ask", reason: "rent_terms", text: `${L}Which app do you pay ${who.name} with: Zelle, Venmo, Cash App or PayPal?` };
          if (missing.length === 3) return { outcome: "ask", reason: "rent_terms", text: `${L}${ASK_ALL}` };
          const got = [who ? who.name : null, terms.amount_cents ? money(terms.amount_cents) : null, terms.day ? `the ${ord(terms.day)}` : null].filter(Boolean).join(", ");
          const q = missing.join(missing.length === 2 ? " and " : ", ");
          return { outcome: "ask", reason: "rent_terms", text: `${L}Got ${got}. Tell me ${q} for rent, e.g. 'Mike $1,450 on the 1st via Zelle'.` };
        }
        if (terms.day > 28) { asking = { at: clock(), mode, terms: Object.assign({}, terms, { day: null }) }; return { outcome: "ask", reason: "rent_terms", text: `${L}I can set rent for the 1st to the 28th, so it lands in every month, February too. Which day should I use?` }; }
        asking = null;
        const next = terms4(Object.assign({}, terms, { name: who.name, handle: who.handle, rail }));
        const warn = terms.new_payee ? "A new payee for rent is the most common rent scam: check it with your landlord on a number you already have. " : "";
        const unsaved = who.saved ? "" : `${who.name} isn't saved in Upmore, so you'll pick them in ${RAIL_NAMES[rail]} yourself each month.${who.note || ""} `;
        if (mode === "change" && rule) {
          const moved = [];
          if (next.amount_cents !== rule.amount_cents) moved.push(`amount ${money(rule.amount_cents)} to ${money(next.amount_cents)}`);
          if (next.day_of_month !== rule.day_of_month) moved.push(`day the ${ord(rule.day_of_month)} to the ${ord(next.day_of_month)}`);
          if (next.payee_name !== rule.payee_name) moved.push(`payee ${rule.payee_name} to ${next.payee_name}`);
          else if (rule.payee_handle && next.payee_handle && next.payee_handle !== rule.payee_handle) moved.push(`handle ${rule.payee_handle} to ${next.payee_handle}`);
          if (next.rail !== rule.rail) moved.push(`app ${RAIL_NAMES[rule.rail]} to ${RAIL_NAMES[next.rail]}`);
          if (next.funding !== rule.funding) moved.push(`account ${rule.funding} to ${next.funding}`);
          if (!moved.length) return { outcome: "already_done", text: `${L}That's already your rent: ${restate(rule)}. Nothing changed.` };
          pending = { kind: "change", confirmation_id: `rent-change-${clock()}`, at: clock(), rule_id: rule.id, terms: next };
          return { outcome: "confirm", confirmation_id: pending.confirmation_id, text: `${L}${warn}Change rent (${moved.join("; ")}): ${restate(next)}, for you to send each month. Each month I'll still put up the card and wait for your yes. Reply YES or NO within 10 min.` };
        }
        pending = { kind: "setup", confirmation_id: `rent-setup-${clock()}`, at: clock(), terms: next };
        return { outcome: "confirm", confirmation_id: pending.confirmation_id, text: `${L}${warn}${unsaved}Set up rent: ${restate(next)}, for you to send each month. Each month I'll put up the card and wait for your yes; one message ('stop rent') turns it off. Reply YES or NO within 10 min.` };
      }
      // This month's card: the amount, the month, the recipient and the due date, restated every time.
      function monthCard(lead) {
        const L = lead ? lead + " " : "", c = cycle(rule, today()), name = monthName(c.month);
        if (rule.last_staged_month === c.month || staged.some(s => s.month === c.month && s.rule_id === rule.id && !s.cancelled)) return { outcome: "already_done", text: `${L}${name}'s rent is already staged: ${money(rule.amount_cents)} to ${rule.payee_name} in ${app(rule.rail)}. I didn't stage it again. If you haven't sent it yet, send it from there; Upmore never sends it for you.` };
        pending = { kind: "month", confirmation_id: `rent-${c.month}-${clock()}`, at: clock(), rule_id: rule.id, month: c.month, due_on: c.due_on, amount_cents: rule.amount_cents, payee_name: rule.payee_name, payee_handle: rule.payee_handle, rail: rule.rail, funding: rule.funding, day_of_month: rule.day_of_month };
        const when = c.late_days ? `was due ${fmtDay(c.due_on)} (${c.late_days} day${c.late_days === 1 ? "" : "s"} ago)` : `due ${fmtDay(c.due_on)}`;
        return { outcome: "confirm", confirmation_id: pending.confirmation_id, month: c.month, text: `${L}Rent for ${name}: ${money(rule.amount_cents)} to ${rule.payee_name} on ${RAIL_NAMES[rule.rail]}, ${when}, from ${rule.funding}, for you to send. Reply YES to stage it or NO to skip this month, within 10 min.` };
      }
      function stop(lead) {
        const L = lead ? lead + " " : "";
        if (o.unavailable) return unread;
        if (!rule) return { outcome: "nothing_to_stop", text: `${L}You don't have rent set up, so there was nothing to turn off. Nothing changed.` };
        const was = rule;
        if (was.id) outbox.push({ op: "update", id: was.id, set: { status: "stopped" } });
        rule = null;
        return { outcome: "rent_stopped", rule_id: was.id, text: `${L}Rent is off: no more monthly rent cards for ${was.payee_name}. Nothing was sent, and nothing else changed. Say 'pay my rent' to set it up again.` };
      }

      function start(text) {
        const t = String(text || "").trim(), kind = intent(t) || "pay";
        const lead = pending || asking ? "I dropped the open rent card." : null;
        pending = null; asking = null;
        if (o.unavailable) return unread;
        if (kind === "stop") return stop(lead);
        // The request words themselves ("can you pay my rent") are not terms; what follows them may be ("... to Mike $1,450").
        const rest = kind === "pay" ? t.replace(PAY, " ") : kind === "setup" ? t.replace(SETUP, " ") : t;
        const terms = Object.assign(parseTerms(rest, { loose: false }), { text: t });
        if (!rule) {
          // A change with nothing on file is a setup with what was said so far.
          if (kind === "change" && !hasTerms(terms)) { asking = { at: clock(), mode: "setup", terms: {} }; return { outcome: "ask", reason: "rent_terms", text: `${lead ? lead + " " : ""}You don't have rent set up yet. ${ASK_ALL}` }; }
          return card(terms, "setup", [lead, kind === "change" ? "You don't have rent set up yet." : null, AUTOPAY.test(t) ?"Rent never pays itself here: each month I put up the card, you say yes, and you send it in your app." : null].filter(Boolean).join(" ") || null);
        }
        if (kind === "change" || ((kind === "setup" || kind === "pay") && hasTerms(terms))) return card(merge(fromRule(rule), terms), "change", lead);
        if (kind === "setup") return { outcome: "already_done", text: `${lead ? lead + " " : ""}${AUTOPAY.test(t) ? "Rent never pays itself here: each month's card waits for your yes. " : ""}Rent is already set up: ${restate(rule)}. Say 'pay my rent' for this month's card, 'rent is <amount> now' to change it, or 'stop rent' to turn it off.` };
        return monthCard(lead);
      }
      const fromRule = r => ({ payee: r.payee_name, handle: r.payee_handle, amount_cents: r.amount_cents, day: r.day_of_month, rail: r.rail, funding: r.funding });
      const fromPending = p => p.kind === "month" ? fromRule(p) : { payee: p.terms.payee_name, handle: p.terms.payee_handle, amount_cents: p.terms.amount_cents, day: p.terms.day_of_month, rail: p.terms.rail, funding: p.terms.funding };

      function approve(p) {
        if (p.kind === "setup") {
          if (rule) return { outcome: "changed", text: `Rent was set up somewhere else in the meantime (${restate(rule)}), so I didn't add a second one. Nothing was sent.` };
          outbox.push({ op: "insert", row: Object.assign({ kind: "rent", status: "active" }, p.terms) });
          rule = normRule(Object.assign({ id: null, status: "active", created_at: new Date(clock()).toISOString() }, p.terms));
          const c = cycle(rule, today()), soon = c.days_until >= 0 && c.days_until <= LEAD_DAYS ? ` ${monthName(c.month)}'s is due ${fmtDay(c.due_on)}: say 'pay my rent' for its card.` : "";
          return { outcome: "rent_set", rule: p.terms, text: `Rent is set up: ${restate(p.terms)}. Nothing was sent. ${LEAD_DAYS} days before each due date I'll put up that month's card for your yes; nothing is staged without it. Say 'stop rent' anytime.${soon}` };
        }
        if (!rule || (p.rule_id && rule.id && p.rule_id !== rule.id)) return { outcome: "changed", text: "Your rent setup changed or was turned off since that card went up, so nothing was changed or staged. Say 'pay my rent' to start again." };
        if (p.kind === "change") {
          if (rule.id) outbox.push({ op: "update", id: rule.id, set: Object.assign({}, p.terms) });
          rule = Object.assign({}, rule, p.terms);
          return { outcome: "rent_changed", rule: p.terms, text: `Rent changed: ${restate(rule)}. Nothing was sent; each month's card still waits for your yes.` };
        }
        // This month's: stop-on-change against the rule as it is now, then staged for the person to send.
        const moved = [];
        if (rule.amount_cents !== p.amount_cents) moved.push(`the amount changed from ${money(p.amount_cents)} to ${money(rule.amount_cents)}`);
        if (rule.payee_name !== p.payee_name || rule.rail !== p.rail || (rule.payee_handle || null) !== (p.payee_handle || null)) moved.push("the recipient changed");
        if (moved.length) { const again = monthCard(); return Object.assign({}, again, { outcome: again.outcome === "confirm" ? "confirm" : again.outcome, moved, text: `Stopped before staging: ${moved.join("; ")}. Nothing was staged. ${again.text}` }); }
        if (rule.last_staged_month === p.month) return { outcome: "already_done", text: `${monthName(p.month)}'s rent is already staged. I didn't stage it again.` };
        const rail = Money && Money.RAILS && Money.RAILS[p.rail] ? Object.assign({ id: p.rail }, Money.RAILS[p.rail]) : { id: p.rail, name: RAIL_NAMES[p.rail], mode: "handoff", app: app(p.rail), speed: "lands in minutes", reversible: "irreversible once received" };
        const send = { amount_cents: p.amount_cents, recipient: { name: p.payee_name, handle: p.payee_handle || null }, rail, memo: `Rent ${monthName(p.month)}`, confirm: { from: p.funding } };
        const h = Money && Money.handoff ? Money.handoff(send) : { app: app(p.rail), steps: [], text: `Staged, not sent. Send ${money(p.amount_cents)} to ${p.payee_handle || p.payee_name} in ${app(p.rail)} with the memo "Rent ${monthName(p.month)}".`, watch: { amount_cents: p.amount_cents, counterparty: p.payee_name, deadline_days: 1 } };
        staged.push({ rule_id: p.rule_id, month: p.month, amount_cents: p.amount_cents, payee_name: p.payee_name, payee_handle: p.payee_handle || null, rail: p.rail, staged_at: clock(), landed: null, watch: h.watch });
        if (rule.id) outbox.push({ op: "update", id: rule.id, set: { last_staged_month: p.month } });
        rule = Object.assign({}, rule, { last_staged_month: p.month });
        return { outcome: "staged", month: p.month, app: h.app, steps: h.steps, watch: h.watch, send: { amount_cents: p.amount_cents, recipient: { name: p.payee_name, handle: p.payee_handle || null }, rail: { id: p.rail, name: RAIL_NAMES[p.rail] } },
          text: `Rent for ${monthName(p.month)}: ${h.text} Upmore didn't move any money; you send it.` };
      }
      function reply(text) {
        const t = String(text || "").trim();
        if (pending) {
          const p = pending;
          if (DETAILS.test(t)) return { outcome: "details", text: details(p) };
          if (NO.test(t)) {
            pending = null;
            if (p.kind === "month") return { outcome: "declined", reason: "skipped_month", text: `Okay, skipping ${monthName(p.month)}'s rent card. Nothing was staged or sent. Say 'pay my rent' if you change your mind.` };
            return { outcome: "declined", text: p.kind === "change" ? "Okay, rent stays as it was. Nothing changed." : "Okay, nothing was set up." };
          }
          if (YES.test(t)) {
            pending = null;
            // A stale yes never fires: the card expired, and a fresh one goes up from the same terms for a fresh yes.
            if (clock() - p.at > ttl) {
              const again = p.kind === "month" ? (rule ? monthCard() : { outcome: "changed", text: "Rent was turned off since then." }) : card(fromPending(p), p.kind === "change" ? "change" : "setup");
              return again.outcome === "confirm" ? Object.assign({}, again, { expired: true, text: `That card expired, so nothing was ${p.kind === "month" ? "staged" : "set up"}. Here's a fresh one: ${again.text}` }) : { outcome: "expired", text: `That card expired, so nothing was ${p.kind === "month" ? "staged" : "set up"}. ${again.text}` };
            }
            return approve(p);
          }
          // A new amount, day or app while a card is up corrects it: a fresh card, never a silent change.
          const fix = parseTerms(t);
          if (fix.amount_cents || fix.day || fix.rail || fix.handle || fix.funding) {
            pending = null;
            const base = fromPending(p), mode = p.kind === "setup" ? "setup" : "change";
            const again = card(merge(base, Object.assign(fix, { payee: null, text: t })), mode);
            return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
          }
          return { outcome: "ask", text: `Yes or no? ${p.kind === "month" ? monthCard().text : details(p)}` };
        }
        if (asking) {
          const a = asking;
          if (clock() - a.at > ASK_TTL) { asking = null; return { outcome: "expired", text: "That question expired. Nothing was set up. Say 'pay my rent' to start again." }; }
          if (DROP.test(t)) { asking = null; return { outcome: "declined", text: "Okay, nothing was set up." }; }
          let fix = parseTerms(t);
          if (a.candidates && Rec) { const pick = Rec.choose(a.candidates, t); if (pick) fix = Object.assign({}, fix, { payee: pick.name, handle: pick.handle || null }); }
          asking = null;
          return card(merge(a.terms, Object.assign(fix, { text: t })), a.mode || "setup");
        }
        return { outcome: "nothing_pending", text: "There's no rent card waiting on you." };
      }
      function details(p) {
        const x = p.kind === "month" ? p : Object.assign({}, p.terms);
        const r = Money && Money.RAILS && Money.RAILS[x.rail] ? Money.RAILS[x.rail] : null;
        return `Rent: ${money(x.amount_cents)} to ${x.payee_name}${x.payee_handle ? ` (${x.payee_handle})` : ""} on ${RAIL_NAMES[x.rail]}, monthly on the ${ord(x.day_of_month)}, from ${x.funding}. Upmore stages it each month for you to send in ${app(x.rail)}; it never sends money itself, and every month asks for your yes.${r ? ` ${r.reversible.charAt(0).toUpperCase() + r.reversible.slice(1)}.` : ""} Reply YES or NO.`;
      }
      // A reply that answers this flow's own question goes here and never to the model.
      function accepts(text) {
        if (!asking || clock() - asking.at > ASK_TTL) return false;
        const t = String(text || "").trim();
        if (!t || t.length > 200 || intent(t)) return false;
        // A new request ("send sam $40", "cancel netflix") is never read as the rent answer; one app word alone is.
        if (NEW_REQUEST.test(t)) return false;
        if (DROP.test(t)) return true;
        if (asking.candidates && Rec && Rec.choose(asking.candidates, t)) return true;
        const x = parseTerms(t);
        if (x.amount_cents || x.day || x.rail || x.handle || x.rail_not_built) return true;
        return !!x.payee && !asking.terms.payee && t.split(/\s+/).length <= 3 && !FLOW_VERB.test(t) && !/\?\s*$/.test(t);
      }
      // "Landed" only when the debit posts, matched like the send flow matches a staged send.
      function landed(transactions) {
        const out = [];
        for (const s of staged) {
          if (s.landed || s.cancelled) continue;
          const hit = (transactions || []).find(x => { const c = Number.isInteger(x.amount_cents) ? x.amount_cents : Math.round(Number(x.amount || 0) * 100); const who = String(x.merchant_raw || "").toLowerCase(); return c === -s.amount_cents && String(x.posted_at).slice(0, 10) >= ymd(s.staged_at) && [s.payee_name, s.payee_handle].filter(Boolean).some(n => who.includes(String(n).toLowerCase().replace(/^[@$]/, "").split(/[\s@]/)[0])); });
          if (hit) { s.landed = String(hit.posted_at).slice(0, 10); out.push({ staged: s, transaction_id: hit.id || null, text: `Rent for ${monthName(s.month)} landed: ${money(s.amount_cents)} to ${s.payee_name}, posted ${s.landed} (from your linked account's transactions).` }); }
        }
        return out;
      }
      const snapshot = () => JSON.parse(JSON.stringify({ asking, pending, staged: staged.slice(-12) }));
      return { start, reply, accepts, landed, snapshot, drain: () => outbox.splice(0), outbox,
        get rule() { return rule ? Object.assign({}, rule) : null; },
        get pending() { return pending ? { confirmation_id: pending.confirmation_id, kind: pending.kind, amount_cents: pending.kind === "month" ? pending.amount_cents : pending.terms.amount_cents, recipient: pending.kind === "month" ? pending.payee_name : pending.terms.payee_name, month: pending.month || null } : null; },
        get awaiting_input() { return !!asking && clock() - asking.at <= ASK_TTL; } };
    }
    return { create, intent, parseTerms, cycle, dueSoon, normRule, activeRule, CAPABILITY, LEAD_DAYS, TTL };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = StandingRent;
