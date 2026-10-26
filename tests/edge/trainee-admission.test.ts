// Launch readiness B7/X1 (review of PR #195): sign-up in waves. The edge half: who the web gate admits (the database
// decides, closed by default; _shared/trainee_admission.ts), every user-facing function gated (agent-chat, essay drafts,
// voice mocks, email codes), and the texting channels recording the env's admission. The database half (the triggers that
// refuse every application write of a person not admitted) is tests/db/trainee_web_admission.test.sql; the whole path in a
// browser is tests/architect/flow-web-signup-e2e.test.ts.
// Run: deno test --no-check tests/edge/trainee-admission.test.ts
import { admitWebUser, allowListed, NOT_INVITED_REPLY, phoneKey } from "../../supabase/functions/_shared/trainee_admission.ts";
import { handleInbound, type InboundStore } from "../../supabase/functions/trainee-inbound/handler.ts";
import { handleVoice, type VoiceSessions } from "../../supabase/functions/_shared/career_voice.ts";
import { signToken } from "../../supabase/functions/_shared/career_voice_link.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const env = (e: Record<string, string>) => ({ get: (k: string) => e[k] });
const CONFIRMED = "2026-10-26T10:00:00Z";
const U = "6f0c1d3e-0000-4000-8000-000000000001";
const TOKEN = "TestInviteToken_0123456789abcdef";

Deno.test("phones: by their digits (10 to 15); anything else is not a phone", () => {
  eq(phoneKey("+1 (312) 555-0142"), "13125550142");
  eq(phoneKey("13125550142"), "13125550142");
  for (const bad of ["", "12345", "owner@example.com", "telegram:13125550142", "+1 312 555 0142 ext 9", "1".repeat(16)]) eq(phoneKey(bad), null, bad);
});

Deno.test("the allow-list admits a confirmed phone only: never an email, an unconfirmed phone, or a chat id", () => {
  const list = env({ TRAINEE_ALLOWED_CONTACTS: "+1 312 555 0142, owner@example.com, telegram:13125550199, wa:13125550188" });
  assert(allowListed(list, { phone: "13125550142", phone_confirmed_at: CONFIRMED }), "a confirmed listed phone");
  assert(!allowListed(list, { phone: "13125550142", phone_confirmed_at: null }), "an unconfirmed phone is not the person's");
  assert(!allowListed(list, { phone: "13125550199", phone_confirmed_at: CONFIRMED }), "a telegram chat id is not a phone");
  assert(!allowListed(list, { phone: "13125550188", phone_confirmed_at: CONFIRMED }), "a whatsapp entry is not a phone");
  // An email on the list admits nobody, confirmed or not: Supabase Auth can confirm an address its owner never saw.
  assert(!allowListed(list, { email: "owner@example.com", email_confirmed_at: CONFIRMED } as never), "an email never admits");
  assert(!allowListed(env({}), { phone: "13125550142", phone_confirmed_at: CONFIRMED }), "an empty list allows nobody");
});

type Call = [string, Record<string, unknown>];
function rpcs(answers: unknown[], error: string | null = null) {
  const calls: Call[] = [];
  let i = 0;
  return { calls, rpc: async (n: string, a: Record<string, unknown>) => { calls.push([n, a]); return { data: answers[Math.min(i++, answers.length - 1)], error: error ? { message: error } : null }; } };
}

Deno.test("admitWebUser asks the database every time (there is no env mode): its answer is the admission", async () => {
  for (const via of ["existing", "allowlist", "invite", "waitlist", "open"] as const) {
    const s = rpcs([via]);
    const r = await admitWebUser({ env: env({}), rpc: s.rpc, user: { id: U } });
    eq(r, { admitted: true, via }, via);
    eq(s.calls, [["trainee_admit", { p_user: U, p_allowlisted: false }]]);
  }
  const s = rpcs([null]);
  eq(await admitWebUser({ env: env({ TRAINEE_WEB_SIGNUP: "open" }), rpc: s.rpc, user: { id: U } }), { admitted: false, reason: "not_invited" },
    "an env cannot open sign-up any more: only the database's setting can");
  const listed = rpcs(["allowlist"]);
  await admitWebUser({ env: env({ TRAINEE_ALLOWED_CONTACTS: "+13125550142" }), rpc: listed.rpc, user: { id: U, phone: "13125550142", phone_confirmed_at: CONFIRMED } });
  eq(listed.calls, [["trainee_admit", { p_user: U, p_allowlisted: true }]], "the env's verdict on the confirmed phone goes to the database");
});

