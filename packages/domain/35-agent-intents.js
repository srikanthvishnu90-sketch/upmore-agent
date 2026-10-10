  /* ================= Agent intents: handing a task over in chat =================
     PURE. Recognises when a chat message is a task for the agent ("dispute the
     Amazon charge for me") rather than a question for the Guide ("how do
     disputes work?"). Deterministic keyword rules; no model.

     Two things have to be present: a request (the person wants something
     done) and a task the agent can take. A question about how something
     works is left to the Guide. When in doubt this returns null: a missed
     hand-off costs one extra tap, a wrong one hijacks a question. */
  const AgentIntents = (() => {
    const REQUEST_RE = /\b(for me|on my behalf|can you|could you|will you|would you|please|help me|i want (you )?to|i need (you )?to|i'd like (you )?to|i would like (you )?to|let'?s|go ahead|do it|handle|take care of|get (me|my|it) )\b/i;
    const IMPERATIVE_RE = /^(pay|schedule|track|cancel|dispute|stop|pause|write|draft|file|chase|search|find|lower|negotiate|request|ask|waive|reverse|fight|contest|send|prepare|get)\b/i;
    const EXPLAIN_RE = /^(what|what's|whats|how|why|when|where|who|which|is|are|does|do|did|should|explain|tell me about|define)\b/i;

    // Most specific first: the first task that matches wins.
    const TASKS = [
      { task: "stop_everything", re: /\b(stop|halt|kill|pause|shut ?down|turn off|disable|revoke)\b.*\b(everything|agent|all (actions|access)|upmore)\b|\bstop (it|this) all\b/i,
        always: true, say: "Stopping is one tap, and it takes effect straight away." , button: "Stop everything" },
      { task: "open_log", re: /\b(action log|audit log|what (have|did) you (done|do)|what has the agent done|show (me )?(the |my )?(ledger|log|history of actions))\b/i,
        always: true, say: "Everything the agent has done is in your action log, with who approved it.", button: "Open the action log" },
      { task: "open_permissions", re: /\b(what (are you|is the agent) allowed|permissions?|your limits|spending (cap|limit)|quiet hours|how much can you (spend|move))\b/i,
        always: true, say: "You decide how far the agent can go, one capability at a time.", button: "Open what the agent may do" },
      { task: "open_catalog", re: /\bwhat (can|could) (you|the agent|upmore) (actually )?do\b|\bwhat (are|were) you able to do\b/i,
        always: true, say: "Here is the full list, including what isn't built yet.", button: "See everything the agent can do" },

      { task: "workflow", kind: "list", re: /\b(what do i owe|what (bills|payments) (are|do i have) due|show (me )?(my )?(bills|money owed)|list (my )?bills)\b/i,
        always: true, say: "I'll show the bills on record, including what's missing or already covered by autopay.", button: "Review my bills" },
      { task: "workflow", kind: "pay", re: /\b(pay|schedule (a |my |the )?payment|handle|take care of)\b.*\b(rent|bills?|payments?|installments?|loans?|mortgage|utilities|credit card|owe|affirm)\b|\bpay\s+(?:my |the )?[a-z][a-z0-9 -]+/i,
        say: "I'll review what is owed and the payment options. Nothing will be paid from this message alone.", button: "Review the payment" },

      { task: "draft", kind: "charged_after_cancel_dispute", re: /\b(charged|billed|charging|billing)\b.*\b(after|even though|although|still)\b.*\b(cancel|cancell?ed)\b|\bcancell?ed\b.*\b(still|anyway|again)\b.*\b(charg|bill)/i,
        say: "A charge after you cancelled is a billing error you can dispute. I'll write it from the dates on record.", button: "Write the dispute" },
      { task: "draft", kind: "duplicate_charge_dispute", re: /\b(double|twice|two times|duplicate|duplicated)\b.*\b(charg|bill)|\b(charg|bill)\w*\b.*\b(twice|two times|double)\b/i,
        say: "A duplicate charge is a billing error you can dispute. I'll write it from the charges on record.", button: "Write the dispute" },
      { task: "draft", kind: "late_fee_waiver", re: /\blate (fee|charge|payment fee)\b/i,
        say: "I'll write a request to have the late fee waived.", button: "Write the request" },
      { task: "draft", kind: "bank_fee_reversal", re: /\b(overdraft|nsf|maintenance|monthly service|atm|bank)\b.*\bfee\b|\bfee\b.*\b(revers|waiv|refund)/i,
        say: "Banks often reverse a fee when asked. I'll write the request.", button: "Write the request" },
      { task: "draft", kind: "security_deposit_demand", re: /\b(security )?deposit\b.*\b(back|return|landlord|refund)\b|\blandlord\b.*\bdeposit\b/i,
        say: "I'll write a letter asking for your deposit back. It's a template you control, not legal advice.", button: "Write the letter" },
      { task: "draft", kind: "debt_validation_request", re: /\b(debt collector|collection agency|collections?|collector)\b/i,
        say: "You can ask a collector to prove the debt. I'll write that request. It's a template you control, not legal advice.", button: "Write the letter" },
      { task: "draft", kind: "itemized_medical_bill", re: /\b(medical|hospital|doctor|clinic|er|emergency room)\b.*\bbill\b/i,
        say: "The first step with a medical bill is an itemized copy. I'll write the request.", button: "Write the request" },
      { task: "draft", kind: "prorated_refund", re: /\b(prorated?|pro-rated?|unused (part|portion|time|months?)|partial refund)\b/i,
        say: "I'll work out the unused part and write the request.", button: "Write the request" },
      { task: "draft", kind: "payment_followup", re: /\b(unpaid|late|overdue|outstanding)\b.*\b(invoice|reimbursement|expense report)\b|\b(invoice|reimbursement|expense report)\b.*\b(unpaid|late|overdue|chase|follow up)\b|\bowes? me\b/i,
        say: "I'll write the follow-up.", button: "Write the follow-up" },
      { task: "draft", kind: "negotiation_script", re: /\b(lower|reduce|negotiate|cut|bring down)\b.*\b(bill|rate|price|internet|phone|cable|insurance|premium)\b/i,
        say: "I'll write what to say. You make the call or open the chat yourself: Upmore doesn't place calls.", button: "Write the script" },

      { task: "unclaimed", re: /\b(unclaimed (money|property|funds|cash)|missing money|money (i'?m|i am) owed by the state)\b/i,
        say: "Searching for unclaimed money is free, and claiming it is too. I'll line up the official search for each state you've lived in.", button: "Start the search" },
      { task: "cancel", re: /\b(cancel|unsubscribe|get rid of|end|stop paying for)\b/i,
        say: "I'll set up the cancellation. You approve it before anything happens.", button: "Set up the cancellation" },
    ];

    // The thing being cancelled: "cancel my Netflix subscription for me" -> "Netflix".
    function cancelTarget(text) {
      const m = /\b(?:cancel|unsubscribe from|get rid of|end|stop paying for)\s+(?:my|the|our)?\s*([a-z0-9][a-z0-9+&'. -]{1,40}?)(?=\s+(?:subscription|membership|plan|account|trial|for me|please|now|today|asap)\b|[.!?,]|$)/i.exec(text);
      if (!m) return null;
      const name = m[1].trim().replace(/\s+(subscription|membership|plan|account|trial)$/i, "");
      if (!name || /^(it|this|that|them|everything|all|one|something|anything|my)$/i.test(name)) return null;
      return name;
    }

    /* Returns null, or { task, kind, target, say, button }. */
    function match(text) {
      const raw = String(text || "").trim();
      if (raw.length < 4 || raw.length > 400) return null;
      const t = raw.replace(/\s+/g, " ");
      const asks = REQUEST_RE.test(t) || IMPERATIVE_RE.test(t);
      const explains = EXPLAIN_RE.test(t) && !REQUEST_RE.test(t);
      for (const def of TASKS) {
        if (!def.re.test(t)) continue;
        if (def.task === "workflow" && /\b(earn|make|find|get)\b.*\b(money|cash|income)\b.*\b(to|so (i|we) can)\s+pay\b/i.test(t)) continue;
        if (!def.always && (!asks || explains)) return null;
        const out = { task: def.task, kind: def.kind || null, target: null, say: def.say, button: def.button };
        if (def.task === "workflow") out.request = raw;
        if (def.task === "cancel") {
          out.target = cancelTarget(t);
          if (out.target) out.say = `I'll set up cancelling ${out.target}. You approve it before anything happens.`;
        }
        return out;
      }
      return null;
    }

    // Shared by the browser and server: personal records must bypass local
    // cached answers, while existing drafts, cancellations and earning routes
    // keep their specialized flows. This selects a reader, never permission.
    function personalFinancialRequest(text) {
      const t = String(text || "").trim(), hit = match(t);
      if (/\b(my|our|me|i|we)\b/i.test(t) && /\b(refund|recover|recovery|fees?|duplicate charges?|charged twice|holds?)\b/i.test(t) &&
          !/^(teach|explain|define)\b/i.test(t)) return true;
      if (hit) return hit.task === "workflow";
      if (/\b(earn|make|extra|unclaimed|side hustle|bonus offer)\b/i.test(t)) return false;
      if (/^(teach|explain|define)\b/i.test(t)) return false;
      if (/\b(how (do|can|should) (i|we)|what (is|does))\b/i.test(t) && /\b(works?|means?|budget|learn|start)\b/i.test(t)) return false;
      return /\b(my|our|me|i|we)\b/i.test(t) && /\b(balance|cash|spend|spending|spent|transactions?|payday|budget|bills?|owe|owed|pending charges?|payment history)\b/i.test(t);
    }

    return { match, cancelTarget, personalFinancialRequest };
  })();
