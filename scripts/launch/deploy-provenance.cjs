#!/usr/bin/env node
"use strict";
// WO-093 deploy provenance: what exactly ships, computed from a `git archive <sha>` stage and never from a live checkout.
// scripts/launch/trainee-go-live.sh stages the commit, then asks this file for the provenance manifest (the sha, every
// function's entry and bundle sha256, every migration with its sha256 and live mark, the time and the tool versions),
// and later compares the deploy ledger and the live marks to it (--verify). No network, no secret: it reads files.
//
//   node deploy-provenance.cjs manifest --stage <dir> --sha <40 hex> --functions a,b --migrations <tsv> [--out <file>]
//                                       [--allow-absent]   (a listed migration the commit lacks is left out, for --verify)
//       <tsv>: one line per migration, "<kind>\t<file>\t<mark>" (kind earlier|trainee), in apply order.
//       Prints the manifest (JSON) and writes it to --out.
//   node deploy-provenance.cjs tsv --manifest <file> functions|migrations
//       functions:  "<name>\t<bundle_sha256>" per line;  migrations: "<file>\t<sha256>\t<mark>" per line.
//   node deploy-provenance.cjs sha256 <file>
//   node deploy-provenance.cjs platform-versions < `supabase functions list` output   -> "<slug>\t<version>" per line
//   node deploy-provenance.cjs compare --manifest <file> --ledger-functions <file> --ledger-migrations <file>
//                                      --marks <file> [--platform <file>]
//       ledger-functions:  "name|sha|bundle_sha256|deployed_at|platform_version" (the latest row per function)
//       ledger-migrations: "file|sha|sha256|deployed_at" (the latest row per migration file)
//       marks:             "file|t" or "file|f" (each manifest migration's mark read on the live schema)
//       platform:          "slug\tversion" (optional; `supabase functions list` now)
//       Prints one line per check and exits 1 on any MISMATCH.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const SHA_RE = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
// The same import rule scripts/career/stage-career.cjs stages agent-chat by (relative specs, static or a literal relative
// import("./x") that loads a module on demand (FEATURE 16: the vendored pdf.js), are files to walk;
// any other spec, npm:, jsr: or https:, is a remote import the platform resolves and is named in the bundle hash).
const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g;
// agent-chat ships its career entry (owner, 2026-10-15): index-career.ts staged as agent-chat/index.ts.
const ENTRY = { "agent-chat": { src: "agent-chat/index-career.ts", as: "agent-chat/index.ts" } };

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));

function importsOf(file) {
  const src = fs.readFileSync(file, "utf8");
  const local = [], remote = [];
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    if (spec.startsWith("./") || spec.startsWith("../")) local.push(spec); else remote.push(spec);
  }
  return { local, remote };
}

// One function's bundle as the deploy uploads it: the files of its static import graph under supabase/functions, keyed
// as staged, each with its sha256, and the remote specs it names. bundle_sha256 is the sha256 of that sorted listing, so
// it depends on the commit's files and nothing about the machine (minifying is a later, recorded tool step).
function functionBundle(stage, name) {
  const fnRoot = path.join(stage, "supabase", "functions");
  const e = ENTRY[name] || { src: `${name}/index.ts`, as: `${name}/index.ts` };
  const entryAbs = path.join(fnRoot, e.src);
  if (!fs.existsSync(entryAbs)) throw new Error(`${name}: entry ${e.src} is not in the staged commit`);
  const files = new Map();
  const remote = new Set();
  const queue = [[e.as, entryAbs]];
  while (queue.length) {
    const [key, abs] = queue.pop();
    if (files.has(key)) continue;
    if (!fs.existsSync(abs)) throw new Error(`${name}: ${key} is imported but not in the staged commit`);
    files.set(key, sha256File(abs));
    const { local, remote: r } = importsOf(abs);
    for (const spec of r) remote.add(spec);
    for (const spec of local) {
      const target = path.resolve(path.dirname(abs), spec);
      queue.push([path.relative(fnRoot, target).split(path.sep).join("/"), target]);
    }
  }
  const keys = [...files.keys()].sort();
  const listing = keys.map((k) => `${files.get(k)}  ${k}\n`).join("") + [...remote].sort().map((s) => `remote ${s}\n`).join("");
  return {
    name,
    entry: `supabase/functions/${e.src}`,
    staged_as: `supabase/functions/${e.as}`,
    entry_sha256: files.get(e.as),
    bundle_sha256: sha256(listing),
    files: keys.length,
    remote_imports: [...remote].sort(),
    file_sha256: Object.fromEntries(keys.map((k) => [k, files.get(k)])),
  };
}