Deno.test("an invite link is redeemed as the person (FEATURE WAVES), then the database is asked again; its answer decides", async () => {
  const svc = rpcs([null, "invite"]), person = rpcs([{ invite_id: "i-1", step: "age" }]);
  eq(await admitWebUser({ env: env({}), rpc: svc.rpc, personRpc: person.rpc, invite: TOKEN, user: { id: U } }), { admitted: true, via: "invite" });
  eq(person.calls, [["career_invite_redeem_own", { p_token: TOKEN }]], "redeemed with the person's own session, by token only");
  eq(svc.calls.length, 2, "asked before and after");
  // A token that does not redeem (used, expired, forged) admits nobody: the second answer is still null.
  const svc2 = rpcs([null, null]), person2 = rpcs([{ error: "used" }]);
  eq(await admitWebUser({ env: env({}), rpc: svc2.rpc, personRpc: person2.rpc, invite: TOKEN, user: { id: U } }), { admitted: false, reason: "not_invited" });
  // A malformed token is never sent; an admitted person's token is never spent.
  const svc3 = rpcs([null]), person3 = rpcs([{}]);
  await admitWebUser({ env: env({}), rpc: svc3.rpc, personRpc: person3.rpc, invite: "short", user: { id: U } });
  eq(person3.calls, [], "a malformed token is not sent");
  const svc4 = rpcs(["existing"]), person4 = rpcs([{}]);
  await admitWebUser({ env: env({}), rpc: svc4.rpc, personRpc: person4.rpc, invite: TOKEN, user: { id: U } });
  eq(person4.calls, [], "an admitted person's invite is not redeemed (not spent)");
});

Deno.test("admitWebUser fails closed: a database error, a thrown call or an unknown answer admits nobody", async () => {
  const user = { id: U };
  eq(await admitWebUser({ env: env({}), rpc: async () => ({ data: null, error: { message: "function trainee_admit does not exist" } }), user }), { admitted: false, reason: "unavailable" });
  eq(await admitWebUser({ env: env({}), rpc: async () => { throw new Error("connection reset"); }, user }), { admitted: false, reason: "unavailable" });
  for (const odd of ["anything", true, 1, {}]) eq(await admitWebUser({ env: env({}), rpc: async () => ({ data: odd, error: null }), user }), { admitted: false, reason: "unavailable" }, JSON.stringify(odd));
  assert(!/\b(soon|today|tomorrow|days?)\b/i.test(NOT_INVITED_REPLY), "the waiting reply promises no date");
});

// Voice mocks: a model session. A person who may not use Trainee is refused before anything is read or minted.
Deno.test("career-voice: a person not admitted gets 403; no session is read or started and nothing is minted", async () => {
  const KEY = "k".repeat(40), now = Date.UTC(2026, 9, 26, 15);
  const reads: string[] = [], mints: string[] = [], asked: string[] = [];
  const sessions = {
    read: async (u: string) => { reads.push(u); return null; }, start: async () => null, finish: async () => false, fallback: async () => false,
  } as unknown as VoiceSessions;
  const token = await signToken({ s: "11111111-1111-4111-8111-111111111111", u: U, k: "start", exp: now + 600_000 }, KEY);
  const run = (admitted: (u: string) => Promise<boolean>) => handleVoice(new Request("https://fn.test/career-voice", { method: "POST", body: JSON.stringify({ action: "start", token }) }), {
    env: (k) => ({ SUPABASE_SERVICE_ROLE_KEY: KEY, OPENAI_API_KEY: "sk-test", CAREER_VOICE: "on" } as Record<string, string>)[k], now: () => now, cors: {}, sessions,
    mint: () => async () => { mints.push("mint"); return { ok: true, value: "x", expires_at: 1 } as never; }, admitted: async (u) => { asked.push(u); return await admitted(u); },
  });
  const no = await run(async () => false);
  eq([no.status, (await no.json()).reason, reads.length, mints.length, asked], [403, "not_admitted", 0, 0, [U]]);
  const err = await run(async () => { throw new Error("db down"); });
  eq([err.status, reads.length, mints.length], [403, 0, 0], "an error answers not admitted");
  const yes = await run(async () => true);
  eq([yes.status !== 403, reads.length], [true, 1], "an admitted person goes on (here: to the session read)");
});

