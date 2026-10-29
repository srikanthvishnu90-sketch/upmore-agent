// Task intelligence, the capability contract (TASK-INTELLIGENCE-SPEC-2026-10-27 §2). Every action the planner can take is a
// Capability declared once in registry.ts. The model picks capabilities and fills inputs; code enforces everything else:
//   - an external effect (send, submit, invite) never runs inside planning: it becomes an item on ONE batch card, with
//     its exact payload and the sha256 of that payload; it runs only through executor.ts after an approval whose hash
//     matches the payload about to run (D-MS-1, D-MN-2);
//   - facts about the person come only from confirmed facts (D-007): requirements are checked by code, never by the model;
//   - LinkedIn, Indeed and Handshake are never automated: any step whose inputs or payload point there is refused;
//   - NO LIMITS: no capability carries a Trainee volume number; an outside refusal is a failure mode with its back-off.
// The approval kinds: "none" | "confirm_fact" | "exact_payload_batch" (the order's "none / single / batch-hash").

export type Effect = "none" | "internal" | "external";
export type Approval = "none" | "confirm_fact" | "exact_payload_batch";
export type Who = "person" | "trainee" | "outside";
// A confirmed fact a capability needs, checked by code against the person's record.
export type FactKey = "resume.confirmed" | "profile.facts" | "outreach.signature";
// A connector need, resolved by K1's requireConnector (Gmail or Outlook, whichever the person has).
export type ConnectorNeed = "mail_send" | "mail_read" | "calendar";
export type Schema = { type: "object"; properties: Record<string, unknown>; required: string[] };

export interface FailureMode { code: string; who: Who; retryable: boolean; means: string; next: string }
// What to offer, in order, when a requirement is missing (the connectors research ladder). Keys, not prose: the reply
// writer (V1) words them.
export const LADDER: Record<FactKey | ConnectorNeed, string[]> = {
  "resume.confirmed": ["attach_resume_file", "paste_resume_text", "confirm_resume_entries"],
  "profile.facts": ["paste_resume_text", "state_facts_in_chat"],
  "outreach.signature": ["state_email_signature"],
  "mail_send": ["connect_gmail", "connect_outlook", "copy_and_send_yourself"],
  "mail_read": ["connect_gmail", "connect_outlook", "forward_or_paste_email"],
  "calendar": ["connect_google_calendar", "connect_outlook_calendar", "state_times_in_chat"],
};

export interface Item {
  idem_key: string; // stable per real-world effect (e.g. "outreach:<draft id>", "apply:<prepared id>")
  payload: Record<string, unknown>; // exactly what will run; hashed and shown whole
  display: string[]; // the payload as the person reads it on the card (code's, verbatim; never the model's retelling)
}
export type Prepared = { items: Item[]; waiting?: { who: Who; code: string; retry_ms: number } };
export interface Executed { status: "done" | "queued" | "failed" | "refused" | "rate_limited"; ref?: Record<string, unknown>; code?: string; retry_ms?: number }
export interface Verified { ok: boolean; state: string; ref?: Record<string, unknown> }

export interface CapCtx {
  userId: string; threadId: string; channel: string; now: number;
  // The person's own words this turn (never an attachment or a page). Provenance for external inputs.
  personText: string;
}
export interface Capability<D = any> {
  name: string; // "area.action"
  summary: string; // one sentence the planner model reads
  lane: string; // who owns the interface it calls
  inputs: Schema;
  outputs: Schema;
  requires: { facts: FactKey[]; connectors: ConnectorNeed[] };
  effect: Effect;
  approval: Approval;
  // A turn class that stays with today's code (the router's resume ingest and evidence; the host's erase and pause): the
  // planner never runs it, it lets the turn fall through.
  handledBy?: "router" | "host";
  failures: FailureMode[];
  owner_rules: string[];
  // null when the interface it calls is present this turn; else NOT_WIRED with the lane that owes it (never faked).
  available(deps: D): null | { code: "NOT_WIRED"; lane: string; missing: string };
  run?(inputs: any, ctx: CapCtx, deps: D): Promise<Record<string, unknown>>; // none / internal
  prepare?(inputs: any, ctx: CapCtx, deps: D): Promise<Prepared>; // external: the items to approve
  current?(payload: Record<string, unknown>, ctx: CapCtx, deps: D): Promise<Record<string, unknown> | null>; // source of truth
  execute?(payload: Record<string, unknown>, ctx: CapCtx & { idemKey: string }, deps: D): Promise<Executed>; // executor.ts only
  verify(result: Record<string, unknown>, ctx: CapCtx, deps: D): Promise<Verified>;
}

export const NOT_WIRED = (lane: string, missing: string) => ({ code: "NOT_WIRED" as const, lane, missing });

// ------------------------------------------------------------------------------------------------ hashing
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v as Record<string, unknown>).sort().filter((k) => (v as any)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
}
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const payloadHash = (p: unknown) => sha256Hex(canonical(p));

// ------------------------------------------------------------------------------------------------ owner rules
// LinkedIn, Indeed and Handshake are never fetched or automated: the label on any suffix and depth (indeed.co.uk,
// www.linkedin.cn, lnkd.in, app.joinhandshake.com). A look-alike that only contains the word (notindeed.com) is allowed.
const NEVER_LABELS = new Set(["linkedin", "lnkd", "licdn", "indeed", "indeedemail", "indeedmail", "joinhandshake", "handshake"]);
export function neverAutomated(host: string): boolean {
  const labels = String(host || "").toLowerCase().replace(/\.$/, "").split(".");
  // The registrable label and any subdomain label count; the public suffix does not ("co", "uk", "com").
  return labels.slice(0, -1).some((l) => NEVER_LABELS.has(l));
}
const URLS = /\bhttps?:\/\/[^\s"'<>]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|in|cn|co|uk|ca|de|fr|jp|au)\b(?:\/[^\s"'<>]*)?/gi;
export function forbiddenTargets(v: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") {
      for (const m of x.matchAll(URLS)) {
        let host = m[0];
        try { host = new URL(/^https?:/i.test(m[0]) ? m[0] : `https://${m[0]}`).hostname; } catch { /* keep raw */ }
        if (neverAutomated(host)) out.push(host);
      }
      for (const m of x.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) if (neverAutomated(m[1])) out.push(m[1]);
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(v);
  return [...new Set(out)];
}

// ------------------------------------------------------------------------------------------------ provenance
// An address or link an external effect would act on must come from the person's own words or from state a capability
// read (a contact on file, a person found with a source, a posting on file). One that appears only in third-party text (an
// attachment, a posting, a page, an email body) can never become a recipient: prompt injection cannot add a side effect.
export function targetsOf(v: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") for (const m of x.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) out.push(m[0].toLowerCase());
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(v);
  return [...new Set(out)];
}
export function untrusted(targets: string[], trusted: string[]): string[] {
  const t = trusted.join("\n").toLowerCase();
  return targets.filter((x) => !t.includes(x.toLowerCase()));
}
