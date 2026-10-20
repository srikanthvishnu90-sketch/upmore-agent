// WO-097: the agent API. Another agent (Codex, the person's own AI agent) acts for the person with a token the person
// minted in their own session (trainee_agent_grant_mint_own). Plain HTTP JSON:
//   GET  <fn>/tools                       the operations, MCP-style (name, description, scope, input schema); no token
//   POST <fn>/call  {"tool": "...", "input": {...}}   (also {"name": "...", "arguments": {...}}, as MCP's tools/call)
//   GET  <fn>/resume/download?g&s&e&sig   the kept resume's signed link (5 minutes), handed out by get_resume
// The bearer token is hashed here (SHA-256) and only the hash goes to the database. Every door in the database resolves
// the person from that hash, refuses a revoked token, a missing scope or a 61st call in a minute, and writes the call to
// the audit (trainee_agent_calls: ids only). No door takes a user id, creates an approval or writes a fact (D-007).
// On top of the database's rules this file keeps two of its own: a fact the store returns unconfirmed is never sent, and
// an application whose payload does not hash to its approval is never listed.
import { hashApplyPayload } from "./career_apply_store.ts";

export const SCOPES = ["read_profile", "read_answers", "read_resume", "read_approved_applications", "report_submission"] as const;
export type Scope = typeof SCOPES[number];
export const TOKEN_RE = /^tra_[A-Za-z0-9_-]{64}$/;
export const LINK_SECONDS = 300;
export const RESUME_BUCKET = "career-resumes";
const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 65536;

export interface Tool { name: string; scope: Scope; description: string; input_schema: Record<string, unknown> }
const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const hex64 = { type: "string", pattern: "^[a-f0-9]{64}$" };
const uuid = { type: "string", format: "uuid" };
export const TOOLS: Tool[] = [
  { name: "get_profile", scope: "read_profile", input_schema: obj(),
    description: "The person's confirmed facts (experience, education, skills and the rest they confirmed). A fact waiting for their confirmation is never returned; use only these facts about the person." },
  { name: "get_saved_answers", scope: "read_answers", input_schema: obj(),
    description: "The answers the person gave to application questions. key says how far an answer travels: fact: for every employer, label: for that exact question wording only, job: for the listed postings only." },
  { name: "get_resume", scope: "read_resume", input_schema: obj({ sha256: hex64 }),
    description: "The person's approved resume (or, with sha256, the exact file an approved application names): a download link valid for 5 minutes and the file's SHA-256. Check the hash of what you download." },
  { name: "list_approved_applications", scope: "read_approved_applications", input_schema: obj(),
    description: "Applications the person approved whose approval is still current, each with the exact approved payload and its payload_hash. Submit only that payload; anything else needs the person's approval in Trainee first." },
  { name: "begin_submission", scope: "report_submission", input_schema: obj({ application_id: uuid, payload_hash: hex64 }, ["application_id", "payload_hash"]),
    description: "Claim one approved application right before you submit it, with its payload_hash. Refused unless the hash is the approved one and the approval is still current. Never on LinkedIn or Indeed: Trainee never automates them (refused 403 forbidden_host; the person applies there themselves). Returns a lease for report_submission." },
  { name: "report_submission", scope: "report_submission",
    input_schema: obj({ application_id: uuid, lease: uuid, payload_hash: hex64, outcome: { type: "string", enum: ["submitted", "blocked"] },
      evidence: obj({ reason: { type: "string", maxLength: 300 }, confirmation_id: { type: "string", maxLength: 200 }, page_confirmation: { type: "boolean" } }) },
      ["application_id", "lease", "payload_hash", "outcome"]),
    description: "Report what happened to an application you claimed: submitted (with any confirmation the page showed), or blocked (with the reason: a verification check, a question with no confirmed answer, a sign-in). The person finishes a blocked one." },
];
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// The database's doors, by tool. Each takes p_token_hash first.
export interface AgentStore { rpc(fn: string, args: Record<string, unknown>): Promise<any> }
export interface Deps {
  store: AgentStore;
  /** A signed link to a private object in the resume bucket, valid for `seconds`. */
  signStorage(path: string, seconds: number): Promise<string>;
  /** The key that signs the kept resume's download link. */
  linkKey: Uint8Array;
  /** This function's public URL, e.g. https://<ref>.supabase.co/functions/v1/trainee-agent-api */
  baseUrl: string;
  now?: () => number;
  /** One line per call: ids, the tool and the outcome only. */
  log?: (line: Record<string, unknown>) => void;
}

