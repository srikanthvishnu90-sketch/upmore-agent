// REQS DOC 1 (conversation and trust, 2026-10-31): the plain questions a person asks about Trainee itself, answered by
// code before the router, from what is true: what Trainee is, what happens to their information, what it can see, and
// that a legal, tax or medical question belongs with a professional. Each one fell to the router's "I may have missed
// what you meant" banner on trunk (or worse: a tax question about a bonus got the negotiation script, and "am I talking
// to a real person" got "that is not on your record").
//
//   identity  "are you a bot?", "am I talking to a real person?": Trainee is an AI career agent, not a person.
//   privacy   "do you sell my data?", "who can see my messages?", "what do you store?": only what the privacy policy says
//             (docs/launch/legal-pages/privacy.template.html; tests/architect/trust-turn.test.ts checks each claim there).
//   access    "can you see my other apps / my email?": from the person's live connections (career_capabilities.ts, read
//             at the top of the turn); a connection that could not be read is said, never guessed.
//   referral  a personal legal, tax or medical question: a professional's call, never a confident guess. A job search
//             in those fields ("tax associate jobs", "nursing roles") is not this, and distress is left to the router's
//             safety answer.
//   ack       a whole-message thanks or laugh: one short word back, nothing changed (meta.ack lets a channel show it as
//             a reaction instead). Never "ok", "yes", "cool" or a thumbs-up: those can answer a card.
//
// Pure: no database, no model, no send. Nothing here changes the person's state.
import type { Capability } from "./career_capabilities.ts";

export type TrustKind = "identity" | "privacy_sell" | "privacy_store" | "access" | "referral" | "ack";
export const TRUST_INTENTS: Record<TrustKind, string> = {
  identity: "career_identity", privacy_sell: "career_privacy", privacy_store: "career_privacy",
  access: "career_account_access", referral: "career_out_of_domain", ack: "conversation_ack",
};
export interface TrustAnswer { kind: TrustKind; intent: string; reply: string; status: "completed"; meta?: Record<string, unknown> }