function readMigrationList(tsv) {
  return fs.readFileSync(tsv, "utf8").split("\n").filter(Boolean).map((line) => {
    const [kind, file, ...mark] = line.split("\t");
    if (!/^(earlier|trainee)$/.test(kind) || !/^[0-9][0-9_a-z]*\.sql$/.test(file || "") || !mark.length) throw new Error(`bad migration line: ${line}`);
    return { kind, file, mark: mark.join("\t") };
  });
}

function toolVersion(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }).split("\n")[0].trim() || "unknown"; }
  catch { return "missing"; }
}
function toolVersions() {
  return {
    node: process.version,
    git: toolVersion("git", ["--version"]),
    deno: toolVersion("deno", ["--version"]),
    supabase: toolVersion("supabase", ["--version"]),
    psql: toolVersion("psql", ["--version"]),
    python3: toolVersion("python3", ["--version"]),
  };
}

// The manifest. `functions` and `migrations` depend only on the commit (the same sha gives the same hashes anywhere);
// created_at and tools say when and with what it was made.
// allowAbsent (--verify of an older commit from a newer checkout): a listed migration the commit does not have is left
// out of its manifest instead of stopping it.
function buildManifest({ stage, sha, functions, migrations, now = new Date(), tools = toolVersions(), allowAbsent = false }) {
  if (!SHA_RE.test(sha)) throw new Error("sha must be the full 40-character commit");
  const fns = functions.map((f) => functionBundle(stage, f));
  const migs = [];
  for (const m of migrations) {
    const abs = path.join(stage, "supabase", "migrations", m.file);
    if (!fs.existsSync(abs) && allowAbsent) continue;
    if (!fs.existsSync(abs)) throw new Error(`migration ${m.file} is listed but not in the staged commit`);
    migs.push({ file: m.file, kind: m.kind, sha256: sha256File(abs), mark: m.mark });
  }
  return { manifest_version: 1, sha, staged_from: `git archive ${sha}`, created_at: now.toISOString(), tools, functions: fns, migrations: migs };
}
// What two manifests of the same commit must agree on.
function stablePart(m) { return { sha: m.sha, functions: m.functions, migrations: m.migrations }; }

// `supabase functions list` prints a table; the columns are found by their header names (SLUG or NAME, VERSION).
function parsePlatformVersions(text) {
  const rows = text.split("\n").filter((l) => l.includes("|")).map((l) => l.split("|").map((c) => c.trim()));
  const header = rows.findIndex((r) => r.some((c) => /^version$/i.test(c)));
  if (header < 0) return null;
  const h = rows[header].map((c) => c.toUpperCase());
  const vi = h.indexOf("VERSION"), si = h.indexOf("SLUG") >= 0 ? h.indexOf("SLUG") : h.indexOf("NAME");
  if (vi < 0 || si < 0) return null;
  const out = new Map();
  for (const r of rows.slice(header + 1)) {
    const slug = r[si], v = Number(r[vi]);
    if (slug && /^[a-z0-9][a-z0-9_-]*$/.test(slug) && Number.isInteger(v) && v > 0) out.set(slug, v);
  }
  return out;
}

const rowsOf = (text, sep = "|") => text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(sep));