const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b)).map((n) => n.toString(16).padStart(2, "0")).join("");
export async function sha256Hex(v: string | Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", (typeof v === "string" ? enc.encode(v) : v) as BufferSource));
}
async function hmacHex(key: Uint8Array, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** The link key: TRAINEE_AGENT_LINK_KEY when set, else derived from the service key (no new secret to manage). */
export async function linkKeyFrom(env: { get(k: string): string | undefined }): Promise<Uint8Array | null> {
  const own = env.get("TRAINEE_AGENT_LINK_KEY"), service = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (own && own.length >= 32) return enc.encode(own);
  if (!service) return null;
  const k = await crypto.subtle.importKey("raw", enc.encode(service), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("trainee-agent-api resume link v1")));
}

const STATUS: Record<string, number> = { unauthorized: 401, revoked: 401, scope: 403, rate_limited: 429, invalid: 400, not_found: 404,
  hash_mismatch: 409, not_ready: 409, stale: 409, forbidden_host: 403, unknown_tool: 400, bad_request: 400, method: 405, not_wired: 503, internal: 500 };
const MESSAGE: Record<string, string> = {
  unauthorized: "No valid agent token. The person mints one in Trainee and gives it to you.",
  revoked: "The person revoked this agent token.",
  scope: "This token was not granted the scope this operation needs.",
  rate_limited: "Too many calls: at most 60 a minute per token.",
  invalid: "The input is not valid for this operation.",
  not_found: "Nothing of the person's matches that.",
  hash_mismatch: "That payload hash is not the one the person approved. Submit only the approved payload.",
  not_ready: "That application is not waiting for you: it was claimed, already recorded, or not claimed with this lease.",
  stale: "That approval is no longer current. The person must approve it again in Trainee.",
  forbidden_host: "Trainee never automates LinkedIn or Indeed; apply there yourself.",
  unknown_tool: "No such operation. GET /tools lists them; none creates an approval.",
  bad_request: "Send JSON: {\"tool\": \"<name>\", \"input\": {...}}.",
  method: "Method not allowed.",
  internal: "Something failed on Trainee's side; nothing was changed by this call.",
};
function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
}
function refuse(code: string): Response {
  return json(STATUS[code] ?? 400, { ok: false, error: code, message: MESSAGE[code] ?? code }, code === "rate_limited" ? { "retry-after": "60" } : {});
}

// A fact is sent only when it is confirmed: never one waiting for the person's yes, whatever the store returned.
export function confirmedOnly(facts: unknown): Record<string, unknown>[] {
  return (Array.isArray(facts) ? facts : []).filter((f): f is Record<string, unknown> =>
    !!f && typeof f === "object" && !Array.isArray(f) && (f as any).needs_confirmation !== true && String((f as any).needs_confirmation ?? "false") === "false"
    && ((f as any).status === undefined || (f as any).status === "confirmed"));
}
// An application is listed only when its payload hashes to its approval (the queue's own canonical hash).
export async function approvedOnly(apps: unknown): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  for (const a of Array.isArray(apps) ? apps : []) {
    if (!a || typeof a !== "object" || typeof (a as any).payload_hash !== "string") continue;
    let h = "";
    try {
      h = await hashApplyPayload((a as any).payload);
    } catch { /* not a canonical payload: never listed */ }
    if (h && h === (a as any).payload_hash) out.push(a as Record<string, any>);
  }
  return out;
}

function pathOf(req: Request): string[] {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("trainee-agent-api");
  return i >= 0 ? parts.slice(i + 1) : parts;
}
function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}
const isStr = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);
function onlyKeys(input: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(input).every((k) => keys.includes(k));
}

