// GB-01 / ON-01: the sign-up steps of a person who came in by invite (migration 20261026233017). Code's, before every
// other turn, only for an account with a career_signup_gate row that is not active yet; everyone else is untouched.
//   1. "Are you 18 or older?" An answer under 18 is blocked while TRAINEE_UNDER18_POLICY is unset or "block" (the
//      owner's decision; "allow" records the answer and goes on).
//   2. The terms of service and privacy policy, each with its version and link (TRAINEE_TERMS_URL/_VERSION,
//      TRAINEE_PRIVACY_URL/_VERSION); "I agree" accepts both. Unset, sign-up can't finish and the reply says so.
// Each acceptance is a career_consents row: its version, the sha256 of the exact text the person was shown, the sha256
// of their answer and the channel. STOP (and "stop everything") always passes through to the existing handling.
// On the web the admission gate (20261026230000's admitWebUser) redeems the invite link's token before this runs; with
// sign-up opened by the owner it admits everyone first, so the token (`invite`) is redeemed here instead, as the
// signed-in person (career_invite_redeem_own). Either way the redemption starts step 1.
import { channelCommand } from "./channel.ts";
import { INVITE_REFUSED, type InviteRefusal, sha256Hex } from "./career_invites.ts";

type Env = { get(k: string): string | undefined };
export const SIGNUP_AGE_ASK = "Welcome to Trainee. First: are you 18 or older? Reply yes or no.";
export const SIGNUP_AGE_AGAIN = "Please answer yes or no: are you 18 or older?";
export const SIGNUP_UNDER18 = "Thanks for telling me. Trainee is only open to people 18 and older right now, so I can't set you up. Nothing else will happen on this account; if you text again, you'll get this same answer.";
export const SIGNUP_TERMS_MISSING = "Trainee's terms of service aren't published yet, so I can't finish setting you up. Text me again later.";
export const termsAsk = (t: Terms) =>
  `Last step: please read Trainee's Terms of Service (version ${t.termsVersion}): ${t.termsUrl}\nand Privacy Policy (version ${t.privacyVersion}): ${t.privacyUrl}\nReply "I agree" to accept both.`;
export const SIGNUP_TERMS_DECLINED = "Without accepting the terms and privacy policy I can't set you up. Reply \"I agree\" any time to accept them.";
export const SIGNUP_TERMS_AGAIN = "Reply \"I agree\" to accept the Terms of Service and Privacy Policy, or \"no\" if you don't.";
export const SIGNUP_DONE = "You're set up. To start, paste your resume here as text and tell me the kind of job you want.";

export interface Terms { termsUrl: string; termsVersion: string; privacyUrl: string; privacyVersion: string }
export function termsFrom(env: Env): Terms | null {
  const t = { termsUrl: (env.get("TRAINEE_TERMS_URL") || "").trim(), termsVersion: (env.get("TRAINEE_TERMS_VERSION") || "").trim(),
    privacyUrl: (env.get("TRAINEE_PRIVACY_URL") || "").trim(), privacyVersion: (env.get("TRAINEE_PRIVACY_VERSION") || "").trim() };
  const url = /^https:\/\/\S+$/, ver = /^[A-Za-z0-9._-]{1,64}$/;
  return url.test(t.termsUrl) && url.test(t.privacyUrl) && ver.test(t.termsVersion) && ver.test(t.privacyVersion) ? t : null;
}

