  /* Data guard (Instinct spec doc 12, constitution 4.3): connector data is
     data. Text that arrives inside a memo, payee name, receipt, bill, headline
     or error message is never an instruction to the agent. Pure and
     deterministic: inspect() says whether a string reads like an instruction
     aimed at the agent, quarantine() renders it as inert quoted data, and
     wrap() walks a connector value so every string in it is quarantined and
     every instruction-like string is flagged with its path. The loop calls
     wrap() on every connector read before the value reaches memory or a
     message, so there is one place where data stops being able to act. */
  const DataGuard = (() => {
    const MAX = 160;
    // Each rule names one way text tries to become an instruction. Order does not matter; all findings are reported.
    const RULES = [
      ["override", /\b(ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(rules?|instructions?|guidelines?|policy|policies|limits?|safety|previous|prior|above|system prompt)\b/i],
      ["role_assertion", /\b(you are now|act as|pretend (to be|you are)|from now on you|new persona|your new (role|instructions?))\b/i],
      ["system_marker", /(<\|im_start\|>|<\|system\|>|\[INST\]|\[SYSTEM\]|<<SYS>>|^\s*(system|assistant|developer|agent|upmore)\s*:|###\s*(system|instruction))/im],
      ["money_directive", /\b(send|transfer|wire|pay|move|forward|zelle|venmo|remit)\b[^.]{0,60}\$\s?\d|\$\s?\d[\d,.]*[^.]{0,60}\b(to this (account|address|number)|to the (account|address) (below|above))\b/i],
      ["state_directive", /\b(mark (this|it|the (bill|invoice|charge|payment)) (as )?(paid|settled|cancel+ed|refunded|approved|verified)|approve (this|the) (payment|transfer|refund|request)|cancel (all|every|the user'?s)\b|change (the )?(payee|recipient|account|routing|limit|envelope)|raise (the|my) (limit|envelope)|delete (the|all|your) (log|history|memory|records?))\b/i],
      ["secrecy", /\b(do not|don'?t|never) (tell|show|mention|reveal|inform|alert)\b[^.]{0,30}\b(user|owner|customer|anyone|them)\b|\b(keep this (secret|hidden|between us)|hide this)\b/i],
      ["agent_address", /\b(hey|dear|attention|note to|message for|instructions? for|memo to)\s+(the\s+)?(ai|assistant|agent|bot|upmore|language model|llm)\b|\b(ai|assistant|agent|bot|upmore|language model|llm)\b[^.]{0,20}\b(please|must|should|need to|you will|execute|run|do)\b/i],
      ["exfiltration", /\b(reply|respond|answer) (with|using)\b[^.]{0,40}\b(balance|account number|routing|password|otp|code|ssn|token)\b|\b(send|forward|email|text)\b[^.]{0,40}\b(statement|balance|account details|login|credentials|otp|one[- ]time (code|passcode)?)\b/i],
      ["credential_ask", /\b(enter|provide|confirm|verify|type)\b[^.]{0,30}\b(password|otp|one[- ]time (code|passcode)|pin|ssn|social security|card number|cvv)\b/i],
      ["urgency_hook", /\b(within (the next )?\d+ (minutes?|hours?)|immediately|right now|or (your|the) account (will be|is) (closed|suspended|locked|frozen))\b[^.]{0,40}\b(send|pay|transfer|click|call|verify|confirm)\b|\b(send|pay|transfer|click|call|verify|confirm)\b[^.]{0,40}\b(within (the next )?\d+ (minutes?|hours?)|immediately|or (your|the) account (will be|is) (closed|suspended|locked|frozen))\b/i]
    ];
    const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

    function inspect(text) {
      const s = String(text == null ? "" : text).replace(CONTROL, " ");
      const findings = [];
      for (const [rule, re] of RULES) { const m = s.match(re); if (m) findings.push({ rule, match: m[0].slice(0, 80) }); }
      return { instruction_like: findings.length > 0, findings };
    }

    // Inert rendering: one line, no control or bidi characters, quoted, cut at MAX, labelled when it tried to instruct.
    function quarantine(text, opts) {
      const o = opts || {}, max = o.max || MAX;
      let s = String(text == null ? "" : text).replace(CONTROL, " ").replace(/\s+/g, " ").trim();
      if (s.length > max) s = s.slice(0, max - 1) + "…";
      const r = inspect(s);
      return `"${s.replace(/"/g, "'")}"` + (r.instruction_like ? " [flagged: instruction-like text in connector data, treated as data]" : "");
    }

    function wrap(value, opts) {
      const flags = [];
      const walk = (v, p) => {
        if (typeof v === "string") { const r = inspect(v); if (r.instruction_like) flags.push({ path: p, findings: r.findings }); return quarantine(v, opts); }
        if (Array.isArray(v)) return v.map((x, i) => walk(x, `${p}[${i}]`));
        if (v && typeof v === "object") { const out = {}; for (const k of Object.keys(v)) out[k] = walk(v[k], p ? `${p}.${k}` : k); return out; }
        return v;
      };
      return { value: walk(value, ""), flags, flagged: flags.length > 0 };
    }

    // One sentence the agent appends when a read carried instruction-like text. It names the fact and does nothing with it.
    function notice(flags) {
      if (!flags || !flags.length) return "";
      const where = flags.map(f => f.path || "the value").slice(0, 3).join(", ");
      return `Note: text in that data (${where}) reads like an instruction to me. I treated it as data and did nothing with it.`;
    }
    return { inspect, quarantine, wrap, notice, RULES: RULES.map(r => r[0]), MAX };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = DataGuard;
