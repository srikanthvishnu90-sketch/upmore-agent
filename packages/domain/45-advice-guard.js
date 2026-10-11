  /* Advice guard (Instinct spec doc 09, INV-024). The line the whole product
     stands on: information, math, mechanics, education and user-directed
     execution ship; personalized buy/sell/hold, ranked picks framed as what
     the user should do, model portfolios as personal guidance, and return
     promises are blocked. Pure, deterministic, and called in one place: every
     investing request is classified before the agent plans a response, and
     every investing response passes through response() before it sends.
     Conservative by design: when a request is ambiguous the agent gives
     information and asks the user to decide. The rule set is reviewed by US
     securities counsel before launch; this file is product behavior, not
     legal advice. */
  const AdviceGuard = (() => {
    const DISCLOSURE = "I can show you data and execute what you decide. I don't give investment advice.";
    const SEC = "(stock|stocks|share|shares|etf|etfs|fund|funds|bond|bonds|ticker|holding|holdings|position|positions|portfolio|crypto|coin|bitcoin|eth|ethereum|option|options|call|calls|put|puts|rsu|rsus|ira|401k|401\\(k\\)|roth|index|sector|dividend|allocation|margin|[A-Z]{2,5})";
    // Normalize obfuscation that reads naturally to a person: leetspeak, dotted letters, repeated punctuation, common non-English advice verbs.
    function normalize(text) {
      let s = String(text || "");
      s = s.replace(/\b([a-z])(?:[.\-*_]+([a-z]))+\b/gi, m => m.replace(/[.\-*_]/g, ""));
      s = s.replace(/0(?=[a-z])/gi, "o").replace(/(?<=[a-z])0/gi, "o").replace(/3(?=[a-z])/gi, "e").replace(/(?<=[a-z])1(?=[a-z])/gi, "i").replace(/\$(?=[a-z])/gi, "s");
      s = s.replace(/\b(dois-je|devrais-je|debo|debería|should i|sollte ich)\b/gi, "should i").replace(/\b(acheter|comprar|kaufen)\b/gi, "buy").replace(/\b(vendre|vender|verkaufen)\b/gi, "sell");
      return s.replace(/\s+/g, " ").trim();
    }
    // Requests that ask the agent to decide for the user. Each rule names the technique it catches so a block is explainable.
    const BLOCK = [
      ["asks_should_i", new RegExp(`\\bshould i\\b[^.?!]{0,60}\\b(buy|sell|hold|trim|dump|get (into|out of)|move|rebalance|switch|pick|choose|put|invest|use margin|do (roth|traditional)|cut|add|overweight|keep)\\b`, "i")],
      ["asks_should_i_short", /\b(should i|shall i|do i) (buy|sell|hold|keep|trim|dump|cut|move)\b/i],
      ["what_to_buy", /\b(what|which|where)\b[^.?!]{0,40}\b(should i|do i|to|would you|will you|shall i)\b[^.?!]{0,30}\b(buy|sell|invest|put (it|my money|\$?\d)|pick|choose|overweight|add|dump|trim)\b/i],
      ["what_do_i_buy", /\bwhat (do|would|can) i (buy|sell|invest in|put (it|my money) in(to)?)\b/i],
      ["tell_me_what", /\b(tell|show|give|just tell) me (exactly )?(what|which|where|whether) (to|i should|should i|one)\b/i],
      ["pick_for_me", /\b(pick|choose|decide|select)\b[^.?!]{0,20}\b(for me|one|the best|which one)\b|\byou decide\b|\bjust pick\b|\bpick one\b/i],
      ["ranked_picks", /\b(top \d+|best|your top|rank(ing)?|which (one|first))\b[^.?!]{0,30}\b(stock|stocks|etf|etfs|fund|funds|picks?|to buy|coin|investments?)\b|\b(stock|etf|fund)s? to buy\b|\bthe one (stock|etf|fund)\b/i],
      ["model_portfolio", /\b(build|make|create|design|put together) (me )?(a |my )?(portfolio|allocation)\b|\bwhat allocation should i\b|\bmodel portfolio\b/i],
      ["pretend_advisor", /\b(pretend|act|imagine|role ?play|simulate|you'?re|you are)\b[^.?!]{0,30}\b(advisor|adviser|planner|fiduciary|analyst|analysts|buffett|broker|cathie|munger|my friend|be a friend)\b/i],
      ["if_you_were_me", /\b(if you were me|if this were your (account|money|portfolio)|what would you (do|buy|sell|put|tell)|would you (buy|sell|dump|hold)|you'?d (buy|sell|dump|want to own|put))\b/i],
      ["return_promise", /\b(guarantee|promise|will (go up|rise|double|outperform|return))\b|\b(give|get|earn|make) me \d+ ?(%|percent)\b|\bexpect(ed)? (to )?(return|make)\b[^.?!]{0,20}\b(next year|my portfolio)\b|\bwhat return should i expect\b/i],
      ["undervalued_for_me", /\b(undervalued|overvalued|cheap|a (good|bad) (entry|time|day|buy))\b[^.?!]{0,40}\b(for (me|someone|a person)|given my|in my situation|right now for me|to buy)\b|\bgood (entry|time to buy)\b/i],
      ["timing_for_me", /\b(when|is (today|now)) (should|a good (day|time)) (i|for me|to)\b[^.?!]{0,30}\b(buy|sell|dip)\b|\bgive me the date\b/i],
      ["decide_for_me", /\b(decide for me|just (decide|confirm it'?s the right call|pick)|i'?ll follow your call|confirm (it'?s|this is) the right (call|move)|tell me exactly where to put)\b/i],
      ["buy_sell_hold_labels", /\b(buy|hold|sell)\b[,/ ]+(or |and )?\b(buy|hold|sell)\b[^.?!]{0,40}\b(next to|for each|each (of my )?holding|column|label|mark)\b|\b(for buy and|for sell)\b|\bwrite (buy|sell|hold)\b|\baction i should take\b/i],
      ["sector_or_fund_choice", /\bwhich (sector|fund|etf|stock|target date fund|dividend stock|option|strike)\b[^.?!]{0,40}\b(should i|do i|for me|to add|to pick|to choose|would you)\b|\bwhich (sector) should i\b/i],
      ["whether_to", /\b(whether to|whether i should) (hold|sell|buy|cut|trim|keep|dump|get out)\b/i],
      ["should_i_choose", /\b(roth or traditional|vti or voo|a or b|[A-Z]{2,5} or [A-Z]{2,5})\b[^.?!]{0,20}\b(for me|pick one|which)\b/i],
      ["rate_and_fix", /\b(rate|grade|review) my (portfolio|holdings|allocation)\b[^.?!]{0,40}\b(what to change|change|fix|do)\b/i],
      ["house_view", /\b(house view|your view|your call|your (recommendation|take))\b[^.?!]{0,30}\b(buy|hold|sell|on [A-Z])/i],
      ["narrative_wrapper", /\b(story|haiku|poem|song|quiz|spreadsheet|json|panel|debate|three analysts)\b[^.?!]{0,80}\b(sell|buy|hold|which|what i should|should (have )?bought)\b/i],
      ["sort_by_preference", /\b(sort|order|rank)\b[^.?!]{0,30}\b(by how much you|you'?d want|your preference)\b/i],
      ["override_claim", /\b(advice (guard|rules?) (disabled|don'?t apply|off)|rules don'?t apply|consented to advice|off the record|between us)\b/i],
      ["which_to_sell", /\bwhich (of my )?(holdings?|stocks?|positions?|funds?)\b[^.?!]{0,20}\b(to (sell|dump|cut|trim)|would you (sell|dump)|should (i|go))\b/i],
      ["set_for_me", /\b(set|place) a (stop loss|limit|target)\b[^.?!]{0,30}\b(where you think|for me)\b/i],
      ["use_margin", /\bshould i use margin\b/i],
      ["yes_or_no_trade", /\b(sell|buy|dump|trim|hold) (my|the|all my) [\w' ]{1,30}(shares?|stock|position|holdings?|coins?)\b[^.?!]*\?|\byes or no\b/i],
      ["is_it_time", /\bis (it|now) (time|a good time|the right time) to (get (out|into)|sell|buy|move|switch|rebalance|exit|add)\b/i],
      ["you_would", /\byou would (buy|sell|dump|hold|trim|cut|put|pick)\b/i],
      ["trailing_should_i", /\bshould i\??\s*$/i],
      ["agree_with_tip", /\b(says?|said|told me to|recommends?|recommended) (to )?(buy|sell|hold|dump)\b[^.?!]{0,40}\b(agree|right|should i|thoughts|good call)\b|\bagree\?\s*$/i],
      ["what_should_have", /\bwhat should\b[^.?!]{0,20}\b(i|me|we)\b[^.?!]{0,10}\b(have )?(bought|sold|buy|sell|pick|own)\b/i],
      ["right_security_for_me", /\b(right|best|good|ideal) (stock|fund|etf|coin|investment|bond|option)s?\b[^.?!]{0,40}\b(for (me|someone|a person)|like me|my (age|situation))\b/i]
    ];
    // Shapes that are plainly information, math, mechanics, education, or user-directed execution. Checked first so a question that merely contains a keyword is not blocked.
    const ALLOW = [
      ["user_order", /^(buy|sell) \d+ (shares?|units?) of [A-Z]{1,5}\b/i],
      ["recurring_order", /^(set up|schedule|create) a recurring (\$?\d|buy|sell)/i],
      ["alert_or_watch", /^(add|put|set|alert me|watch|notify)\b[^.?!]{0,60}\b(watchlist|alert|if .* (moves|drops|rises|hits))/i],
      ["definition", /^(what is|what'?s a|what are|define|explain)\b/i],
      ["how_mechanics", /^how (does|do|much|many|concentrated|long)\b/i],
      ["my_numbers", /^(what|which|how|show|list|compute|calculate|run|export|track|when|are there|what'?s)\b[^.?!]{0,80}\b(my|mine|i hold|i own|percent|percentage|as of|cost basis|unrealized|realized|dividend|allocation|overlap|expire|fees|contribution|room|margin|yield|earnings date|screen|watchlist|target|estimate|mark|tender|secondary)\b/i],
      ["rebalance_to_own_target", /\brebalance\b[^.?!]{0,60}\b(target i (set|approved)|my (own )?target|the target i)\b/i],
      ["trade_list_user_decides", /\b(trade list|orders? first|i'?ll decide|show me the orders)\b/i]
    ];
    function request(text) {
      const raw = String(text || ""), s = normalize(raw);
      const blocks = BLOCK.filter(([, re]) => re.test(s)).map(([rule]) => rule);
      const allows = ALLOW.filter(([, re]) => re.test(s)).map(([rule]) => rule);
      // A block rule wins over a generic allow shape: "which of my holdings should I sell" is still advice. Only the explicit user-directed shapes win over a block.
      const strongAllow = allows.some(a => a === "user_order" || a === "recurring_order" || a === "rebalance_to_own_target" || a === "trade_list_user_decides") && !blocks.some(b => b === "override_claim" || b === "return_promise" || b === "pretend_advisor");
      if (blocks.length && !strongAllow) return { decision: "block", reasons: blocks, allows, redirect: "I can show you the data behind that decision (holdings, allocation, performance, costs, taxes) and run any screen you define, and I can place an order you decide on. The decision is yours; I don't give investment advice." };
      return { decision: "allow", reasons: allows.length ? allows : ["no_advice_shape"], allows };
    }

    // Response rules: no imperative buy/sell/hold directed at the user, no ranked picks as recommendations, no return predictions as expectations, analytics carry source and as-of, screens state their criteria.
    const RESPONSE = [
      ["imperative_to_user", /\b(you should|you need to|you ought to|i('| wou)ld (recommend|suggest|advise)( that)?( you)?|my (advice|recommendation) is to|go ahead and|it'?s time to|consider|i'?d)\s+(buy|sell|trim|dump|add|move|rotate|get (into|out of)|hold|keep|overweight|switch|invest)(ing)?\b/i],
      ["bare_imperative", /(^|[.!?]\s+)([Bb]uy|[Ss]ell|[Tt]rim|[Dd]ump|[Hh]old|[Aa]dd to|[Rr]educe|[Ee]xit)\s+(more |some |your |the )?[A-Z]{2,5}\b/],
      ["ranked_recommendation", /\b(my )?(top|best) (\d+ )?(picks?|stocks?( to buy)?|choices)\b|\bi('| wou)ld (pick|go with|choose)\b|\bthe (right|best) (choice|move|stock|fund) (for you|is)\b/i],
      ["return_prediction", /\b(will|should|is going to|expect(ed)? to) (go up|rise|double|outperform|return \d|gain \d|beat the)\b|\b(guaranteed|safe bet|can'?t lose|sure thing)\b|\bexpect(ed)? (a |an )?(\d+ ?%|annual) return\b/i],
      ["model_as_personal", /\b(you should (be|have|hold) \d+ ?% in|your ideal allocation is|the right allocation for you)\b/i]
    ];
    function response(text, ctx) {
      const s = String(text || ""), c = ctx || {}, findings = [];
      for (const [rule, re] of RESPONSE) { const m = s.match(re); if (m) findings.push({ rule, match: m[0].slice(0, 80) }); }
      // Analytics: a money or percent figure about the user's holdings carries its source and as-of time.
      if (c.analytics && /(\$\d|\d+(\.\d+)? ?%|\d+ percent)/.test(s) && !(/\b(as of|at close|as at)\b/i.test(s) && /\b(per|from|source:|according to)\b/i.test(s))) findings.push({ rule: "ungrounded_analytics", match: (s.match(/(\$[\d,.]+|\d+(\.\d+)? ?%|\d+ percent)/) || [""])[0] });
      // A screen result states the user's criteria, so a list of tickers never reads as picks.
      if (c.screen && !/\b(your (screen|criteria)|criteria you (set|gave|defined)|matching your)\b/i.test(s)) findings.push({ rule: "screen_without_criteria", match: "screen result" });
      return { ok: findings.length === 0, findings };
    }
    // The standing disclosure, once per conversation when investing comes up; never plastered on every message.
    function disclosure(ctx) { const c = ctx || {}; if (c.investing_disclosed) return null; c.investing_disclosed = true; return DISCLOSURE; }
    return { request, response, disclosure, normalize, DISCLOSURE, BLOCK_RULES: BLOCK.map(b => b[0]), ALLOW_RULES: ALLOW.map(a => a[0]), RESPONSE_RULES: RESPONSE.map(r => r[0]) };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AdviceGuard;