export async function handleAgentApi(req: Request, deps: Deps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((l) => console.log(JSON.stringify(l)));
  const path = pathOf(req);
  try {
    if (path.length === 1 && path[0] === "tools") {
      if (req.method !== "GET") return refuse("method");
      return json(200, { ok: true, tools: TOOLS, auth: "Authorization: Bearer <agent token>", call: "POST /call {\"tool\": \"<name>\", \"input\": {...}}" });
    }
    if (path.length === 2 && path[0] === "resume" && path[1] === "download") {
      if (req.method !== "GET") return refuse("method");
      return await download(req, deps, now, log);
    }
    if (!(path.length === 1 && path[0] === "call")) return json(404, { ok: false, error: "not_found", message: "GET /tools lists the operations." });
    if (req.method !== "POST") return refuse("method");
    const token = bearer(req);
    if (!token) {
      log({ fn: "trainee-agent-api", outcome: "unauthorized" });
      return refuse("unauthorized");
    }
    const text = await req.text();
    if (text.length > MAX_BODY) return refuse("bad_request");
    let body: any;
    try {
      body = JSON.parse(text || "{}");
    } catch {
      return refuse("bad_request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return refuse("bad_request");
    const name = typeof body.tool === "string" ? body.tool : typeof body.name === "string" ? body.name : "";
    const input = body.input ?? body.arguments ?? {};
    const tool = BY_NAME.get(name);
    if (!tool) return refuse("unknown_tool");
    if (!input || typeof input !== "object" || Array.isArray(input)) return refuse("invalid");
    const tokenHash = await sha256Hex(token);
    const r = await run(tool.name, tokenHash, input as Record<string, unknown>, deps, now);
    log({ fn: "trainee-agent-api", tool: tool.name, outcome: r.outcome, grant_id: r.grant_id ?? null, application_id: r.application_id ?? null });
    return r.response;
  } catch (e) {
    log({ fn: "trainee-agent-api", outcome: "internal", error: String((e as Error)?.message ?? e).slice(0, 120) });
    return refuse("internal");
  }
}

interface Ran { response: Response; outcome: string; grant_id?: string; application_id?: string }
async function run(name: string, h: string, input: Record<string, unknown>, deps: Deps, now: () => number): Promise<Ran> {
  const done = (r: any, data: Record<string, unknown>, application_id?: string): Ran =>
    ({ response: json(200, { ok: true, ...data }), outcome: "ok", grant_id: r?.grant_id, application_id });
  const refused = (r: any, application_id?: string): Ran | null => {
    if (r && r.ok === true) return null;
    const code = typeof r?.refusal === "string" && r.refusal in STATUS ? r.refusal : "internal";
    return { response: refuse(code), outcome: code, grant_id: r?.grant_id, application_id };
  };
  const invalid = (): Ran => ({ response: refuse("invalid"), outcome: "invalid" });

  if (name === "get_profile") {
    if (!onlyKeys(input, [])) return invalid();
    const r = await deps.store.rpc("trainee_agent_get_profile", { p_token_hash: h });
    return refused(r) ?? done(r, { facts: confirmedOnly(r.facts) });
  }
  if (name === "get_saved_answers") {
    if (!onlyKeys(input, [])) return invalid();
    const r = await deps.store.rpc("trainee_agent_get_saved_answers", { p_token_hash: h });
    return refused(r) ?? done(r, { answers: Array.isArray(r.answers) ? r.answers : [] });
  }
  if (name === "get_resume") {
    if (!onlyKeys(input, ["sha256"]) || (input.sha256 !== undefined && !isStr(input.sha256, HEX64))) return invalid();
    const r = await deps.store.rpc("trainee_agent_get_resume", { p_token_hash: h, p_sha256: input.sha256 ?? null });
    const no = refused(r);
    if (no) return no;
    const res = r.resume ?? {};
    if (!isStr(res.sha256, HEX64)) return { response: refuse("internal"), outcome: "internal", grant_id: r.grant_id };
    const exp = Math.floor(now() / 1000) + LINK_SECONDS;
    let url: string;
    if (res.source === "tailored" && typeof res.path === "string") url = await deps.signStorage(res.path, LINK_SECONDS);
    else if (res.source === "kept" && isStr(r.grant_id, UUID)) {
      const sig = await hmacHex(deps.linkKey, `${r.grant_id}.${res.sha256}.${exp}`);
      url = `${deps.baseUrl}/resume/download?g=${r.grant_id}&s=${res.sha256}&e=${exp}&sig=${sig}`;
    } else return { response: refuse("internal"), outcome: "internal", grant_id: r.grant_id };
    return done(r, { resume: { sha256: res.sha256, filename: res.filename ?? null, source: res.source, url, expires_at: new Date(exp * 1000).toISOString() } });
  }
  if (name === "list_approved_applications") {
    if (!onlyKeys(input, [])) return invalid();
    const r = await deps.store.rpc("trainee_agent_list_approved", { p_token_hash: h });
    return refused(r) ?? done(r, { applications: await approvedOnly(r.applications) });
  }
  if (name === "begin_submission") {
    if (!onlyKeys(input, ["application_id", "payload_hash"]) || !isStr(input.application_id, UUID) || !isStr(input.payload_hash, HEX64)) return invalid();
    const id = input.application_id as string;
    const r = await deps.store.rpc("trainee_agent_begin_submission", { p_token_hash: h, p_application: id, p_payload_hash: input.payload_hash });
    return refused(r, id) ?? done(r, { application_id: r.application_id, lease: r.lease, payload_hash: r.payload_hash }, id);
  }
  if (name === "report_submission") {
    const ev = input.evidence ?? {};
    if (!onlyKeys(input, ["application_id", "lease", "payload_hash", "outcome", "evidence"]) || !isStr(input.application_id, UUID)
      || !isStr(input.lease, UUID) || !isStr(input.payload_hash, HEX64) || (input.outcome !== "submitted" && input.outcome !== "blocked")
      || !ev || typeof ev !== "object" || Array.isArray(ev) || !onlyKeys(ev as Record<string, unknown>, ["reason", "confirmation_id", "page_confirmation"])) return invalid();
    const id = input.application_id as string;
    const r = await deps.store.rpc("trainee_agent_report_submission", { p_token_hash: h, p_application: id, p_lease: input.lease,
      p_payload_hash: input.payload_hash, p_outcome: input.outcome, p_evidence: ev });
    return refused(r, id) ?? done(r, { application_id: r.application_id, state: r.state }, id);
  }
  return { response: refuse("unknown_tool"), outcome: "unknown_tool" };
}

// The kept resume's link: signed here, 5 minutes, re-checked against the grant in the database (a token revoked after
// the link was made downloads nothing), and the bytes' hash checked against the link's before they are sent.
async function download(req: Request, deps: Deps, now: () => number, log: (l: Record<string, unknown>) => void): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const g = q.get("g") ?? "", s = q.get("s") ?? "", e = q.get("e") ?? "", sig = q.get("sig") ?? "";
  const exp = /^[0-9]{1,12}$/.test(e) ? Number(e) : 0;
  const t = Math.floor(now() / 1000);
  if (!UUID.test(g) || !HEX64.test(s) || !/^[a-f0-9]{64}$/.test(sig) || exp < t || exp > t + LINK_SECONDS + 5
    || !sameHex(await hmacHex(deps.linkKey, `${g}.${s}.${exp}`), sig)) {
    log({ fn: "trainee-agent-api", tool: "download_resume", outcome: "unauthorized" });
    return refuse("unauthorized");
  }
  const r = await deps.store.rpc("trainee_agent_resume_download", { p_grant: g, p_sha256: s });
  if (!r || r.ok !== true) {
    const code = typeof r?.refusal === "string" && r.refusal in STATUS ? r.refusal : "internal";
    log({ fn: "trainee-agent-api", tool: "download_resume", outcome: code, grant_id: g });
    return refuse(code);
  }
  const bytes = Uint8Array.from(atob(String(r.b64 ?? "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  if ((await sha256Hex(bytes)) !== s) {
    log({ fn: "trainee-agent-api", tool: "download_resume", outcome: "internal", grant_id: g });
    return refuse("internal");
  }
  log({ fn: "trainee-agent-api", tool: "download_resume", outcome: "ok", grant_id: g });
  const filename = String(r.filename ?? "resume").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "resume";
  return new Response(bytes, { status: 200, headers: {
    "content-type": /\.pdf$/i.test(filename) ? "application/pdf" : "application/octet-stream",
    "content-disposition": `attachment; filename="${filename}"`, "x-content-sha256": s, "cache-control": "no-store" } });
}
