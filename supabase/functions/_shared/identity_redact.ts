// Identity digits never reach storage or a model (owner rule: never store OTPs, passwords or identity digits). Found by
// the testing agent (evals/agent/run.ts, O-20): "my ssn is 123-45-6789, send mike 40" was saved word for word into
// agent_messages and sent to the model. The chat input is redacted before anything else sees it; the person is told what
// was removed, and the rest of the message is still answered.
//   - a Social Security number: 3-2-4 digits with dashes or spaces, or 9 digits right after "ssn", "social security",
//     "itin" or "tax id"
//   - a card number: 13 to 19 digits (spaces or dashes allowed) that pass the Luhn check
//   - an account or routing number: 6 to 17 digits right after "account", "acct", "routing" or "aba"
//   - a password (owner, 2026-10-11: secrets never travel through chat, decision 1): the word after "password is",
//     "password:", "pw =", "passcode is" (unless it describes the password: "my password is wrong"), or a value with a
//     digit or symbol a few words after "password ... is" ("my robinhood password is hunter2")
//   - a labeled one-time code ("my 2fa code is 482913", "otp: 482913") and a card security code ("cvv 123")
//   - FEATURE NEEDS (2026-10-26): an API key, access token or app password: one in a provider's own shape (sk-..., sk_live_...,
//     ghp_..., github_pat_..., xoxb-..., AKIA..., AIza..., ya29...., a JWT), or a long value right after "api key", "secret
//     key", "access token", "token", "app password" and the like. Trainee never takes a key or token in chat: an account
//     connects only on its own sign-in page (career_connectors.ts says the safe path).
// Phone numbers (3-3-4), dates, amounts, order ids and a bare code are left alone (a bare code answers a paused
// cancellation once and is withheld from storage by the handler).
export type Redaction = { text: string; removed: ("ssn" | "card" | "account" | "password" | "code" | "key")[] };

