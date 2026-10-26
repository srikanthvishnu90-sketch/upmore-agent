// Launch readiness B7/X1 (2026-10-26): sign-up in waves. The web gate (_shared/trainee_admission.ts, called by
// agent-chat's career handler and career-essay-draft) and the texting channels' waitlist check (channel_inbound.ts).
// The database half (trainee_admit, trainee_invite_wave) is tests/db/trainee_web_admission.test.sql; the whole path in a
// browser is tests/architect/flow-web-signup-e2e.test.ts.
// Run: deno test --no-check tests/edge/trainee-admission.test.ts
import { admitWebUser, allowListed, contactKey, NOT_INVITED_REPLY, webSignupMode } from "../../supabase/functions/_shared/trainee_admission.ts";
import { handleInbound, SIGNUP_CLOSED_REPLY, type InboundStore } from "../../supabase/functions/trainee-inbound/handler.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const env = (e: Record<string, string>) => ({ get: (k: string) => e[k] });
const CONFIRMED = "2026-10-26T10:00:00Z";

Deno.test("the mode: invite only when set to invite; unset or anything else is open (the web before this gate)", () => {
  eq(webSignupMode(env({})), "open");
  eq(webSignupMode(env({ TRAINEE_WEB_SIGNUP: "invite" })), "invite");
  eq(webSignupMode(env({ TRAINEE_WEB_SIGNUP: " Invite " })), "invite");
  eq(webSignupMode(env({ TRAINEE_WEB_SIGNUP: "open" })), "open");
});

Deno.test("contacts: a phone by its digits, an email in lower case, junk is nothing", () => {
  eq(contactKey("+1 (312) 555-0142"), "13125550142");
  eq(contactKey("13125550142"), "13125550142");
  eq(contactKey(" Owner@Example.com "), "owner@example.com");
  for (const bad of ["", "12345", "telegram:123", "not an email@", "+1 312 555 0142 ext 9", "1".repeat(16)]) eq(contactKey(bad), null, bad);
});

Deno.test("the allow-list counts only a confirmed phone or email; telegram and whatsapp ids never match an account", () => {
  const list = env({ TRAINEE_ALLOWED_CONTACTS: "+1 312 555 0142, Owner@Example.com, telegram:13125550199, wa:13125550188" });
  assert(allowListed(list, { phone: "13125550142", phone_confirmed_at: CONFIRMED }), "a confirmed listed phone");
  assert(allowListed(list, { email: "owner@example.com", email_confirmed_at: CONFIRMED }), "a confirmed listed email");
  assert(!allowListed(list, { phone: "13125550142", phone_confirmed_at: null }), "an unconfirmed phone is not the person's");
  assert(!allowListed(list, { email: "owner@example.com" }), "an unconfirmed email is not the person's");
  assert(!allowListed(list, { phone: "13125550199", phone_confirmed_at: CONFIRMED }), "a telegram chat id is not a phone");
  assert(!allowListed(list, { phone: "13125550188", phone_confirmed_at: CONFIRMED }), "a whatsapp id entry is not a phone");
  assert(!allowListed(env({}), { phone: "13125550142", phone_confirmed_at: CONFIRMED }), "an empty list allows nobody");
});

Deno.test("admitWebUser: open admits without asking; invite asks the database once with the env's own check", async () => {
  const calls: unknown[] = [];
  const rpc = (answer: unknown, error: string | null = null) => async (n: string, a: Record<string, unknown>) => { calls.push([n, a]); return { data: answer, error: error ? { message: error } : null }; };
  const user = { id: "6f0c1d3e-0000-4000-8000-000000000001", phone: "13125550142", phone_confirmed_at: CONFIRMED };
  eq(await admitWebUser({ env: env({}), rpc: rpc("x"), user }), { admitted: true, via: "open" });
  eq(calls.length, 0, "open mode reads nothing");
  const invite = env({ TRAINEE_WEB_SIGNUP: "invite", TRAINEE_ALLOWED_CONTACTS: "+13125550142" });
  eq(await admitWebUser({ env: invite, rpc: rpc("allowlist"), user }), { admitted: true, via: "allowlist" });
  eq(calls, [["trainee_admit", { p_user: user.id, p_allowlisted: true }]], "the env's verdict goes to the database, never the person's claim");
  calls.length = 0;
  eq(await admitWebUser({ env: env({ TRAINEE_WEB_SIGNUP: "invite" }), rpc: rpc("waitlist"), user }), { admitted: true, via: "waitlist" });
  eq(calls, [["trainee_admit", { p_user: user.id, p_allowlisted: false }]]);
  eq(await admitWebUser({ env: env({ TRAINEE_WEB_SIGNUP: "invite" }), rpc: rpc(null), user }), { admitted: false, reason: "not_invited" });
});

Deno.test("admitWebUser fails closed: a database error, a thrown call or an unknown answer admits nobody", async () => {
  const user = { id: "6f0c1d3e-0000-4000-8000-000000000002" };
  const invite = env({ TRAINEE_WEB_SIGNUP: "invite" });
  eq(await admitWebUser({ env: invite, rpc: async () => ({ data: null, error: { message: "function trainee_admit does not exist" } }), user }), { admitted: false, reason: "unavailable" });
  eq(await admitWebUser({ env: invite, rpc: async () => { throw new Error("connection reset"); }, user }), { admitted: false, reason: "unavailable" });
  eq(await admitWebUser({ env: invite, rpc: async () => ({ data: "open", error: null }), user }), { admitted: false, reason: "unavailable" }, "only the database's three ways count");
  eq(await admitWebUser({ env: invite, rpc: async () => ({ data: true, error: null }), user }), { admitted: false, reason: "unavailable" });
  assert(!/\b(soon|today|tomorrow|days?)\b/i.test(NOT_INVITED_REPLY), "the waiting reply promises no date");
});