Deno.test("every user-facing function asks before it acts: agent-chat, essay drafts, voice mocks, email codes", async () => {
  const read = (p: string) => Deno.readTextFile(new URL(`../../supabase/functions/${p}`, import.meta.url));
  const chat = await read("agent-chat/handler-career.ts");
  const gate = chat.indexOf("const adm = await admitWebUser("), limit = chat.indexOf('const rlFn = bridgeUserId ? "agent_rl_bump_as" : "agent_rl_bump";');
  assert(gate > 0 && limit > gate, "agent-chat asks for admission before the rate limit is spent");
  assert(/if \(!adm\.admitted\) \{\s*return json\(cors, \{ error: adm\.reason/.test(chat), "a person not admitted gets the refusal, no turn");
  assert(/invite: body\.invite,\s*rpc: .*serviceKey\)\.rpc\(n, a\), personRpc: \(n, a\) => supabase\.rpc\(n, a\)/.test(chat), "the invite is redeemed as the person");
  const essay = await read("career-essay-draft/index.ts");
  assert(/return adm\.admitted \? \{ id: data\.user\.id \} : null;/.test(essay), "essay drafts: no user (401, no model call) unless admitted");
  const voice = await read("career-voice/index.ts");
  assert(/admitted: async \(userId\) => \{\s*const \{ data, error \} = await admin\.rpc\("trainee_may_act", \{ p_user: userId \}\);\s*return !error && data === true;/.test(voice),
    "voice mocks: the entry passes the database's check");
  const code = await read("career-email-code/index.ts");
  assert(/const may = await admin\.rpc\("trainee_may_act", \{ p_user: data\.user\.id \}\);\s*return !may\.error && may\.data === true \? \{ id: data\.user\.id \} : null;/.test(code),
    "email codes: no mail is read for a person who may not act");
});

// The texting channels: a contact the env lets in gets an account and its admission recorded (trainee_admit), so the
// database lets them apply and the web admits the same person. A contact the env does not let in is refused, as before.
function world(e: Record<string, string>, over: Partial<InboundStore> = {}) {
  const st = { people: new Map<string, { userId: string; threadId: string | null }>(), admitted: [] as unknown[], refused: new Set<string>() };
  const store: InboundStore = {
    async claimMessage() { return true; },
    async person(c) { return st.people.get(c) ?? null; },
    async refusedBefore(c) { const s = st.refused.has(c); st.refused.add(c); return s; },
    async createPerson(c) { const p = { userId: `u-${st.people.size + 1}`, threadId: null }; st.people.set(c, p); return p; },
    async setThread(c, t) { st.people.get(c)!.threadId = t; },
    async setOptOut() {},
    async enqueueReply() { return true; },
    async admit(userId, listed) { st.admitted.push([userId, listed]); },
    ...over,
  };
  const SECRET = "i".repeat(40), chats: unknown[] = [];
  const deps = {
    env: { get: (k: string) => ({ TRAINEE_INBOUND_SECRET: SECRET, LOOPMESSAGE_API_KEY: "k-live", ...e } as Record<string, string>)[k] }, now: () => Date.UTC(2026, 9, 26, 15),
    store: () => store, send: () => async () => ({ ok: true as const, id: null }),
    chat: async (a: unknown) => { chats.push(a); return { status: 200, reply: "Hi, I'm Trainee.", threadId: "t-1" }; },
    deliverReply: async () => {},
  };
  let n = 0;
  const text = async (from: string) => await (await handleInbound(new Request(`https://fn.test/trainee-inbound?secret=${SECRET}`, { method: "POST",
    body: JSON.stringify({ alert_type: "message_inbound", message_id: `m${++n}`, recipient: from, text: "hi" }) }), deps as any)).json();
  return { st, chats, text };
}

Deno.test("channels: an allow-listed contact gets an account and its admission; anyone else is refused with no account", async () => {
  const w = world({ TRAINEE_ALLOWED_CONTACTS: "+13125550142" });
  await w.text("+1 (312) 555-0142");
  eq([w.st.people.size, w.st.admitted, w.chats.length], [1, [["u-1", true]], 1]);
  const no = await w.text("+1 (312) 555-0100");
  eq([no.refused, w.st.people.size, w.st.admitted.length], ["signup closed", 1, 1]);
});

Deno.test("channels: an admission write that fails is logged; the turn still runs (the database then refuses their applications)", async () => {
  const w = world({ TRAINEE_SIGNUP: "open" }, { admit: async () => { throw new Error("connection reset"); } });
  const r = await w.text("+1 (312) 555-0142");
  eq([r.refused, w.st.people.size, w.chats.length], [undefined, 1, 1]);
});