const SSN_SHAPED = /\b(?<!\d[- ])\d{3}[- ]\d{2}[- ]\d{4}\b(?![- ]\d)/g;
const SSN_LABELED = /\b(ssn|social security(?: number| no\.?| #)?|itin|tax id(?: number)?)(\s*(?:is|=|:|#)?\s*)(\d{9})\b/gi;
const ACCOUNT_LABELED = /\b(account|acct|routing|aba)(\s*(?:number|no\.?|#)?\s*(?:is|=|:|#)?\s*)(\d{6,17})\b/gi;
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PW_WORD = String.raw`(?:password|passwd|passcode|passphrase|pwd|pw)`;
// The word right after "password is" is the password, unless it describes it ("my password is wrong").
const NOT_A_PASSWORD = /^(?:wrong|incorrect|expired|invalid|not|too|the|a|an|my|same|correct|right|saved|stored|reset|changed|locked|weak|strong|missing|required|needed|forgotten|case|different|new|old|long|short|fine|ok|okay|working|broken|blocked|bad|good|stuck|gone|compromised|leaked|hacked)$/i;
const PASSWORD_LABELED = new RegExp(String.raw`\b(${PW_WORD})(\s*(?:is|was|=|:)\s*)("[^"\n]+"|'[^'\n]+'|\S{3,})`, "gi");
const PASSWORD_LOOSE = new RegExp(String.raw`\b(${PW_WORD}\b[^.\n]{1,40}?\s(?:is|=|:)\s*)(\S*[\d!@#$%^&*_+=?~]\S*)`, "gi");
const CODE_LABELED = /\b((?:one[- ]time|verification|security|sign[- ]?in|login|log[- ]in|2fa|mfa|otp|auth(?:entication)?)\s*(?:code|pin|passcode|number)?)(\s*(?:is|=|:|#)?\s*)(\d(?:[ -]?\d){3,7})\b/gi;
const KEY_SHAPED = /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g;
const KEY_LABELED = /\b((?:api|secret|access|private|auth|bearer|refresh|client|personal access)[ _-]?(?:key|token|secret)|(?:app|application) password|token)(\s*(?:is|=|:)\s*)("[^"\n]{8,}"|'[^'\n]{8,}'|[A-Za-z0-9_\-./+=]{12,})/gi;
const CVV_LABELED = /\b(cvv2?|cvc2?|csc)(\s*(?:code|number)?\s*(?:is|=|:)?\s*)(\d{3,4})\b/gi;

function luhn(digits: string) {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

// WO-100: while an employer's emailed code is waiting (career_situation.ts codePending), a bare 6-8 digit number is that
// code, so it is removed too ("Plaid emailed me a code, it's 482913"). Never otherwise: a bare number stays a number.
const BARE_CODE = /(?<![\d$€£.,:/#-])\b\d{6,8}\b(?![\d.,:/-]|\s*(?:k\b|%|usd|dollars|a year|per\b|\/))/gi;
export function redactIdentity(input: string, o: { codePending?: boolean } = {}): Redaction {
  const removed = new Set<Redaction["removed"][number]>();
  let t = String(input ?? "");
  t = t.replace(SSN_LABELED, (_m, label, sep) => { removed.add("ssn"); return `${label}${sep}[SSN removed]`; });
  t = t.replace(SSN_SHAPED, () => { removed.add("ssn"); return "[SSN removed]"; });
  // An order, confirmation or tracking number is a reference, not a card, even when its digits happen to pass Luhn.
  t = t.replace(CARD_CANDIDATE, (m, at: number, all: string) => { const d = m.replace(/\D/g, ""); if (d.length < 13 || d.length > 19 || !luhn(d) || /\b(?:order|confirmation|conf|ref|reference|tracking|invoice|case|ticket)\s*(?:number|no\.?|#|id)?\s*[:#]?\s*$/i.test(all.slice(Math.max(0, at - 30), at))) return m; removed.add("card"); return "[card number removed]"; });
  t = t.replace(ACCOUNT_LABELED, (_m, label, sep) => { removed.add("account"); return `${label}${sep}[number removed]`; });
  t = t.replace(PASSWORD_LABELED, (m, label, sep, value: string) => {
    if (NOT_A_PASSWORD.test(value.replace(/[.,!?;]+$/, "")) || value.startsWith("[")) return m;
    removed.add("password"); return `${label}${sep}[password removed]`;
  });
  t = t.replace(PASSWORD_LOOSE, (m, lead, value: string) => { if (value.startsWith("[")) return m; removed.add("password"); return `${lead}[password removed]`; });
  t = t.replace(CODE_LABELED, (_m, label, sep) => { removed.add("code"); return `${label}${sep}[code removed]`; });
  t = t.replace(KEY_LABELED, (m, label, sep, value: string) => { if (value.startsWith("[") || !/\d/.test(value)) return m; removed.add("key"); return `${label}${sep}[key removed]`; });
  t = t.replace(KEY_SHAPED, () => { removed.add("key"); return "[key removed]"; });
  t = t.replace(CVV_LABELED, (_m, label, sep) => { removed.add("card"); return `${label}${sep}[security code removed]`; });
  if (o.codePending) t = t.replace(BARE_CODE, () => { removed.add("code"); return "[code removed]"; });
  return { text: t, removed: [...removed] };
}

const NAMES = { ssn: "Social Security number", card: "card number", account: "account number", password: "password", code: "one-time code", key: "key or token" } as const;
export function redactionNote(removed: Redaction["removed"]): string | null {
  if (!removed.length) return null;
  const what = removed.map((r) => NAMES[r]);
  const list = what.length === 1 ? what[0] : `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}`;
  // A password or code also gets the way it should go: never in a message, only on the company's own page or the secure link.
  const how = removed.some((r) => r === "password" || r === "code" || r === "key") ? " Never send passwords or codes in a message: you sign in yourself on the company's own page, and anything else sensitive goes on Upmore's secure link." : "";
  return `(I removed the ${list} from your message and didn't keep it. Upmore never needs it here.)${how}`;
}
