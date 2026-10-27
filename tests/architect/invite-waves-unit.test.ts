// FEATURE WAVES: the pure parts of the invite send and the sign-up steps (career_invites.ts, career_signup.ts). The
// database side and the whole path are tests/db/career_invite_waves.test.sql and flow-invite-waves.test.ts.
import assertNode from "node:assert/strict";
import { INVITE_PAYLOAD, inviteLinks, renderInvite, type Rpc, sendWave, sha256Hex } from "../../supabase/functions/_shared/career_invites.ts";
import { readAge, readAgree, signupTurn, termsFrom } from "../../supabase/functions/_shared/career_signup.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
const TOK = "abcdefghijklmnopqrstuvwxyz012345";

Deno.test("invite links: the web link and Telegram's Start, each only when configured; a bad token is refused", () => {
  eq(inviteLinks(env({ TRAINEE_APP_URL: "https://app.trainee.test/", TELEGRAM_BOT_USERNAME: "@trainee_bot" }), TOK),
    { link: `https://app.trainee.test/?invite=${TOK}`, telegram: `https://t.me/trainee_bot?start=inv_${TOK}` });
  eq(inviteLinks(env({ TRAINEE_APP_URL: "http://insecure.test" }), TOK), { link: null, telegram: null }, "only https");
  assertNode.throws(() => inviteLinks(env({}), "short"));
  eq(INVITE_PAYLOAD.exec(`inv_${TOK}`)?.[1], TOK);
  eq(INVITE_PAYLOAD.exec(`inv_${TOK}x`), null, "exactly 32 characters");
  eq(`inv_${TOK}`.length <= 64, true, "fits Telegram's 64-character start parameter");
});

Deno.test("render: a placeholder whose link is not configured is an error, never a message with a hole", () => {
  eq(renderInvite("Trainee: {link} Reply STOP to opt out.", { link: "https://a.test/?invite=x", telegram: null }), "Trainee: https://a.test/?invite=x Reply STOP to opt out.");
  assertNode.throws(() => renderInvite("Trainee: {telegram} Reply STOP to opt out.", { link: "https://a.test", telegram: null }), /NOT_WIRED/);
});

