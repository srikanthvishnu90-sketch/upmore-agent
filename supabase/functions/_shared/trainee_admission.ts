// Who may use Trainee on the web (launch readiness 2026-10-26, B7 and X1). The owner opens sign-up in waves:
//
//   TRAINEE_WEB_SIGNUP=invite  a signed-in person may chat only once admitted: their account existed before the gate
//                              (migration 20261026230000), or their phone or email is in TRAINEE_ALLOWED_CONTACTS, or
//                              their verified phone or email matches a waitlist row the owner invited (trainee_invite_wave).
//   TRAINEE_WEB_SIGNUP=open    anyone who signs in may chat.
//   unset                      the same as open, which is how the web worked before this gate. trainee-go-live.sh sets
//                              invite on every run unless the owner passes TRAINEE_WEB_SIGNUP=open.
//
// The decision is the database's (trainee_admit, service role only), and the env list is checked here, never by the
// person. A failure to read the decision closes the gate for that turn: nothing is admitted on an error.

export type WebSignupMode = "open" | "invite";
export interface AdmissionEnv { get(k: string): string | undefined }
export type Admission =
  | { admitted: true; via: "open" | "existing" | "allowlist" | "waitlist" }
  | { admitted: false; reason: "not_invited" | "unavailable" };

export function webSignupMode(env: AdmissionEnv): WebSignupMode {
  const v = (env.get("TRAINEE_WEB_SIGNUP") ?? "").trim().toLowerCase();
  return v === "invite" ? "invite" : "open";
}

// A phone as its digits (10 to 15 of them), an email in lower case; anything else is not a contact.
export function contactKey(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
  if (!/^\+?[0-9 ().-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// Whether the account's phone or email is on TRAINEE_ALLOWED_CONTACTS (the same list the texting channels read;
// "telegram:" and "whatsapp:" entries name chat ids, not accounts, and never match here).
// Only a confirmed contact counts: an email or phone typed at sign-up and never verified is not the person's.
export interface Account { email?: string | null; phone?: string | null; email_confirmed_at?: string | null; phone_confirmed_at?: string | null }
export function allowListed(env: AdmissionEnv, account: Account): boolean {
  const mine = [account.email_confirmed_at ? contactKey(account.email) : null, account.phone_confirmed_at ? contactKey(account.phone) : null]
    .filter((x): x is string => !!x);
  if (!mine.length) return false;
  const list = (env.get("TRAINEE_ALLOWED_CONTACTS") ?? "").split(",").map((c) => c.trim()).filter((c) => c && !/^(telegram|tg|whatsapp|wa):/i.test(c));
  return list.some((c) => { const k = contactKey(c); return !!k && mine.includes(k); });
}

// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;

export async function admitWebUser(o: { env: AdmissionEnv; rpc: Rpc; user: { id: string } & Account }): Promise<Admission> {
  if (webSignupMode(o.env) === "open") return { admitted: true, via: "open" };
  try {
    const r = await o.rpc("trainee_admit", { p_user: o.user.id, p_allowlisted: allowListed(o.env, o.user) });
    if (r.error) throw new Error(r.error.message);
    const via = r.data;
    if (via === "existing" || via === "allowlist" || via === "waitlist") return { admitted: true, via };
    if (via === null) return { admitted: false, reason: "not_invited" };
    throw new Error(`unexpected admission ${JSON.stringify(via)}`);
  } catch (e) {
    console.error("trainee admission:", e instanceof Error ? e.message : String(e));
    return { admitted: false, reason: "unavailable" };
  }
}

// What the web app shows; plain words, no promise of a date.
export const NOT_INVITED_REPLY =
  "Your spot on Trainee hasn't opened yet. We open the waitlist in waves and text you when yours opens. If you joined the waitlist with your phone number, sign in with that number.";
export const ADMISSION_UNAVAILABLE_REPLY = "We couldn't check your access just now. Nothing was saved. Try again in a minute.";
