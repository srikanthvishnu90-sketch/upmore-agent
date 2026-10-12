  /* Category rules in chat (owner's capability list item 8; megadoc L07 "recategorize Target as groceries"; teardown 2
     Copilot Money/Categories and budgets, Monarch rules). A person moves a merchant into one of the categories the chat
     already counts ("how much did i spend on groceries", category budgets): every later answer and budget counts that
     merchant's charges there. It changes how Upmore counts, never anything at the bank or card, and never moves money.
       parse(words)                     what a message asks: set, stop, list, or null (anything else goes on)
       command(words, rules, now)       the new rule list and the restating reply (null when the words are not a rule)
       describe(rules)                  one line for "what are my alerts" style summaries ("" with none)
     A rule is { id, term, group, created_at, text }: term is the merchant words as typed (no run of 5 or more digits,
     never a pronoun, an amount or a category word), group one of MoneyAnswers' single groups. Stored in
     agent_proactive_settings.category_rules (migration 20261012020000; at most 40 rules, no run of 9 or more digits).
     Matching and precedence live with the classifier (MoneyAnswers.classify(raw, rules), 80-money-answers.js): the
     term's whole words in the bank's descriptor, the longest term wins, and a known merchant more specific than the term
     keeps its own category (a "Costco" rule leaves Costco Gas as gas; the reply says so). Pure: no I/O, no clock reads.
     Depth packet CATEGORY-RULES (tests/depth-CATEGORY-RULES.test.cjs). */
  const CategoryRules = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const MAX_RULES = 40;
    // The groups a merchant can be moved into, by the words a person uses for each. "Food" spans three groups, so it is
    // asked about, never guessed.
    const GROUPS = [
      ["delivery", "food delivery", /^(?:food delivery|delivery|deliveries|take-?out|take out)$/],
      ["groceries", "groceries", /^(?:grocer(?:y|ies)|grocery stores?|supermarkets?)$/],
      ["restaurants", "restaurants", /^(?:restaurants?|eating out|dining(?: out)?|coffee|coffee shops?|fast food)$/],
      ["gas", "gas", /^(?:gas|fuel|gasoline|gas stations?)$/],
      ["subscriptions", "subscriptions", /^(?:subscriptions?|streaming)$/],
      ["transport", "transport", /^(?:transport(?:ation)?|rides?|rideshare|transit|commut(?:e|ing)|parking)$/],
      ["shopping", "shopping", /^(?:shopping|clothes|clothing)$/],
    ];
    const LABEL = Object.fromEntries(GROUPS.map(([g, l]) => [g, l]));
    const LIST = "food delivery, groceries, restaurants (eating out, dining, coffee), gas, subscriptions, transport, shopping";
    const FILLER = /\s+(?:category|categories|spending|purchases?|charges?|stuff|things?|bucket)$/;
    // The group a category phrase names: a group key, "food" (ambiguous), or null (not a category).
    function groupOf(y) {
      let s = String(y || "").trim().replace(/[,;]?\s*(?:not|instead of|rather than)\s+.+$/, "").replace(/^(?:the|a|an|my)\s+/, "").trim();
      for (let i = 0; i < 2; i++) s = s.replace(FILLER, "").trim();
      if (/^(?:food|meals?|eating)$/.test(s)) return "food";
      const hit = GROUPS.find(([, , re]) => re.test(s));
      return hit ? hit[0] : null;
    }

    // ---- the person's words ----
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|pls|please|upmore)[,\s]+)*(?:(?:can|could|would|will) (?:you|u)\s+(?:please\s+|pls\s+)?|please\s+|pls\s+|i want (?:you )?to\s+|i'd like (?:you )?to\s+)?/i;
    const TAIL = /(?:\s+(?:from now on|going forward|always|instead|please|pls|thanks|thank you|for me|too|now|anymore|any more))+$/;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").replace(TAIL, "").trim();
    const QUESTION = /^(?:how|what|why|when|where|which|who|should|could|would|do|does|did|can|is|are|am|if|was|were)\b/;
    const PRONOUN = /^(?:it|that|this|them|those|these|that one|this one|that charge|this charge|the last one|the last charge|my last charge|the charge)$/;
    const AMOUNT = /^\$?\s?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:dollars|bucks|usd))?$/;
    const GENERIC = /^(?:the|a|an|inc|llc|co|corp|store|stores|shop|pos|debit|credit|card|purchase|purchases|payment|payments|transfer|transfers|ach|atm|online|web|recurring|checkcard|charge|charges|transaction|transactions|everything|all|stuff|money|spending|merchant|merchants)$/;
    // The merchant words: "my target purchases" is "target", "all charges from costco" is "costco".
    function termOf(x) {
      let s = String(x || "").trim().replace(/^["']+|["']+$/g, "");
      s = s.replace(/^(?:all\s+(?:of\s+)?)?(?:(?:my|the|our)\s+)?/, "").replace(/^(?:charges?|purchases?|transactions?|payments?|orders?|spending)\s+(?:from|at|to|with|on)\s+/, "");
      s = s.replace(/^(?:my|the|our)\s+/, "").replace(/(?:'s)?\s+(?:charges?|purchases?|transactions?|payments?|orders?|trips?|runs?|visits?|stuff|spending)$/, "").replace(/^["']+|["']+$/g, "").trim();
      return s;
    }
    const key = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    // Why a term can't be a rule ("" when it can).
    function badTerm(term) {
      const k = key(term);
      if (!k || PRONOUN.test(term)) return "pronoun";
      if (AMOUNT.test(term)) return "amount";
      if (/\d{5,}/.test(term.replace(/[\s-]/g, ""))) return "digits";
      if (k.replace(/[^a-z]/g, "").length < 2 || k.length > 40 || term.length > 60) return "length";
      if (GENERIC.test(k)) return "generic";
      if (groupOf(term)) return "category";
      return "";
    }

    const SET_STRONG = /^(?:always\s+)?(?:re-?categori[sz]e|categori[sz]e|re-?classify|classify)\s+(.+?)\s+(?:as|under|in|into|to)\s+(.+)$/;
    const SET_WEAK = /^(?:always\s+)?(?:count|treat|mark|file|tag|label|put|move)\s+(.+?)\s+(?:as|under|in|into|to)\s+(.+)$/;
    // Chat shorthand: "target = groceries", "target -> groceries" (a known category only, like the bare "is" form).
    const ARROW = /^(.+?)\s*(?:=|->|=>|\u2192)\s*(.+)$/;
    const CHANGE = /^(?:change|switch|set)\s+(?:the\s+category\s+(?:of|for)\s+)?(.+?)(?:(?:'s)?\s+category)?\s+(?:to|into)\s+(.+)$/;
    const ISNT_ITS = /^(.+?)\s+(?:isn'?t|is not|isnt|aint|ain't)\s+(?:a\s+|an\s+)?(.+?)[,;]?\s+(?:it'?s|it is|that'?s|thats)\s+(?:a\s+|an\s+)?(.+)$/;
    const IS = /^(.+?)\s+(?:should be|should count as|counts as|is|are|goes under|go under|belongs (?:in|under)|should go (?:in|under)|should be in)\s+(?:a\s+|an\s+|in\s+|under\s+)?(.+)$/;
    const STOP_COUNT = /^(?:(?:stop|quit)\s+(?:counting|putting|categori[sz]ing|filing)|(?:don'?t|do not|dont|never)\s+(?:count|put|file))\s+(.+?)\s+(?:as|in|under|into)\s+(?:a\s+|an\s+|the\s+)?(.+)$/;
    // "take Target out of groceries", "remove Target from groceries". Never for subscriptions: "remove netflix from my
    // subscriptions" may be a cancel, so it goes on.
    const OUT_OF = /^(?:remove|take)\s+(.+?)\s+(?:out of|from)\s+(?:my\s+|the\s+)?(.+)$/;
    const REMOVE = /^(?:delete|remove|forget|undo|drop|clear|cancel|stop)\s+(?:my\s+|the\s+)?(?:(category\s+)?rule\s+(?:for|on|about)\s+(.+)|(.+?)\s+(category\s+)?rule)$/;
    const REMOVE_ALL = /^(?:delete|remove|clear|forget|reset|erase|drop|undo)\s+(?:all\s+)?(?:of\s+)?(?:my|the)\s+(?:category|categori[sz]ation)\s+rules$/;
    const LIST_ASK = /^(?:(?:show|list|see|view|give|tell)(?: me)?|what are|whats|what's|what is)\s+(?:all\s+)?(?:(?:my|the)\s+)?(?:category|categori[sz]ation)\s+rules$|^(?:my\s+)?(?:category|categori[sz]ation)\s+rules$/;
    const NOT_A_NAME = /^(?:my|our|your|the|a|an|this|that|it|most|all|half|some|everything|what|which)\b|\b(?:biggest|largest|most|main|top|favorite|favourite|expenses?|spending|problem|weakness|habit|category|money|bills?|budget|thing|things|cost|costs)\b/;
    // Money places, and words that make it a dispute or a tax question ("classify this charge as fraud", "mark Staples as
    // a business expense"): not a category rule, so they go on to the dispute flow or the model.
    const NOT_OURS = /\b(?:budget|account|savings|checking|brokerage|portfolio|wallet|vault|fraud\w*|scam|unauthori[sz]ed|disputed?|stolen|business|tax|deductible|reimburs\w*|work expenses?)\b/;

    function parse(words) {
      const t = clean(words);
      if (!t || t.length > 160) return null;
      if (LIST_ASK.test(t)) return { kind: "list" };
      if (REMOVE_ALL.test(t)) return { kind: "stop", all: true, term: null, group: null, explicit: true };
      if (QUESTION.test(t)) return null;
      let m;
      if ((m = REMOVE.exec(t))) {
        const term = termOf(m[2] || m[3]);
        return term ? { kind: "stop", all: false, term, group: null, explicit: !!(m[1] || m[4]) } : null;
      }
      if ((m = STOP_COUNT.exec(t))) {
        const g = groupOf(m[2]);
        return g && g !== "food" ? { kind: "stop", all: false, term: termOf(m[1]), group: g, explicit: true } : null;
      }
      if ((m = OUT_OF.exec(t))) {
        const g = groupOf(m[2]);
        if (g && g !== "food" && g !== "subscriptions") return { kind: "stop", all: false, term: termOf(m[1]), group: g, explicit: true };
      }
      const set = (x, y, strong) => {
        if (NOT_OURS.test(y)) return null;
        const term = termOf(x), g = groupOf(y), named = /\bcategor/.test(y) || strong;
        if (!g && !named) return null;
        if (AMOUNT.test(term)) return null; // "move 500 into savings" is a money move, not a rule
        const unknown = g ? null : String(y).replace(/^(?:the|a|an|my)\s+/, "").replace(FILLER, "").replace(/\d{5,}/g, "#").slice(0, 30).trim();
        return { kind: "set", term, group: g === "food" ? null : g, food: g === "food", unknown };
      };
      if ((m = ISNT_ITS.exec(t))) { const p = set(m[1], m[3], false); if (p) return p; }
      if ((m = SET_STRONG.exec(t))) return set(m[1], m[2], true);
      if ((m = SET_WEAK.exec(t))) return set(m[1], m[2], false);
      if ((m = CHANGE.exec(t))) return set(m[1], m[2], false);
      if ((m = ARROW.exec(t))) {
        const g = groupOf(m[2]), subj = m[1].trim();
        if (g && g !== "food" && !NOT_A_NAME.test(subj) && subj.split(/\s+/).length <= 4) return { kind: "set", term: termOf(subj), group: g, food: false, unknown: null };
      }
      if ((m = IS.exec(t))) {
        // "target is groceries": only when the rest is exactly a category, so "gas is expensive" or "netflix is a
        // subscription i want to cancel" goes on; and only when the subject reads like a merchant's name, so "my biggest
        // expense is groceries" or "most of it is shopping" is a statement, not a rule.
        const g = groupOf(m[2]), subj = m[1].trim();
        if (g && g !== "food" && !NOT_OURS.test(m[2]) && !NOT_A_NAME.test(subj) && subj.split(/\s+/).length <= 4) return { kind: "set", term: termOf(subj), group: g, food: false, unknown: null };
      }
      return null;
    }

    // ---- the replies ----
    const nameOf = (term) => {
      const c = MA.classify(term);
      if (c && c.name && key(c.name) === key(term)) return c.name;
      return String(term).replace(/(^|[\s\-\/&.])([a-z])/g, (_, a, b) => a + b.toUpperCase());
    };
    const q = (term) => `"${nameOf(term)}"`;
    const rulesIn = (rules) => (Array.isArray(rules) ? rules : []).filter((r) => r && typeof r.term === "string" && LABEL[r.group]);
    const same = (a, b) => key(a) === key(b);
    // Known merchants more specific than the term, which keep their own category (Costco Gas under a Costco rule).
    function exceptions(term, group) {
      const k = key(term), out = [];
      for (const [g, name] of MA.MERCHANT_NAMES || []) {
        const n = key(name);
        if (n !== k && ` ${n} `.includes(` ${k} `) && g !== group && !out.some((o) => o[0] === name)) out.push([name, g]);
      }
      return out;
    }
    const BAD = {
      pronoun: `Tell me the merchant's name, like "count Target as groceries". I set rules by merchant, not for one charge, so nothing changed.`,
      amount: `That reads like an amount, not a merchant, so nothing changed. Say "count Target as groceries" with the merchant's name.`,
      digits: `That has a long number in it. Use the merchant's name, like "count Target as groceries"; nothing changed.`,
      length: `I need the merchant's name, like "count Target as groceries", so nothing changed.`,
      generic: `That word is on almost every bank line, so a rule for it would move far more than you mean. Use the merchant's name, like "count Target as groceries"; nothing changed.`,
      category: `I can move a merchant into a category, not one category into another, so nothing changed. Say "count Target as groceries" with the merchant's name.`,
    };
    function defaultGroup(term) { const c = MA.classify(term); return c ? c.group : null; }
    function command(words, rules, now) {
      const p = parse(words);
      if (!p) return null;
      const have = rulesIn(rules);
      if (p.kind === "list") return { rules: null, reply: have.length ? `Your category rules: ${have.map((r) => `${q(r.term)} counts as ${LABEL[r.group]}`).join("; ")}. They change how I count, nothing at your bank.` : `You don't have any category rules. Say "count Target as groceries" to add one.` };
      if (p.kind === "stop") {
        if (p.all) {
          if (!have.length) return { rules: null, reply: "You don't have any category rules, so nothing changed." };
          return { rules: [], reply: `Removed all ${have.length === 1 ? "1 category rule" : `${have.length} category rules`}: ${have.map((r) => `${q(r.term)} (${LABEL[r.group]})`).join(", ")}. Those merchants count where they did before. Nothing else changed.` };
        }
        const mine = have.find((r) => same(r.term, p.term));
        if (!mine) {
          // "delete my autosave rule" is someone else's: without the word category, a rule we don't have goes on.
          if (!p.explicit) return null;
          const d = p.group && defaultGroup(p.term) === p.group;
          if (d) return { rules: null, reply: `${q(p.term)} counts as ${LABEL[p.group]} by default, not by a rule of yours. Tell me where it should go instead, like "count ${nameOf(p.term)} as shopping". Nothing changed.` };
          return { rules: null, reply: `You don't have a category rule for ${q(p.term)}, so nothing changed.${have.length ? ` Your rules: ${have.map((r) => `${q(r.term)} as ${LABEL[r.group]}`).join("; ")}.` : ""}` };
        }
        if (p.group && p.group !== mine.group) return { rules: null, reply: `Your rule counts ${q(mine.term)} as ${LABEL[mine.group]}, not ${LABEL[p.group]}, so nothing changed.` };
        const d = defaultGroup(mine.term);
        return { rules: have.filter((r) => r !== mine), reply: `Removed your rule: charges that say ${q(mine.term)} ${d ? `count as ${LABEL[d]} again` : "are back to no category (shown as spending I couldn't place)"}, as they did before. Nothing else changed.` };
      }
      // Set.
      const bad = badTerm(p.term);
      if (bad) return { rules: null, reply: BAD[bad] };
      if (p.food) return { rules: null, reply: `"Food" covers groceries, restaurants and food delivery. Which one should ${q(p.term)} count as? Nothing changed yet.` };
      if (!p.group) return { rules: null, reply: `I don't have a${p.unknown ? ` "${p.unknown}"` : ""} category to put it in, so nothing changed. Categories I can put a merchant in: ${LIST}.` };
      const old = have.find((r) => same(r.term, p.term));
      if (old && old.group === p.group) return { rules: null, reply: `Charges that say ${q(p.term)} already count as ${LABEL[p.group]} (your rule), so nothing changed.` };
      const d = defaultGroup(p.term);
      if (!old && d === p.group) return { rules: null, reply: `Charges that say ${q(p.term)} already count as ${LABEL[p.group]}, so nothing changed.` };
      if (!old && have.length >= MAX_RULES) return { rules: null, reply: `You have ${MAX_RULES} category rules, the most I keep, so nothing changed. Say "show my category rules" and remove one first.` };
      const nowMs = typeof now === "number" ? now : Date.parse(now);
      // The settings table refuses any run of 9 or more digits: the id carries the time in base 36.
      const rule = { id: `cr-${nowMs.toString(36)}`, term: String(p.term).slice(0, 60), group: p.group, created_at: new Date(nowMs).toISOString(), text: String(words || "").replace(/\d{5,}/g, "#").slice(0, 160) };
      const next = have.filter((r) => r !== old).concat([rule]);
      const was = old ? `instead of ${LABEL[old.group]} (that replaces your earlier rule)` : d ? `instead of ${LABEL[d]}` : "(I didn't place them in any category before)";
      const ex = exceptions(p.term, p.group);
      const lines = [
        `Done: charges that say ${q(p.term)} now count as ${LABEL[p.group]} ${was}, in your spending answers and budgets, past charges included.${ex.length ? ` ${ex.map(([n, g]) => `${n} stays ${LABEL[g]}`).join("; ")}.` : ""}`,
        `This changes how I count, nothing at your bank or card. Say "stop counting ${nameOf(p.term)} as ${LABEL[p.group]}" to undo it.`,
      ];
      return { rules: next, reply: lines.join("\n") };
    }
    function describe(rules) { const r = rulesIn(rules); return r.length ? `Category rules: ${r.map((x) => `${q(x.term)} as ${LABEL[x.group]}`).join("; ")}.` : ""; }

    return { MAX_RULES, GROUPS, LABEL, LIST, parse, command, describe, rulesIn, groupOf, termOf, badTerm };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = CategoryRules;
