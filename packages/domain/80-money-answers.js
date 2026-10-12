  /* See-everything numbers in chat (capability list section 1; live gauntlet S16-01 balance, S16-02 spend, S16-14 how am
     I doing, S16-16 did rent go through). Every number here comes from the person's own rows, never from the model:
       accounts      agent_financial_accounts rows: account_id, name, institution, account_kind, balance_cents,
                     available_cents, balance_as_of, fetched_at, status (and currency when present)
       transactions  agent_financial_transactions rows: account_id, provider_transaction_id, amount_cents (negative =
                     money out), posted_on, merchant_raw, is_pending, is_transfer (and fetched_at when present)
     Four answers, each plain text with its source and as-of time on the last line:
       balance(accounts, now)                   cash across checking/savings/cash, each account, card balances owed apart,
                                                the oldest as-of time named, more than a day old said plainly
       spend(transactions, words, now)          a category or merchant over a period read from the words, against the prior
                                                equal period, top 3 places, transfers and pending left out, uncategorized
                                                spending never guessed into a category (its total is said instead)
       checkup(accounts, transactions, now)     "how am I doing": cash now, in vs out this month so far vs the same day last
                                                month, one sentence of what changed
       didItGoThrough(transactions, words, now) posted (date) or pending, or "not yet" since a named date
     Pure: rows and the clock are passed in; opts.tz (an IANA zone, default UTC) sets the person's "today"; opts.rules,
     the person's category rules (95-category-rules.js), place a merchant where they said (classify(raw, rules)), and an
     answer a rule changed says so with its amount (ruleLine). Spend adds up charges; a refund is not taken off there. */
  const MoneyAnswers = (() => {
    const HOUR = 3600 * 1000, DAY = 24 * HOUR, STALE_MS = DAY;
    const CASH_KINDS = ["checking", "savings", "cash"];
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTH_WORDS = [/\bjan(?:uary)?\b/, /\bfeb(?:ruary)?\b/, /\bmar(?:ch)?\b/, /\bapr(?:il)?\b/, /\bmay\b/, /\bjune?\b/, /\bjuly?\b/, /\baug(?:ust)?\b/, /\bsept?(?:ember)?\b/, /\boct(?:ober)?\b/, /\bnov(?:ember)?\b/, /\bdec(?:ember)?\b/];

    // $1,234.56, from integer cents (no float rounding on the way).
    function money(cents) {
      const c = Math.round(Number(cents) || 0), a = Math.abs(c);
      return (c < 0 ? "-" : "") + "$" + String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(a % 100).padStart(2, "0");
    }
    const ms = (v) => { if (v == null || v === "") return NaN; const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v); return Number.isFinite(t) ? t : NaN; };
    function parts(t, tz) {
      const p = {};
      for (const x of new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(new Date(t))) p[x.type] = x.value;
      return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, zone: p.timeZoneName || "UTC" };
    }
    const pad = (n) => String(n).padStart(2, "0");
    const todayIn = (now, tz) => { const p = parts(ms(now), tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
    // "Oct 12, 3:05 PM UTC": the as-of time, in the person's zone.
    function timeLabel(t, tz) {
      const p = parts(t, tz), h12 = p.h % 12 === 0 ? 12 : p.h % 12;
      return `${MON[p.m - 1]} ${p.d}, ${h12}:${pad(p.min)} ${p.h < 12 ? "AM" : "PM"} ${p.zone}`;
    }
    // Calendar days as YYYY-MM-DD strings, worked in UTC so no zone shifts them.
    const toUtc = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
    const fromUtc = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
    const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * DAY);
    const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
    const monthStart = (y, m) => `${y}-${pad(m)}-01`;
    const monthEnd = (y, m) => `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
    const prevMonth = (y, m) => (m === 1 ? [y - 1, 12] : [y, m - 1]);
    function dateLabel(ymd, withYear) { const y = +ymd.slice(0, 4), m = +ymd.slice(5, 7), d = +ymd.slice(8, 10); return `${MON[m - 1]} ${d}${withYear ? `, ${y}` : ""}`; }
    function rangeLabel(from, to) {
      if (from === to) return dateLabel(from);
      if (from.slice(0, 4) !== to.slice(0, 4)) return `${dateLabel(from, true)}-${dateLabel(to, true)}`;
      if (from.slice(0, 7) === to.slice(0, 7)) return `${dateLabel(from)}-${+to.slice(8, 10)}`;
      return `${dateLabel(from)}-${dateLabel(to)}`;
    }

    // The period a question names, and the prior period of equal length it is compared with. Default: this month so far.
    function period(words, now, tz) {
      const w = String(words || "").toLowerCase(), today = todayIn(now, tz), y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10);
      const sameDayIn = (yy, mm) => `${yy}-${pad(mm)}-${pad(Math.min(d, lastDay(yy, mm)))}`;
      const thisMonth = () => { const [py, pm] = prevMonth(y, m); return { from: monthStart(y, m), to: today, label: `this month so far (${rangeLabel(monthStart(y, m), today)})`, prior: { from: monthStart(py, pm), to: sameDayIn(py, pm), label: `at the same point last month (${rangeLabel(monthStart(py, pm), sameDayIn(py, pm))})` } }; };
      const fullMonth = (yy, mm, label) => { const [py, pm] = prevMonth(yy, mm); return { from: monthStart(yy, mm), to: monthEnd(yy, mm), label, prior: { from: monthStart(py, pm), to: monthEnd(py, pm), label: `in ${MONTH_NAMES[pm - 1]}${py !== y ? ` ${py}` : ""}` } }; };
      let n;
      if (/\blast month\b|\bprevious month\b|\bpast month\b(?! or)/.test(w) && !/\blast \d+ days\b/.test(w)) { const [py, pm] = prevMonth(y, m); return fullMonth(py, pm, `last month (${rangeLabel(monthStart(py, pm), monthEnd(py, pm))})`); }
      if (/\bthis month\b|\bso far\b|\bmonth to date\b/.test(w)) return thisMonth();
      if ((n = w.match(/\b(?:last|past|previous) (\d{1,3}) days\b/))) {
        const k = Math.max(1, Math.min(366, +n[1])), from = addDays(today, -(k - 1)), pto = addDays(from, -1), pfrom = addDays(pto, -(k - 1));
        return { from, to: today, label: `in the last ${k} days (${rangeLabel(from, today)})`, prior: { from: pfrom, to: pto, label: `the ${k} days before (${rangeLabel(pfrom, pto)})` } };
      }
      const dow = (new Date(toUtc(today)).getUTCDay() + 6) % 7; // Monday = 0
      if (/\bthis week\b/.test(w)) { const from = addDays(today, -dow), pfrom = addDays(from, -7), pto = addDays(today, -7); return { from, to: today, label: `this week so far (${rangeLabel(from, today)})`, prior: { from: pfrom, to: pto, label: `at the same point last week (${rangeLabel(pfrom, pto)})` } }; }
      if (/\blast week\b|\bpast week\b|\bprevious week\b/.test(w)) { const from = addDays(today, -dow - 7), to = addDays(from, 6), pfrom = addDays(from, -7), pto = addDays(from, -1); return { from, to, label: `last week (${rangeLabel(from, to)})`, prior: { from: pfrom, to: pto, label: `the week before (${rangeLabel(pfrom, pto)})` } }; }
      if (/\byesterday\b/.test(w)) { const t = addDays(today, -1); return { from: t, to: t, label: `yesterday (${dateLabel(t)})`, prior: { from: addDays(t, -1), to: addDays(t, -1), label: `the day before (${dateLabel(addDays(t, -1))})` } }; }
      if (/\btoday\b/.test(w)) return { from: today, to: today, label: `today (${dateLabel(today)})`, prior: { from: addDays(today, -1), to: addDays(today, -1), label: `yesterday (${dateLabel(addDays(today, -1))})` } };
      if (/\bthis year\b|\byear to date\b|\bytd\b/.test(w)) { const from = `${y}-01-01`, pto = `${y - 1}-${today.slice(5, 7)}-${pad(Math.min(d, lastDay(y - 1, m)))}`; return { from, to: today, label: `this year so far (${rangeLabel(from, today)})`, prior: { from: `${y - 1}-01-01`, to: pto, label: `at the same point last year (${rangeLabel(`${y - 1}-01-01`, pto)})` } }; }
      if (/\blast year\b/.test(w)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `last year (${y - 1})`, prior: { from: `${y - 2}-01-01`, to: `${y - 2}-12-31`, label: `in ${y - 2}` } };
      const named = MONTH_WORDS.findIndex((re) => re.test(w.replace(/\bmay i\b/g, "")));
      if (named >= 0) {
        const mm = named + 1;
        if (mm === m) return thisMonth();
        const yy = mm < m ? y : y - 1;
        return fullMonth(yy, mm, `in ${MONTH_NAMES[mm - 1]}${yy !== y ? ` ${yy}` : ""} (${rangeLabel(monthStart(yy, mm), monthEnd(yy, mm))})`);
      }
      return thisMonth();
    }

    // Known merchants: [group, display name, pattern on the raw descriptor]. First match wins, so the specific rows
    // (Uber Eats, Costco gas, Amazon Prime) come before the general ones (Uber, Costco, Amazon). A merchant not on this
    // list has no category: it is never guessed into one.
    const MERCHANTS = [
      ["delivery", "DoorDash", /\bdoor ?dash\b|\bdd \*/], ["delivery", "Uber Eats", /\buber ?\*? ?eats\b|\bubereats\b/], ["delivery", "Grubhub", /\bgrubhub\b/],
      ["delivery", "Postmates", /\bpostmates\b/], ["delivery", "Seamless", /\bseamless\b/], ["delivery", "Caviar", /\bcaviar\b/],
      ["gas", "Costco Gas", /\bcostco gas\b/], ["gas", "Sam's Club Fuel", /\bsams? club fuel\b/], ["gas", "Shell", /\bshell\b(?! ?oil co)/], ["gas", "Chevron", /\bchevron\b/],
      ["gas", "Exxon", /\bexxon/], ["gas", "Mobil", /\bmobil\b/], ["gas", "BP", /\bbp\b/], ["gas", "Arco", /\barco\b/], ["gas", "Sunoco", /\bsunoco\b/],
      ["gas", "Marathon", /\bmarathon petro/], ["gas", "Speedway", /\bspeedway\b/], ["gas", "Citgo", /\bcitgo\b/], ["gas", "Valero", /\bvalero\b/],
      ["gas", "QuikTrip", /\bquik ?trip\b|\bqt \d/], ["gas", "Circle K", /\bcircle k\b/], ["gas", "76", /^76\b|\b76 (?:gas|fuel)\b/], ["gas", "Gas station", /\bgas station\b|\bfuel\b/],
      ["subscriptions", "Netflix", /\bnetflix\b/], ["subscriptions", "Spotify", /\bspotify\b/], ["subscriptions", "Hulu", /\bhulu\b/], ["subscriptions", "Disney+", /\bdisney ?(?:plus|\+)|\bdisneyplus\b/],
      ["subscriptions", "Max", /\bhbo ?max\b|\bmax\.com\b/], ["subscriptions", "YouTube Premium", /\byoutube ?(?:premium|tv|music)\b|\bgoogle \*youtube/], ["subscriptions", "Apple", /\bapple\.com\/bill\b|\bapple com bill\b|\bicloud\b/],
      ["subscriptions", "Google One", /\bgoogle \*?one\b/], ["subscriptions", "Amazon Prime", /\bamazon prime\b|\bprime video\b|\bamzn prime\b/], ["subscriptions", "Paramount+", /\bparamount\b/],
      ["subscriptions", "Peacock", /\bpeacock\b/], ["subscriptions", "Audible", /\baudible\b/], ["subscriptions", "Adobe", /\badobe\b/], ["subscriptions", "Dropbox", /\bdropbox\b/],
      ["subscriptions", "Microsoft", /\bmicrosoft\b|\bmsft\b/], ["subscriptions", "Peloton", /\bpeloton\b/], ["subscriptions", "New York Times", /\bnytimes\b|\bny times\b/],
      ["subscriptions", "Patreon", /\bpatreon\b/], ["subscriptions", "OpenAI", /\bopenai\b|\bchatgpt\b/], ["subscriptions", "Planet Fitness", /\bplanet fit/],
      ["groceries", "Trader Joe's", /\btrader joe/], ["groceries", "Kroger", /\bkroger\b/], ["groceries", "Whole Foods", /\bwhole ?foods\b|\bwholefds\b/], ["groceries", "Safeway", /\bsafeway\b/],
      ["groceries", "Aldi", /\baldi\b/], ["groceries", "Publix", /\bpublix\b/], ["groceries", "Wegmans", /\bwegmans\b/], ["groceries", "Sprouts", /\bsprouts\b/], ["groceries", "H-E-B", /\bh-e-b\b|\bheb\b/],
      ["groceries", "Costco", /\bcostco\b/], ["groceries", "Instacart", /\binstacart\b/], ["groceries", "Amazon Fresh", /\bamazon fresh\b/], ["groceries", "Food Lion", /\bfood lion\b/],
      ["groceries", "Stop & Shop", /\bstop ?& ?shop\b/], ["groceries", "Meijer", /\bmeijer\b/], ["groceries", "Albertsons", /\balbertsons\b/], ["groceries", "Vons", /\bvons\b/], ["groceries", "Ralphs", /\bralphs\b/],
      ["groceries", "Harris Teeter", /\bharris teeter\b/], ["groceries", "WinCo", /\bwinco\b/], ["groceries", "Lidl", /\blidl\b/], ["groceries", "Giant Eagle", /\bgiant eagle\b/], ["groceries", "Grocery", /\bgrocery\b|\bsupermarket\b/],
      ["restaurants", "Starbucks", /\bstarbucks\b/], ["restaurants", "Chipotle", /\bchipotle\b/], ["restaurants", "McDonald's", /\bmcdonald/], ["restaurants", "Dunkin'", /\bdunkin\b/],
      ["restaurants", "Chick-fil-A", /\bchick-?fil-?a\b/], ["restaurants", "Taco Bell", /\btaco bell\b/], ["restaurants", "Wendy's", /\bwendy'?s\b/], ["restaurants", "Burger King", /\bburger king\b/],
      ["restaurants", "Subway", /\bsubway\b(?! ?(?:fare|mta))/], ["restaurants", "Panera", /\bpanera\b/], ["restaurants", "Domino's", /\bdomino'?s\b/], ["restaurants", "Pizza Hut", /\bpizza hut\b/],
      ["restaurants", "Papa John's", /\bpapa john/], ["restaurants", "Sweetgreen", /\bsweetgreen\b/], ["restaurants", "Shake Shack", /\bshake shack\b/], ["restaurants", "Five Guys", /\bfive guys\b/],
      ["restaurants", "Popeyes", /\bpopeyes\b/], ["restaurants", "KFC", /\bkfc\b/], ["restaurants", "Panda Express", /\bpanda express\b/], ["restaurants", "Cava", /\bcava\b/], ["restaurants", "Dutch Bros", /\bdutch bros\b/],
      ["restaurants", "Peet's", /\bpeet'?s\b/], ["restaurants", null, /\btst\* ?|\brestaurant\b|\bcafe\b|\bcoffee\b|\bpizza\b|\bgrill\b|\bdiner\b|\btaqueria\b|\bsushi\b|\bburgers?\b/],
      ["transport", "Uber", /\buber\b/], ["transport", "Lyft", /\blyft\b/], ["transport", "Amtrak", /\bamtrak\b/], ["transport", null, /\bmta\b|\bbart\b|\bclipper\b|\btransit\b|\bmetro ?card\b|\bparking\b|\bparkmobile\b|\btoll\b|\be-?z ?pass\b/],
      ["shopping", "Amazon", /\bamazon\b|\bamzn\b/], ["shopping", "Target", /\btarget\b/], ["shopping", "Walmart", /\bwal-?mart\b/], ["shopping", "Best Buy", /\bbest buy\b/],
      ["shopping", "Etsy", /\betsy\b/], ["shopping", "eBay", /\bebay\b/], ["shopping", "IKEA", /\bikea\b/], ["shopping", "Home Depot", /\bhome depot\b/], ["shopping", "Lowe's", /\blowe'?s\b/],
      ["shopping", "Nike", /\bnike\b/], ["shopping", "Macy's", /\bmacy'?s\b/], ["shopping", "Nordstrom", /\bnordstrom\b/], ["shopping", "Kohl's", /\bkohl'?s\b/], ["shopping", "TJ Maxx", /\btj ?maxx\b/],
      ["shopping", "Marshalls", /\bmarshalls\b/], ["shopping", "Old Navy", /\bold navy\b/], ["shopping", "Zara", /\bzara\b/], ["shopping", "Shein", /\bshein\b/], ["shopping", "Temu", /\btemu\b/],
    ];
    const GROUP_LABEL = { groceries: "groceries", restaurants: "restaurants", delivery: "delivery", gas: "gas", subscriptions: "subscriptions", transport: "transport", shopping: "shopping" };
    // What a question can ask for, in the order the words are tested (specific before general).
    const CATEGORIES = [
      { key: "delivery", label: "food delivery", groups: ["delivery"], words: /\b(?:food )?deliver(?:y|ies)\b|\btake-?out\b/ },
      { key: "groceries", label: "groceries", groups: ["groceries"], words: /\bgrocer(?:y|ies)\b|\bsupermarkets?\b/ },
      { key: "restaurants", label: "restaurants", groups: ["restaurants"], words: /\brestaurants?\b|\beating out\b|\bdining\b|\bcoffee\b|\bfast food\b/ },
      { key: "food", label: "food", groups: ["groceries", "restaurants", "delivery"], words: /\bfood\b|\beating\b|\bmeals?\b/ },
      { key: "gas", label: "gas", groups: ["gas"], words: /\bgas\b(?! (?:bill|company|utility))|\bfuel\b|\bgasoline\b/ },
      { key: "subscriptions", label: "subscriptions", groups: ["subscriptions"], words: /\bsubscriptions?\b|\bstreaming\b/ },
      { key: "transport", label: "transport", groups: ["transport"], words: /\btransport(?:ation)?\b|\brides?\b|\brideshare\b|\btransit\b|\bcommut\w*|\bparking\b/ },
      { key: "shopping", label: "shopping", groups: ["shopping"], words: /\bshopping\b|\bclothes\b|\bclothing\b/ },
    ];
    const NOT_SPENDING = /\b(?:credit card payment|card payment|payment thank you|autopay|online transfer|transfer (?:to|from)|internal transfer)\b/i;
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9&'+.\/*-]+/g, " ").replace(/\s+/g, " ").trim();
    // The person's category rules (95-category-rules.js, "recategorize Target as groceries"): a rule's words, whole, in
    // the bank's descriptor (apostrophes dropped, a bank's "JOE S" read as "joes"); the longest matching term wins. A
    // known merchant more specific than the term keeps its own group: a "Costco" rule leaves Costco Gas as gas, an "Uber"
    // rule leaves Uber Eats as delivery. A stored rule naming no group the chat counts is ignored.
    const ruleKey = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b([a-z0-9]+) s\b/g, "$1s").trim();
    function ruleFor(raw, rules) {
      if (!Array.isArray(rules) || !rules.length) return null;
      const d = ` ${ruleKey(raw)} `;
      let best = null, bestLen = 0;
      for (const r of rules) {
        if (!r || typeof r.term !== "string" || !GROUP_LABEL[r.group]) continue;
        const k = ruleKey(r.term);
        if (k && k.length > bestLen && d.includes(` ${k} `)) { best = r; bestLen = k.length; }
      }
      return best;
    }
    function classify(raw, rules) {
      const t = norm(raw);
      let def = null;
      for (const [group, name, re] of MERCHANTS) if (re.test(t)) { def = { group, name: name || cleanName(raw) }; break; }
      const r = ruleFor(raw, rules);
      if (!r) return def;
      const named = def && MERCHANTS.find((m) => m[1] === def.name) ? ruleKey(def.name) : "", k = ruleKey(r.term);
      if (named && named !== k && named.length > k.length && ` ${named} `.includes(` ${k} `)) return def;
      return { group: r.group, name: def ? def.name : cleanName(raw), rule: r };
    }
    // "By your category rule: "Target" as groceries $212.40." for the rows a rule placed (spending only), "" for none.
    function ruleLine(rows, rules) {
      if (!Array.isArray(rules) || !rules.length) return "";
      const by = new Map();
      for (const r of rows || []) { const c = classify(r.merchant_raw, rules); if (c && c.rule) { const e = by.get(c.rule) || 0; by.set(c.rule, e - (Number(r.amount_cents) || 0)); } }
      const hit = [...by.entries()].filter(([, v]) => v !== 0);
      if (!hit.length) return "";
      const nm = (term) => String(term).replace(/(^|[\s\-\/&.])([a-z])/g, (_, a, b) => a + b.toUpperCase());
      return `By your category rule${hit.length === 1 ? "" : "s"}: ${hit.map(([r, v]) => `"${nm(r.term)}" as ${GROUP_LABEL[r.group]} ${v < 0 ? "-" : ""}${money(Math.abs(v))}`).join(", ")}.`;
    }
    // A readable name for a merchant not on the list: card-network noise and store numbers removed, nothing invented.
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    function cleanName(raw) {
      raw = label(raw);
      const s = String(raw || "").replace(/^(?:sq|tst|sp|pp|paypal|py)\s*\*\s*/i, "").replace(/\b(?:pos|debit|purchase|checkcard|check card|recurring|card \d+)\b/gi, " ")
        .replace(/#\s*\d+|\b\d{3,}\b|[*#]/g, " ").replace(/\s+/g, " ").trim();
      if (!s) return String(raw || "Unknown").trim() || "Unknown";
      return s.toLowerCase().replace(/(^|[\s\-\/])([a-z])/g, (_, a, b) => a + b.toUpperCase());
    }
    const display = (raw) => { const c = classify(raw); return c ? c.name : cleanName(raw); };
    const cents = (r) => (Number.isFinite(Number(r.amount_cents)) && r.amount_cents !== null ? Math.round(Number(r.amount_cents)) : NaN);
    const usd = (r) => !r.currency || String(r.currency).toUpperCase() === "USD"; // other currencies are never added into dollars
    const posted = (rows) => (rows || []).filter((r) => r && usd(r) && !r.is_pending && typeof r.posted_on === "string" && Number.isFinite(cents(r)));
    const isSpend = (r) => cents(r) < 0 && !r.is_transfer && !NOT_SPENDING.test(String(r.merchant_raw || ""));
    const isIncome = (r) => cents(r) > 0 && !r.is_transfer && !NOT_SPENDING.test(String(r.merchant_raw || ""));
    const inRange = (r, p) => r.posted_on.slice(0, 10) >= p.from && r.posted_on.slice(0, 10) <= p.to;
    const sum = (rows) => rows.reduce((a, r) => a + Math.abs(cents(r)), 0);

    // The last line of every transaction answer: the source, the newest posted day, and when the rows were last synced.
    function txSource(rows, tz, extra) {
      const p = posted(rows), through = p.map((r) => r.posted_on.slice(0, 10)).sort().slice(-1)[0];
      const synced = (rows || []).map((r) => ms(r && r.fetched_at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
      const asOf = synced ? `, as of ${timeLabel(synced, tz)}` : "";
      return `From your linked accounts, ${through ? `transactions through ${dateLabel(through, true)}` : "no posted transactions yet"}${asOf}.${extra ? " " + extra : ""}`;
    }
    const earliest = (rows) => posted(rows).map((r) => r.posted_on.slice(0, 10)).sort()[0] || null;

    // ---- balance ----
    const active = (accounts) => (accounts || []).filter((a) => a && a.status !== "disconnected");
    // SimpleFIN sends no account type, so most rows arrive "unknown" until the person sets one (agent_account_preferences,
    // merged in by the host). A name that says what it is ("TOTAL CHECKING", "Platinum Credit Card") is read as that;
    // anything else stays unknown and is listed, never counted as cash.
    const kindOf = (a) => {
      const k = String(a.account_kind || "unknown").toLowerCase();
      if (k !== "unknown") return k;
      const n = String(a.name || "").toLowerCase();
      if (/\bchecking\b/.test(n)) return "checking";
      if (/\bsavings?\b|\bmoney market\b/.test(n)) return "savings";
      if (/\bcredit card\b|\bcredit\b/.test(n)) return "credit";
      return "unknown";
    };
    const acctName = (a) => { const n = String(a.name || a.account_id || "Account").trim(), i = String(a.institution || "").trim(); return i && !n.toLowerCase().includes(i.toLowerCase()) ? `${i} ${n}` : n; };
    const asOfMs = (a) => { const b = ms(a.balance_as_of); return Number.isFinite(b) ? b : ms(a.fetched_at); };
    const hasBal = (a) => a.balance_cents !== null && a.balance_cents !== undefined && Number.isFinite(Number(a.balance_cents));
    const foreign = (a) => a.currency && String(a.currency).toUpperCase() !== "USD";
    function summarize(accounts, now) {
      const list = active(accounts);
      const cash = list.filter((a) => CASH_KINDS.includes(kindOf(a)) && hasBal(a) && !foreign(a));
      const cards = list.filter((a) => kindOf(a) === "credit" && hasBal(a) && !foreign(a));
      const other = list.filter((a) => !cash.includes(a) && !cards.includes(a) && hasBal(a));
      const missing = list.filter((a) => !hasBal(a));
      const shown = cash.concat(cards, other);
      const times = shown.map(asOfMs).filter(Number.isFinite);
      const oldest = times.length ? Math.min(...times) : NaN;
      const stale = shown.filter((a) => Number.isFinite(asOfMs(a)) && ms(now) - asOfMs(a) > STALE_MS);
      return { list, cash, cards, other, missing, oldest, stale, failed: shown.filter((a) => a.sync_error === true), undated: shown.filter((a) => !Number.isFinite(asOfMs(a))), cash_cents: cash.reduce((s, a) => s + Math.round(Number(a.balance_cents)), 0) };
    }
    const owedText = (a) => { const b = Math.round(Number(a.balance_cents)); return b <= 0 ? `${money(-b)} owed` : `${money(b)} in your favor`; };
    function staleText(s, tz, now) {
      if (!s.stale.length) return "";
      const worst = s.stale.slice().sort((a, b) => asOfMs(a) - asOfMs(b))[0], hrs = Math.floor((ms(now) - asOfMs(worst)) / HOUR);
      const age = hrs >= 48 ? `${Math.floor(hrs / 24)} days` : `${hrs} hours`;
      return s.stale.length === 1
        ? `Heads up: ${acctName(worst)} was last updated ${timeLabel(asOfMs(worst), tz)}, ${age} ago, so its real balance may have changed.`
        : `Heads up: ${s.stale.length} balances are more than a day old (the oldest, ${acctName(worst)}, was last updated ${timeLabel(asOfMs(worst), tz)}, ${age} ago), so the real numbers may have changed.`;
    }
    function balance(accounts, now, opts) {
      const tz = (opts && opts.tz) || "UTC", s = summarize(accounts, now);
      if (!s.list.length) return "I don't see a connected bank or card yet, so I can't give you a balance.";
      const when = Number.isFinite(s.oldest) ? timeLabel(s.oldest, tz) : null;
      const lines = [];
      if (s.cash.length) {
        lines.push(`You have ${money(s.cash_cents)} in cash across ${s.cash.length} account${s.cash.length === 1 ? "" : "s"}${when ? `, as of ${when}` : ""}.`);
        for (const a of s.cash) { const av = Number(a.available_cents); lines.push(`- ${acctName(a)}: ${money(a.balance_cents)}${Number.isFinite(av) && a.available_cents !== null && Math.round(av) !== Math.round(Number(a.balance_cents)) ? ` (${money(av)} available)` : ""}`); }
      } else {
        lines.push(`No checking or savings balance is linked, so there's no cash total${when ? ` (balances as of ${when})` : ""}.`);
      }
      if (s.cards.length) {
        const owed = s.cards.reduce((t, a) => t + Math.max(0, -Math.round(Number(a.balance_cents))), 0);
        lines.push(`Credit cards, not counted in cash: ${money(owed)} owed in total.`);
        for (const a of s.cards) lines.push(`- ${acctName(a)}: ${owedText(a)}`);
      }
      if (s.other.length) { lines.push("Also linked, not counted as cash:"); for (const a of s.other) lines.push(`- ${acctName(a)} (${foreign(a) ? String(a.currency).toUpperCase() : kindOf(a) === "unknown" ? "type not set" : kindOf(a)}): ${foreign(a) ? String((Math.round(Number(a.balance_cents)) / 100).toFixed(2)) + " " + String(a.currency).toUpperCase() : money(a.balance_cents)}`); }
      if (s.missing.length) lines.push(`${s.missing.map(acctName).join(", ")} didn't report a balance, so ${s.missing.length === 1 ? "it isn't" : "they aren't"} counted.`);
      if (s.other.some((a) => kindOf(a) === "unknown")) lines.push("An account with no type set isn't counted as cash; set its type in the app and it will be.");
      const st = staleText(s, tz, now);
      if (st) lines.push(st);
      if (s.failed.length) lines.push(`The last sync of ${s.failed.map(acctName).join(", ")} failed, so ${s.failed.length === 1 ? "that balance" : "those balances"} may be out of date.`);
      if (s.undated.length) lines.push(`${s.undated.map(acctName).join(", ")} didn't say when ${s.undated.length === 1 ? "its balance was" : "their balances were"} taken.`);
      const insts = [...new Set(s.list.map((a) => String(a.institution || "").trim()).filter(Boolean))];
      lines.push(`From your linked accounts${insts.length ? ` (${insts.join(", ")})` : ""}${when ? `, balances as of ${when}` : ""}.`);
      return lines.join("\n");
    }

    // ---- spend ----
    // What the words ask for: a known category, a merchant named after "on"/"at", or everything.
    function target(words) {
      const w = String(words || "").toLowerCase();
      const cat = CATEGORIES.find((c) => c.words.test(w));
      if (cat) return { kind: "category", cat };
      const m = w.match(/\b(?:on|at|for|with)\s+(.+?)\s*(?:\b(?:last|this|past|previous|so far|in|during|since|today|yesterday|month|week|year)\b|[?.!,]|$)/);
      const term = m ? m[1].replace(/^(?:my|the|a|an)\s+/, "").trim() : "";
      if (term && !/^(?:everything|all|stuff|things|average|total|the|my|this|that|it)$/.test(term)) return { kind: "merchant", term };
      return { kind: "all" };
    }
    function termMatch(raw, term) {
      const t = norm(raw), q = norm(term).replace(/'/g, "");
      if (!q) return false;
      const t2 = t.replace(/'/g, "");
      return new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(t2) || t2.replace(/[^a-z0-9]/g, "").includes(q.replace(/[^a-z0-9]/g, "")) && q.replace(/[^a-z0-9]/g, "").length >= 4;
    }
    function topPlaces(rows) {
      const by = new Map();
      for (const r of rows) { const k = display(r.merchant_raw); by.set(k, (by.get(k) || 0) + Math.abs(cents(r))); }
      return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
    }
    // Against the prior equal period. No rows reach back into it: no comparison. Rows reach only part of it: compared,
    // with the start date said, because the prior total is then a floor.
    function compareText(now$, prior$, p, start) {
      if (start && start > p.prior.to) return `Your linked transactions start ${dateLabel(start, true)}, so there's nothing to compare with ${p.prior.label} yet.`;
      const d = now$ - prior$, caveat = start && start > p.prior.from ? ` Your linked transactions start ${dateLabel(start, true)}, so that earlier total may be missing a few days.` : "";
      if (d === 0) return `That's the same as ${p.prior.label}: ${money(prior$)}.${caveat}`;
      return `That's ${money(Math.abs(d))} ${d > 0 ? "more" : "less"} than ${p.prior.label}, when it was ${money(prior$)}.${caveat}`;
    }
    function spend(transactions, words, now, opts) {
      const tz = (opts && opts.tz) || "UTC", rules = (opts && opts.rules) || null, p = period(words, now, tz), all = posted(transactions), start = earliest(transactions);
      const extra = "Transfers, card payments and pending charges are left out.";
      if (!all.length) return `I don't see any posted transactions in your linked accounts yet, so I can't add up your spending. ${txSource(transactions, tz)}`;
      // A period that ends before the linked data begins has no rows to add up: saying "$0.00" would claim a fact we don't have.
      if (start && start > p.to) return `Your linked transactions start ${dateLabel(start, true)}, so I can't see ${p.label}: there's nothing from then to add up.\n${txSource(transactions, tz, extra)}`;
      const out = all.filter(isSpend), cur = out.filter((r) => inRange(r, p)), prev = out.filter((r) => inRange(r, p.prior));
      const tg = target(words), lines = [];
      const partial = start && start > p.from ? ` Your linked transactions start ${dateLabel(start, true)}, so this covers only from then.` : "";
      if (tg.kind === "category") {
        const pick = (rows) => rows.filter((r) => { const c = classify(r.merchant_raw, rules); return c && tg.cat.groups.includes(c.group); });
        const a = pick(cur), b = pick(prev), total = sum(a);
        const split = tg.cat.groups.length > 1 ? tg.cat.groups.map((g) => [g, sum(a.filter((r) => classify(r.merchant_raw, rules).group === g))]).filter((x) => x[1] > 0) : [];
        lines.push(`You spent ${money(total)} on ${tg.cat.label} ${p.label}${split.length > 1 ? `: ${split.map(([g, c]) => `${money(c)} ${GROUP_LABEL[g]}`).join(", ")}` : ""}.${partial}`);
        lines.push(compareText(total, sum(b), p, start));
        const top = topPlaces(a);
        if (top.length) lines.push(`Top: ${top.map(([n, c]) => `${n} ${money(c)}`).join(", ")}.`);
        const ruled = ruleLine(a, rules);
        if (ruled) lines.push(ruled);
        const unc = cur.filter((r) => !classify(r.merchant_raw, rules));
        if (unc.length) lines.push(`${money(sum(unc))} of your other spending in that period didn't match a category I know, so I didn't count any of it as ${tg.cat.label}.`);
      } else if (tg.kind === "merchant") {
        const ever = out.filter((r) => termMatch(r.merchant_raw, tg.term));
        if (!ever.length) {
          lines.push(`No charge in your linked accounts mentions "${tg.term}", and it isn't a category I track, so I won't guess.`);
          lines.push(`All your spending ${p.label}: ${money(sum(cur))}.${partial}`);
          lines.push(compareText(sum(cur), sum(prev), p, start));
        } else {
          const a = cur.filter((r) => termMatch(r.merchant_raw, tg.term)), b = prev.filter((r) => termMatch(r.merchant_raw, tg.term));
          lines.push(`You spent ${money(sum(a))} at ${display(ever[ever.length - 1].merchant_raw)} ${p.label}, ${a.length} charge${a.length === 1 ? "" : "s"}.${partial}`);
          lines.push(compareText(sum(a), sum(b), p, start));
        }
      } else {
        lines.push(`You spent ${money(sum(cur))} ${p.label}.${partial}`);
        lines.push(compareText(sum(cur), sum(prev), p, start));
        const top = topPlaces(cur);
        if (top.length) lines.push(`Top: ${top.map(([n, c]) => `${n} ${money(c)}`).join(", ")}.`);
      }
      lines.push(txSource(transactions, tz, extra));
      return lines.join("\n");
    }

    // ---- checkup ----
    function checkup(accounts, transactions, now, opts) {
      const tz = (opts && opts.tz) || "UTC", rules = (opts && opts.rules) || null, s = summarize(accounts, now), p = period("this month", now, tz), all = posted(transactions), start = earliest(transactions);
      const lines = [];
      const when = Number.isFinite(s.oldest) ? timeLabel(s.oldest, tz) : null;
      if (s.cash.length) lines.push(`Cash: ${money(s.cash_cents)} across ${s.cash.length} account${s.cash.length === 1 ? "" : "s"}${when ? `, as of ${when}` : ""}${s.stale.length ? " (more than a day old)" : ""}.`);
      else lines.push("No checking or savings balance is linked, so there's no cash number.");
      if (!all.length) { lines.push(`No posted transactions yet, so there's no in and out to compare. ${txSource(transactions, tz)}`); return lines.join("\n"); }
      const cur = all.filter((r) => inRange(r, p)), prev = all.filter((r) => inRange(r, p.prior));
      const inN = sum(cur.filter(isIncome)), outN = sum(cur.filter(isSpend)), inP = sum(prev.filter(isIncome)), outP = sum(prev.filter(isSpend));
      // History that starts inside this month is said, as spend says it: the days before it are not known to be $0.00.
      lines.push(`${p.label[0].toUpperCase() + p.label.slice(1)}: ${money(inN)} in, ${money(outN)} out.${start && start > p.from ? ` Your linked transactions start ${dateLabel(start, true)}, so this covers only from then.` : ""}`);
      if (start && start > p.prior.to) {
        lines.push(`Your linked transactions start ${dateLabel(start, true)}, so there's no last month to compare with yet.`);
      } else {
        lines.push(`Same point last month: ${money(inP)} in, ${money(outP)} out.${start && start > p.prior.from ? ` (Your linked transactions start ${dateLabel(start, true)}, so that may be missing a few days.)` : ""}`);
        const d = outN - outP;
        if (d === 0) lines.push(`Your spending is exactly where it was at this point last month.`);
        else {
          const key = (r) => { const c = classify(r.merchant_raw, rules); return c ? GROUP_LABEL[c.group] : cleanName(r.merchant_raw); };
          const diff = new Map();
          for (const r of cur.filter(isSpend)) diff.set(key(r), (diff.get(key(r)) || 0) + Math.abs(cents(r)));
          for (const r of prev.filter(isSpend)) diff.set(key(r), (diff.get(key(r)) || 0) - Math.abs(cents(r)));
          const mover = [...diff.entries()].filter(([, v]) => (d > 0 ? v > 0 : v < 0)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))[0];
          lines.push(`You've spent ${money(Math.abs(d))} ${d > 0 ? "more" : "less"} than at this point last month${mover ? `, mostly ${mover[0]} (${mover[1] > 0 ? "+" : "-"}${money(Math.abs(mover[1]))})` : ""}.`);
        }
      }
      lines.push(txSource(transactions, tz, "Transfers and pending charges are left out."));
      return lines.join("\n");
    }

    // ---- did it go through ----
    const RENT = /\brent\b|\brental\b|\bproperty (?:mgmt|mgt|management)\b|\bapartments?\b|\blandlord\b|\bleasing\b|\brentcafe\b|\bappfolio\b|\bbuildium\b|\byardi\b/;
    const PAY = /\bpayroll\b|\bpayrl\b|\bdirect dep|\bdir dep\b|\bsalary\b/;
    const ASK = /\b(?:did|has|have|is|was)\s+(?:my|the|our|this month'?s)?\s*(.+?)\s+(?:go(?:ne)? through|went through|post(?:ed)?|clear(?:ed)?|come (?:in|through)|hit|go out|gone out|went out|been (?:paid|charged|taken|posted))\b/;
    function goThroughTarget(words) {
      const m = String(words || "").toLowerCase().match(ASK);
      if (!m) return null;
      const t = m[1].replace(/^(?:my|the|our)\s+/, "").replace(/\s+(?:payment|bill|charge|autopay|auto-pay|deposit|transfer|subscription)s?$/, "").replace(/^(?:payment|charge|transfer)\s+(?:to|for|from)\s+/, "").trim();
      if (!t || /^(?:it|that|this|the payment|my payment|payment|money)$/.test(t)) return null;
      if (/^rent\b/.test(t)) return { label: "rent", test: (r) => cents(r) < 0 && RENT.test(norm(r.merchant_raw)) };
      if (/^(?:pay ?check|paycheque|pay|salary|direct deposit|wages?)$/.test(t)) return { label: "paycheck", test: (r) => cents(r) > 0 && PAY.test(norm(r.merchant_raw)) };
      // A refund, credit or price adjustment is money coming in: the words name the kind, not the merchant, and only a
      // credit counts ("did my target credit post" after a price-drop draft; "did the delta refund post" after an airline one).
      const REFUND = /\s*\b(?:refunds?|credits?(?!\s*(?:cards?|union|score|line|limit|report))|price adjustments?|adjustments?|reimbursements?|money back|cash ?back)\b\s*/g;
      if (REFUND.test(t)) {
        const who = t.replace(REFUND, " ").replace(/\b(?:check|payment)\b/g, " ").replace(/\s+/g, " ").trim();
        if (!who) return null;
        return { label: `${who} refund`, refund: true, test: (r) => cents(r) > 0 && termMatch(r.merchant_raw, who) };
      }
      return { label: t, test: (r) => termMatch(r.merchant_raw, t) };
    }
    function didItGoThrough(transactions, words, now, opts) {
      const tz = (opts && opts.tz) || "UTC", today = todayIn(now, tz), since = addDays(today, -31);
      const tg = goThroughTarget(words);
      if (!tg && /\b(?:refund|credit|reimbursement|money back)\b/i.test(String(words || ""))) return `Which refund? Name the store, airline or company, like "did the target refund post", and I'll look for the credit. ${txSource(transactions, tz)}`;
      if (!tg) return `Name the payment, like "did rent go through", and I'll check your transactions. ${txSource(transactions, tz)}`;
      const names = new Map(((opts && opts.accounts) || []).map((a) => [a.account_id, acctName(a)]));
      const rows = (transactions || []).filter((r) => r && usd(r) && Number.isFinite(cents(r)) && tg.test(r));
      const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : Number.isFinite(ms(r.fetched_at)) ? todayIn(ms(r.fetched_at), tz) : today);
      const sorted = rows.slice().sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || (a.is_pending ? -1 : 1));
      const pend = sorted.find((r) => r.is_pending && dayOf(r) >= since), post = sorted.find((r) => !r.is_pending && typeof r.posted_on === "string");
      const where = (r) => (names.get(r.account_id) ? ` (${names.get(r.account_id)})` : "");
      const what = (r) => `${money(Math.abs(cents(r)))} ${cents(r) < 0 ? "to" : "from"} ${display(r.merchant_raw)}`;
      const lines = [];
      if (pend && (!post || dayOf(pend) >= post.posted_on.slice(0, 10))) {
        lines.push(`It's pending: ${what(pend)}${where(pend)}, first seen ${dateLabel(dayOf(pend))}. It hasn't posted yet, so the money may not have moved.`);
      } else if (post && post.posted_on.slice(0, 10) >= since) {
        const age = daysBetween(post.posted_on.slice(0, 10), today);
        lines.push(`Yes, it posted: ${what(post)} on ${dateLabel(post.posted_on.slice(0, 10))}${where(post)}.${age > 20 ? ` That was ${age} days ago; nothing newer has shown up since.` : ""}`);
      } else {
        lines.push(`Not yet: no ${tg.label}${tg.refund ? " or credit" : tg.label === "paycheck" ? " deposit" : " charge"} has posted since ${dateLabel(since)}.${post ? ` The last one posted ${dateLabel(post.posted_on.slice(0, 10), true)}: ${what(post)}.` : ""}`);
        if (tg.label === "rent") lines.push(`If rent goes out under another name (a Zelle to your landlord or a portal's name), say "did <that name> go through".`);
      }
      lines.push(txSource(transactions, tz));
      return lines.join("\n");
    }

    // CATEGORIES, isSpend, display, txSource and todayIn are shared with category budgets (93-budgets.js), so "groceries",
    // "spending" and the source line mean the same in a budget as in "how much did i spend on groceries". The same ones,
    // plus isIncome (a credit that is not a transfer or card payment), termMatch, acctName and kindOf, are shared with
    // the month comparison and spending by card (94-spending-views.js).
    return { money, period, classify, ruleFor, ruleLine, MERCHANT_NAMES: MERCHANTS.filter((m) => m[1]).map((m) => [m[0], m[1]]), GROUP_LABEL, target, balance, spend, checkup, didItGoThrough, goThroughTarget, timeLabel, STALE_MS, CATEGORIES, isSpend, isIncome, termMatch, acctName, kindOf, display, txSource, todayIn };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = MoneyAnswers;
