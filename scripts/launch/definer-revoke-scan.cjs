// Static check (launch readiness B1, 2026-10-26): every migration that makes a SECURITY DEFINER function must, in the
// same file, revoke EXECUTE on that exact function (name and argument types) from both PUBLIC and anon, and must not
// grant it back to either afterwards. Supabase grants EXECUTE on every new public function to anon, authenticated and
// service_role through default privileges, so "revoke ... from public" alone leaves anon able to call it over
// /rest/v1/rpc; the grant must be taken from anon by name.
//
// THE AUTHORITATIVE GUARD IS tests/db/definer_lockdown.test.sql, run by tests/db/run.sh against the schema every
// migration actually builds (run.sh applies every migration that declares a definer function, and checks that each one
// it declares exists there): it fails on any SECURITY DEFINER function in public that anon can execute, however it got
// there. This scan is an early, file-level warning and reads SQL with regular expressions, not a parser. Anything that
// needs real parsing is the DB guard's, not this scan's: a revoke or grant inside a function body that may never run,
// conditional or computed DDL, privileges changed by a role's default privileges at apply time, ownership changes.
// Before matching, /* */ and -- comments are removed and every string literal ('...' and $tag$...$tag$, which includes
// function bodies and DO blocks) is emptied, so text inside them is never read as a statement. What it covers:
//   - CREATE [OR REPLACE] FUNCTION|PROCEDURE ... SECURITY DEFINER (before or after the body) and
//     ALTER FUNCTION|PROCEDURE ... SECURITY DEFINER;
//   - names quoted or not, schema-qualified or not, quoted names with spaces;
//   - the revoke must name the same overload (argument types compared after normalizing names, defaults, modes and the
//     common type aliases); a revoke with no argument list covers every overload of the name, as in Postgres;
//   - a GRANT of EXECUTE (or ALL) to PUBLIC or anon after the last revoke undoes it; role names quoted or not
//     ("anon" is anon), GRANTED BY and WITH GRANT OPTION read past;
//   - GRANT ... ON ALL FUNCTIONS|PROCEDURES|ROUTINES IN SCHEMA, and ALTER DEFAULT PRIVILEGES ... GRANT ... ON
//     FUNCTIONS|ROUTINES, to PUBLIC or anon is refused outright;
//   - dynamic SQL that creates or alters a function (EXECUTE of a string that holds CREATE/ALTER FUNCTION, as in a DO
//     block or a generator function) cannot be read here, so the file is refused unless it carries the marker
//     "-- definer-scan: dynamic function DDL reviewed" stating someone checked what it builds.
// Used by tests/career-definer-revoke.test.cjs.
"use strict";
const fs = require("fs");
const path = require("path");

const REVIEWED_MARKER = /--\s*definer-scan:\s*dynamic function DDL reviewed\b/i;
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
// Comments out, and every string literal emptied (its quotes kept, so a body's position and end stay readable).
function stripLiterals(sql) {
  return stripComments(sql).replace(/'(?:[^']|'')*'|(\$[a-z_0-9]*\$)[\s\S]*?\1/gi, (m, tag) => tag ? `${tag}${tag}` : "''");
}
// A function name: optional schema, each part an identifier or a "quoted identifier" (which may hold spaces).
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`(${IDENT}(?:\s*\.\s*${IDENT})?)`;
const unquote = (part) => part.startsWith('"') ? part.slice(1, -1).replace(/""/g, '"') : part.toLowerCase();
function bare(qname) {
  const parts = qname.match(new RegExp(IDENT, "g")) || [];
  const last = parts[parts.length - 1] || "";
  const schema = parts.length > 1 ? unquote(parts[0]) : "public";
  return schema === "public" ? unquote(last) : `${schema}.${unquote(last)}`;
}

