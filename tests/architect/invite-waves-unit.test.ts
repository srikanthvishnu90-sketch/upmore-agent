// FEATURE WAVES: the pure parts of the invite send and the sign-up steps (career_invites.ts, career_signup.ts). The
// database side and the whole path are tests/db/career_invite_waves.test.sql and flow-invite-waves.test.ts.
import assertNode from "node:assert/strict";
import { INVITE_PAYLOAD, inviteLinks, renderInvite, type Rpc, sendWave, sha256Hex } from "../../supabase/functions/_shared/career_invites.ts";
import { readAge, readAgree, termsFrom } from "../../supabase/functions/_shared/career_signup.ts";

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
