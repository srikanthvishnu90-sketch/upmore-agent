  /* Advice guard (Instinct spec doc 09). A hard gate on every investing
     response, called in one place. Pure rules, no model. The line: facts,
     math, mechanics, education and user-directed execution pass; telling
     the user what to buy, sell or hold, ranked picks framed as what to do,
     return promises and personal suitability claims are blocked. Conservative
     reading until securities counsel reviews the rule set: when in doubt,
     block and give information instead. The rule set is grown by the
     red-team set in evals/data/labeled/advice-boundary.json: every phrasing
     that got past it became a rule here. */
  const AdviceGuard = (() => {
    // Base verbs of a securities instruction; forms (buying/bought) are allowed where the context word makes it directed.
    const BASE = "buy|sell|hold|trim|dump|short|exit|unload|rotate|switch|own|keep|pick|choose|liquidate";
    const ACTION = `(?:(?:${BASE})(?:ing|s|ed|ght)?|add(?:ing)? to|load(?:ing)? up on|lock(?:ing)? in|get(?:ting)? (?:in|into|out of)|mov(?:e|ing) (?:into|out of|everything into)|invest(?:ing)?(?: (?:it|everything|all|the cash|your \\w+|\\$?[\\d,.]+\\w*))?(?: all)?(?: in| into)?|put(?:ting)? (?:your |the )?(?:money|cash|savings)(?: there| in| into)?|pil(?:e|ing) into|doubl(?:e|ing) down on|tak(?:e|ing) profits? on|go(?:ing)? with|copy (?:it|that|my)|execute (?:this|that|those|these)|do (?:it|that|this))`;
    const DIRECTED = `(?:you should|you need to|you ought to|you have to|you'?d better|you must|i(?:'d| would)? (?:strongly )?(?:recommend|suggest|advise)(?: that)?(?: you)?|my (?:advice|recommendation|suggestion|call) (?:is|would be)|go ahead and|it'?s time to|now is (?:the|a good) time to|you'?d be (?:smart|wise) to|if i were you,? i'?d|i'?d (?:personally )?|i(?:'d| would) tell (?:you|them|that \\w+|a \\w+) to|(?:someone|anyone|a smart person|a \\w+ person) (?:like you|in your (?:position|shoes|situation)) would|the (?:move|trade|play|answer) is (?:simple|clear|obvious)[:,]?|the ones you should|i'?ve decided[:,]?|trust me[:,]?)`;
    const RULES = [
      ["directed_action", new RegExp(`\\b${DIRECTED}\\s*(?:[^.!?]{0,60}?\\b)?${ACTION}\\b`, "i")],
      ["directed_action", new RegExp(`\\b(?:you should|you need to|i recommend|i suggest|i'?d recommend)\\s+${ACTION}\\b`, "i")],
      ["ranked_picks", /\b(?:top|best|my|our)\s+(?:\d+\s+)?(?:stocks?|etfs?|funds?|picks?|buys|plays|tickers|to buy|to own)(?:\s+(?:to buy|to own|for you|for a\b|right now|this (?:week|month|year)|you should))?\b|\bmy (?:top )?picks?\b|\bpicks? for you\b|\bhere(?:'s| are) (?:what|the ones) (?:to|you should) buy\b|\btop \d+ to buy\b/i],
      ["return_promise", /\b(?:will|is going to|are going to|should|guaranteed to|expected to|bound to|sure to|likely to) (?:return|gain|rise|climb|double|triple|outperform|go up|10x|beat the market|make you money|win)\b|\b\d+(?:\.\d+)?% (?:annual |yearly )?returns? (?:guaranteed|expected|likely|is realistic)\b|\bcan'?t lose\b|\bno[- ]brainer\b|\bsafe bet\b|\bsure thing\b|\bwins? over the next\b|\bis the winner\b|\bbefore it (?:runs|takes off|rallies|moons)\b/i],
      ["personal_suitability", /\b(?:undervalued|overvalued|cheap|a (?:good|great|smart|bad|perfect|solid) (?:buy|investment|fit|choice|idea|move)) for (?:you|your|a \d+-year-old)\b|\bright for you\b|\bsuits? your (?:goals|situation|risk|profile)\b|\b(?:perfect for|fits?) your portfolio\b|\byou(?:'re| are) (?:too|over|under)(?:-| )?exposed,? so (?:sell|trim|buy)\b|\bin your position\b[^.!?]*\b(?:buy|sell|hold)\b/i],
      ["advisor_roleplay", new RegExp(`\\b(?:as your (?:financial |personal )?(?:advis[eo]r|cfp|planner|fiduciary|broker|money manager)|speaking as your advis[eo]r|in my professional opinion you should|if i were managing your money i(?:'d| would) ${ACTION}|(?:between us|off the record|just this once|honestly|confidentially)[,:]?\\s*(?:${BASE})\\b|the bot says[:,]|future you says[:,])`, "i")],
      ["model_portfolio_as_guidance", /\byou should (?:allocate|put|move|have|hold|keep) \d+ ?(?:%|percent)|\bthe (?:ideal|right|optimal|correct) (?:allocation|portfolio|mix) for you is\b|\bi(?:'d| would) (?:allocate|put) your money\b|\bmy (?:recommendation|advice|call)\s*:\s*\d+ ?(?:%|percent)\b/i]
    ];
    // An imperative at the start of a sentence or clause (after ":" or a quote), allowing one vocative/interjection ("Yes, sell", "Kid, buy").
    const IMPERATIVE = new RegExp(`^(?:["'“‘]\\s*)?(?:\\w+,\\s*)?(?:${BASE}|dump your|lock in)\\b`, "i");
    const ANALYTIC = /\b\d+(?:\.\d+)?%|\$\d/;
    // Grounding: an as-of time, a named source ("per Fidelity", "Source: IRS") or a clock time; "per share" is not a source.
    const GROUNDED = /\bas of\b|\b[Pp]er [A-Z]|\bfrom [A-Z][\w .&-]+ (?:data|holdings|statement|confirmation)\b|\b[Ss]ource:\s*\S|\bat \d{1,2}:\d{2}\s*(?:am|pm)\b/;
    // Conditional mechanics ("you must own shares before the ex-date to receive it") are education, not instructions.
    const MECHANICS = /\b(?:to (?:receive|qualify|be eligible|count|avoid|trigger)|means|is (?:the|a) (?:first|last|day|date|fee|rule|period)|by definition|is defined as|the rule is)\b/i;
    // An order the user already decided, restated for approval, is execution: "Order to confirm: buy 10 MSFT ... Reply confirm".
    const ORDER_CONTEXT = /\border to confirm\b|\breply (?:confirm|yes)\b|\bexecutes only if you approve\b|\bconfirm to (?:place|start|send)\b/i;
    // Grown from the red-team prompt set: every phrasing that asked for a pick without tripping this went in.
    const ADVICE_SEEKING = /\b(?:what (?:should|do) i (?:buy|sell|invest in|do with|own)|should i (?:buy|sell|hold|dump|trim|invest|keep)|(?:hold or (?:sell|dump)|sell or hold|buy or sell|time to (?:buy|sell|hold|dump))|which (?:of my )?(?:holdings?|positions?|stocks?|etfs?|funds?|ones?|tickers?)? ?(?:should|would you|do you think i should) (?:i )?(?:buy|sell|trim|dump|keep|own|pick|take|recommend|add)|(?:stocks?|etfs?|funds?|tickers?|positions?) (?:that )?(?:i|you) (?:should|would) (?:own|buy|sell|hold|take)|(?:recommend|suggest|pick|choose|name|give me|tell me) (?:me )?(?:one|a|an|some|the best|your (?:top|best)|which|what) (?:\w+ )?(?:stock|etf|fund|ticker|investment|portfolio|allocation|position)s?\b|what would you (?:buy|invest in|do if you were me|take|pick|put)|is (?:\w+ )?(?:a good|the right) (?:buy|investment|time to buy)( for me)?|tell me what to (?:buy|sell|own)|(?:pretend|act|role-?play|imagine)[^.?!]{0,40}(?:advis[eo]r|cfp|planner|fiduciary|hedge fund|portfolio manager|\bpm\b|warren buffett|guru|analyst)|you(?:'re| are) (?:now )?(?:a |an |my )?(?:licensed )?(?:advis[eo]r|cfp|planner|fiduciary|hedge fund|portfolio manager|warren buffett|guru)|hypothetically,? (?:what|which) (?:would|should) (?:you|i) (?:buy|own|pick)|just (?:between us|this once|tell me)|rank (?:these|the best|my|your)|(?:top|best) (?:\d+ |\w+ )?(?:stocks?|etfs?|funds?|investments?|dividend \w+|growth \w+) (?:to buy|to own|for|right now|this)|where (?:should|would you) (?:i )?put (?:my|the|\$?[\d,]+)|put \$?[\d,]+ (?:in|into)\b|(?:what|which) (?:position|trade) would you (?:take|make)|list (?:\w+ )?(?:stocks|etfs) i should|if you (?:were|had) (?:me|my)|what would you (?:say|tell|do)|(?:what|which) (?:investment |stock |one )?(?:will|is going to|would) (?:double|go up|rise|moon|make me|beat)|what'?s (?:in your|the trade|going to go up|your (?:pick|play))|speak as my (?:broker|advis[eo]r|planner)|(?:tell me|what) (?:to do|should i do) with my (?:cash|money|savings|bonus|inheritance)|i'?ll copy (?:it|you|yours)|(?:your|a) (?:personal )?portfolio\b.*\bcopy|in a world where you could (?:give advice|recommend)|what would you say to (?:them|me|a friend)|whether to (?:sell|buy|hold|dump)|(?:which|what) (?:fund|stock|etf|sector|asset|one) is (?:best|right) for me|(?:your|an?) (?:actual |real |honest )?(?:pick|call|recommendation)\b|confirm (?:that'?s|this is) (?:the )?right (?:call|move)|agree or disagree|(?:overweight|underweight) (?:this|next)|undervalued for me|(?:all|go) in on\b|pick the (?:one|best)|how many shares (?:should|to))\b/i;
    // Clauses: sentence punctuation, or a colon that introduces an instruction ("The trade is simple: buy").
    const clauses = s => String(s || "").split(/(?<=[.!?])\s+|:\s+/).map(x => x.trim()).filter(Boolean);

    function check(text, ctx) {
      const c = ctx || {}, s = String(text || ""), findings = [];
      const order = !!c.user_directed_order || ORDER_CONTEXT.test(s);
      const clauseList = clauses(s);
      const clauseAround = i => { let at = 0; for (const cl of clauseList) { const k = s.indexOf(cl, at); if (k <= i && i < k + cl.length) return cl; at = k + cl.length; } return s; };
      for (const [rule, re] of RULES) {
        const m = re.exec(s);
        if (m && !(rule === "directed_action" && MECHANICS.test(clauseAround(m.index)))) findings.push({ rule, match: m[0].slice(0, 120) });
      }
      for (const clause of clauseList) {
        // A bare imperative ("Sell NVDA.") is advice; an order restatement awaiting approval ("Buy 10 MSFT ... Confirm?") is not.
        if (IMPERATIVE.test(clause) && !(order && (/\?$|\bconfirm\b|\bapprove\b/i.test(clause) || ORDER_CONTEXT.test(s)))) findings.push({ rule: "directed_action", match: clause.slice(0, 120) });
      }
      if (c.kind === "analytics" || c.kind === "screen") {
        if (ANALYTIC.test(s) && !GROUNDED.test(s)) findings.push({ rule: "ungrounded_analytics", match: "number without source and as-of time" });
      }
      if (c.kind === "screen" && !(c.criteria && s.includes(c.criteria)) && !/\byour criteria\b/i.test(s)) findings.push({ rule: "screen_without_criteria", match: "screen result does not state the user's criteria" });
      return { allowed: findings.length === 0, findings };
    }

    // Prompts that ask for a recommendation are answered with data and the standing boundary, never routed to free generation.
    function classifyRequest(prompt) { return ADVICE_SEEKING.test(String(prompt || "")) ? "advice_seeking" : "information"; }
    const DISCLOSURE = "I can show you data and execute what you decide. I don't give investment advice.";
    function disclosure(conversation) {
      const c = conversation || {};
      if (c.disclosed) return { text: null, state: c };
      return { text: DISCLOSURE, state: Object.assign({}, c, { disclosed: true }) };
    }
    function adviceRefusal(facts) {
      // Information first (the user's own holdings), then the boundary, then the decision stays with the user.
      const lead = facts && facts.length ? facts.join(" ") + " " : "";
      return `${lead}${DISCLOSURE} Tell me what you want to do and I'll make it exact.`;
    }
    return { check, classifyRequest, disclosure, adviceRefusal, DISCLOSURE, RULES: RULES.map(r => r[0]) };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AdviceGuard;
