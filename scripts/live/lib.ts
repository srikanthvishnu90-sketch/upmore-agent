// Live production verification (scripts/live/verify.ts): the shared pieces. Results, the read-only database runner and
// its guard, the test-account guard, the HTTP guard, the matrix. Nothing here writes to the live project; the only
// writes a run causes go through the product's own doors (agent-chat, trainee-telegram) as the dedicated test account,
// and every one of those doors is guarded here (see assertTestAccount, guardedFetch, ChatGuard).

export type Status = "PASS" | "FAIL" | "NOT_RUN";
export interface Result {
  feature: string; // F1..F15, E2E, CLOUD, TG, ACCOUNT, ERASE, SAFETY
  check: string; // a stable id, e.g. "F5.listed_postings_open"
  status: Status;
  reason: string; // why, always: a PASS says what was seen, a FAIL what was wrong, a NOT_RUN what was missing
  evidence?: Record<string, unknown>;
}
export const pass = (feature: string, check: string, reason: string, evidence?: Record<string, unknown>): Result => ({ feature, check, status: "PASS", reason, ...(evidence ? { evidence } : {}) });
export const fail = (feature: string, check: string, reason: string, evidence?: Record<string, unknown>): Result => ({ feature, check, status: "FAIL", reason, ...(evidence ? { evidence } : {}) });
export const notRun = (feature: string, check: string, reason: string): Result => ({ feature, check, status: "NOT_RUN", reason });

export const FEATURES: Record<string, string> = {
  ACCOUNT: "Test account and preflight",
  F1: "Chat-to-apply",
  F2: "Greenhouse submit binding",
  F3: "Prepare-ahead",
  F4: "Resume rewrite",
  F5: "Search + judge",
  F6: "Ingest at scale",
  F7: "Alerts",
  F8: "Inbox / follow-ups",
  F9: "Account memory",
  F10: "Networking outreach",
  F11: "Mock interviews",
  F12: "Offer benchmark",
  F13: "Staged brain",
  F14: "Receipts",
  F15: "Dashboard / approval card",
  AUDIT: "Launch-readiness audit (PR #192) BLOCKERs and MAJORs",
  E2E: "E2E chat-submit path",
  CLOUD: "Cloud sender (cloud runner)",
  TG: "Telegram channel",
  ERASE: "Erase (cleanup)",
  SAFETY: "Suite safety",
};

