// Launch readiness B1 (2026-10-26): every migration that makes a SECURITY DEFINER function revokes EXECUTE on that
// exact function from PUBLIC and anon in the same file, and never grants it back (scripts/launch/definer-revoke-scan.cjs).
// Supabase grants EXECUTE on each new public function to anon by default, so a definer function without that revoke can
// be called with the anon key, which ships in the web page; that is how exec_vault_read came to decrypt Vault secrets
// for anyone on production. The authoritative guard is tests/db/definer_lockdown.test.sql on the real schema; this is
// the early, file-level warning.
// The findings below predate the rule. Each is covered at run time by 20261026230500_definer_execute_lockdown.sql and
// checked on the applied schema by tests/db/definer_lockdown.test.sql. The list may only shrink: a new file must carry
// its revoke. Most are CREATE OR REPLACE of a function an earlier file revoked (Postgres keeps the grants on replace);
// the last is the cloud runner's generated claim (dynamic SQL), whose result definer_lockdown.test.sql checks.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { scan, scanText, definersIn, argTypes, REVIEWED_MARKER } = require("../scripts/launch/definer-revoke-scan.cjs");

const GRANDFATHERED = fs.readFileSync(path.join(__dirname, "fixtures/definer-revoke-grandfathered.txt"), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const keyOf = (x) => `${x.file} ${x.key}`;
const findings = (sql) => scanText("fixture.sql", sql).map((x) => [x.key, x.why]);
const DEF = (name = "public.f", args = "p_user uuid") =>
  `create or replace function ${name}(${args}) returns void language plpgsql security definer set search_path = public as $$ begin end $$;\n`;

test("every migration that makes a SECURITY DEFINER function revokes it from public and anon in the same file", () => {
  const all = scan(path.join(__dirname, "../supabase/migrations")).map(keyOf);
  const fresh = all.filter((m) => !GRANDFATHERED.includes(m));
  assert.deepEqual(fresh, [], `add "revoke all on function <name>(<types>) from public, anon[, authenticated];" to: ${fresh.join("; ")}`);
  const fixed = GRANDFATHERED.filter((g) => !all.includes(g));
  assert.deepEqual(fixed, [], `these now pass in their file; take them off the grandfathered list: ${fixed.join("; ")}`);
  assert.equal(GRANDFATHERED.length, 37, "the list only shrinks");
});

test("the forms migrations use pass", () => {
  assert.deepEqual(findings(DEF() + "revoke all on function public.f(uuid) from public, anon, authenticated;"), []);
  assert.deepEqual(findings(DEF() + "revoke execute on function f(uuid) from public;\nrevoke execute on function f(uuid) from anon;"), [], "two revokes");
  assert.deepEqual(findings(DEF() + "revoke all on function public.f from public, anon;"), [], "no argument list: every overload, as in Postgres");
  assert.deepEqual(findings(DEF("public.f", "p_limit int default 5, out total bigint") + "revoke all on function public.f(integer) from public, anon;"), [],
    "int is integer; OUT parameters are not in the signature");
  assert.deepEqual(findings(DEF() + "grant execute on function public.f(uuid) to anon;\nrevoke all on function public.f(uuid) from public, anon;"), [],
    "a grant before the revoke is undone by it");
  assert.deepEqual(findings("create function y() returns int language sql security invoker as $$ select 1 $$;\n-- create function x() security definer"), []);
});

test("a revoke from public only, or none, fails", () => {
  assert.deepEqual(findings(DEF() + "revoke all on function public.f(uuid) from public;"), [["f(uuid)", "no revoke from public and anon"]]);
  assert.deepEqual(findings("create function f() returns int language sql as $$ select 1 $$ security definer;"), [["f()", "no revoke from public and anon"]],
    "definer after the body");
});

test("bypass 1: granting back to anon or PUBLIC after the revoke fails", () => {
  assert.deepEqual(findings(DEF() + "revoke all on function public.f(uuid) from public, anon;\ngrant execute on function public.f(uuid) to authenticated, anon;"),
    [["f(uuid)", "granted back to public or anon after the revoke"]]);
  assert.deepEqual(findings(DEF() + "revoke all on function public.f(uuid) from public, anon;\ngrant all on function public.f to public;"),
    [["f(uuid)", "granted back to public or anon after the revoke"]], "to PUBLIC, every overload");
  assert.deepEqual(findings(DEF() + "revoke all on function public.f(uuid) from public, anon;\ngrant execute on function public.f(uuid) to authenticated, service_role;"), [],
    "to signed-in people: fine");
});

test("bypass 2: ALTER FUNCTION ... SECURITY DEFINER is a definer function too", () => {
  const plain = "create function public.g(p text) returns text language sql security invoker as $$ select p $$;\n";
  assert.deepEqual(findings(plain + "alter function public.g(text) security definer;"), [["g(text)", "no revoke from public and anon"]]);
  assert.deepEqual(findings(plain + "alter function public.g(text) security definer;\nrevoke all on function public.g(text) from public, anon;"), []);
  assert.deepEqual(findings(plain + "alter function public.g(text) security invoker;"), [], "back to invoker is not a definer");
});

test("bypass 3: a revoke on a different overload does not cover the definer one", () => {
  assert.deepEqual(findings(DEF("public.f", "p_limit integer") + "revoke all on function public.f(integer, text) from public, anon;"),
    [["f(integer)", "no revoke from public and anon"]]);
  assert.deepEqual(findings(DEF("public.f", "p_limit integer, p_source text") + "revoke all on function public.f(integer, text) from public, anon;"), []);
  assert.equal(argTypes("p_now timestamptz, p_ok bool, p_n int4, p_s varchar(40)"), "timestamp with time zone,boolean,integer,character varying");
});

test("bypass 4: a quoted name, with spaces, is the same function only when spelled the same", () => {
  assert.deepEqual(definersIn(DEF('public."f g"', "")).map((d) => d.key), ["f g()"]);
  assert.deepEqual(findings(DEF('public."f g"', "") + 'revoke all on function public."f g"() from public, anon;'), []);
  assert.deepEqual(findings(DEF('public."f g"', "") + "revoke all on function public.f() from public, anon;"), [["f g()", "no revoke from public and anon"]], "f is not \"f g\"");
  assert.deepEqual(findings(DEF('"Mixed"', "") + "revoke all on function mixed() from public, anon;"), [["Mixed()", "no revoke from public and anon"]],
    "a quoted name keeps its case");
});

test("bypass 5: dynamic SQL that creates a function is refused unless the file says it was reviewed", () => {
  const dyn = "do $$ declare n text := 'leaky'; begin\n" +
    "  execute 'create function public.' || n || '() returns int language sql security definer as ''select 1''';\nend $$;\n";
  assert.deepEqual(findings(dyn), [["(dynamic)", "dynamic SQL creates or alters a function"]]);
  assert.deepEqual(findings("-- definer-scan: dynamic function DDL reviewed (it builds no definer function)\n" + dyn), []);
  assert.ok(REVIEWED_MARKER.test("-- definer-scan: dynamic function DDL reviewed"));
  assert.deepEqual(findings("do $$ begin execute format('revoke all on function %s from public, anon', 'public.f()'); end $$;"), [],
    "a dynamic revoke is not function DDL");
});

test("a new migration file with a definer function and only 'revoke ... from public' fails the scan of a directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "definer-scan-"));
  fs.writeFileSync(path.join(dir, "20991231000000_new.sql"), DEF("public.leaky", "p text") + "revoke all on function public.leaky(text) from public;\n");
  assert.deepEqual(scan(dir).map((x) => [x.file, x.key, x.has]), [["20991231000000_new.sql", "leaky(text)", ["public"]]]);
  fs.rmSync(dir, { recursive: true, force: true });
});
