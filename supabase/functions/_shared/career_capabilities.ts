// WO-100: what Trainee can and cannot do for this person right now, from their live rows, never from static prose (the
// host manifest said alerts were not wired; the prompt said nothing about Gmail). Each item carries its status, one line
// the model may say as is, and the one step that turns it on. The "never" items are Trainee's own rules (D-007, owner):
// they never change with a connection.
// A source that could not be read is "unknown", never guessed. Calendar is left out on purpose: nothing reads it here.
import { CAREER_READ_SCOPE, CAREER_SEND_SCOPE } from "./career_mail_gmail.ts";

export type CapStatus = "on" | "off" | "not_connected" | "expired" | "never" | "unknown";
export interface Capability { id: string; name: string; status: CapStatus; line: string; unlock: string | null }
// One connector grant, as user_oauth_connections keeps it (the vault reference and the address are never read here).
export interface Connection { provider: string; scopes: string[]; connected_at: string | null }
export interface CapabilityRows {
  connections: Connection[];
  extension_seen_at: string | null; // max(career_apply_wanted.taken_at): the last time the extension took a queued posting
  cloud: { enabled: boolean } | null;
  alerts: { on: boolean; keywords: string[] } | null;
  channel: { opted_out: boolean } | null;
  unreadable: string[]; // source names: connections, wanted, cloud, alerts, channel
}

export const NEVER: Capability[] = [
  { id: "linkedin_indeed", name: "LinkedIn and Indeed", status: "never", line: "Never: LinkedIn or Indeed automation (applying, messaging or scraping there).", unlock: null },
  { id: "captcha", name: "Captchas", status: "never", line: "Never: solving a captcha or a verification; they finish it on the employer's page.", unlock: null },
  { id: "secrets", name: "Passwords and codes", status: "never", line: "Never: a password or a one-time code in chat; they type it on the employer's own page.", unlock: null },
];
const CONNECT_GOOGLE = 'they text "connect my Google"';

export function capabilitiesFrom(r: CapabilityRows): Capability[] {
  const lost = (s: string) => r.unreadable.includes(s);
  const google = r.connections.find((c) => c.provider === "google_career");
  const gmail = (id: string, name: string, scope: string, on: string, none: string): Capability => {
    if (lost("connections")) return { id, name, status: "unknown", line: `${name}: could not be read this turn; never say it is connected or not.`, unlock: null };
    if (!google) return { id, name, status: "not_connected", line: none, unlock: CONNECT_GOOGLE };
    return google.scopes.includes(scope)
      ? { id, name, status: "on", line: on, unlock: null }
      : { id, name, status: "off", line: `${name}: not granted on their Google connection.`, unlock: CONNECT_GOOGLE };
  };
  const seen = r.extension_seen_at;
  return [
    gmail("gmail_read", "Gmail read", CAREER_READ_SCOPE, "Gmail read: connected; Trainee reads their job mail for confirmations and replies.",
      "Gmail is NOT connected: Trainee cannot read their job mail, so a confirmation or reply email is not seen."),
    gmail("gmail_send", "Gmail send", CAREER_SEND_SCOPE, "Gmail send: granted; every email still goes only after their yes on its exact text.",
      "Gmail is NOT connected: no email (outreach, follow-up, apply by email) can be sent until they connect it."),
    lost("wanted")
      ? { id: "extension", name: "Trainee extension", status: "unknown", line: "Trainee extension: could not be read this turn.", unlock: null }
      : seen
      ? { id: "extension", name: "Trainee extension", status: "on", line: `Trainee extension: last took a queued posting on ${seen.slice(0, 10)}.`, unlock: null }
      : { id: "extension", name: "Trainee extension", status: "unknown", line: "Trainee extension: never seen taking a queued posting; applications queued from chat wait until it runs on their computer.", unlock: 'open Chrome with the Trainee extension and press "Add Trainee\'s picks"' },
    lost("cloud") ? { id: "cloud_apply", name: "Cloud applying", status: "unknown", line: "Cloud applying: could not be read this turn.", unlock: null }
      : r.cloud?.enabled ? { id: "cloud_apply", name: "Cloud applying", status: "on", line: "Cloud applying: on.", unlock: null }
      : { id: "cloud_apply", name: "Cloud applying", status: "off", line: "Cloud applying: off.", unlock: 'they text "apply for me in the cloud"' },
    lost("alerts") ? { id: "alerts", name: "Job alerts", status: "unknown", line: "Job alerts: could not be read this turn.", unlock: null }
      : r.alerts?.on ? { id: "alerts", name: "Job alerts", status: "on", line: `Job alerts: on, for ${r.alerts.keywords.join(", ") || "their saved search"}.`, unlock: null }
      : { id: "alerts", name: "Job alerts", status: "off", line: "Job alerts: off.", unlock: "they say what jobs to watch" },
    lost("channel") ? { id: "texting", name: "Texting", status: "unknown", line: "Texting: could not be read this turn.", unlock: null }
      : !r.channel ? { id: "texting", name: "Texting", status: "not_connected", line: "Texting: no phone linked.", unlock: "they link their phone in the Trainee app" }
      : r.channel.opted_out ? { id: "texting", name: "Texting", status: "off", line: "Texting: they texted STOP; nothing is texted until they text START.", unlock: 'they text "START"' }
      : { id: "texting", name: "Texting", status: "on", line: "Texting: linked; Trainee can text them.", unlock: null },
    ...NEVER,
  ];
}

// The person's connector grants (user_oauth_connections). Stable for WO-101 (connect and disconnect actions): it throws
// on a read error, so a caller can tell "nothing connected" from "could not be read".
export async function readConnections(admin: any, userId: string): Promise<Connection[]> {
  const { data, error } = await admin.from("user_oauth_connections").select("provider,scopes,connected_at").eq("user_id", userId).limit(20);
  if (error) throw new Error(`read connections: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    provider: String(r.provider), connected_at: r.connected_at ?? null,
    scopes: Array.isArray(r.scopes) ? r.scopes.map(String) : String(r.scopes ?? "").split(/[\s,]+/).filter(Boolean),
  }));
}

// The router's connected-accounts view (module 120 reads ctx.statusRecords as [{provider, scopes, connected_at}]): only
// what is on, without any address, so "what's connected" answers from the live state.
export function statusRecordsFrom(caps: Capability[]): { provider: string; scopes: string[]; connected_at: null }[] {
  const on = (id: string) => caps.some((c) => c.id === id && c.status === "on");
  const scopes = [...(on("gmail_read") ? [CAREER_READ_SCOPE] : []), ...(on("gmail_send") ? [CAREER_SEND_SCOPE] : [])];
  return [
    ...(scopes.length ? [{ provider: "google_career", scopes, connected_at: null }] : []),
    ...(on("texting") ? [{ provider: "texting", scopes: [], connected_at: null }] : []),
    ...(on("extension") ? [{ provider: "trainee_extension", scopes: [], connected_at: null }] : []),
  ];
}