// ------------------------------------------------------------------------------------------------ the read-only guard
// Every SQL statement this suite sends to the live database passes assertReadOnlySql first, and then runs inside
// `begin transaction read only` (Postgres itself refuses a write there). Two locks: code and the database.
const WRITE_WORDS = /\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|analyze|cluster|reindex|refresh|lock|listen|notify|prepare|execute|deallocate|discard|reset|set|comment|security|import|load|checkpoint|begin|commit|rollback|savepoint|release|start)\b/i;
const SIDE_EFFECT_FNS = /\b(nextval|setval|pg_advisory\w*|pg_try_advisory\w*|dblink\w*|lo_\w+|pg_read_\w+|pg_ls_\w+|pg_stat_file|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|set_config|pg_notify|txid_current|pg_current_xact_id|http\w*|net\.\w+)\s*\(/i;
// Database functions a check may call: each is a read (stable, or a pure computation).
export const READ_FUNCTIONS = new Set(["career_ingest_coverage", "career_apply_canonical", "career_user_quiet"]);
function stripLiterals(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, "x");
}
export function assertReadOnlySql(sql: string): void {
  const s = stripLiterals(sql).trim();
  if (!/^(select|with|values|table)\b/i.test(s)) throw new Error(`refused: not a read (${s.slice(0, 40)})`);
  if (s.replace(/;\s*$/, "").includes(";")) throw new Error("refused: one statement per query");
  const w = WRITE_WORDS.exec(s);
  if (w) throw new Error(`refused: "${w[1]}" in a read-only check`);
  if (SIDE_EFFECT_FNS.test(s)) throw new Error("refused: a function with a side effect in a read-only check");
  for (const m of s.matchAll(/\b(?:public\.)?((?:career|channel|agent|trainee|upmore)_[a-z0-9_]+)\s*\(/gi)) {
    if (!READ_FUNCTIONS.has(m[1].toLowerCase())) throw new Error(`refused: ${m[1]}() is not on the read-function list`);
  }
}

export interface Db { rows<T = Record<string, unknown>>(sql: string): Promise<T[]> }
export const q = (v: string) => `'${String(v).replace(/'/g, "''")}'`; // a literal; ids are also shape-checked by callers
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The text sent for one read: inside a read-only transaction, so Postgres itself refuses a write even if the code check
// above were wrong. Exported so the test can send a write through it and see Postgres refuse it.
export function readOnlyText(sql: string): string {
  const body = sql.trim().replace(/;\s*$/, "");
  return `begin transaction read only;\nselect coalesce(jsonb_agg(lv_row), '[]'::jsonb) from (${body}) lv_row;\ncommit;`;
}

// A Db over any runner that executes one SQL text and returns its single-column output (psql -tA). The query is wrapped
// so it returns one JSON array, inside a read-only transaction.
export function readOnlyDb(exec: (sqlText: string) => Promise<string>): Db {
  return {
    async rows<T>(sql: string): Promise<T[]> {
      assertReadOnlySql(sql);
      const out = await exec(readOnlyText(sql));
      const line = out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[")).at(-1);
      if (!line) throw new Error("no rows read");
      return JSON.parse(line) as T[];
    },
  };
}

// psql against SUPABASE_DB_URL. The URL never appears in an error (scrub).
export function psqlExec(dbUrl: string): (sqlText: string) => Promise<string> {
  return async (sqlText) => {
    const child = new Deno.Command("psql", { args: [dbUrl, "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"], stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
    const w = child.stdin.getWriter();
    await w.write(new TextEncoder().encode(sqlText));
    await w.close();
    const out = await child.output();
    if (out.code !== 0) throw new Error(new TextDecoder().decode(out.stderr).trim().split("\n").slice(-2).join(" ").slice(0, 300));
    return new TextDecoder().decode(out.stdout);
  };
}

// ------------------------------------------------------------------------------------------------ the test account
export const TEST_DOMAIN = "@upmore.test";
export const TEST_FLAG = "trainee_test_account"; // auth.users.raw_app_meta_data: settable by the service role only
export function jwtSubject(jwt: string): { sub: string; exp: number | null } {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("the JWT is not a JWT");
  const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")), (c) => c.charCodeAt(0))));
  if (typeof json.sub !== "string" || !UUID.test(json.sub)) throw new Error("the JWT has no user subject");
  return { sub: json.sub, exp: Number.isFinite(json.exp) ? Number(json.exp) : null };
}
// The account a run acts as must be the dedicated test account: its email on the reserved test domain, the flag set by
// the owner's setup SQL, and the email the run was told to expect. Any other account: the run does not start.
export async function assertTestAccount(db: Db, userId: string, expectEmail: string): Promise<{ email: string }> {
  if (!UUID.test(userId)) throw new Error("not a user id");
  if (!expectEmail.toLowerCase().endsWith(TEST_DOMAIN)) throw new Error(`the expected test email must end with ${TEST_DOMAIN}`);
  const r = await db.rows<{ email: string | null; flag: string | null }>(
    `select email, raw_app_meta_data->>${q(TEST_FLAG)} as flag from auth.users where id = ${q(userId)}`);
  if (r.length !== 1) throw new Error("the JWT's user does not exist");
  const email = String(r[0].email ?? "").toLowerCase();
  if (!email.endsWith(TEST_DOMAIN)) throw new Error("the JWT's user is not on the test domain: refusing to act as a real person");
  if (email !== expectEmail.toLowerCase()) throw new Error("the JWT's user is not the configured test account");
  if (r[0].flag !== "true") throw new Error(`the test account is not flagged (${TEST_FLAG}); run the owner setup SQL`);
  return { email };
}

// ------------------------------------------------------------------------------------------------ the HTTP guard
// Every request a run makes goes through this. It allows exactly: agent-chat and trainee-telegram as the test account
// (POST), the password sign-in for the test account, GETs (PostgREST reads, the app page, and for this project only the
// Management API's function list and a count-only edge-log query), a CORS preflight to agent-chat, and the cloud runner's
// dispatch door with a wrong secret and an empty want (a refusal check). Anything else throws.
export interface FetchPolicy { base: string; appUrl?: string | null; ref?: string | null }
export function guardedFetch(policy: FetchPolicy, inner: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const base = new URL(policy.base);
    const own = url.origin === base.origin;
    const app = policy.appUrl ? new URL(policy.appUrl).origin === url.origin : false;
    let ok = false;
    if (method === "GET" || method === "HEAD") {
      const mgmt = url.origin === "https://api.supabase.com" && !!policy.ref &&
        (url.pathname === `/v1/projects/${policy.ref}/functions` ||
          (url.pathname === `/v1/projects/${policy.ref}/analytics/endpoints/logs.all` && /^select count\(\*\) as inbound, countif\(/.test(url.searchParams.get("sql") ?? "")));
      // PostgREST table reads only: GET /rest/v1/rpc/* would run a database function, so it is refused.
      const read = own && url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/rest/v1/rpc/");
      ok = read || app || mgmt;
    }
    else if (method === "OPTIONS") ok = own && url.pathname === "/functions/v1/agent-chat";
    else if (method === "POST" && own) {
      ok = url.pathname === "/functions/v1/agent-chat" || url.pathname === "/functions/v1/trainee-telegram" ||
        (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") ||
        (url.pathname === "/functions/v1/career-cloud-runner/dispatch" && String(init?.body ?? "") === '{"want":0}' && /^wrong-/.test(String(new Headers(init?.headers).get("x-cloud-dispatch-secret") ?? "")));
    }
    if (!ok) throw new Error(`refused by the suite's HTTP guard: ${method} ${url.origin}${url.pathname}`);
    return await inner(input, init);
  }) as typeof fetch;
}

// Words that could approve, send or submit. The suite never says them in a thread that has shown a card, and never says
// "send N" or "approve" anywhere: the card's yes belongs to the owner's real run, not to this suite.
export const APPROVING = /^\s*(?:yes|yeah|yep|y|ok|okay|sure|approve[ds]?|go ahead|do it|send(?: it| them| all| \d+)?|submit(?: it)?|confirm(?:ed)?)\b/i;
export class ChatGuard {
  private carded = new Set<string>();
  noteReply(threadId: string | null, body: any) {
    const meta = body?.meta ?? {};
    const shown = /\bapprove\b|\bcard\b|a yes sends|send \d|say "send/i.test(String(body?.reply ?? "")) || !!meta.offer_card || !!meta.card || !!meta.apply_card;
    if (threadId && shown) this.carded.add(threadId);
  }
  check(threadId: string | null, message: string, allowResumeConfirm = false) {
    if (/^\s*(?:send \d+|approve\b)/i.test(message)) throw new Error("refused by the suite's chat guard: an approval phrase");
    if (APPROVING.test(message)) {
      if (!allowResumeConfirm) throw new Error("refused by the suite's chat guard: a yes outside the resume confirmation");
      if (threadId && this.carded.has(threadId)) throw new Error("refused by the suite's chat guard: a yes in a thread that has shown a card");
    }
  }
}

// ------------------------------------------------------------------------------------------------ output
export function scrubber(values: (string | undefined | null)[]): (s: string) => string {
  const hidden = values.filter((v): v is string => typeof v === "string" && v.length >= 6);
  return (s) => hidden.reduce((t, v) => t.split(v).join("***").split(encodeURIComponent(v)).join("***"), String(s));
}
export function summary(results: Result[]) {
  const n = (s: Status) => results.filter((r) => r.status === s).length;
  return { pass: n("PASS"), fail: n("FAIL"), not_run: n("NOT_RUN"), total: results.length };
}
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300);
export function markdown(results: Result[], meta: { started: string; finished: string; sha: string | null; project: string | null }): string {
  const s = summary(results);
  const lines = [
    `# Trainee live verification`,
    ``,
    `Run ${meta.started} to ${meta.finished}${meta.sha ? ` at ${meta.sha.slice(0, 12)}` : ""}${meta.project ? ` against ${meta.project}` : ""}.`,
    `**${s.pass}/${s.total} passed.** Not passed: ${s.fail} FAIL and ${s.not_run} NOT_RUN. A NOT_RUN is not passed: it is a check that did not get to look.`,
    ``,
    `| Feature | PASS | FAIL | NOT_RUN |`,
    `|---|---|---|---|`,
  ];
  for (const [id, name] of Object.entries(FEATURES)) {
    const r = results.filter((x) => x.feature === id);
    if (!r.length) continue;
    const c = (st: Status) => r.filter((x) => x.status === st).length;
    lines.push(`| ${id} ${name} | ${c("PASS")} | ${c("FAIL")} | ${c("NOT_RUN")} |`);
  }
  lines.push(``, `| Feature | Check | Status | Reason |`, `|---|---|---|---|`);
  for (const r of results) lines.push(`| ${r.feature} | ${r.check} | ${r.status} | ${cell(r.reason)} |`);
  return lines.join("\n") + "\n";
}
