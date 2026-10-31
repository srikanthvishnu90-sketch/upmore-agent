// REQS DOC 1 (conversation and trust): the questions a person asks about Trainee itself are answered from what is true,
// never with the "I may have missed what you meant" banner and never with a confident wrong route. Items: Q33 (what it
// is), Q234/Q239/Q244 (privacy promise, never sold, what is stored), Q235 (what it can see, from the connected list),
// Q202 (legal, tax and medical questions get a referral), Q84/Q127 (a thanks or a laugh gets a short reply).
// Outcome assertions on meaning (kind, the facts a reply rests on), not on exact wording.
import assertNode from "node:assert/strict";
import { TRUST_INTENTS, trustKind, trustTurn } from "../../supabase/functions/_shared/career_trust_turn.ts";
import { capabilitiesFrom, type CapabilityRows } from "../../supabase/functions/_shared/career_capabilities.ts";
import { CAREER_READ_SCOPE, CAREER_SEND_SCOPE } from "../../supabase/functions/_shared/career_mail_gmail.ts";

const POLICY = Deno.readTextFileSync(new URL("../../docs/launch/legal-pages/privacy.template.html", import.meta.url));
const FALLBACK = /I may have missed what you meant|I didn't catch that/i;
// Q91's banned list (and Q119's opener).
const BANNED = /I'?d be happy to|great question|absolutely!|let me know if you need anything else|I hope this helps|how can I help you today/i;
const caps = (over: Partial<CapabilityRows> = {}) => capabilitiesFrom({ connections: [], extension_seen_at: null, cloud: null, alerts: null, channel: null, unreadable: [], ...over });

Deno.test("Q33: 'are you a bot / AI / a real person' is answered plainly: an AI career agent, not a person", () => {
  for (const m of ["are you a bot?", "Are you an AI?", "r u a real person", "am I talking to a real person?", "is this a bot", "wait are you human?", "who am I texting with?", "are you a bot or a person"]) {
    eq(trustKind(m), "identity", m);
    const a = trustTurn({ message: m, capabilities: null })!;
    eq(a.intent, TRUST_INTENTS.identity, m);
    assert(/\bAI\b/.test(a.reply) && /not a (real )?person/i.test(a.reply) && /Trainee/.test(a.reply), a.reply);
  }
});

