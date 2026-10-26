// Who may use Trainee from a signed-in session (launch readiness B7/X1; review of PR #195). The database decides
// (trainee_admit, 20261026230000): sign-up is closed ('invite') unless the owner opened it with trainee_set_signup('open').
// A person is admitted when their account existed before the gate, when their CONFIRMED PHONE is on
// TRAINEE_ALLOWED_CONTACTS (checked here, never claimed by the person), or when they redeemed a single-use invite
// (FEATURE WAVES: career_invite_redeem_own, the one invite system). An email never admits anyone: an email can be
// "confirmed" without its owner when Supabase Auth auto-confirms sign-ups.
// A failure to read the decision closes the gate for that call: nothing is admitted on an error.

export interface AdmissionEnv { get(k: string): string | undefined }
export type Admission =
  | { admitted: true; via: "existing" | "allowlist" | "invite" | "waitlist" | "open" }
  | { admitted: false; reason: "not_invited" | "unavailable" };

// A phone as its digits (10 to 15 of them); anything else is not a phone.
export function phoneKey(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t || !/^\+?[0-9 ().-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// Whether the account's confirmed phone is on TRAINEE_ALLOWED_CONTACTS. Email entries, "telegram:" and "whatsapp:"
// entries name other things (an address, a chat id) and never admit a web account.
export interface Account { phone?: string | null; phone_confirmed_at?: string | null }
export function allowListed(env: AdmissionEnv, account: Account): boolean {
  const mine = account.phone_confirmed_at ? phoneKey(account.phone) : null;
  if (!mine) return false;
  return (env.get("TRAINEE_ALLOWED_CONTACTS") ?? "").split(",").map((c) => c.trim())
    .some((c) => phoneKey(c) === mine); // an email, "telegram:<id>" or "wa:<id>" is never a phone (phoneKey: digits only)
}

// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

// o.rpc: the service role (trainee_admit is service-only). o.personRpc: the person's own session, for redeeming the
// invite token they carry (career_invite_redeem_own binds the invite to auth.uid(), never to an id we pass).
export async function admitWebUser(o: { env: AdmissionEnv; rpc: Rpc; personRpc?: Rpc; invite?: unknown; user: { id: string } & Account }): Promise<Admission> {
  try {
    const ask = async () => {
      const r = await o.rpc("trainee_admit", { p_user: o.user.id, p_allowlisted: allowListed(o.env, o.user) });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };
    let via = await ask();
    if (via === null && typeof o.invite === "string" && INVITE_TOKEN.test(o.invite) && o.personRpc) {
      // The one invite system (FEATURE WAVES). Its answer is not trusted here: the admission is read again.
      const red = await o.personRpc("career_invite_redeem_own", { p_token: o.invite });
      if (red.error) console.error("trainee admission: invite not redeemed:", red.error.message);
      via = await ask();
    }
    if (via === "existing" || via === "allowlist" || via === "invite" || via === "waitlist" || via === "open") return { admitted: true, via };
    if (via === null) return { admitted: false, reason: "not_invited" };
    throw new Error(`unexpected admission ${JSON.stringify(via)}`);
  } catch (e) {
    console.error("trainee admission:", e instanceof Error ? e.message : String(e));
    return { admitted: false, reason: "unavailable" };
  }
}

// What the web app shows; plain words, no promise of a date.
export const NOT_INVITED_REPLY =
  "Your spot on Trainee hasn't opened yet. We open the waitlist in waves and text you an invite link when yours opens. Open that link to get in.";
export const ADMISSION_UNAVAILABLE_REPLY = "We couldn't check your access just now. Nothing was saved. Try again in a minute.";