// yes / no / an age. A number decides when there is one ("yes I'm 17" is under 18); otherwise yes or no.
export function readAge(text: string): "adult" | "minor" | null {
  const t = String(text ?? "").trim().toLowerCase();
  if (/\b(under|younger than|not|less than|below)\s*(18|eighteen)\b/.test(t)) return "minor";
  const nums = [...t.matchAll(/\b(\d{1,3})\b/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 120);
  if (nums.length) return nums.some((n) => n < 18) ? "minor" : "adult";
  if (/^(yes|yeah|yep|yup|y|i am|i'm|im|correct|of course|sure)\b/.test(t) || /\b(over|older than|at least)\s*(18|eighteen)\b/.test(t) || /^18\s*\+/.test(t)) return "adult";
  if (/^(no|nope|nah|n|not yet|i'm not|i am not)\b/.test(t)) return "minor";
  return null;
}
export function readAgree(text: string): "agree" | "decline" | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[.!\s]+$/g, "");
  if (/^(no|nope|i don'?t agree|i do not agree|decline|i decline|disagree)\b/.test(t)) return "decline";
  if (/^(i agree|agree|i accept|accept|yes,? i agree|yes,? i accept|agreed|yes)\b/.test(t)) return "agree";
  return null;
}
const isStop = (text: string) => channelCommand(text, "telegram") === "stop" || /^stop everything[.!]*$/i.test(String(text ?? "").trim());

export interface SignupDeps {
  admin: any; // service role: the gate rows and the step change
  person: any | null; // the signed-in person's client (web); null on a channel's service-role turn
  userId: string; message: string; invite: unknown; bridge: boolean; env: Env; now: number;
}
export interface SignupAnswer { reply: string; intent: string; status: string }

async function channelOf(admin: any, userId: string, bridge: boolean): Promise<string> {
  if (!bridge) return "web";
  const r = await admin.from("channel_contacts").select("channel,last_inbound_at").eq("user_id", userId).order("last_inbound_at", { ascending: false }).limit(1);
  const c = r.error ? null : r.data?.[0]?.channel;
  return ["telegram", "imessage", "whatsapp"].includes(c) ? c : "imessage";
}

// null: not this turn's business (no gate, or the person is active, or a STOP).
export async function signupTurn(d: SignupDeps): Promise<SignupAnswer | null> {
  if (isStop(d.message)) return null;
  let gate = await readGate(d.admin, d.userId);
  if (!gate && typeof d.invite === "string" && d.invite && d.person && !d.bridge) {
    const r = await d.person.rpc("career_invite_redeem_own", { p_token: d.invite });
    if (r.error) throw new Error(`redeem the invite: ${r.error.message}`);
    const why = r.data?.error as string | undefined;
    if (why === "already_in") return null;
    if (why) return { reply: INVITE_REFUSED[(why in INVITE_REFUSED ? why : "invalid") as InviteRefusal], intent: "career_invite_refused", status: why };
    gate = await readGate(d.admin, d.userId);
    if (!gate) throw new Error("the invite was redeemed but its sign-up record is missing");
  }
  if (!gate || gate.step === "active") return null;
  const at = new Date(d.now).toISOString();
  const step = async (from: string, to: string, age: string | null, consents: unknown[]) => {
    const r = await d.admin.rpc("career_signup_step", { p_user: d.userId, p_from: from, p_to: to, p_age_answer: age, p_consents: consents, p_now: at });
    if (r.error) throw new Error(`record the sign-up step: ${r.error.message}`);
    return String(r.data);
  };
  const said = await sha256Hex(d.message);
  // The first message after the invite (Telegram's Start, a first text, the web link's first message) is never an answer:
  // the 18+ question is asked and recorded as asked.
  if ((gate.step === "age" || gate.step === "terms") && !gate.asked_at) {
    if (gate.step === "terms" && !termsFrom(d.env)) return { reply: SIGNUP_TERMS_MISSING, intent: "career_signup_terms", status: "terms_not_published" };
    const s = await step(gate.step, gate.step, null, []);
    if (s === gate.step) return gate.step === "age" ? { reply: SIGNUP_AGE_ASK, intent: "career_signup_age", status: "asked" } : { reply: termsAsk(termsFrom(d.env)!), intent: "career_signup_terms", status: "asked" };
    gate = await readGate(d.admin, d.userId);
    if (!gate || gate.step === "active") return null;
  }
  if (gate.step === "under18_blocked") return { reply: SIGNUP_UNDER18, intent: "career_signup_blocked", status: "under18_blocked" };
  if (gate.step === "age") {
    const age = readAge(d.message);
    if (!age) return { reply: SIGNUP_AGE_AGAIN, intent: "career_signup_age", status: "asked_again" };
    const channel = await channelOf(d.admin, d.userId, d.bridge);
    if (age === "minor" && (d.env.get("TRAINEE_UNDER18_POLICY") || "block") !== "allow") {
      const s = await step("age", "under18_blocked", d.message, []);
      return s === "under18_blocked" ? { reply: SIGNUP_UNDER18, intent: "career_signup_blocked", status: "under18_blocked" } : promptFor(s, d.env);
    }
    const terms = termsFrom(d.env);
    const consents = age === "adult" ? [{ kind: "age_18_plus", version: "v1", text_sha256: await sha256Hex(SIGNUP_AGE_ASK), channel, message_sha256: said }] : [];
    const s = await step("age", "terms", d.message, consents);
    if (s !== "terms") return promptFor(s, d.env);
    // The terms are shown now (and recorded as shown) only when they are published; otherwise on a later message.
    if (!terms) return { reply: SIGNUP_TERMS_MISSING, intent: "career_signup_terms", status: "terms_not_published" };
    await step("terms", "terms", null, []);
    return { reply: termsAsk(terms), intent: "career_signup_terms", status: "asked" };
  }
  // gate.step === "terms"
  const terms = termsFrom(d.env);
  if (!terms) return { reply: SIGNUP_TERMS_MISSING, intent: "career_signup_terms", status: "terms_not_published" };
  const a = readAgree(d.message);
  if (a === "decline") return { reply: SIGNUP_TERMS_DECLINED, intent: "career_signup_terms", status: "declined" };
  if (!a) return { reply: SIGNUP_TERMS_AGAIN, intent: "career_signup_terms", status: "asked_again" };
  const channel = await channelOf(d.admin, d.userId, d.bridge);
  const shown = await sha256Hex(termsAsk(terms));
  const s = await step("terms", "active", null, [
    { kind: "terms", version: terms.termsVersion, url: terms.termsUrl, text_sha256: shown, channel, message_sha256: said },
    { kind: "privacy", version: terms.privacyVersion, url: terms.privacyUrl, text_sha256: shown, channel, message_sha256: said },
  ]);
  return s === "active" ? { reply: SIGNUP_DONE, intent: "career_signup_done", status: "active" } : promptFor(s, d.env);
}

// A step another turn already moved (a retry, two messages at once): this message decides nothing; the step that is now
// current is asked again.
function promptFor(step: string, env: Env): SignupAnswer | null {
  if (step === "age") return { reply: SIGNUP_AGE_AGAIN, intent: "career_signup_age", status: "stale" };
  if (step === "under18_blocked") return { reply: SIGNUP_UNDER18, intent: "career_signup_blocked", status: "under18_blocked" };
  if (step === "terms") { const t = termsFrom(env); return { reply: t ? termsAsk(t) : SIGNUP_TERMS_MISSING, intent: "career_signup_terms", status: "stale" }; }
  if (step === "active") return { reply: SIGNUP_DONE, intent: "career_signup_done", status: "stale" };
  return null;
}

async function readGate(admin: any, userId: string): Promise<{ step: string; asked_at: string | null } | null> {
  const r = await admin.from("career_signup_gate").select("step,asked_at").eq("user_id", userId).limit(1);
  if (r.error) {
    // Migration 20261026233017 not applied yet: there is no gate to keep, and no invite could have made one.
    if (/career_signup_gate|PGRST205|42P01/.test(`${r.error.code ?? ""} ${r.error.message ?? ""}`) && /does not exist|not find|schema cache/i.test(r.error.message ?? "")) return null;
    throw new Error(`read the sign-up record: ${r.error.message}`);
  }
  return r.data?.[0] ?? null;
}

// The sign-up reply is saved like every turn (the thread's messages, the turn key's replay): the same commit, with the
// snapshot unchanged and no patch, task or batch.
// deno-lint-ignore no-explicit-any
export async function commitSignupTurn(persistence: { commit(a: any): Promise<any> }, a: {
  userId: string; threadId: string; turnKey: string; requestHash: unknown; revision: unknown; accountVersion: unknown; snapshot: unknown; input: unknown; response: Record<string, unknown>;
}): Promise<unknown> {
  const done = await persistence.commit({ ...a, patch: undefined, taskIntent: null, batchIntent: null });
  return done.response;
}