function fakeDb(o: { text: string; textSha: string; gates?: "pass" | "fail"; invites?: number }) {
  const calls: { name: string; args: any }[] = [];
  let left = o.invites ?? 2;
  const db: Rpc = {
    async rpc(name, args = {}) {
      calls.push({ name, args });
      if (name === "career_wave_recommendation") return { data: { status: o.gates ?? "pass", gates: o.gates === "fail" ? [{ gate: "error_rate", status: "fail" }] : [] }, error: null };
      if (name === "career_wave_close") return { data: 0, error: null };
      if (name === "career_invite_claim_send") {
        if (left <= 0) return { data: { done: true }, error: null };
        left--;
        return { data: { invite_id: `inv-${left}`, phone: `+1312555010${left}`, token: TOK, text: o.text, text_sha256: o.textSha }, error: null };
      }
      if (name === "career_invite_mark_sent") return { data: args.p_ok ? "sent" : "failed", error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    },
  };
  return { db, calls };
}
const E = env({ TRAINEE_APP_URL: "https://app.trainee.test" });

Deno.test("send: the approved text with each person's link, each result recorded", async () => {
  const text = "Trainee: {link} Reply STOP to opt out.";
  const { db, calls } = fakeDb({ text, textSha: await sha256Hex(text) });
  const out: string[] = [];
  const r = await sendWave({ db, wave: 1, env: E, now: () => 0, send: async (_p, b) => { out.push(b[0]); return { ok: true, id: "lm-1" }; } });
  eq([r.sent, r.failed, r.stoppedBy], [2, 0, null]);
  eq(out, [`Trainee: https://app.trainee.test/?invite=${TOK} Reply STOP to opt out.`, `Trainee: https://app.trainee.test/?invite=${TOK} Reply STOP to opt out.`]);
  eq(calls.filter((c) => c.name === "career_invite_mark_sent").map((c) => [c.args.p_ok, c.args.p_provider_id]), [[true, "lm-1"], [true, "lm-1"]]);
});

Deno.test("send: a claimed text that is not the approved one is never sent, and is recorded failed", async () => {
  const { db, calls } = fakeDb({ text: "Trainee: {link} Reply STOP. Changed.", textSha: await sha256Hex("Trainee: {link} Reply STOP to opt out."), invites: 1 });
  let sends = 0;
  const r = await sendWave({ db, wave: 1, env: E, now: () => 0, send: async () => { sends++; return { ok: true, id: "x" }; } });
  eq([sends, r.sent, r.failed], [0, 0, 1]);
  eq(calls.find((c) => c.name === "career_invite_mark_sent")?.args.p_error, "the message is not the approved one");
});

Deno.test("send: a failing gate closes the wave before anything is claimed or sent", async () => {
  const text = "Trainee: {link} Reply STOP to opt out.";
  const { db, calls } = fakeDb({ text, textSha: await sha256Hex(text), gates: "fail" });
  let sends = 0;
  const r = await sendWave({ db, wave: 7, env: E, now: () => 0, send: async () => { sends++; return { ok: true, id: "x" }; } });
  eq([r.stoppedBy, sends], ["gates_failed", 0]);
  eq(calls.map((c) => c.name), ["career_wave_recommendation", "career_wave_close"]);
  eq(calls[1].args.p_reason, "a gate failed: error_rate");
});

Deno.test("send: a provider failure is recorded with its error; the run goes on", async () => {
  const text = "Trainee: {link} Reply STOP to opt out.";
  const { db, calls } = fakeDb({ text, textSha: await sha256Hex(text) });
  const r = await sendWave({ db, wave: 1, env: E, now: () => 0, send: async () => ({ ok: false, error: "LoopMessage 500", retryable: true }) });
  eq([r.sent, r.failed], [0, 2]);
  eq(calls.filter((c) => c.name === "career_invite_mark_sent").map((c) => c.args.p_error), ["LoopMessage 500", "LoopMessage 500"]);
});

Deno.test("the 18+ answer: a number decides; yes and no otherwise; anything else is asked again", () => {
  for (const s of ["yes", "Yes!", "yep", "I'm 22", "i am 18", "over 18", "18+", "of course"]) eq(readAge(s), "adult", s);
  for (const s of ["no", "nope", "I'm 16", "yes I'm 17", "under 18", "not yet", "17"]) eq(readAge(s), "minor", s);
  for (const s of ["what?", "", "maybe", "why do you ask"]) eq(readAge(s), null, s);
});

Deno.test("the terms answer, and terms read only when every link and version is set", () => {
  for (const s of ["I agree", "agree.", "I accept", "yes, I agree", "Agreed!"]) eq(readAgree(s), "agree", s);
  for (const s of ["no", "I don't agree", "decline"]) eq(readAgree(s), "decline", s);
  eq(readAgree("what do they say?"), null);
  eq(termsFrom(env({ TRAINEE_TERMS_URL: "https://t.test/terms", TRAINEE_TERMS_VERSION: "1", TRAINEE_PRIVACY_URL: "https://t.test/privacy" })), null, "a missing version: not published");
  eq(termsFrom(env({ TRAINEE_TERMS_URL: "http://t.test/terms", TRAINEE_TERMS_VERSION: "1", TRAINEE_PRIVACY_URL: "https://t.test/privacy", TRAINEE_PRIVACY_VERSION: "1" })), null, "https only");
});

Deno.test("the web gate (20261026230000's admitWebUser) on the invites: the token is redeemed as the person only when not admitted; a refused one admits nobody", async () => {
  const { admitWebUser } = await import("../../supabase/functions/_shared/trainee_admission.ts");
  const user = { id: "u-1" };
  let state: string | null = null, redeemed: string[] = [];
  const rpc = async () => ({ data: state, error: null });
  const personRpc = (answer: Record<string, unknown>) => async (name: string, a: Record<string, unknown>) => {
    eq(name, "career_invite_redeem_own"); redeemed.push(String(a.p_token)); if (!answer.error) state = "waitlist"; return { data: answer, error: null }; };
  eq(await admitWebUser({ env: env({}), rpc, user, invite: TOK, personRpc: personRpc({ step: "age" }) }), { admitted: true, via: "waitlist" });
  eq(redeemed, [TOK]);
  redeemed = [];
  eq(await admitWebUser({ env: env({}), rpc, user, invite: TOK, personRpc: personRpc({ step: "age" }) }), { admitted: true, via: "waitlist" });
  eq(redeemed, [], "already admitted: the token is never used again");
  state = null;
  eq(await admitWebUser({ env: env({}), rpc, user, invite: TOK, personRpc: personRpc({ error: "used" }) }), { admitted: false, reason: "not_invited" });
  eq(await admitWebUser({ env: env({}), rpc, user, invite: "short", personRpc: personRpc({ step: "age" }) }), { admitted: false, reason: "not_invited" }, "a malformed token is never sent");
  eq(redeemed, [TOK], "only the well-formed token reached the database");
  eq(await admitWebUser({ env: env({}), rpc, user }), { admitted: false, reason: "not_invited" }, "no token: not invited");
});

Deno.test("send: the gates are read again every gateEvery sends, and a failure there closes the wave and stops the run", async () => {
  const text = "Trainee: {link} Reply STOP to opt out.", sha = await sha256Hex(text);
  const calls: string[] = [];
  let reads = 0, left = 10;
  const db: Rpc = {
    async rpc(name, args = {}) {
      calls.push(name);
      if (name === "career_wave_recommendation") { reads++; return { data: { status: reads >= 2 ? "fail" : "pass", gates: reads >= 2 ? [{ gate: "telegram_429", status: "fail" }] : [] }, error: null }; }
      if (name === "career_wave_close") return { data: 0, error: null };
      if (name === "career_invite_claim_send") { if (left <= 0) return { data: { done: true }, error: null }; left--; return { data: { invite_id: `i-${left}`, phone: "+13125550100", token: TOK, text, text_sha256: sha }, error: null }; }
      if (name === "career_invite_mark_sent") return { data: "sent", error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    },
  };
  const r = await sendWave({ db, wave: 3, env: E, now: () => 0, gateEvery: 3, send: async () => ({ ok: true, id: "x" }) });
  eq([r.sent, r.stoppedBy], [3, "gates_failed"], "three sent, then the periodic read failed");
  eq(calls.filter((c) => c === "career_wave_recommendation").length, 2, "read once before the first send and once after the third, never in between");
  eq(calls.slice(-2), ["career_wave_recommendation", "career_wave_close"], "the wave is closed when the recheck fails");
  eq(left, 7, "nothing was claimed after the failure");
});

Deno.test("the sign-up record: a missing table is no record; any other read error is an error (the handler then stops, never carrying on)", async () => {
  const E2 = env({});
  const adminWith = (error: { code?: string; message: string } | null, data: unknown = null) => ({
    rpc: async (name: string, args: Record<string, unknown>) => { eq([name, args], ["career_signup_state", { p_user: "u-1" }]); return { data, error }; },
  });
  const run = (admin: unknown) => signupTurn({ admin, person: null, userId: "u-1", message: "hello", invite: undefined, bridge: false, env: E2, now: 0 });
  eq(await run(adminWith({ code: "PGRST202", message: "Could not find the function public.career_signup_state(p_user) in the schema cache" })), null, "migration not applied: no sign-up record");
  eq(await run(adminWith({ code: "42883", message: "function public.career_signup_state(uuid) does not exist" })), null);
  eq(await run(adminWith(null, null)), null, "an account with no record is untouched");
  eq(await run(adminWith(null, { step: "active", asked_at: null })), null, "an active account is untouched");
  for (const error of [{ code: "42501", message: "permission denied for function career_signup_state" }, { message: "connection reset" }, { code: "PGRST301", message: "JWT expired" }]) {
    await assertNode.rejects(() => run(adminWith(error)), /read the sign-up record/, error.message);
  }
});

Deno.test("Telegram's last-4 words: ask, wrong with the tries left, and the refusals for a wrong number and a locked invite", async () => {
  const m = await import("../../supabase/functions/_shared/career_invites.ts");
  assertNode.match(m.INVITE_ASK_LAST4, /last 4 digits/);
  eq(m.inviteLast4Wrong(4), "Those digits don't match the number this invite was sent to. 4 tries left.");
  eq(m.inviteLast4Wrong(1), "Those digits don't match the number this invite was sent to. 1 try left.");
  assertNode.match(m.INVITE_REFUSED.wrong_number, /different phone number/);
  assertNode.match(m.INVITE_REFUSED.locked, /locked for an hour/);
});
