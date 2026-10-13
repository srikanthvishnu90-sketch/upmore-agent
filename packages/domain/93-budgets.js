  /* Category budgets in chat (overnight H1; teardown 2 build-order step 4 "Budget, left-to-spend number and tracking-only
     goals"; teardown sections Origin/Budgeting, Monarch/Budgeting, Rocket Money/Budgets and habits, Copilot
     Money/Categories and budgets, YNAB/Categories and category groups). Tracking only: a budget never moves money, never
     blocks a payment and never decides anything. Numbers only, no advice.
       parse(words)                             what a message asks: set, stop, a status ask, or null (anything else)
       command(words, watches, now, tz)         set or stop, as a new watch list and the restating reply (null otherwise)
       answer(words, { budgets, transactions, now, tz })   "how am i doing on my grocery budget", "how are my budgets",
                                                "am i over budget", a bare "am i on track" (nothing with no
                                                budget, so it goes on to the model): spent this month so far,
                                                left, the day of the month and the pace, top 3 merchants, uncategorized spending said apart
       alerts(budgets, transactions, now, { tz, sent })    the 80% and 100% messages the agent sends on its own, once per
                                                budget per month per threshold (the key says which)
       monthlyReport(budgets, rows, monthKey, { rules })   (C16) a completed month's caps vs actuals in dollars per
                                                budget: spent, cap, over/left, percent of cap, the biggest merchants,
                                                and the P2P share (Venmo/Cash App/Zelle/PayPal rows counted in the
                                                category like any charge, named apart); parse/answer serve it in
                                                chat as kind "report" ("budget report", "how did I do on my budgets")
     A budget is stored as a person-set watch of kind "category_budget" in agent_proactive_settings.watches (no migration):
       { id, kind: "category_budget", category, amount_cents, period: "month", created_at, created_on, status, text }
     with no run of 9 or more digits anywhere (the table's check refuses one), and at most one per category.
     One per category; setting it again replaces it (the reply says the old amount). The categories are exactly the ones
     "how much did i spend on groceries" uses (MoneyAnswers.CATEGORIES and its merchant list, 80-money-answers.js), with
     the person's own category rules applied the same way (95-category-rules.js; answer's input.rules, alerts' opts.rules):
     a merchant it doesn't know is never guessed into one, and the uncategorized total is said instead.
     What counts: posted rows in US dollars in the person's own calendar month (their time zone), transfers and card
     payments left out, a refund in the category taken off. Pending charges and other currencies are said, never added.
     Bank posted dates are UTC, so a row dated the day after the person's today is this evening's and counts today (on the
     last day of a month it counts in that month). Known limit: a row dated the 1st that was really the evening before
     counts in the new month too; the time of day isn't in the rows, so it can't be told apart. Pure: rows and the clock
     are passed in. Depth packet BUDGETS (tests/depth-BUDGETS.test.cjs). */
  const Budgets = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const KIND = "category_budget", MAX_CENTS = 10000000, DAY = 86400000;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = MA.money;
    const pad = (n) => String(n).padStart(2, "0");
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    // What each category takes in, said in the set reply so the person knows what counts.
    const SAYS = {
      delivery: "food delivery (DoorDash, Uber Eats, Grubhub and the like)",
      groceries: "grocery stores I recognize (Kroger, Trader Joe's, Whole Foods, Costco and the like)",
      restaurants: "restaurants, coffee shops and fast food I recognize",
      food: "groceries, restaurants and food delivery together",
      gas: "gas stations I recognize",
      subscriptions: "subscriptions and streaming I recognize",
      transport: "rideshare, transit, parking and tolls I recognize",
      shopping: "stores like Amazon, Target and Walmart I recognize",
      prediction_markets: "prediction markets I recognize (Polymarket, Kalshi and the like, from merchant knowledge)",
      sports_betting: "sports betting I recognize (Rebet and the like, from merchant knowledge)",
      health: "health & wellness I recognize (pharmacies and the merchants in merchant knowledge)",
      work_services: "freelance/work services I recognize (Fiverr and the like, from merchant knowledge)",
      entertainment: "entertainment I recognize (Topgolf and the like, from merchant knowledge)",
      fees: "bank fees I recognize (a monthly service fee and the like)",
      pay_later: "pay-later payments I recognize (Affirm and the like)",
      person_to_person: "person-to-person payments I recognize (Zelle, Apple Cash, Venmo and the like)",
      investing: "investing transfers I recognize (a Robinhood debit and the like)",
    };
    const LIST = "food delivery, groceries, restaurants (eating out, dining, coffee), food (groceries, restaurants and delivery together), gas, subscriptions, transport, shopping";
    // The category a message names, from the same words "how much did i spend on ..." reads.
    function categoryIn(words) {
      const w = String(words || "").toLowerCase();
      return MA.CATEGORIES.find((c) => c.words.test(w)) || null;
    }
    const byKey = (k) => MA.CATEGORIES.find((c) => c.key === k) || null;

    // ---- the person's words ----
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|pls|please|quick q:?|upmore)[,\s]+)*(?:(?:can|could|would|will) you\s+(?:please\s+)?|please\s+|pls\s+)?/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    // A dollar amount: "$400", "400", "$1,200.50", "400 bucks", "-50", "zero".
    function amountIn(t) {
      const m = /(-|minus\s+|negative\s+)?\$\s?(-)?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(t)
        || /(?:^|[^\w.$,])(-|minus\s+|negative\s+)?(?:\s?)()(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\w%])/.exec(t);
      if (!m) return /\bzero\b|\bnothing\b/.test(t) ? { cents: 0, text: "0" } : null;
      const whole = Number(m[3].replace(/,/g, "")), frac = m[4] ? Number(m[4].padEnd(2, "0")) : 0;
      const neg = !!(m[1] || m[2]);
      return { cents: (neg ? -1 : 1) * (whole * 100 + frac), text: m[0].trim() };
    }
    const NOT_MONTHLY = /\b(?:a|per|each|every|\/)\s*(?:week|wk|day|year|yr|quarter)\b|\/(?:wk|week|day|yr|year)\b|\bweekly\b|\bbi-?weekly\b|\bdaily\b|\byearly\b|\bannual(?:ly)?\b|\bquarterly\b|\bfortnight(?:ly)?\b|\bthis week\b|\bnext week\b/;
    const QUESTION = /^(?:how|what|why|when|where|which|who|should|could|would|is|are|do|does|did|can i|am i|if)\b/;
    const SET = /^(?:set|make|create|start|add|put|setup|give me|i want|i'd like|i would like|let'?s do|let'?s set|lets set|lets do|track)\b.*\bbudget\b|^budget\b|^(?:my|our|the)?\s*[a-z' -]{0,30}\bbudget\b\s*(?:is|=|:|should be|will be|to|at|of|now|now is|for)?\s*(?:-|minus\s+|negative\s+)?\$?\s?-?\d|^(?:my|our|the)\s+(?:monthly\s+)?budget (?:for|on) [a-z' -]{1,30}?\s+(?:is|=|should be|will be|is now)\s+\$?\s?\d/;
    const STOP = /^(?:stop|delete|remove|cancel|clear|end|drop|turn off|get rid of|kill|forget|reset|erase|no more)\s+(?:(all)\s+(?:of\s+)?)?(?:my|the|our)?\s*(.*?)\s*\bbudget(s)?(?:\s+(?:too|please|pls|now))?$|^stop budgeting(?:\s+(?:for|on))?\s*(.*)$/;
    const SKIP_WORDS = /^(?:a|an|the|my|our|monthly|month|total|overall|whole|entire|current|new|this|that|me|up|set|budget)$/;
    // The word(s) a message used for a category that isn't one, so the reply can name it instead of guessing.
    function unknownWord(t) {
      const m = /\bfor\s+([a-z][a-z' -]{1,30}?)\s*(?:\b(?:a|per|each|every) month\b|\bmonthly\b|\bthis month\b)?\s*$/.exec(t) || /([a-z][a-z'-]{1,24})\s+budget\b/.exec(t);
      if (!m) return null;
      const w = m[1].trim().replace(/\s+(?:a|per|each|every)\s+month$/, "").replace(/\s+monthly$/, "").trim();
      return w && !SKIP_WORDS.test(w) ? w : null;
    }
    // Megadoc L04: "am I on track", said after setting a budget. Only the bare words (and "this month", "so far"): "on
    // track to retire" or "with my savings goal" is about something else. A bare ask is the status of every budget for a
    // person who has one; with none, answer() gives nothing and the message goes on to the model (bare: true says so).
    const BARE = /^(?:am i|are we) (?:on track|on pace|doing ok(?:ay)?)(?: this month| so far| right now)?$/;
    function parse(words) {
      const t = clean(words);
      if (BARE.test(t)) return { kind: "status", category: null, all: true, over: false, unknown: null, bare: true };
      if (!/\bbudget(?:s|ing)?\b/.test(t) || t.length > 200) return null;
      let m;
      if ((m = STOP.exec(t))) {
        const rest = (m[2] !== undefined ? m[2] : m[4] || "").replace(/^(?:all\s+(?:of\s+)?)?(?:my|the|our)\s+/, "").trim();
        const cat = categoryIn(rest);
        const all = !!m[1] || (!cat && (!rest || /^(?:all|every|each|any)$/.test(rest)) && (!!m[3] || !rest));
        return { kind: "stop", category: cat ? cat.key : null, all: all && !cat, unknown: !cat && !all ? (rest || null) : null };
      }
      // A wish to budget better is not a budget ("i want to budget better", "learn to budget"; found 2026-10-12: it got
      // "I don't have a \"to\" category"). A budget with an amount still is ("i want to budget $400 for groceries").
      if (/\bbudget(?:ing)? (?:better|more|less|properly|smarter|well|wisely)\b|\b(?:learn|how|want|need|try|trying|start) (?:how )?to (?:start )?budget\b(?!\s+\$?\d)/.test(t)) return null;
      // C16: the monthly report ask — "budget report", "how did I do on my budgets", "last month's budgets", or a
      // named month with a report word ("September budget report"). A set command (a set verb, or any amount) is
      // never a report; SET's own bare "^budget" opener would otherwise swallow "budget report" itself.
      if (!amountIn(t) && !/^(?:set|make|create|start|add|put|setup|give me|i want|i'd like|i would like|let'?s)\b/.test(t)) {
        const monthIdx = MONTHS.findIndex((n) => t.includes(n.toLowerCase())) + 1 || MON.findIndex((n) => new RegExp(`\\b${n.toLowerCase()}\\b`).test(t)) + 1;
        if (/\bbudgets?\s+report\b|\breport\b.*\bbudgets?\b|\bbudgets?\s+recap\b|\bhow did (?:i|we) do\b|\blast month'?s?\b|\bprevious month\b/.test(t) || (monthIdx > 0 && /\b(?:report|recap|how|did|were|was|show|give|see)\b/.test(t))) return { kind: "report", month: monthIdx || null };
      }
      if (QUESTION.test(t) || /\b(?:should|could|would|tips?|advice|help me|ideas?|good|reasonable|realistic|average|normal|typical)\b/.test(t)) return status(t);
      if (SET.test(t)) {
        const amt = amountIn(t), rest = amt ? t.replace(amt.text, " ") : t;
        const cat = categoryIn(rest.replace(/\bbudget\b/g, " "));
        return { kind: "set", category: cat ? cat.key : null, amount_cents: amt ? amt.cents : null, amount_text: amt ? amt.text.replace(/^(?:minus|negative)\s+/, "-") : null, not_monthly: NOT_MONTHLY.test(t), unknown: cat ? null : unknownWord(rest) };
      }
      return status(t);
    }
    // "how am i doing on my grocery budget", "how are my budgets", "am i over budget", "what's left in my dining budget",
    // "show my budgets", "grocery budget?". A how-to or advice question ("how do i make a budget", "what's a good grocery
    // budget") is not a status ask: it goes on to the model.
    const STATUS = [
      /^how(?:'s|s| is| are|'re| am i| r| am i doing| are we doing| we doing| i'm doing| im doing)\b.*\b(?:my|our|the)\b.*\bbudgets?\b/,
      /^how am i doing (?:on|with|against) budget\b/,
      /^how much(?: money)?(?: is| do i have| have i got| do we have|'s)? (?:left|remaining) (?:in|on|of|for) (?:my|our|the)\b.*\bbudget\b/,
      /^how much (?:is )?left (?:in|on|of) (?:my|our|the)\b.*\bbudget\b/,
      /^how much (?:of )?(?:my|our|the)\b.*\bbudget\b.*\b(?:left|used|spent|remaining|is left)\b/,
      /^how much (?:have i|did i|i've|ive) (?:spent|used) (?:of|from|against) (?:my|our|the)\b.*\bbudget\b/,
      /^am i (?:over|under|on|within|inside|staying|still|doing ok|ok|good|on track|on pace|ahead|behind|close)\b.*\bbudgets?\b/,
      /^(?:did|have) i (?:go|gone|went|blow|blown|bust|busted) (?:over )?(?:my|our|the|any)?\s*.*\bbudgets?\b/,
      /^(?:what'?s|whats|what is) (?:left|remaining) (?:in|on|of|for) (?:my|our|the)\b.*\bbudgets?\b/,
      /^(?:show|list|check|see|view|give|tell)(?: me)? (?:all )?(?:my|our|the)\b.*\bbudgets?\b(?: status| progress| so far)?$/,
      /^(?:what are|whats|what'?s|what is|where am i (?:on|with)|where are we (?:on|with)) (?:all )?(?:my|our)\b.*\bbudgets?\b(?: status| progress| at)?$/,
      /^(?:my |our |the )?budgets?(?: status| check| update| progress| so far)?$/,
      /^budget (?:check|status|update|progress)$/,
    ];
    const NOT_STATUS = /\bhow (?:do|does|should|can|could|would|to)\b|\b(?:should|tips?|advice|ideas?|help|plan|planning|work|works|make|create|build|set ?up|setup|start|good|reasonable|realistic|average|normal|typical|recommend)\b/;
    // "grocery budget?" alone: a status ask only when the words name a category ("family budget" goes on to the model).
    const NAMED = /^(?:my |our |the )?([a-z][a-z' -]{1,25}) budget(?: status| check| update| progress| so far)?$/;
    function status(t) {
      const s = t.replace(/\s+(?:this month|so far|right now|now|today|lately|this month so far)$/, "").trim();
      const named = NAMED.exec(s);
      if (NOT_STATUS.test(s) || !(STATUS.some((re) => re.test(s)) || (named && categoryIn(named[1])))) return null;
      const cat = categoryIn(s.replace(/\bbudgets?\b/g, " "));
      const over = /^am i (?:over|under|within|inside|staying)|^(?:did|have) i (?:go|gone|went|blow|blown|bust|busted)/.test(s);
      const w = cat ? null : (/(?:my|our|the)\s+([a-z][a-z'-]{1,24}(?:\s[a-z][a-z'-]{1,24})?)\s+budget\b/.exec(s) || /^([a-z][a-z'-]{1,24})\s+budget\b/.exec(s) || [])[1];
      const unknown = w && !SKIP_WORDS.test(w) && !/^(?:my|our|the|all|monthly|total|overall|whole)\b/.test(w) ? w : null;
      return { kind: "status", category: cat ? cat.key : null, all: !cat && !unknown, over, unknown };
    }

    // ---- set and stop ----
    const isBudget = (w) => w && w.kind === KIND && w.status !== "revoked";
    const budgetsIn = (watches) => (watches || []).filter(isBudget);
    const labelOf = (key) => { const c = byKey(key); return c ? c.label : key; };
    const zoneName = (tz) => String(tz || "UTC").replace(/_/g, " ");
    function todayOf(now, tz) { return MA.todayIn(now, tz || "UTC"); }
    function listOf(budgets) { return budgets.map((b) => labelOf(b.category)).join(", "); }
    function command(words, watches, now, tz) {
      const p = parse(words);
      if (!p || p.kind === "status") return null;
      const have = budgetsIn(watches);
      if (p.kind === "stop") {
        if (p.all) {
          if (!have.length) return { watches: null, reply: "You don't have any budgets set, so nothing changed." };
          return { watches: (watches || []).filter((w) => !isBudget(w)), reply: `Stopped ${have.length === 1 ? "your only budget" : `all ${have.length} budgets`}: ${have.map((b) => `${labelOf(b.category)} (${money(b.amount_cents)} a month)`).join(", ")}. I won't track ${have.length === 1 ? "it" : "them"} or send ${have.length === 1 ? "its" : "their"} alerts. Nothing else changed.` };
        }
        const mine = p.category ? have.find((b) => b.category === p.category) : null;
        if (!mine) {
          const what = p.category ? labelOf(p.category) : p.unknown ? `"${p.unknown}"` : "that";
          return { watches: null, reply: `You don't have a ${what} budget, so nothing changed.${have.length ? ` Your budgets: ${listOf(have)}.` : ""}` };
        }
        return { watches: (watches || []).filter((w) => w !== mine), reply: `Stopped your ${labelOf(mine.category)} budget (${money(mine.amount_cents)} a month). I won't track it or send its alerts. Nothing else changed.` };
      }
      // Set.
      const cat = p.category ? byKey(p.category) : null;
      if (!cat) return { watches: null, reply: `${p.unknown ? `I don't have a "${p.unknown}" category` : "I couldn't tell which category"}, so nothing was set. Categories I can budget: ${LIST}.` };
      if (p.not_monthly) return { watches: null, reply: `I can only track a budget by calendar month, so nothing was set. Say "budget ${p.amount_cents != null && p.amount_cents > 0 ? (p.amount_cents / 100).toFixed(p.amount_cents % 100 ? 2 : 0) : "400"} a month for ${cat.label}" if you want a monthly one.` };
      if (p.amount_cents == null) return { watches: null, reply: `How much a month for ${cat.label}? Say "set a ${cat.label} budget of 400" with your number. Nothing was set.` };
      if (p.amount_cents <= 0) return { watches: null, reply: `A budget needs an amount above $0.00, so nothing was set. Say "set a ${cat.label} budget of 400" with your number.` };
      if (p.amount_cents > MAX_CENTS) return { watches: null, reply: `That's more than I track as a monthly budget (${money(MAX_CENTS)} a month at most), so nothing was set.` };
      const old = have.find((b) => b.category === cat.key);
      const nowMs = typeof now === "number" ? now : Date.parse(now);
      // The settings table refuses any run of 9 or more digits in watches (no identity numbers, owner rule), so the id
      // carries the time in base 36 and created_at is an ISO string; the person's words are kept without long digit runs.
      const b = { id: `budget-${cat.key}-${nowMs.toString(36)}`, kind: KIND, category: cat.key, amount_cents: p.amount_cents, period: "month", created_at: new Date(nowMs).toISOString(), created_on: todayOf(nowMs, tz), status: "active", text: String(words || "").replace(/\d{9,}/g, "#").slice(0, 200) };
      const next = (watches || []).filter((w) => w !== old).concat([b]);
      const lines = [
        `Budget set: ${cat.label}, ${money(b.amount_cents)} a month.${old ? ` That replaces your ${money(old.amount_cents)} ${cat.label} budget.` : ""}`,
        `I'll count posted spending at ${SAYS[cat.key]}, each calendar month in ${zoneName(tz)} time, with refunds taken off. Transfers don't count; pending charges and charges in other currencies are mentioned, not added; anything I can't place in a category is shown apart, never guessed in.`,
        `It only tracks: it never moves money or blocks a payment. I'll message you once at 80% and once at 100% each month.`,
        `Say "stop my ${cat.label} budget" to turn it off.`,
      ];
      return { watches: next, reply: lines.join("\n") };
    }

    // ---- the numbers ----
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD";
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    // The person's month so far: from the 1st through today, plus a row dated tomorrow (this evening, in UTC).
    function monthWindow(now, tz) {
      const today = todayOf(now, tz), y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10);
      return { today, from: `${y}-${pad(m)}-01`, to: addDays(today, 1), y, m, day: d, days: lastDay(y, m), name: MONTHS[m - 1], key: `${y}-${pad(m)}` };
    }
    const inWindow = (r, w) => { const d = dayOf(r); return d !== null && d >= w.from && d <= w.to; };
    // The person's category rules (95-category-rules.js) place a merchant the same way here as in the spending answer.
    const groupOf = (r, rules) => { const c = MA.classify(r.merchant_raw, rules); return c ? c.group : null; };
    // One budget's month: net spent (charges minus refunds), what's pending, what's in another currency, top 3 places.
    function tally(budget, rows, w, rules) {
      const cat = byKey(budget.category), groups = cat ? cat.groups : [];
      const inCat = (r) => groups.includes(groupOf(r, rules));
      const usable = rows.filter((r) => r && Number.isFinite(cents(r)) && !r.is_transfer && inCat(r));
      const posted = usable.filter((r) => !r.is_pending && usd(r) && inWindow(r, w));
      const charges = posted.filter((r) => cents(r) < 0 && MA.isSpend(r)), refunds = posted.filter((r) => cents(r) > 0);
      const charged = charges.reduce((s, r) => s - cents(r), 0), refunded = refunds.reduce((s, r) => s + cents(r), 0);
      const pending = usable.filter((r) => r.is_pending && usd(r) && cents(r) < 0 && (dayOf(r) === null || inWindow(r, w)));
      const foreign = usable.filter((r) => !r.is_pending && !usd(r) && cents(r) < 0 && inWindow(r, w));
      const by = new Map();
      for (const r of charges.concat(refunds)) { const k = MA.display(r.merchant_raw); by.set(k, (by.get(k) || 0) - cents(r)); }
      const top = [...by.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
      const spent = charged - refunded;
      // C16: the P2P share of what counted. A payment through Venmo, Cash App, Zelle or PayPal is spend like
      // any card charge when it lands in the category (by the merchant in the descriptor, or the person's own
      // category rule); it is counted once, in the same total, and the report names how much came via a rail.
      const p2pBy = new Map();
      for (const r of charges) { const rail = p2pRail(r.merchant_raw); if (rail) p2pBy.set(rail, (p2pBy.get(rail) || 0) - cents(r)); }
      for (const r of refunds) { const rail = p2pRail(r.merchant_raw); if (rail && p2pBy.has(rail)) p2pBy.set(rail, p2pBy.get(rail) + cents(r)); }
      const p2pRails = [...p2pBy.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const p2p = p2pRails.reduce((s, [, v]) => s + v, 0);
      return { budget, label: cat ? cat.label : budget.category, amount: budget.amount_cents, spent, left: budget.amount_cents - spent, refunded, pending, foreign, top, p2p, p2pRails, counted: charges.concat(refunds) };
    }
    const P2P_RAILS = [[/\bvenmo\b/i, "Venmo"], [/\bcash\s?app\b/i, "Cash App"], [/\bzelle\b/i, "Zelle"], [/\bpaypal\b/i, "PayPal"]];
    function p2pRail(raw) { const d = String(raw || ""); for (const [re, name] of P2P_RAILS) if (re.test(d)) return name; return null; }
    // A completed month's window (C16): the whole month, no this-evening extension — the month is over.
    function reportWindow(key) {
      const y = +String(key).slice(0, 4), m = +String(key).slice(5, 7), days = lastDay(y, m);
      return { today: `${key}-${pad(days)}`, from: `${key}-01`, to: `${key}-${pad(days)}`, y, m, day: days, days, name: MONTHS[m - 1], key };
    }
    // The monthly report (C16): caps versus actuals in dollars for one completed month, per budget — what was
    // spent, the cap, over or left, the percent of the cap used, the biggest merchants in the category, and how
    // much of it came through a P2P rail (Venmo, Cash App, Zelle, PayPal) — plus the month's uncategorized total,
    // said apart, never guessed in. Tracking only, like everything here.
    function monthlyReport(budgets, rows, monthKey, opts) {
      const have = budgetsIn(budgets);
      if (!have.length || !/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return null;
      const o = opts || {}, w = reportWindow(monthKey);
      const ts = have.map((b) => tally(b, rows || [], w, o.rules || []));
      const unc = uncategorized(rows || [], w, o.rules || []);
      const totalSpent = ts.reduce((s, t) => s + t.spent, 0), totalCap = ts.reduce((s, t) => s + t.amount, 0);
      const lines = [`Your ${w.name} budget report (caps vs what you spent):`];
      const detail = ts.map((t) => {
        const pct = t.amount > 0 ? Math.round((t.spent / t.amount) * 100) : 0;
        lines.push(`${cap(t.label)}: ${money(t.spent)} spent of a ${money(t.amount)} cap — ${t.spent > t.amount ? `${money(t.spent - t.amount)} over` : t.spent === t.amount ? "exactly at the cap" : `${money(t.left)} left`} (${pct}% of the cap).`);
        if (t.top.length) lines.push(`  Biggest: ${t.top.map(([n, c]) => `${n} ${money(c)}`).join(", ")}.`);
        if (t.p2p > 0) lines.push(`  ${money(t.p2p)} of it came through ${t.p2pRails.map(([n, c]) => `${n} ${money(c)}`).join(", ")}.`);
        return { category: t.budget.category, label: t.label, cap_cents: t.amount, spent_cents: t.spent, left_cents: t.left, pct, top: t.top, p2p_cents: t.p2p, p2p_rails: t.p2pRails };
      });
      lines.push(`Across ${ts.length === 1 ? "that budget" : `all ${ts.length} budgets`}: ${money(totalSpent)} spent against ${money(totalCap)} of caps.`);
      if (unc > 0) lines.push(`${money(unc)} of ${w.name} spending wasn't in any category I know, so it isn't in these numbers.`);
      // C16 on real feeds: person-to-person money usually matches no category at all, so the per-budget naming
      // above never sees it and the report would leave the person's biggest outflow unnamed. The month's P2P
      // total is therefore named apart, over every spend row in the window (counted in the totals it belongs
      // to — a category's tally when it has one, the uncategorized line when it doesn't).
      const p2pBy = new Map();
      for (const r of (rows || []).filter((x) => x && Number.isFinite(cents(x)) && cents(x) < 0 && !x.is_pending && !x.is_transfer && usd(x) && inWindow(x, w) && MA.isSpend(x))) {
        const rail = p2pRail(r.merchant_raw); if (!rail) continue;
        p2pBy.set(rail, (p2pBy.get(rail) || 0) - cents(r));
      }
      const p2pRails = [...p2pBy.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const p2p = p2pRails.reduce((s, [, v]) => s + v, 0);
      if (p2p > 0) lines.push(`Person-to-person in ${w.name}: ${money(p2p)} (${p2pRails.map(([n2, c]) => `${n2} ${money(c)}`).join(", ")}).`);
      lines.push(TAIL);
      return { key: w.key, name: w.name, text: lines.join("\n"), budgets: detail, uncategorized_cents: unc, total_spent_cents: totalSpent, total_cap_cents: totalCap, p2p_cents: p2p, p2p_rails: p2pRails };
    }
    // Spending this month that matched no category: said as its own total, never guessed into a budget.
    function uncategorized(rows, w, rules) {
      return rows.filter((r) => r && Number.isFinite(cents(r)) && !r.is_pending && usd(r) && inWindow(r, w) && cents(r) < 0 && MA.isSpend(r) && !groupOf(r, rules)).reduce((s, r) => s - cents(r), 0);
    }
    // An even pace: the budget spread evenly over the month's days, so far. Within $1.00 or 1% of the budget is on pace.
    function pace(t, w) {
      const even = Math.round((t.amount * w.day) / w.days), diff = t.spent - even, close = Math.max(100, Math.round(t.amount / 100));
      return { even, diff, on: Math.abs(diff) < close };
    }
    function paceText(t, w) {
      if (t.spent > t.amount) return `over budget with ${w.days - w.day} day${w.days - w.day === 1 ? "" : "s"} left in ${w.name}.`;
      const p = pace(t, w);
      if (p.on) return `an even pace is ${money(p.even)} by now; you're on pace.`;
      return `an even pace is ${money(p.even)} by now; you're ${money(Math.abs(p.diff))} ${p.diff > 0 ? "ahead of pace (spending faster)" : "behind pace (spending slower)"}.`;
    }
    const leftText = (t) => (t.spent > t.amount ? `${money(t.spent - t.amount)} over` : t.spent === t.amount ? "nothing left" : `${money(t.left)} left`);
    const topText = (t) => (t.top.length ? t.top.map(([n, c]) => `${n} ${money(c)}`).join(", ") : "");
    const foreignText = (rows) => rows.map((r) => `${(Math.abs(cents(r)) / 100).toFixed(2)} ${String(r.currency).toUpperCase()}`).join(", ");
    const TAIL = "A budget only tracks: it never moves money or blocks a payment.";
    function answer(words, input) {
      const p = typeof words === "string" ? parse(words) : words;
      if (!p || (p.kind !== "status" && p.kind !== "report")) return null;
      const i = input || {}, tz = i.tz || "UTC", have = budgetsIn(i.budgets);
      if (!have.length && p.bare) return null;
      if (!have.length) return { text: `You don't have any budgets set. Say "set a grocery budget of 400" (any category and amount, by the month) and I'll track it. Categories I can budget: ${LIST}.` };
      if (p.kind === "report") {
        const rows = i.transactions || [];
        if (!rows.some((r) => r && !r.is_pending && typeof r.posted_on === "string")) return { text: `You have ${have.length} budget${have.length === 1 ? "" : "s"}, but I don't see a linked bank or card with posted transactions yet, so there's nothing to report.` };
        const today = todayOf(i.now, tz), cm = +today.slice(5, 7), cy = +today.slice(0, 4);
        let y = cy, m = cm === 1 ? 12 : cm - 1;
        if (p.month) { m = p.month; if (p.month >= cm) y = cy - 1; } else if (cm === 1) y = cy - 1;
        const report = monthlyReport(i.budgets, rows, `${y}-${pad(m)}`, { rules: i.rules || [] });
        if (!report) return null;
        return { text: `${report.text}\n${MA.txSource(rows, tz)}`, report };
      }
      let pick = have;
      if (!p.all) {
        const mine = p.category ? have.filter((b) => b.category === p.category) : [];
        if (!mine.length) return { text: `You don't have a ${p.category ? labelOf(p.category) : `"${p.unknown}"`} budget. Your budgets: ${listOf(have)}.${p.category ? ` Say "set a ${labelOf(p.category)} budget of 400" with your number to add one.` : ""}` };
        pick = mine;
      }
      const rows = i.transactions || [], w = monthWindow(i.now, tz);
      if (!rows.some((r) => r && !r.is_pending && typeof r.posted_on === "string")) {
        return { text: `${pick.length === 1 ? `Your ${labelOf(pick[0].category)} budget is ${money(pick[0].amount_cents)} a month` : `You have ${pick.length} budgets`}, but I don't see a linked bank or card with posted transactions yet, so there's nothing to count against ${pick.length === 1 ? "it" : "them"}.` };
      }
      const rules = i.rules || null, ts = pick.map((b) => tally(b, rows, w, rules)), unc = uncategorized(rows, w, rules), lines = [];
      if (ts.length === 1 && !p.over) {
        const t = ts[0];
        lines.push(`${cap(t.label)} budget for ${w.name}: ${money(t.spent)} spent of ${money(t.amount)}, ${leftText(t)}.`);
        lines.push(`Day ${w.day} of ${w.days}: ${paceText(t, w)}`);
        if (t.top.length) lines.push(`Top: ${topText(t)}.`);
      } else {
        const over = ts.filter((t) => t.spent > t.amount);
        if (p.over) lines.push(over.length ? `Yes, over on ${over.length === 1 ? "" : `${over.length}: `}${over.map((t) => `${t.label} (${money(t.spent - t.amount)} over)`).join(", ")}.` : `No, you're not over on ${ts.length === 1 ? `your ${ts[0].label} budget` : "any budget"}.`);
        lines.push(`${ts.length === 1 ? "Your budget" : "Your budgets"} for ${w.name}, day ${w.day} of ${w.days}:`);
        for (const t of ts) {
          const p = pace(t, w), how = t.spent > t.amount ? "" : p.on ? "; on pace" : `; ${money(Math.abs(p.diff))} ${p.diff > 0 ? "ahead of pace" : "behind pace"}`;
          lines.push(`- ${cap(t.label)}: ${money(t.spent)} of ${money(t.amount)} spent, ${leftText(t)}${how}${t.top.length ? ` (top: ${topText(t)})` : ""}.`);
        }
      }
      const refunds = ts.filter((t) => t.refunded > 0);
      if (refunds.length) lines.push(`Refunds taken off: ${refunds.map((t) => `${ts.length > 1 ? `${t.label} ` : ""}${money(t.refunded)}`).join(", ")}.`);
      const pend = ts.filter((t) => t.pending.length);
      if (pend.length) lines.push(`Pending, not added yet: ${pend.map((t) => `${ts.length > 1 ? `${t.label} ` : ""}${money(t.pending.reduce((s, r) => s - cents(r), 0))} (${t.pending.length} charge${t.pending.length === 1 ? "" : "s"})`).join(", ")}.`);
      const fx = ts.filter((t) => t.foreign.length);
      if (fx.length) lines.push(`In another currency, not added: ${fx.map((t) => `${ts.length > 1 ? `${t.label} ` : ""}${foreignText(t.foreign)}`).join(", ")}.`);
      const ruled = MA.ruleLine(ts.flatMap((t) => t.counted), rules);
      if (ruled) lines.push(ruled);
      if (unc > 0) lines.push(`${money(unc)} of your spending this month matched no category I know, so it isn't counted in any budget.`);
      lines.push(MA.txSource(rows, tz, TAIL));
      return { text: lines.join("\n"), tallies: ts, uncategorized_cents: unc, month: w.key };
    }

    // ---- the agent speaks first: 80% and 100%, once each per budget per month ----
    function alerts(budgets, transactions, now, opts) {
      const o = opts || {}, tz = o.tz || "UTC", w = monthWindow(now, tz), sent = new Set(o.sent || []), rows = transactions || [], out = [];
      const posted = rows.filter((r) => r && !r.is_pending && usd(r) && typeof r.posted_on === "string").map(dayOf).sort();
      const through = posted.length ? posted[posted.length - 1] : null;
      if (!through) return out;
      const thru = `Transactions through ${MON[+through.slice(5, 7) - 1]} ${+through.slice(8, 10)}, ${through.slice(0, 4)}.`;
      for (const b of budgetsIn(budgets)) {
        if (!(b.amount_cents > 0)) continue;
        const t = tally(b, rows, w, o.rules || null), base = `budget:${b.id}:${w.key}:`;
        if (t.spent >= t.amount) {
          if (sent.has(base + "100")) continue;
          out.push({ key: base + "100", threshold: 100, category: b.category, budget_id: b.id, month: w.key, spent_cents: t.spent, amount_cents: t.amount,
            text: `Your ${t.label} budget for ${w.name} is used up: ${money(t.spent)} spent of ${money(t.amount)}, ${leftText(t)}, on day ${w.day} of ${w.days}. ${thru} ${TAIL} (You set this budget; say "stop my ${t.label} budget" to end it.)` });
        } else if (t.spent * 100 >= t.amount * 80) {
          if (sent.has(base + "80") || sent.has(base + "100")) continue;
          out.push({ key: base + "80", threshold: 80, category: b.category, budget_id: b.id, month: w.key, spent_cents: t.spent, amount_cents: t.amount,
            text: `Your ${t.label} budget is at ${Math.floor((t.spent * 100) / t.amount)}% for ${w.name}: ${money(t.spent)} spent of ${money(t.amount)}, ${money(t.left)} left, on day ${w.day} of ${w.days}. ${thru} ${TAIL} (You set this budget; say "stop my ${t.label} budget" to end it.)` });
        }
      }
      return out;
    }
    // "show my alerts": the budgets, restated.
    function describe(watches) { const b = budgetsIn(watches); return b.length ? `Budgets: ${b.map((x) => `${labelOf(x.category)} ${money(x.amount_cents)} a month`).join("; ")}.` : ""; }

    return { KIND, LIST, parse, command, answer, alerts, describe, budgetsIn, isBudget, categoryIn, monthWindow, monthlyReport, reportWindow, MAX_CENTS };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Budgets;