const norm = (m: string) => String(m ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const LEAD = String.raw`^(?:(?:hey|hi|hello|so|wait|ok|okay|lol|honestly|real quick|quick question|be honest|serious question)[\s,!.:]+)*`;

// Self-harm and crisis words are the router's safety answer (142 handleAppendixSafety), never a referral line.
const DISTRESS = /\b(suicid\w*|kill (my ?self|me)|end (it all|my life)|self[- ]?harm|hurt(ing)? my ?self|want to die|don'?t want to (live|be here)|no reason to live)\b/;
// A search for work in a field is a job search, not a question for a professional.
const JOB_WORDS = /\b(jobs?|roles?|positions?|internships?|openings?|postings?|hiring|careers?|apply|applying|applications?|interviews?|resume)\b/;
// Work authorization is the person's own fact for applications (the forms ask "are you legally authorized to work"), never a
// question for a lawyer here.
const WORK_AUTH = /\b(authori[sz]ed|authori[sz]ation|sponsor\w*|visas?|opt|cpt|h-?1b|work permit|green card|citizen\w*)\b/;

const IDENTITY = [
  new RegExp(LEAD + String.raw`(?:are|r) (?:you|u) (?:a |an |actually |even |really |just |like )*(?:real |actual )?(?:bot|robot|ai|a\.i\.?|human|person|real person|real|machine|chatbot|chat ?gpt|gpt|computer|program|automated)\b[^?.!]{0,40}[?.!]*$`),
  new RegExp(LEAD + String.raw`am i (?:talking|texting|chatting|speaking|messaging) (?:to|with) (?:a |an )?(?:real |actual )?(?:person|human|bot|robot|ai|machine|chatbot)\b[^?.!]{0,30}[?.!]*$`),
  new RegExp(LEAD + String.raw`is (?:this|that|trainee) (?:a |an )?(?:real )?(?:bot|robot|ai|human|person|real person|automated|chatbot|machine)\b[^?.!]{0,30}[?.!]*$`),
  new RegExp(LEAD + String.raw`(?:is there|are there) (?:a |any )?(?:real )?(?:person|human|people|humans) (?:on the other end|behind (?:this|you|it)|reading (?:this|these))[?.!]*$`),
  new RegExp(LEAD + String.raw`who am i (?:talking|texting|chatting|speaking) (?:to|with)[?.!]*$`),
];
const SELL = [
  /\b(sell|sells|selling|sold)\b[^?.]{0,30}\b(my|our|your users'?|people'?s) (data|info|information|details|number|messages|chats|texts)\b/,
  /\bdo (you|u|y'?all) (share|give away|hand over)\b[^?.]{0,20}\bmy (data|info|information|details|messages|chats|texts)\b/,
  /\bwho (?:else )?(?:can|could|will|gets to|is able to) (see|read|access|look at)\b[^?.]{0,10}\bmy (data|info|information|messages|chats|texts|conversations?)\b/,
  /\b(is|are) my (data|info|information|messages|chats|texts|conversations?) (safe|private|secure|shared|sold|protected|encrypted)\b/,
  /\bdo (you|u) (train|use)\b[^?.]{0,25}\bmy (data|messages|chats|texts|info|information) (to train|for training|for ads|for advertising)\b|\bdo (you|u) train on my\b/,
  /\bwhat (happens|do you do) (to|with) my (data|info|information|messages|chats)\b/,
];
const STORE = [
  /\bwhat (?:do|did|will|would) (?:you|u) (?:store|keep|save|retain|collect|log)\b/,
  /\bwhat (?:data|info|information) do (?:you|u) (?:have|keep|store|collect|save)\b/,
  /\bdo (?:you|u) (?:store|keep|save|log|record)\b[^?.]{0,10}\b(?:my|our|these|this) (?:data|messages|chats|texts|info|information|conversations?)\b/,
];
const ACCESS = [
  // A question about what Trainee can see, ending at the thing named: "can you check my email for replies" or "can you read
  // my email from Acme" is a request (the inbox and connector turns own those), not this question.
  /\bcan (?:you|u) (?:see|read|access|look at|get into|view)\b[^?.]{0,25}\bmy (?:other )?(?:apps?|accounts?|e-?mails?|inbox|gmail|outlook|texts|text messages|imessages?|messages|phone|contacts|photos|camera|files|calendar|linkedin|browser|history|location|computer)(?: too| as well| at all| right now| already)?[?.!]*$/,
  /\bdo (?:you|u) have access to my (?:other )?[a-z ]{2,30}[?.!]*$/,
  /^(?:so )?what (?:can|do) (?:you|u) (?:have )?(?:access|see)(?: on my (?:phone|computer))?[?.!]*$/,
  /\bwhat (?:apps|accounts) (?:can|do) (?:you|u) (?:see|access|read)\b/,
];
const LEGAL = /\b(?:is (?:it|this|that) (?:il)?legal|against the law|can (?:they|my (?:employer|boss|company|manager|job|landlord))\b[^?.]{0,40}\b(?:fire|sue|withhold|keep my|refuse to pay|make me|rescind)|should i (?:sue|get|hire|talk to|call|see) (?:a |an )?(?:lawyer|attorney)|wrongful(?:ly)? (?:fired|terminat\w*|dismiss\w*)|(?:file|filing) (?:a )?(?:lawsuit|complaint|claim) against|(?:sue|suing) (?:my|the|them|him|her)\b|non-?competes? (?:is |are |be )?(?:enforceable|valid|legal)|do i need a (?:lawyer|attorney))\b/;
const TAX = /\b(?:(?:do|will|would|should|have to|must) i (?:have to )?(?:owe|pay|file)\b[^?.]{0,30}\btax(?:es)?|tax(?:es)? (?:on|for) (?:my|a|the)\b|how much (?:tax|taxes)\b|(?:is|are) (?:my |this |the |a )?[a-z0-9$ ]{0,25}(?:taxable|tax[- ]deductible|deductible)|(?:get|be|is|are) taxed|file my taxes|my tax return|w-?4 (?:form|withholding)|1099 (?:or|vs\.?) w-?2)\b/;
const MEDICAL = /\b(?:should i (?:see|talk to|go to|call) (?:a |my )?(?:doctor|therapist|psychiatrist|counsel?or|physician|gp)|my (?:medication|meds|prescription|diagnosis|symptoms?)|(?:is|are) (?:this|these|my) [a-z ]{0,20}symptoms?|what (?:medication|meds) should i)\b/;
const THANKS = /^(?:(?:ok(?:ay)?|cool|great|perfect|awesome|nice|got it|alright)[,!. ]+)?(?:thanks|thank you|thank u|thanks so much|thanks a lot|thanks again|thx|ty|tysm|tyvm|appreciate (?:it|you|that)|much appreciated|cheers)(?:[,! ]+(?:man|bro|dude|trainee|so much|a lot))?[\s!.]*$/;
const LAUGH = /^(?:lol+|lmao+|haha+|hah|hehe+|ha(?: ha)+|(?:😂|🤣)+)[\s!.]*$/u;

export function trustKind(message: string): TrustKind | null {
  const t = norm(message);
  if (!t || t.length > 300) return null;
  if (DISTRESS.test(t)) return null;
  if (THANKS.test(t) || LAUGH.test(t)) return "ack";
  if (IDENTITY.some((r) => r.test(t))) return "identity";
  if (SELL.some((r) => r.test(t))) return "privacy_sell";
  if (STORE.some((r) => r.test(t))) return "privacy_store";
  if (ACCESS.some((r) => r.test(t))) return "access";
  if (!JOB_WORDS.test(t) && !WORK_AUTH.test(t) && (LEGAL.test(t) || TAX.test(t) || MEDICAL.test(t))) return "referral";
  return null;
}

function professional(t: string): string {
  if (TAX.test(t)) return "a tax professional";
  if (MEDICAL.test(t)) return "a doctor";
  return "a lawyer";
}

// What the person's live connections say, in their words; null capabilities (the read failed) is said, never guessed.
function accessReply(caps: Capability[] | null): string {
  const lead = "I only see what you send me here and the accounts you connect to Trainee. I can't see your other apps, texts, contacts, photos or files.";
  const read = caps?.find((c) => c.id === "gmail_read");
  const send = caps?.find((c) => c.id === "gmail_send");
  let state: string;
  if (!caps || !read || read.status === "unknown") state = "I couldn't read your connections just now, so I won't guess what's connected. Ask \"what's connected\" in a minute.";
  else if (read.status === "on") state = send?.status === "on"
    ? "You connected Gmail, so I read your job mail for confirmations and replies, and I send an email only after your yes on its exact words."
    : "You connected Gmail, so I read your job mail for confirmations and replies. I can't send email from it.";
  else state = "You haven't connected any account, so right now I see only this chat.";
  return `${lead}\n${state}`;
}

export function trustTurn(o: { message: string; capabilities: Capability[] | null }): TrustAnswer | null {
  const kind = trustKind(o.message);
  if (!kind) return null;
  const t = norm(o.message);
  const answer = (reply: string, meta?: Record<string, unknown>): TrustAnswer => ({ kind, intent: TRUST_INTENTS[kind], reply, status: "completed", ...(meta ? { meta } : {}) });
  switch (kind) {
    case "ack":
      return answer(LAUGH.test(t) ? "Ha." : "Anytime.", { ack: true });
    case "identity":
      return answer("I'm Trainee, an AI career agent, not a person. I find roles, get applications ready for your OK, and prep you for interviews.");
    case "privacy_sell":
      return answer([
        "I don't sell your information or use it for advertising.",
        "It's used for your job search, and it goes to an employer or a contact only when you approve the exact application or message. The services that run me (Supabase for storage, OpenAI for the AI model) process it for Trainee only.",
        "Say \"forget everything\" to delete your profile, facts, tracker and tailored resumes.",
      ].join("\n"));
    case "privacy_store":
      return answer([
        "I keep what you tell me and confirm (the jobs you want, your facts and answers), your resume and the tailored versions I make, your application tracker, and our messages.",
        "I don't sell any of it or use it for advertising. Ask \"what do you know about me?\" to see your record, or say \"forget everything\" to delete it.",
      ].join("\n"));
    case "access":
      return answer(accessReply(o.capabilities));
    case "referral":
      return answer(`That's a question for ${professional(t)}, and I won't guess at it. If there's a job-search side to it, like an offer, a message to HR or your next role, tell me and I'll take that part.`);
  }
}