// The texting channels (trainee-inbound): an invited waitlist phone may sign up with sign-up closed; the admission is
// recorded on the new account; a waitlist read that fails refuses, never admits.
function world(e: Record<string, string>, invited: Set<string>, over: Partial<InboundStore> = {}) {
  const st = { people: new Map<string, { userId: string; threadId: string | null }>(), admitted: [] as unknown[], asked: [] as string[], refused: new Set<string>() };
  const store: InboundStore = {
    async claimMessage() { return true; },
    async person(c) { return st.people.get(c) ?? null; },
    async refusedBefore(c) { const s = st.refused.has(c); st.refused.add(c); return s; },
    async createPerson(c) { const p = { userId: `u-${st.people.size + 1}`, threadId: null }; st.people.set(c, p); return p; },
    async setThread(c, t) { st.people.get(c)!.threadId = t; },
    async setOptOut() {},
    async enqueueReply() { return true; },
    async waitlistInvited(phone) { st.asked.push(phone); return invited.has(phone); },
    async admit(userId, listed) { st.admitted.push([userId, listed]); },
    ...over,
  };
  const SECRET = "i".repeat(40), sent: string[][] = [], chats: unknown[] = [];
  const deps = {
    env: { get: (k: string) => ({ TRAINEE_INBOUND_SECRET: SECRET, LOOPMESSAGE_API_KEY: "k-live", ...e } as Record<string, string>)[k] }, now: () => Date.UTC(2026, 9, 26, 15),
    store: () => store, send: () => async (_c: string, b: string[]) => { sent.push(b); return { ok: true as const, id: null }; },
    chat: async (a: unknown) => { chats.push(a); return { status: 200, reply: "Hi, I'm Trainee.", threadId: "t-1" }; },
    deliverReply: async () => {},
  };
  let n = 0;
  const text = async (from: string, t = "hi") => await (await handleInbound(new Request(`https://fn.test/trainee-inbound?secret=${SECRET}`, { method: "POST",
    body: JSON.stringify({ alert_type: "message_inbound", message_id: `m${++n}`, recipient: from, text: t }) }), deps as any)).json();
  return { st, sent, chats, text };
}

Deno.test("channels: sign-up closed, an invited waitlist phone gets an account and its admission; an uninvited one is refused", async () => {
  const w = world({}, new Set(["+13125550142"]));
  const ok = await w.text("+1 (312) 555-0142");
  assert(!ok.refused, JSON.stringify(ok));
  eq([w.st.people.size, w.chats.length, w.st.admitted], [1, 1, [["u-1", false]]], "one account, one turn, the waitlist claim recorded (not via the env)");
  const no = await w.text("+1 (312) 555-0100");
  eq([no.refused, w.st.people.size, w.sent.at(-1)?.join(" ")], ["signup closed", 1, SIGNUP_CLOSED_REPLY]);
  eq(w.st.asked, ["+13125550142", "+13125550100"], "the waitlist is asked by the normalized number");
});

Deno.test("channels: an allow-listed contact is admitted via the env without reading the waitlist", async () => {
  const w = world({ TRAINEE_ALLOWED_CONTACTS: "+13125550142" }, new Set());
  await w.text("+1 (312) 555-0142");
  eq([w.st.people.size, w.st.admitted, w.st.asked], [1, [["u-1", true]], []]);
});

Deno.test("channels: a waitlist read that fails refuses; an admission write that fails still answers the person", async () => {
  const down = world({}, new Set(["+13125550142"]), { waitlistInvited: async () => { throw new Error("connection reset"); } });
  eq((await down.text("+1 (312) 555-0142")).refused, "signup closed");
  eq(down.st.people.size, 0, "no account on an unread waitlist");
  const flaky = world({}, new Set(["+13125550142"]), { admit: async () => { throw new Error("connection reset"); } });
  const r = await flaky.text("+1 (312) 555-0142");
  eq([r.refused, flaky.st.people.size, flaky.chats.length], [undefined, 1, 1], "the account exists, the turn runs; the error is logged");
});

Deno.test("the web entry points gate on admission: agent-chat before its rate limit, essay drafting before any model call", async () => {
  const read = (p: string) => Deno.readTextFile(new URL(`../../supabase/functions/${p}`, import.meta.url));
  const chat = await read("agent-chat/handler-career.ts");
  const gate = chat.indexOf("const adm = await admitWebUser("), limit = chat.indexOf('const rlFn = bridgeUserId ? "agent_rl_bump_as" : "agent_rl_bump";');
  assert(gate > 0 && limit > gate, "agent-chat asks for admission before the rate limit is spent");
  assert(/if \(!bridgeUserId\) \{\s*const adm = await admitWebUser/.test(chat), "only web sign-ins are gated here (the texting channels decide their own sign-up)");
  assert(/if \(!adm\.admitted\) \{\s*return json\(cors, \{ error: adm\.reason/.test(chat), "a person not admitted gets the refusal, no turn");
  const essay = await read("career-essay-draft/index.ts");
  assert(/const adm = await admitWebUser\(\{ env: Deno\.env, user: data\.user, rpc: \(n, a\) => admin\.rpc\(n, a\) \}\);\s*return adm\.admitted \? \{ id: data\.user\.id \} : null;/.test(essay),
    "the essay draft has no user (401, no model call) unless admitted");
});