Deno.test("Q234/Q239: 'do you sell my data' gets the policy's own promise, and every claim is in the policy", () => {
  for (const m of ["do you sell my data?", "will you sell my information", "who can see my messages?", "is my data safe", "do you share my info with employers?", "do you train on my data", "what happens with my data"]) {
    eq(trustKind(m), "privacy_sell", m);
    const a = trustTurn({ message: m, capabilities: null })!;
    eq(a.intent, "career_privacy", m);
    assert(/don't sell/i.test(a.reply) && /advertis/i.test(a.reply), a.reply);
    assert(/approve the exact/i.test(a.reply), `who it goes to, and only on approval: ${a.reply}`);
    assert(/forget everything/.test(a.reply), `how to delete it: ${a.reply}`);
  }
  // The claims are the policy's, not invented.
  assert(/We do not sell your information, use it for advertising/.test(POLICY));
  assert(/sends nothing without your yes to the exact content/.test(POLICY));
  assert(/Supabase \(our database and servers\), OpenAI \(the AI model/.test(POLICY));
  assert(/Saying "forget everything" to Trainee deletes your profile, confirmed facts, tracker, tailored resumes/.test(POLICY));
});

Deno.test("Q244: 'what do you store' lists the policy's categories and how to see and delete them", () => {
  for (const m of ["what do you store about me?", "what data do you keep", "do you save my messages?", "what do you collect"]) {
    eq(trustKind(m), "privacy_store", m);
    const r = trustTurn({ message: m, capabilities: null })!.reply;
    for (const w of [/resume/, /tracker/, /messages/, /what do you know about me/, /forget everything/]) assert(w.test(r), `${m}: ${w} in ${r}`);
  }
  for (const w of [/What you tell Trainee:<\/strong> your messages, the jobs you want, and the facts you confirm/, /the tailored versions Trainee makes/]) assert(w.test(POLICY), String(w));
});

Deno.test("Q235: 'can you see my other apps' is answered from the person's live connections, never guessed", () => {
  const m = "can you see my other apps?";
  eq(trustKind(m), "access");
  const none = trustTurn({ message: m, capabilities: caps() })!.reply;
  assert(/haven't connected any account/i.test(none) && !/You connected Gmail/.test(none), none);
  const read = trustTurn({ message: m, capabilities: caps({ connections: [{ provider: "google_career", scopes: [CAREER_READ_SCOPE], connected_at: null }] }) })!.reply;
  assert(/You connected Gmail/.test(read) && /can't send email/i.test(read), read);
  const both = trustTurn({ message: m, capabilities: caps({ connections: [{ provider: "google_career", scopes: [CAREER_READ_SCOPE, CAREER_SEND_SCOPE], connected_at: null }] }) })!.reply;
  assert(/You connected Gmail/.test(both) && /only after your yes/.test(both), both);
  // A read that failed is said, never a guess either way.
  for (const c of [null, caps({ unreadable: ["connections"] })]) {
    const r = trustTurn({ message: m, capabilities: c })!.reply;
    assert(/couldn't read your connections/.test(r) && !/You connected Gmail|haven't connected/.test(r), r);
  }
  for (const q of ["can you read my emails", "do you have access to my contacts?", "can u see my texts", "what can you see?", "can you look at my linkedin"]) eq(trustKind(q), "access", q);
  // Requests to do something with the inbox belong to the inbox and connector turns.
  for (const q of ["can you check my email for replies", "can you read my email from Acme and tell me what they said", "can you go through my inbox"]) eq(trustKind(q), null, q);
});

Deno.test("Q202: a personal legal, tax or medical question gets a referral, never a confident answer", () => {
  const cases: [string, RegExp][] = [
    ["is it legal for my employer to fire me for this?", /lawyer/], ["can my boss withhold my last paycheck?", /lawyer/],
    ["should I sue my old company", /lawyer/], ["is my non-compete enforceable?", /lawyer/],
    ["do I owe taxes on my signing bonus?", /tax professional/], ["how much tax will I pay on a $20k bonus", /tax professional/],
    ["is my relocation stipend taxable", /tax professional/],
    ["should I see a doctor about stress?", /doctor/], ["what meds should I take for anxiety", /doctor/],
  ];
  for (const [m, who] of cases) {
    eq(trustKind(m), "referral", m);
    const a = trustTurn({ message: m, capabilities: null })!;
    eq(a.intent, "career_out_of_domain", m);
    assert(who.test(a.reply) && /won't guess/.test(a.reply), `${m}: ${a.reply}`);
  }
  // A job search in those fields, a negotiation ask, and distress are not referrals.
  for (const m of ["find me tax associate jobs in Chicago", "any nursing roles near me", "paralegal internships", "help me negotiate my signing bonus",
    "I want to become a lawyer", "is it legal to apply to two jobs at the same company", "I am legally authorized to work in the U.S.", "is it legal for me to work on OPT?", "do I need a lawyer for my H-1B?", "I want to kill myself", "should I see a therapist? I want to die", "medical assistant openings"]) eq(trustKind(m), null, m);
});

Deno.test("Q84/Q127: a bare thanks or laugh gets one short word back, marked as an acknowledgment", () => {
  for (const m of ["thanks", "Thank you!", "ty", "thx", "ok thanks", "appreciate it", "lol", "haha", "lmao", "😂"]) {
    eq(trustKind(m), "ack", m);
    const a = trustTurn({ message: m, capabilities: null })!;
    eq(a.intent, "conversation_ack", m);
    eq(a.meta?.ack, true, m);
    assert(a.reply.split(/\s+/).length <= 2, `short: ${a.reply}`);
  }
  // Words that can answer a card or carry an ask are never taken as a bare acknowledgment.
  for (const m of ["ok", "yes", "cool", "👍", "sure", "thanks, now find me data analyst jobs", "lol find me jobs"]) assert(trustKind(m) !== "ack", m);
});

Deno.test("every trust reply: no fallback banner, no banned phrase, no em-dash or semicolon, at most 3 sentences a bubble", () => {
  const msgs = ["are you a bot?", "do you sell my data?", "what do you store?", "can you see my other apps?", "do I owe taxes on my bonus?", "thanks"];
  const capSets = [null, caps(), caps({ connections: [{ provider: "google_career", scopes: [CAREER_READ_SCOPE], connected_at: null }] })];
  for (const m of msgs) for (const c of capSets) {
    const r = trustTurn({ message: m, capabilities: c })!.reply;
    assert(!FALLBACK.test(r) && !BANNED.test(r), r);
    assert(!/[—;]/.test(r), `no em-dash or semicolon (Q101): ${r}`);
    for (const bubble of r.split("\n")) assert((bubble.match(/[.!?](\s|$)/g) ?? []).length <= 3, `Q66: ${bubble}`);
  }
});

Deno.test("career asks and everyday texts are left to the router", () => {
  for (const m of ["find me data analyst jobs in Chicago", "what do you know about me?", "what's connected?", "do you have my resume?", "hi",
    "apply to the Stripe role", "where are my applications?", "forget everything", "can you tailor my resume", "who are you?", "what can you do"]) eq(trustKind(m), null, m);
});

function eq(a: unknown, b: unknown, m?: string) { assertNode.deepStrictEqual(a, b, m); }
function assert(v: unknown, m?: string) { assertNode.ok(v, m); }
