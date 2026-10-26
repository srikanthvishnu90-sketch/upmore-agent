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
// Three locks, each enough on its own to stop a write:
//   1. code: every statement passes assertReadOnlySql. It is lexed once, left to right (literals, quoted identifiers and
//      comments are recognised in the order they open, so a quote inside a comment or a comment marker inside a quote
//      cannot hide anything), and must be one SELECT/WITH with no ';', no write keyword, only allow-listed functions and
//      only allow-listed schemas;
//   2. protocol: it is sent as ONE extended-protocol query (postgres.js; never psql's simple protocol), which Postgres
//      refuses outright if it holds more than one command, inside `begin read only`;
//   3. role: the connection is a SELECT-only role with default_transaction_read_only on (scripts/live/test-account.sql),
//      and assertReadOnlyRole refuses to start on a role that could write.
const WRITE_WORDS = /\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|analyze|cluster|reindex|refresh|lock|listen|notify|unlisten|prepare|execute|deallocate|discard|reset|set|comment|security|import|load|checkpoint|begin|commit|rollback|abort|savepoint|release|start|into)\b/i;
// The only functions a check may call: aggregates, pure computations and catalog reads.
export const ALLOWED_FUNCTIONS = new Set([
  "count", "sum", "max", "min", "coalesce", "nullif", "jsonb_agg", "jsonb_array_elements", "jsonb_array_length",
  "jsonb_build_object", "string_agg", "bool_and", "to_regclass", "to_regprocedure", "has_function_privilege",
  "has_table_privilege", "pg_get_function_identity_arguments", "encode", "sha256", "convert_to", "extract", "date_trunc",
  "now", "substr", "lower", "left", "octet_length", "current_setting", "career_apply_canonical", "career_ingest_coverage",
]);
// Words that may stand before "(" without being a function call.
const PAREN_KEYWORDS = new Set(["in", "exists", "any", "all", "some", "as", "on", "over", "filter", "values", "select", "from",
  "where", "and", "or", "not", "case", "when", "then", "else", "using", "join", "lateral", "distinct", "array", "row", "by", "is",
  "union", "except", "intersect", "with", "between", "like", "ilike"]);
// Schemas a qualified name may use, and for the non-public ones the only relations in them.
const ALLOWED_RELATIONS: Record<string, Set<string> | "any"> = {
  public: "any", pg_catalog: "any",
  auth: new Set(["users"]), cron: new Set(["job", "job_run_details"]), storage: new Set(["objects"]),
  information_schema: new Set(["columns", "tables"]),
};
// Schemas on a Supabase project that hold secrets or side effects; none may be named, and no alias may take their name.
const SCHEMA_NAMES = new Set(["vault", "pgsodium", "pgsodium_masks", "net", "extensions", "supabase_functions", "graphql",
  "graphql_public", "realtime", "pg_temp", "pg_toast", "supabase_migrations", "pgbouncer", "_realtime", "_analytics"]);
const NOT_ALIASES = new Set([...PAREN_KEYWORDS, "left", "right", "inner", "outer", "cross", "full", "natural", "group", "order",
  "limit", "offset", "having", "window", "only", "true", "false", "null", "asc", "desc"]);

