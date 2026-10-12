  /* Savings goals, tracking only (teardown 2 build-order step 4 "tracking-only goals"; megadoc M08 "how's my vacation
     fund"). A goal is a name, a target and, if the person gives one, a date, tied to one of their own accounts: its
     balance is the progress. Nothing is moved, set aside or scheduled (saving automatically stays not built, M01).
       command(words, watches, now, tz)        set, tie to an account, or stop: { watches | null, reply }, or null
       isStatus(words)                         "how's my vacation fund", "how are my goals", "show my goals"
       status(words, goals, accounts, now, tz) the progress: the account's balance (with its source and as-of) against the
                                               target, what's left, and with a date the months left and the amount a month
     Stored as a person-set watch (no migration): { id, kind: "savings_goal", name, target_cents, by, account,
     created_on, status }. account is the person's words for the account ("High Yield Savings"), matched against their
     linked accounts' names when asked; none, or more than one match, is asked about, never guessed. The date words are
     SaveGoal's (107-save-goal.js): "by June" (the next one, its last day), "by Dec 31", "by 12/31", "in 6 months", "by
     the end of the year". Up to 5 goals. The table refuses a run of 9+ digits, so the id is base 36 and the target at
     most $10,000,000.00. Pure. Depth packet GOALS. */
  const SavingsGoals = (() => {
    const SG = typeof SaveGoal !== "undefined" ? SaveGoal : require("./107-save-goal.js");
    const KIND = "savings_goal", MAX = 5, MAX_CENTS = 1000000000;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = (c) => (c < 0 ? "-" : "") + "$" + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
    const dateLabel = (d) => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
    const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    const clean = (t) => String(t || "").replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
    function todayOf(now, tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)); } catch (e) { return new Date(now).toISOString().slice(0, 10); } }
    const isGoal = (w) => w && w.kind === KIND && w.status !== "stopped";
    const goalsIn = (watches) => (watches || []).filter(isGoal);
    const AMT = "\\$?(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?(k)?";
    const cents = (m, i) => { const whole = Number(String(m[i]).replace(/,/g, "")), c = whole * 100 + (m[i + 1] ? Number((m[i + 1] + "0").slice(0, 2)) : 0); return m[i + 2] ? whole * 100000 : c; };
    // The goal's name: a word or two before "goal" or "fund", or after "for (a|the|my)".
    const NAME = "([a-z][a-z' -]{0,24}?)";
    const keyOf = (n) => clean(n).replace(/^(?:a|an|the|my|our)\s+/, "").replace(/\s+(?:fund|goal|savings)$/, "").trim();
    const SETS = [
      // "set a goal to save $3000 for vacation by june in high yield savings", "set a savings goal of 3k for a car"
      new RegExp(`^(?:set|start|make|create|add|track)(?: up)? (?:a |an |my )?(?:new )?(?:savings )?goal (?:to save|of|for)? ?${AMT} (?:for|towards?) (?:a |an |the |my )?${NAME}(?= by | before | in | until |$)`),
      // "set a $3000 vacation goal", "start a 5000 emergency fund", "track a $3,000 vacation fund"
      new RegExp(`^(?:set|start|make|create|add|track)(?: up)? (?:a |an |my )?${AMT} ${NAME} (?:savings )?(?:goal|fund)\\b`),
      // "my goal is $5000 for a house" ("my goal is to save 5000 by june" is SaveGoal's math, which the chat asks first)
      new RegExp(`^my (?:savings )?goal is ${AMT} (?:for|towards?) (?:a |an |the |my )?${NAME}(?= by | before | in | until |$)`),
    ];
    const TIE = /^(?:my |the )?([a-z][a-z' -]{0,24}?) (?:fund|goal) is (?:in|at|my) (?:my |the )?(.{2,40})$|^(?:track|keep) (?:my |the )?([a-z][a-z' -]{0,24}?) (?:fund|goal) (?:in|at|on) (?:my |the )?(.{2,40})$/;
    // "delete all my goals" first, so "all my" is never read as a goal's name.
    const STOP = /^(?:stop|delete|remove|cancel|drop|forget)(?: tracking)? all (?:my |of my |the )?(?:savings )?goals$|^(?:stop|delete|remove|cancel|drop|forget|end)(?: tracking)? (?:my |the )?(?:([a-z][a-z' -]{0,24}?) )?(?:savings )?(?:goal|fund)s?$/;
    const STATUS = /^(?:how close am i to |where am i (?:on|with) |progress on |how(?:'s|s| is| are)? |show(?: me)? |check |what's |whats )?(?:my |the )?(?:([a-z][a-z' -]{0,24}?) )?(?:savings )?(?:fund|goal)s?(?: (?:doing|looking|going|coming along|at|progress|status))?$/;
    function parseSet(t, today) {
      for (const re of SETS) {
        const m = re.exec(t); if (!m) continue;
        const target = cents(m, 1), name = keyOf(m[4]);
        const after = t.slice(m.index + m[0].length), by = SG.when(after, today);
        // "in High Yield Savings" is the account; "in 6 months" and "in June" are dates, never an account.
        const acc = /\b(?:in|at) (?:my |the )?(?!\d|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)([a-z][a-z0-9' &-]{1,40}?)(?: account)?(?= by | before | until |$)/.exec(after);
        return { name, target, by, account: acc ? acc[1].trim() : null };
      }
      return null;
    }
    function command(words, watches, now, tz) {
      const t = clean(words), all = watches || [], have = goalsIn(all), today = todayOf(now, tz);
      let m;
      if ((m = STOP.exec(t))) {
        const name = m[1] ? keyOf(m[1]) : null, drop = name ? have.filter((g) => g.name === name) : have;
        if (!drop.length) return { watches: null, reply: name ? `You don't have a ${name} goal, so nothing changed.` : "You don't have any savings goals, so nothing changed." };
        return { watches: all.filter((w) => !drop.includes(w)), reply: `Stopped tracking ${drop.map((g) => `your ${g.name} goal (${money(g.target_cents)})`).join(" and ")}. Nothing was moved; nothing else changed.` };
      }
      if ((m = TIE.exec(t))) {
        const name = keyOf(m[1] || m[3]), account = (m[2] || m[4]).replace(/\s+account$/, "").trim(), g = have.find((x) => x.name === name);
        if (!g) return null;
        return { watches: all.map((w) => (w === g ? Object.assign({}, w, { account }) : w)), reply: `Your ${g.name} goal now tracks the balance of "${cap(account)}". Nothing was moved.` };
      }
      const p = parseSet(t, today);
      if (!p) return null;
      if (p.name && /\b(?:index|mutual|bond|etf|hedge|retirement|401k|ira|stock)\b/.test(p.name)) return { watches: null, reply: "A retirement or investment fund isn't tracked as a savings goal here, so nothing was set. A savings goal tracks an account's balance, like \"set a $3,000 vacation goal by June in High Yield Savings\"." };
      if (!p.name) return { watches: null, reply: "I couldn't tell what the goal is for, so nothing was set. Say it like \"set a $3,000 vacation goal by June in High Yield Savings\"." };
      if (!(p.target > 0) || p.target > MAX_CENTS) return { watches: null, reply: `A goal needs a target from $0.01 to ${money(MAX_CENTS)}, so nothing was set.` };
      if (p.by === null) return { watches: null, reply: "I couldn't read that date, so nothing was set. Say it like \"by June\", \"by Dec 31\" or \"in 6 months\"." };
      const old = have.find((g) => g.name === p.name);
      if (!old && have.length >= MAX) return { watches: null, reply: `You have ${MAX} goals already, the most I track, so nothing was set. Say "stop my <name> goal" to make room.` };
      const g = { id: `goal-${now.toString(36)}`, kind: KIND, name: p.name, target_cents: p.target, by: p.by || (old && old.by) || null, account: p.account || (old && old.account) || null, created_on: today, status: "active" };
      const next = all.filter((w) => w !== old).concat([g]);
      const lines = [`Goal set: ${g.name}, ${money(g.target_cents)}${g.by ? ` by ${dateLabel(g.by)}` : ""}${old ? ` (it was ${money(old.target_cents)}${old.by ? ` by ${dateLabel(old.by)}` : ""})` : ""}.`];
      lines.push(g.account ? `I'll track it against the balance of "${cap(g.account)}".` : `Which account holds it? Say "my ${g.name} fund is in" and the account's name, and I'll track its balance.`);
      lines.push("It's tracking only: nothing is moved, set aside or scheduled.");
      return { watches: next, reply: lines.join(" ") };
    }
    function isStatus(words) { const t = clean(words); return STATUS.test(t) && !/\b(?:index|mutual|bond|etf|hedge|retirement|401k|ira)\b/.test(t); }
    // Months left to a date, counted the way SaveGoal counts them: the calendar months after this one through the date's.
    const monthsTo = (today, by) => (+by.slice(0, 4) * 12 + +by.slice(5, 7)) - (+today.slice(0, 4) * 12 + +today.slice(5, 7));
    function status(words, goals, accounts, now, tz) {
      const t = clean(words), have = goalsIn(goals), today = todayOf(now, tz);
      if (!have.length) return null;
      const m = STATUS.exec(t), want = m && m[1] ? keyOf(m[1]) : null;
      const pick = want && !/^(?:all|savings)$/.test(want) ? have.filter((g) => g.name === want || g.name.split(" ")[0] === want.split(" ")[0]) : have;
      if (!pick.length) return `You don't have a ${want} goal. Your goals: ${have.map((g) => g.name).join(", ")}.`;
      const accts = (accounts || []).filter((a) => a && a.name);
      const out = [];
      for (const g of pick) {
        if (!g.account) { out.push(`${cap(g.name)}: ${money(g.target_cents)} goal${g.by ? ` by ${dateLabel(g.by)}` : ""}, not tied to an account yet. Say "my ${g.name} fund is in" and the account's name${accts.length ? ` (${accts.slice(0, 4).map((a) => a.name).join(", ")})` : ""}.`); continue; }
        const k = clean(g.account), hits = accts.filter((a) => clean(a.name) === k || clean(a.name).includes(k) || k.includes(clean(a.name)));
        if (hits.length !== 1) { out.push(`${cap(g.name)}: I ${hits.length ? `found ${hits.length} accounts that match "${g.account}" (${hits.map((a) => a.name).join(", ")})` : `don't see an account called "${g.account}" among your linked accounts`}, so I won't guess its balance. Say "my ${g.name} fund is in" and the exact name.`); continue; }
        const a = hits[0], bal = Number.isFinite(Number(a.balance_cents)) ? Math.round(Number(a.balance_cents)) : null;
        if (bal === null) { out.push(`${cap(g.name)}: ${a.name} has no balance I can read right now, so I won't guess.`); continue; }
        const left = g.target_cents - bal, pct = Math.floor((bal / g.target_cents) * 1000) / 10;
        let line = `${cap(g.name)}: ${money(bal)} of ${money(g.target_cents)} (${pct}%) in ${a.name}${a.institution ? ` at ${a.institution}` : ""}, as of ${a.balance_as_of ? String(a.balance_as_of).slice(0, 10) : "its last read"}.`;
        if (left <= 0) line += ` That's the goal reached${left < 0 ? `, ${money(-left)} over` : ""}.`;
        else {
          line += ` ${money(left)} to go`;
          if (g.by) { const n = monthsTo(today, g.by); line += n >= 1 ? `: ${money(Math.ceil(left / n))} a month for ${n} month${n === 1 ? "" : "s"} to reach it by ${dateLabel(g.by)}.` : g.by >= today ? `, due by ${dateLabel(g.by)}, this month.` : `; the date, ${dateLabel(g.by)}, has passed.`; }
          else line += ".";
        }
        out.push(line);
      }
      out.push("The balance is the whole account, so money in it for other things counts too. Tracking only: nothing is moved.");
      return out.join("\n");
    }
    return { KIND, command, isStatus, status, goalsIn, isGoal };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SavingsGoals;