const ALIASES = {
  int: "integer", int4: "integer", int2: "smallint", int8: "bigint", bool: "boolean", float8: "double precision",
  float4: "real", varchar: "character varying", "char": "character", timestamptz: "timestamp with time zone",
  timestamp: "timestamp without time zone", timetz: "time with time zone", decimal: "numeric",
};
// The argument list between the outer parentheses, starting at an index that holds "(".
function parenBody(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") { depth--; if (depth === 0) return { body: s.slice(open + 1, i), end: i + 1 }; }
  }
  return { body: s.slice(open + 1), end: s.length };
}
function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
// Argument types of a signature, as Postgres identifies an overload: OUT parameters dropped, names and defaults dropped.
// fromDefinition: the list carries parameter names ("p_user uuid default null"); a revoke's list may or may not.
function argTypes(list) {
  return splitTop(list).map((a) => {
    let t = a.replace(/\s+(default\b|=)[\s\S]*$/i, "").trim().toLowerCase().replace(/\s+/g, " ");
    const mode = /^(in|out|inout|variadic)\s+/.exec(t);
    if (mode) { if (mode[1] === "out") return null; t = t.slice(mode[0].length); }
    const words = t.split(" ");
    // "p_user uuid" -> "uuid"; a lone type stays; "double precision" / "character varying" / "timestamp with time zone" stay.
    const known = /^(double|character|timestamp|time|bit|interval)$/;
    if (words.length > 1 && !known.test(words[0]) && !/[\[(]/.test(words[0])) words.shift();
    t = words.join(" ").replace(/^public\./, "").replace(/\(\s*\d+(\s*,\s*\d+)?\s*\)/g, "");
    return ALIASES[t] || t;
  }).filter((t) => t !== null && t !== "").join(",");
}

// Every SECURITY DEFINER function the file makes: { key: "name(types)", name, at }.
function definersIn(sql) {
  const out = [];
  const create = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+${QNAME}\s*\(`, "gi");
  let m;
  while ((m = create.exec(sql))) {
    const open = m.index + m[0].length - 1;
    const { body: args, end } = parenBody(sql, open);
    const rest = sql.slice(end);
    const bodyAt = rest.search(/\bas\s+(\$[a-z_0-9]*\$|')/i);
    const header = bodyAt < 0 ? rest.slice(0, 2000) : rest.slice(0, bodyAt);
    let after = "";
    if (bodyAt >= 0) {
      const tag = rest.slice(bodyAt).match(/\bas\s+(\$[a-z_0-9]*\$|')/i)[1];
      const start = bodyAt + rest.slice(bodyAt).indexOf(tag) + tag.length;
      const close = rest.indexOf(tag, start);
      after = close < 0 ? "" : rest.slice(close + tag.length, close + tag.length + 400).split(";")[0];
    }
    if (/\bsecurity\s+definer\b/i.test(header) || /\bsecurity\s+definer\b/i.test(after)) {
      out.push({ name: bare(m[1]), key: `${bare(m[1])}(${argTypes(args)})`, at: m.index });
    }
  }
  const alter = new RegExp(String.raw`alter\s+(?:function|procedure)\s+${QNAME}\s*(\()?`, "gi");
  while ((m = alter.exec(sql))) {
    let args = null, end = m.index + m[0].length;
    if (m[2]) { const p = parenBody(sql, end - 1); args = p.body; end = p.end; }
    const stmt = sql.slice(end).split(";")[0];
    if (/\bsecurity\s+definer\b/i.test(stmt)) out.push({ name: bare(m[1]), key: args === null ? `${bare(m[1])}(*)` : `${bare(m[1])}(${argTypes(args)})`, at: m.index });
  }
  const seen = new Set();
  return out.filter((d) => !seen.has(d.key) && seen.add(d.key));
}

// Each REVOKE / GRANT on functions, in file order: { kind, name, key (null: every overload), roles, at }.
function privilegeStatements(sql) {
  const out = [];
  const re = /\b(revoke|grant)\s+([^;]*?)\bon\s+(?:function|functions|procedure|procedures|routine|routines)\s+(?!all\s)([\s\S]*?)\s+(from|to)\s+([^;]+);/gi;
  let m;
  while ((m = re.exec(sql))) {
    const kind = m[1].toLowerCase();
    const what = m[2].toLowerCase();
    if (kind === "grant" && !/\b(execute|all)\b/.test(what)) continue;
    const roles = rolesOf(m[5]);
    for (const item of splitTop(m[3])) {
      const nm = new RegExp(String.raw`^\s*${QNAME}\s*(\()?`).exec(item);
      if (!nm) continue;
      let key = null;
      if (nm[2]) { const p = parenBody(item, nm[0].length - 1); key = `${bare(nm[1])}(${argTypes(p.body)})`; }
      out.push({ kind, name: bare(nm[1]), key, roles, at: m.index });
    }
  }
  return out;
}
// The roles of a GRANT/REVOKE: GRANTED BY, WITH GRANT OPTION, CASCADE/RESTRICT and GROUP read past; a quoted name is the
// role spelled exactly ("anon" is anon), an unquoted one is folded to lower case, as Postgres does.
function rolesOf(list) {
  const cut = list.replace(/\s+granted\s+by\s+[\s\S]*$/i, "").replace(/\s+with\s+grant\s+option\b/i, "").replace(/\s+(cascade|restrict)\s*$/i, "");
  return splitTop(cut).map((r) => r.trim().replace(/^group\s+/i, "")).filter(Boolean)
    .map((r) => r.startsWith('"') ? r.slice(1, -1).replace(/""/g, '"') : r.toLowerCase());
}
// GRANT ... ON ALL FUNCTIONS IN SCHEMA ... TO PUBLIC/anon, or default privileges that grant functions to them.
function schemaWideGrants(sql) {
  const out = [];
  const all = /\bgrant\s+([^;]*?)\bon\s+all\s+(?:functions|procedures|routines)\s+in\s+schema\s+[^;]*?\s+to\s+([^;]+);/gi;
  const defaults = /\balter\s+default\s+privileges\b[^;]*?\bgrant\s+([^;]*?)\bon\s+(?:functions|routines)\s+to\s+([^;]+);/gi;
  for (const re of [all, defaults]) {
    let m;
    while ((m = re.exec(sql))) {
      if (!/\b(execute|all)\b/i.test(m[1])) continue;
      if (rolesOf(m[2]).some((r) => r === "public" || r === "anon")) out.push(m[0].replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return out;
}
const covers = (stmt, d) => stmt.name === d.name && (stmt.key === null || stmt.key === d.key || d.key.endsWith("(*)"));

// Back-compat for callers: name -> roles revoked (any overload).
function revokedIn(sql) {
  const from = new Map();
  for (const s of privilegeStatements(sql)) {
    if (s.kind !== "revoke") continue;
    const set = from.get(s.name) || new Set();
    for (const r of s.roles) set.add(r);
    from.set(s.name, set);
  }
  return from;
}

// Dynamic function DDL: CREATE/ALTER FUNCTION|PROCEDURE text inside a string literal (any quoting: '...', $tag$...$tag$,
// nested in a body or a DO block), in a file that EXECUTEs something. Found by counting the DDL keywords with comments
// removed and again with literals emptied: any the second count misses were inside a string.
function dynamicFunctionDdl(raw) {
  const ddl = /\b(create\s+(or\s+replace\s+)?|alter\s+)(function|procedure)\b/gi;
  const count = (t) => (t.match(ddl) || []).length;
  const commentsOut = stripComments(raw);
  // An EXECUTE that runs SQL: not "grant/revoke execute", not a trigger's "execute function|procedure".
  const runs = commentsOut.replace(/\b(grant|revoke)\s+execute\b/gi, " ").replace(/\bexecute\s+(function|procedure)\b/gi, " ");
  return count(commentsOut) > count(stripLiterals(raw)) && /\bexecute\b/i.test(runs);
}

function scanText(file, raw) {
  const findings = [];
  const sql = stripLiterals(raw);
  const stmts = privilegeStatements(sql);
  for (const d of definersIn(sql)) {
    const revokes = stmts.filter((s) => s.kind === "revoke" && covers(s, d));
    const roles = new Set(revokes.flatMap((s) => s.roles));
    const lastRevoke = revokes.reduce((a, s) => Math.max(a, s.at), -1);
    const regrant = stmts.find((s) => s.kind === "grant" && covers(s, d) && s.at > lastRevoke && s.roles.some((r) => r === "public" || r === "anon"));
    if (!roles.has("public") || !roles.has("anon")) findings.push({ file, fn: d.name, key: d.key, why: "no revoke from public and anon", has: [...roles].sort() });
    else if (regrant) findings.push({ file, fn: d.name, key: d.key, why: "granted back to public or anon after the revoke", has: [...roles].sort() });
  }
  for (const g of schemaWideGrants(sql)) findings.push({ file, fn: "(schema-wide grant)", key: "(schema-wide grant)", why: `grants every function to public or anon: ${g}`, has: [] });
  if (dynamicFunctionDdl(raw) && !REVIEWED_MARKER.test(raw)) findings.push({ file, fn: "(dynamic)", key: "(dynamic)", why: "dynamic SQL creates or alters a function", has: [] });
  return findings;
}

function scan(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return files.flatMap((f) => scanText(f, fs.readFileSync(path.join(dir, f), "utf8")));
}

// Every definer function each file declares, for tests/db/run.sh's check that the suite built them all:
// "file<TAB>schema<TAB>name<TAB>types" ("*" types: an ALTER with no argument list).
function definerKeys(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const d of definersIn(stripLiterals(fs.readFileSync(path.join(dir, f), "utf8")))) {
      const i = d.key.lastIndexOf("("), name = d.key.slice(0, i), types = d.key.slice(i + 1, -1);
      const [schema, fn] = name.includes(".") ? name.split(".") : ["public", name];
      out.push([f, schema, fn, types]);
    }
  }
  return out;
}

module.exports = { scan, scanText, definersIn, revokedIn, privilegeStatements, argTypes, dynamicFunctionDdl, schemaWideGrants, rolesOf, stripLiterals, definerKeys, REVIEWED_MARKER };
if (require.main === module && process.argv[2] === "--definer-keys") {
  for (const k of definerKeys(process.argv[3] || path.join(__dirname, "../../supabase/migrations"))) console.log(k.join("\t"));
} else if (require.main === module) {
  const miss = scan(process.argv[2] || path.join(__dirname, "../../supabase/migrations"));
  for (const x of miss) console.log(`${x.file}\t${x.key}\t${x.why}\t${x.has.join(",") || "-"}`);
  console.log(`${miss.length} findings`);
}