// Compare the live record to the manifest. Every function's latest ledger row must be this sha with this bundle; every
// migration's mark must read true live and its latest ledger row must carry this file's sha256; a platform version
// newer than the ledger's is a deploy no ledger row explains.
function compare({ manifest, ledgerFunctions, ledgerMigrations, marks, platform }) {
  const lines = [], mismatches = [];
  const bad = (s) => { mismatches.push(s); lines.push(`MISMATCH ${s}`); };
  const okLine = (s) => lines.push(`OK       ${s}`);
  const lf = new Map(rowsOf(ledgerFunctions).map(([name, sha, bundle, at, ver]) => [name, { sha, bundle, at, ver: ver ? Number(ver) : null }]));
  const lm = new Map(rowsOf(ledgerMigrations).map(([file, sha, sum, at]) => [file, { sha, sum, at }]));
  const mk = new Map(rowsOf(marks).map(([file, v]) => [file, v]));
  for (const f of manifest.functions) {
    const row = lf.get(f.name);
    if (!row) { bad(`function ${f.name}: no deploy ledger row (deployed outside go-live, or never)`); continue; }
    if (row.sha !== manifest.sha) bad(`function ${f.name}: live is ${row.sha} (deployed ${row.at}), not ${manifest.sha}`);
    else if (row.bundle !== f.bundle_sha256) bad(`function ${f.name}: ledger bundle ${row.bundle} != manifest bundle ${f.bundle_sha256}`);
    else okLine(`function ${f.name}: ${manifest.sha.slice(0, 12)} bundle ${f.bundle_sha256.slice(0, 12)} (deployed ${row.at})`);
    if (platform && row.sha === manifest.sha) {
      const live = platform.get(f.name);
      if (live == null) bad(`function ${f.name}: not in the platform's function list`);
      else if (row.ver != null && live !== row.ver) bad(`function ${f.name}: the platform runs version ${live}, the ledger recorded ${row.ver} (a deploy no ledger row explains)`);
    }
  }
  for (const m of manifest.migrations) {
    const v = mk.get(m.file);
    if (v !== "t") bad(`migration ${m.file}: its mark is ${v === "f" ? "false" : "not read"} on the live schema (${m.mark})`);
    const row = lm.get(m.file);
    if (!row) bad(`migration ${m.file}: no deploy ledger row`);
    else if (row.sum !== m.sha256) bad(`migration ${m.file}: ledger sha256 ${row.sum} (from ${row.sha.slice(0, 12)}) != this commit's ${m.sha256}`);
    if (v === "t" && row && row.sum === m.sha256) okLine(`migration ${m.file}`);
  }
  if (!platform) lines.push("WARN     the platform's function versions were not read (supabase functions list); the ledger and the marks were compared");
  lines.push(mismatches.length ? `VERIFY FAILED: ${mismatches.length} mismatch(es) against ${manifest.sha}` : `VERIFIED: the live project matches ${manifest.sha}`);
  return { ok: mismatches.length === 0, mismatches, lines };
}

function arg(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function need(args, name) { const v = arg(args, name); if (!v) { console.error(`missing ${name}`); process.exit(64); } return v; }

function main(argv) {
  const [cmd, ...args] = argv;
  if (cmd === "manifest") {
    const m = buildManifest({ stage: need(args, "--stage"), sha: need(args, "--sha"), functions: need(args, "--functions").split(",").filter(Boolean),
      migrations: readMigrationList(need(args, "--migrations")), allowAbsent: args.includes("--allow-absent") });
    const text = JSON.stringify(m, null, 2) + "\n";
    const out = arg(args, "--out");
    if (out) fs.writeFileSync(out, text);
    process.stdout.write(text);
    return 0;
  }
  if (cmd === "tsv") {
    const m = JSON.parse(fs.readFileSync(need(args, "--manifest"), "utf8"));
    const what = args[args.length - 1];
    if (what === "functions") for (const f of m.functions) console.log(`${f.name}\t${f.bundle_sha256}`);
    else if (what === "migrations") for (const x of m.migrations) console.log(`${x.file}\t${x.sha256}\t${x.mark}`);
    else { console.error("tsv: functions or migrations"); return 64; }
    return 0;
  }
  if (cmd === "sha256") { console.log(sha256File(args[0])); return 0; }
  if (cmd === "platform-versions") {
    const v = parsePlatformVersions(fs.readFileSync(0, "utf8"));
    if (!v) return 3;
    for (const [s, n] of v) console.log(`${s}\t${n}`);
    return 0;
  }
  if (cmd === "compare") {
    const manifest = JSON.parse(fs.readFileSync(need(args, "--manifest"), "utf8"));
    const p = arg(args, "--platform");
    const platform = p && fs.existsSync(p) && fs.statSync(p).size ? new Map(rowsOf(fs.readFileSync(p, "utf8"), "\t").map(([s, n]) => [s, Number(n)])) : null;
    const r = compare({ manifest, ledgerFunctions: fs.readFileSync(need(args, "--ledger-functions"), "utf8"),
      ledgerMigrations: fs.readFileSync(need(args, "--ledger-migrations"), "utf8"), marks: fs.readFileSync(need(args, "--marks"), "utf8"), platform });
    for (const l of r.lines) console.log(l);
    return r.ok ? 0 : 1;
  }
  console.error("usage: deploy-provenance.cjs manifest|tsv|sha256|platform-versions|compare (see the header)");
  return 64;
}

module.exports = { buildManifest, stablePart, functionBundle, compare, parsePlatformVersions, readMigrationList, HEX64, SHA_RE };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`deploy-provenance: ${e.message}`); process.exitCode = 1; }
}
