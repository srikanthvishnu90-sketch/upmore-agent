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

// Secrets never travel through chat (owner, 2026-10-11, decision 1). A model reply that asks the person to send a
// password, a one-time code, a PIN, a card's security code, a full card, account or Social Security number, an API key
// or a seed phrase in a message is wrong by construction: sign-ins happen on the company's own page, and anything else
// sensitive goes on Upmore's secure link into the encrypted vault. The asking sentence is removed (a warning such as
// "never share your password" stays) and the right way is said instead.
const SECRET = String.raw`(?:password|passcode|pin\b|one[- ]time code|verification code|sign[- ]?in code|login code|2fa code|security code|cvv|cvc|social security(?: number)?|ssn|(?:full |whole )?card number|account number|routing number|api (?:key|secret)|secret key|private key|seed phrase|recovery phrase)`;
const SECRET_ASK = new RegExp(
  [
    String.raw`\b(?:send|text|share|give|tell|reply with|respond with|type|enter|provide|paste|drop|dm)\b(?:\s+me)?[^.?!\n]{0,40}?\b${SECRET}`,
    String.raw`\bwhat(?:'s| is| are)\s+your\s+(?:\w+\s+){0,2}${SECRET}`,
    String.raw`\bI(?:'ll| will)?\s+need\s+your\s+(?:\w+\s+){0,2}${SECRET}`,
  ].join("|"),
  "i",
);
const NEGATED = /\b(?:never|don't|do not|won't|will not|no need to|not|shouldn't|should not|avoid)\b/i;
export const SECRET_SAFE = "I never need a password, a code, or a full card or account number in a message, so please don't send one here. Sign-ins happen on the company's own page, and anything else sensitive goes on Upmore's secure link, straight into the encrypted vault.";

export function guardSecretAsk(reply: string): { reply: string; caught: boolean } {
  const text = String(reply ?? "");
  if (text.includes(SECRET_SAFE)) return { reply: text, caught: false };
  let caught = false;
  const kept = text.split(/(?<=[.?!])\s+|\n/).filter((sentence) => {
    const m = SECRET_ASK.exec(sentence);
    if (!m) return true;
    if (NEGATED.test(sentence.slice(0, m.index + m[0].length))) return true;
    caught = true;
    return false;
  });
  if (!caught) return { reply: text, caught: false };
  const rest = kept.join(" ").trim();
  return { reply: rest ? `${rest}\n\n${SECRET_SAFE}` : SECRET_SAFE, caught: true };
}