// One left-to-right pass: string literals ('' / E'' / $tag$), quoted identifiers and comments become blanks. Unterminated
// ones are refused (they would end somewhere the code check never looked).
export function lexSql(sql: string): string {
  let out = "", i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === "-" && d === "-") { const j = sql.indexOf("\n", i); i = j < 0 ? n : j; out += " "; continue; }
    if (c === "/" && d === "*") {
      let depth = 1, j = i + 2;
      while (j < n && depth) { if (sql[j] === "/" && sql[j + 1] === "*") { depth++; j += 2; } else if (sql[j] === "*" && sql[j + 1] === "/") { depth--; j += 2; } else j++; }
      if (depth) throw new Error("refused: an unterminated comment");
      out += " "; i = j; continue;
    }
    if (c === "'") {
      const escaped = /[eE]/.test(sql[i - 1] ?? "") && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? "");
      let j = i + 1;
      for (;;) {
        if (j >= n) throw new Error("refused: an unterminated string");
        if (escaped && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      out += "''"; i = j + 1; continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (;;) { if (j >= n) throw new Error("refused: an unterminated quoted name"); if (sql[j] === '"') { if (sql[j + 1] === '"') { j += 2; continue; } break; } j++; }
      out += " qname "; i = j + 1; continue;
    }
    if (c === "$" && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? "")) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length);
        if (end < 0) throw new Error("refused: an unterminated dollar-quoted string");
        out += "''"; i = end + m[0].length; continue;
      }
    }
    out += c; i++;
  }
  return out;
}
export function assertReadOnlySql(sql: string): void {
  const s = lexSql(sql).trim();
  if (!/^(select|with)\b/i.test(s)) throw new Error(`refused: not a read (${s.slice(0, 40)})`);
  if (s.includes(";")) throw new Error("refused: one statement per query, and no ';'");
  if (/\\/.test(s)) throw new Error("refused: a backslash outside a string");
  const w = WRITE_WORDS.exec(s);
  if (w) throw new Error(`refused: "${w[1]}" in a read-only check`);
  const low = s.toLowerCase();
  for (const m of low.matchAll(/([a-z_][a-z0-9_$]*)(?:\s*\.\s*([a-z_][a-z0-9_$]*))?\s*\(/g)) {
    const [schema, name] = m[2] ? [m[1], m[2]] : [null, m[1]];
    if (!schema && PAREN_KEYWORDS.has(name)) continue;
    if (schema && schema !== "public" && schema !== "pg_catalog") throw new Error(`refused: a function in schema ${schema}`);
    if (!ALLOWED_FUNCTIONS.has(name)) throw new Error(`refused: ${name}() is not on the function allow-list`);
  }
  // Names the query itself declares and may qualify columns with: CTE names, relations named in FROM/JOIN/a comma, and
  // their aliases (also after a closing parenthesis).
  const aliases = new Set<string>();
  // Each pattern only looks ahead, so one match never swallows the keyword the next one starts with.
  const ID = "[a-z_][a-z0-9_$]*";
  const declared = [
    new RegExp(`(?:\\bwith|,)(?=\\s+(${ID})\\s+as\\s*\\()`, "g"),
    new RegExp(`(?:\\bfrom|\\bjoin|,)(?=\\s+(?:only\\s+)?(${ID})\\b(?!\\s*[.(]))`, "g"),
    new RegExp(`(?:\\bfrom|\\bjoin|,)(?=\\s+(?:only\\s+)?${ID}(?:\\s*\\.\\s*${ID})?\\s+(?:as\\s+)?(${ID}))`, "g"),
    new RegExp(`\\)(?=\\s+(?:as\\s+)?(${ID}))`, "g"),
  ];
  for (const re of declared) for (const m of low.matchAll(re)) if (!NOT_ALIASES.has(m[1])) aliases.add(m[1]);
  // An alias may not take a schema's name: that would let "vault.x" pass as "alias.column". With that rule every
  // schema-qualified name, in FROM or anywhere else, meets the allow-list below.
  for (const a of aliases) if (a in ALLOWED_RELATIONS || SCHEMA_NAMES.has(a)) throw new Error(`refused: "${a}" is a schema name, not an alias`);
  for (const m of low.matchAll(/(?<![a-z0-9_$.])([a-z_][a-z0-9_$]*)\s*\.\s*([a-z_][a-z0-9_$]*)(?!\s*\()/g)) {
    const [, q1, q2] = m;
    if (aliases.has(q1)) continue;
    const rel = ALLOWED_RELATIONS[q1];
    if (!rel) throw new Error(`refused: schema or name "${q1}" is not allowed`);
    if (rel !== "any" && !rel.has(q2)) throw new Error(`refused: ${q1}.${q2} is not allowed`);
  }
}

export interface Db { rows<T = Record<string, unknown>>(sql: string): Promise<T[]> }
export const q = (v: string) => `'${String(v).replace(/'/g, "''")}'`; // a literal; ids are also shape-checked by callers
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The one statement sent for a read: the check's SELECT wrapped so it returns one JSON array.
export function wrapRead(sql: string): string {
  return `select coalesce(jsonb_agg(lv_row), '[]'::jsonb) as rows from (${sql.trim()}) lv_row`;
}
// Runs one statement as one extended-protocol query inside a read-only transaction and returns its rows.
export type Exec = (statement: string) => Promise<Record<string, unknown>[]>;
export function readOnlyDb(exec: Exec): Db {
  return {
    async rows<T>(sql: string): Promise<T[]> {
      assertReadOnlySql(sql);
      const out = await exec(wrapRead(sql));
      const v = out[0]?.rows;
      if (!Array.isArray(v)) throw new Error("no rows read");
      return v as T[];
    },
  };
}

// postgres.js (extended protocol only) against a database URL, or a local socket for the tests. Every statement runs in
// `begin read only`, on a connection that asks for default_transaction_read_only=on at startup. The URL never appears
// in an error.
// deno-lint-ignore no-explicit-any
// `startupReadOnly: false` exists only so a test can show the `begin read only` lock holding on its own.
export async function pgExec(target: string | { path: string; user: string; database: string }, o: { startupReadOnly?: boolean } = {}): Promise<{ exec: Exec; end: () => Promise<void> }> {
  const { default: postgres } = await import("npm:postgres@3.4.5");
  const connection = o.startupReadOnly === false ? { application_name: "trainee-live-verify" } : { application_name: "trainee-live-verify", default_transaction_read_only: true };
  const opts = { max: 1, prepare: true, onnotice: () => {}, connection };
  // deno-lint-ignore no-explicit-any
  const sql: any = typeof target === "string" ? postgres(target, opts) : postgres({ ...opts, path: target.path, user: target.user, database: target.database });
  return {
    async exec(statement: string) {
      try {
        // deno-lint-ignore no-explicit-any
        return await sql.begin("read only", (tx: any) => tx.unsafe(statement, [], { prepare: true, simple: false }));
      } catch (e) {
        throw new Error(String((e as Error).message ?? e).replace(/postgres(?:ql)?:\/\/\S+/g, "***").slice(0, 300));
      }
    },
    end: () => sql.end({ timeout: 5 }),
  };
}

// The connection must not be able to write: not a superuser, no BYPASS... beyond reading, default_transaction_read_only
// on, and no INSERT, UPDATE, DELETE or TRUNCATE on any table in the schemas the suite reads.
export async function assertReadOnlyRole(db: Db): Promise<void> {
  const r = await db.rows<{ superuser: boolean; ro: string; writable: number; can_read_vault: boolean }>(
    `select r.rolsuper as superuser, current_setting('default_transaction_read_only') as ro,
            (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname in ('public', 'auth', 'cron', 'storage', 'vault') and c.relkind in ('r', 'p')
                and (has_table_privilege(c.oid, 'INSERT') or has_table_privilege(c.oid, 'UPDATE') or has_table_privilege(c.oid, 'DELETE') or has_table_privilege(c.oid, 'TRUNCATE')))::int as writable,
            coalesce((select has_table_privilege(c.oid, 'SELECT') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'vault' and c.relname = 'decrypted_secrets'), false) as can_read_vault
       from pg_roles r where r.rolname = current_user`);
  const x = r[0];
  if (!x) throw new Error("the connection's role was not found");
  if (x.superuser) throw new Error("the database role is a superuser: use the SELECT-only role from scripts/live/test-account.sql");
  if (x.ro !== "on") throw new Error("default_transaction_read_only is not on for this connection");
  if (x.writable) throw new Error(`the database role can write ${x.writable} table(s): use the SELECT-only role`);
  if (x.can_read_vault) throw new Error("the database role can read Vault secrets: use the SELECT-only role");
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
// (POST), the password sign-in for the test account, a CORS preflight to agent-chat, GET reads of four named tables
// through PostgREST, the app page, and for this project only the Management API's function list and one count-only
// edge-log query; and the cloud runner's dispatch door with a wrong secret and an empty want (a refusal check).
// Anything else throws. A path with an escape (%), an empty segment (//), a dot segment or a backslash is refused before
// it is compared, so no spelling can reach another endpoint.
export const READ_TABLES = new Set(["career_outbox", "career_apply_jobs", "career_alert_prefs", "career_apply_wanted"]);
export interface FetchPolicy { base: string; appUrl?: string | null; ref?: string | null }
function rawPath(input: string): string {
  const m = /^[a-z]+:\/\/[^/?#]*([^?#]*)/i.exec(input);
  return m ? (m[1] || "/") : "";
}
export function guardedFetch(policy: FetchPolicy, inner: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = rawPath(href);
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const refuse = (why: string) => { throw new Error(`refused by the suite's HTTP guard: ${method} ${why}`); };
    const url = new URL(href);
    // One rule: the path as written must be plain and exactly the path the parser sees.
    if (!raw || /%|\/\/|\\|(^|\/)\.\.?(\/|$)/.test(raw) || url.pathname !== raw) refuse(`an unusual path (${raw.slice(0, 60)})`);
    const own = url.origin === new URL(policy.base).origin;
    const app = policy.appUrl ? new URL(policy.appUrl).origin === url.origin : false;
    let ok = false;
    if (method === "GET") {
      const mgmt = url.origin === "https://api.supabase.com" && !!policy.ref &&
        (url.pathname === `/v1/projects/${policy.ref}/functions` ||
          (url.pathname === `/v1/projects/${policy.ref}/analytics/endpoints/logs.all` && /^select count\(\*\) as inbound, countif\(/.test(url.searchParams.get("sql") ?? "")));
      const t = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      const read = own && !!t && READ_TABLES.has(t[1]);
      ok = read || (app && url.pathname === new URL(policy.appUrl!).pathname) || mgmt;
    } else if (method === "OPTIONS") ok = own && url.pathname === "/functions/v1/agent-chat";
    else if (method === "POST" && own) {
      ok = url.pathname === "/functions/v1/agent-chat" || url.pathname === "/functions/v1/trainee-telegram" ||
        (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") ||
        (url.pathname === "/functions/v1/career-cloud-runner/dispatch" && String(init?.body ?? "") === '{"want":0}' && /^wrong-/.test(String(new Headers(init?.headers).get("x-cloud-dispatch-secret") ?? "")));
    }
    if (!ok) refuse(`${url.origin}${url.pathname}`);
    return await inner(input, init);
  }) as typeof fetch;
}

// ------------------------------------------------------------------------------------------------ the chat guard
// The suite never approves, sends or applies. Words that could approve or send are refused ANYWHERE in a message; the
// only exception is the resume confirmation, said once, word for word, in a thread that has shown no card. An apply
// ask is refused unless it is one of the two probes below, neither of which names a real employer's posting.
export const APPROVING = /\b(?:yes|yeah|yep|yup|ok|okay|sure|approve\w*|go ahead|do it|send\w*|submit\w*|confirm\w*|lgtm|ship it|sounds good)\b/i;
export const APPLYING = /\bappl(?:y|ies|ying|ied|ication|ications)\b/i;
export const RESUME_CONFIRMATION = "yes, that's my resume";
export const APPLY_PROBES = new Set([
  "can you apply to jobs for me?", // the audit's Q3 phrasing, in a fresh thread with no postings listed
  "apply me to this: https://www.linkedin.com/jobs/view/trainee-live-verify-not-a-posting", // not a posting; LinkedIn is never applied to
]);
export class ChatGuard {
  private carded = new Set<string>();
  private confirmed = false;
  noteReply(threadId: string | null, body: any) {
    const meta = body?.meta ?? {};
    const shown = /\bapprov|\bcard\b|a yes sends|\bsend \d|say "send/i.test(String(body?.reply ?? "")) || !!meta.offer_card || !!meta.card || !!meta.apply_card;
    if (threadId && shown) this.carded.add(threadId);
  }
  check(threadId: string | null, message: string) {
    if (APPLYING.test(message) && !APPLY_PROBES.has(message)) throw new Error("refused by the suite's chat guard: an apply ask (the suite never queues an application)");
    if (APPROVING.test(message)) {
      if (message !== RESUME_CONFIRMATION) throw new Error("refused by the suite's chat guard: a word that could approve or send");
      if (this.confirmed) throw new Error("refused by the suite's chat guard: the resume confirmation was already said");
      if (threadId && this.carded.has(threadId)) throw new Error("refused by the suite's chat guard: a yes in a thread that has shown a card");
      this.confirmed = true;
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
