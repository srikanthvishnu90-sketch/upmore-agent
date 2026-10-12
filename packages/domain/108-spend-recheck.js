  /* "I spent less than that" (megadoc L06): the person disputes a spending total, so it is rechecked from their rows and
     the charges behind it are shown. Read-only.
       ask(words)                                         null | { kind: "less" | "more" | "where" }
       answer(transactions, words, now, opts)             opts: { tz, rules, previous: [{ role, content }] newest first }
     The total disputed is the thread's last spending answer ("You spent $612.40 on groceries ...") and the ask before it;
     it is recomputed now by MoneyAnswers.spendRows (the same filters as the answer). Said: the total now (and the one
     given, if new rows changed it), the charges behind it, largest first with their dates (up to 8, the rest counted),
     the pending charges left out, and for a category, how a merchant is counted and the rule that moves it. With no
     spending answer in the thread, the person is asked which number. Nothing is changed. Pure. Depth packet
     SPEND-RECHECK. */
  const SpendRecheck = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const money = MA.money, SHOW = 8;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = (ymd) => `${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
    // "no, that's wrong" drops its "no,"; "no way I spent that much" keeps it.
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|um|hmm|wait|huh|upmore)[,!\s]+|(?:no|nah)[,!.]+\s*)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const LESS = /^(?:i (?:spent|paid) (?:way |much |a lot )?less than that|i didn'?t spend (?:that much|so much|that)|no way i spent (?:that|that much)|that(?:'s| is| seems| looks) (?:way )?(?:too high|too much|high)|i don'?t think i spent that much)$/;
    const MORE = /^(?:i (?:spent|paid) (?:way |much |a lot )?more than that|that(?:'s| is| seems| looks) (?:way )?(?:too low|low)|i think i spent more)$/;
    const WHERE = /^(?:that(?:'s| is| seems| looks) (?:wrong|off|not right)|that can'?t be right|where did (?:that|you get that)(?: number| total)?(?: come)?(?: from)?|which (?:charges|transactions) (?:is|are) (?:that|in that)|show me (?:the )?(?:charges|transactions)(?: behind that| for that)?|what'?s in that(?: number| total)?|break (?:that|it) down)$/;
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 80) return null;
      if (LESS.test(t)) return { kind: "less" };
      if (MORE.test(t)) return { kind: "more" };
      if (WHERE.test(t)) return { kind: "where" };
      return null;
    }
    const SPEND_REPLY = /^You spent (\$[\d,]+\.\d\d) /;
    // The spending answer just given and the ask it answered (newest first). Only the most recent reply counts: "that's
    // wrong" after a safe-to-spend answer is about that number, not an older spending total.
    function lastSpend(previous) {
      const list = previous || [], i = list.findIndex((x) => x && x.role === "assistant");
      const m = i >= 0 ? SPEND_REPLY.exec(String(list[i].content || "")) : null;
      if (!m) return null;
      const asked = list.slice(i + 1).find((x) => x && x.role === "user");
      return asked ? { said: m[1], ask: String(asked.content || ""), reply: String(list[i].content) } : null;
    }
    function answer(transactions, words, now, opts) {
      const q = typeof words === "string" ? ask(words) : words;
      if (!q) return null;
      const o = opts || {}, tz = o.tz || "UTC", src = MA.txSource(transactions || [], tz);
      const last = lastSpend(o.previous);
      if (!last) return q.kind === "where" ? null : `Which number? I don't see a spending total in this chat to recheck. Ask it again, like "how much did I spend on groceries last month", and then say "that's too high" and I'll show the charges behind it.`;
      const d = MA.spendRows(transactions, last.ask, now, { tz, rules: o.rules || null });
      const what = d.target.kind === "category" ? ` on ${d.target.cat.label}` : d.target.kind === "merchant" ? ` at ${d.rows.length ? MA.display(d.rows[d.rows.length - 1].merchant_raw) : `"${d.target.term}"`}` : "";
      const lines = [];
      const now$ = money(d.total);
      lines.push(`Rechecked from your rows: ${now$}${what} ${d.period.label}, from ${d.rows.length} charge${d.rows.length === 1 ? "" : "s"}${now$ !== last.said ? ` (I said ${last.said} before; your transactions have changed since)` : ""}.`);
      const big = d.rows.slice().sort((a, b) => a.amount_cents - b.amount_cents || String(a.posted_on).localeCompare(String(b.posted_on)));
      if (big.length) lines.push(`${big.length > SHOW ? `The ${SHOW} largest` : "The charges"}: ${big.slice(0, SHOW).map((r) => `${MA.display(r.merchant_raw)} ${money(-r.amount_cents)} on ${label(r.posted_on.slice(0, 10))}`).join("; ")}${big.length > SHOW ? `; and ${big.length - SHOW} more for ${money(big.slice(SHOW).reduce((s, r) => s - r.amount_cents, 0))}` : ""}.`);
      if (d.pending.length) lines.push(`Not counted: ${d.pending.length === 1 ? "1 pending charge" : `${d.pending.length} pending charges`} (${money(d.pending.reduce((s, r) => s - r.amount_cents, 0))}), until ${d.pending.length === 1 ? "it posts" : "they post"}.`);
      lines.push("Not counted either: transfers between your accounts and card payments.");
      if (d.target.kind === "category") lines.push(`Each charge counts by the store's name. If one here isn't ${d.target.cat.label}, say "count <store> as shopping" (or another category) and it moves in every answer after.${d.unmatched.length ? ` ${money(d.unmatched.reduce((s, r) => s - r.amount_cents, 0))} of your other spending in that period matched no category, so none of it is in this total.` : ""}`);
      if (q.kind === "more") lines.push("Something missing may still be pending, on a card that isn't linked, or counted under another category.");
      if (q.kind === "less" && d.rows.length) lines.push(`If a charge here isn't yours, say "what's this charge from ${MA.display(big[0].merchant_raw)}" or "dispute this charge".`);
      if (d.start && d.start > d.period.from) lines.push(`Your linked transactions start ${label(d.start)}, so the total covers only from then.`);
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer, lastSpend };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SpendRecheck;
