// The chat model never moves money, places an order or cancels anything: every money action runs through a flow card and
// that person's yes, and flow replies never reach the model. So a model reply that says, in the first person, that it just
// did one of those things is false by construction. Found by the testing agent (evals/agent/run.ts, O-15): a bare "yes"
// with no card waiting goes to the model, and nothing stopped it from answering "Done, sent!". The claim is not deleted
// (the rest of the reply may be right); a correction is appended so the person is never left believing it happened.
const CLAIM = new RegExp(
  [
    // "I've sent", "I have just paid", "I just bought", "I went ahead and cancelled"
    String.raw`\bI(?:'ve| have)?\s+(?:just\s+|now\s+|already\s+|gone ahead and\s+|went ahead and\s+)?(?:sent|paid|transferred|moved|wired|deposited|bought|purchased|sold|placed|submitted|executed|cancell?ed|unsubscribed|refunded)\b(?!\s+(?:you\s+)?(?:a |an |the )?(?:card|link|summary|recap|reminder|note|message|list))`,
    // "Done! Sent $40", "All set: bought $5 of NVDA", "Sent." at the start of the reply
    String.raw`^(?:done|all set|sent|paid|bought|sold|cancell?ed|transferred)[.!:,]\s*(?:\S+\s+){0,4}?(?:\$\d|order|to \w+|subscription|membership)`,
    // "Your payment/order/transfer/cancellation has been sent/placed/completed"
    String.raw`\byour (?:payment|transfer|order|trade|cancellation|subscription)\s+(?:has been|was|is now)\s+(?:sent|placed|submitted|completed|executed|cancell?ed|processed)\b`,
  ].join("|"),
  "im",
);

export const CORRECTION = "Correction: nothing was sent, bought, sold or cancelled just now. I only do those through a card you approve with a yes, and no card was approved. Tell me what you want and I'll put one up.";

export function guardMoneyClaim(reply: string): { reply: string; caught: boolean } {
  const text = String(reply ?? "");
  if (!CLAIM.test(text) || text.includes(CORRECTION)) return { reply: text, caught: false };
  return { reply: `${text}\n\n${CORRECTION}`, caught: true };
}
