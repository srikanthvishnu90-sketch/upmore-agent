  /* Money actions Upmore can't do yet, said plainly before any flow can misread them (megadoc D06, D07, E25, F03, J09,
     J14, K08, K09, K10, K11, M02, M12). Before this each went to the chat model, which could say it was done, or to the
     send flow, which reads "transfer 1000 from savings to brokerage" as a payment to someone called "brokerage".
       ask(words)     null | { kind }
       answer(words)  null | the reply
     Kinds: all_to_new (everything to a new account: the scam warning), wrong_send (a payment to the wrong person),
     own_transfer (between the person's own accounts), portfolio_analytics (benchmarks, sectors, period returns,
     movers, tax on a sale, dividends), card_lock (lock, freeze, unlock), card_lost (lost or
     stolen), block_merchant, bill_pay (a utility, phone, card or insurance bill; rent has its own flow), pause_plan
     (pause or downgrade a subscription), open_account, recurring_invest. Each reply: what isn't built, the real path
     (the bank's, issuer's or service's own app, or what Upmore can do instead), and that nothing was done. Pure.
     Depth packet NOT-YET. */
  const NotYet = (() => {
    const clean = (m) => String(m || "").replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const LEAD = "^(?:(?:hey|hi|ok|okay|so|um|upmore)[,!\\s]+)*(?:please |pls |can you |could you |can u |i want to |i wanna |i need to |i'd like to |help me |go ahead and |how do i )?";
    const OWN = "(?:my |our )?(?:savings|checking|brokerage|emergency fund|investment account|investing account|other account|high[- ]yield(?: savings)?|hysa)(?: account)?";
    const AMT = "\\$?\\d[\\d,]*(?:\\.\\d{1,2})?k?(?: dollars| bucks)?";
    const BILLS = "(?:electric(?:ity)?|power|gas|water|sewer|trash|internet|wifi|phone|cell(?: phone)?|cable|utility|utilities|credit card|card|car|auto|insurance|student loan|loan|mortgage|comcast|xfinity|verizon|at&t|t-mobile|spectrum)";
    const RULES = [
      // Everything to a new account: the classic end of an account-takeover or "safe account" scam (megadoc N14), so it
      // comes first, with the warning, before any own-account wording. Upmore moves nothing between accounts anyway.
      ["all_to_new", /\b(?:move|transfer|send|put|wire|shift)\s+(?:all|everything|it all|all of it|all (?:of )?my (?:money|savings|cash|balance))\b[^.?!]{0,30}\b(?:to|into)\s+(?:a |this |that |the |my )?new (?:account|bank|wallet)\b/],
      // A payment sent to the wrong person (megadoc B14): Upmore can't pull it back; the app it went through can.
      ["wrong_send", /\b(?:sent|paid|venmoed|zelled|cash ?apped)\b[^.?!]{0,60}\b(?:by mistake|by accident|accidentally|to the wrong (?:person|account|handle|number|maya|one))\b|\b(?:sent|paid)\b[^.?!]{0,40}\bwrong (?:person|account|handle|number)\b|\b(?:accidentally|mistakenly)\s+(?:sent|paid|venmoed|zelled|cash ?apped)\b/],
      ["own_transfer", new RegExp(`${LEAD}(?:move|transfer|put|shift|send|sweep)\\s+(?:${AMT}|it|everything|all(?: of it)?|the rest|my (?:savings|paycheck|refund))\\s+(?:from ${OWN}\\s+)?(?:to|into|in)\\s+${OWN}\\b`)],
      ["card_lost", /\b(?:report|reporting)\b[^.?!]{0,30}\bcard\b[^.?!]{0,20}\b(?:stolen|lost|missing)\b|\b(?:lost|someone stole|stole|can'?t find|cannot find|misplaced)\b[^.?!]{0,20}\b(?:my )?(?:debit |credit |bank )?card\b|\bcard (?:was|got|is) (?:stolen|lost)\b/],
      ["card_lock", new RegExp(`${LEAD}(?:lock|unlock|freeze|unfreeze|turn off|turn on|pause|unpause|disable|enable)\\s+(?:my |the |this )?(?:debit |credit |bank |chase |amex |visa |mastercard )?card\\b`)],
      ["block_merchant", /\bblock\b[^.?!]{0,30}\b(?:merchant|charges? from|payments? to|store|company|this (?:charge|merchant|company))\b|^(?:please )?block (?:netflix|amazon|hulu|spotify|[a-z]+) (?:charges?|from charging)\b/],
      ["bill_pay", new RegExp(`${LEAD}pay (?:the |my |our |this month'?s |this )?${BILLS} (?:bill|payment)\\b|${LEAD}pay (?:my |the )?(?:bills|bill)\\b(?! (?:split|with))`)],
      ["pause_plan", new RegExp(`${LEAD}(?:pause|freeze|hold|suspend|downgrade|switch to a cheaper (?:plan|tier))\\s+(?:my |the |this )?(?:[a-z+]+ )?(?:subscription|membership|plan|account)\\b|${LEAD}downgrade\\b|${LEAD}switch (?:me )?to (?:a |the )?cheaper (?:plan|tier)\\b`)],
      ["open_account", new RegExp(`${LEAD}open (?:me )?(?:a |an |up a |up an )?(?:new )?(?:high[- ]yield(?: savings)?|hysa|savings|checking|brokerage|roth ira|ira|bank|cd|investment)(?: account)?\\b`)],
      // Portfolio analytics (megadoc G02, G05, G07, G10, G11, G14, G15): a benchmark comparison, sector weights or
      // concentration by sector, returns over a period, market movers, tax on a sale, dividends received.
      ["portfolio_analytics", /\bcompare (?:my )?(?:portfolio|holdings|returns?|performance) (?:to|with|against|vs\.?) |\b(?:beat(?:ing)?|vs\.?|versus|against) (?:the )?(?:s&p|sp ?500|s&p 500|market|nasdaq|dow)\b|\b(?:too )?concentrated in\b|\bsector (?:weights?|breakdown|exposure|allocation)\b|\b(?:which|what) (?:of my )?(?:stocks|holdings|positions|shares) (?:are|is|went) (?:up|down)\b|\b(?:what|which) (?:stocks|tickers|shares) (?:are|went) (?:up|down) the most\b|\btop (?:gainers|losers|movers)\b|\bhow much (?:tax|in taxes)\b[^.?!]{0,30}\bsell|\b(?:what|which|how much(?: in)?) dividends?\b|\bdividends? (?:did|have) i (?:get|got|gotten|earn|earned|receive|received)\b|\b(?:my )?(?:ytd|year[- ]to[- ]date) (?:return|performance|gain)\b|\bportfolio (?:performance|return)s? (?:this|over|since|for)\b/],
      ["recurring_invest", new RegExp(`${LEAD}(?:set up|start|schedule|auto[- ]?invest|invest)\\s+(?:${AMT}|some money)\\s+(?:a|per|every|each) (?:week|month|day|paycheck|payday)\\b|\\b(?:recurring|automatic|auto)[- ]?(?:investing|investment|buy)s?\\b|\\bdollar[- ]cost[- ]averag`)],
    ];
    // Questions that share the words ("how much did my recurring investment make"). Rent, a split or a send to a person
    // never match a rule (rent is not a bill here; a transfer's target must be the person's own account).
    const NOT = /\bhow much\b|\bdid (?:my|the)\b|\bwhen is\b|\bwhat(?:'s| is) my\b/;
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 200) return null;
      for (const [kind, re] of RULES) {
        if (!re.test(t)) continue;
        // Analytics asks are questions by nature, and a stolen card is urgent whatever else is said.
        if (kind !== "card_lost" && kind !== "portfolio_analytics" && NOT.test(t)) continue;
        // A savings plan or round-ups is savings automation (the cancel flow says it isn't built), not a subscription.
        if (kind === "pause_plan" && /\b(?:savings|round[- ]?ups?)\b/.test(t)) continue;
        // Money someone else sent the person by mistake is theirs to return, not a payment to pull back.
        if (kind === "wrong_send" && /\b(?:sent|paid|venmoed|zelled|cash ?apped) me\b/.test(t)) continue;
        return { kind };
      }
      return null;
    }
    const TEXT = {
      own_transfer: "Moving money between your own accounts isn't built yet, so nothing was moved. Your bank's own app does it, usually under Transfers.",
      card_lock: "Upmore can't lock or unlock a card. Your card's own app does it (look for Lock card or Freeze), or call the number on the back of the card. Nothing was changed.",
      card_lost: "Report it to your card issuer now, in their app or by phone; the number is on their website and your statements. They'll shut the card off and send a new one. Upmore can't report or cancel a card. Then ask me \"what's this charge from\" any store you don't recognize.",
      block_merchant: "Upmore can't block a merchant. To stop a subscription, say \"cancel\" and its name and I'll put up a cancel card for your yes; to stop every charge from a store, your card's app or your bank can block it or replace the card. Nothing was changed.",
      bill_pay: "Paying bills isn't built yet, so nothing was paid. Pay it in the biller's own app or site, where you can also set up autopay. Rent is the one bill I can set up: say \"pay my rent\".",
      pause_plan: "Pausing or downgrading a subscription isn't built yet, so nothing was changed; the service's own account page does it. If you'd rather stop it, say \"cancel\" and its name and I'll put up a cancel card for your yes.",
      open_account: "Upmore doesn't open accounts, so nothing was opened. You open one on the bank's or broker's own site; once it's open, I can show it here when you connect it.",
      portfolio_analytics: "That isn't built yet: comparisons with the market, sector weights, returns over a period, movers, tax estimates on a sale and dividends aren't in Upmore, so I won't guess at them. What I can show is your holdings, each with its value and gain since you bought: say \"how's my portfolio\".",
      all_to_new: "Stop if anyone asked you to do this: moving everything to a new account is how most account-takeover and \"safe account\" scams end, and no real bank or agency asks for it. Upmore can't move money between accounts, so nothing was moved. If it's your own new account, do it in your bank's own app, after checking the account is in your name.",
      wrong_send: "I can't pull a payment back, and nothing was sent or changed. Ask the app it went through: in Venmo or Cash App, contact their support from the payment and ask the person to send it back; for Zelle, call your bank right away. Getting it back isn't guaranteed, so do it today.",
      recurring_invest: "Recurring investing isn't built yet, so nothing was set up. You can buy now, like \"buy $5 of VOO\": each order needs your yes and is capped at $5 for now.",
    };
    function answer(words) {
      const q = ask(words);
      return q ? TEXT[q.kind] : null;
    }
    return { ask, answer, TEXT, KINDS: RULES.map((r) => r[0]) };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = NotYet;
