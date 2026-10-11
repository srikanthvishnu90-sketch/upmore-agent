#!/usr/bin/env node
// Dataset validator and privacy lint (Instinct spec doc 12).
//   node evals/data/validate.cjs            validate every set under evals/data
//   node evals/data/validate.cjs --json     machine-readable summary
// Every set has a schema in evals/data/schemas/<set>.json (a small subset of
// JSON Schema: type, required, properties, items, enum, minItems, minimum,
// maximum, pattern). The privacy lint rejects anything shaped like a real
// account, routing or card number anywhere in a dataset; synthetic fixtures
// must use obviously fake identifiers.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const dataDir = __dirname;
const schemasDir = path.join(dataDir, "schemas");

// 9-digit ABA routing numbers pass a checksum; 8-17 digit runs are account-shaped; 13-19 digit Luhn-valid runs are card-shaped.
function routingValid(d) { const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]; return d.length === 9 && d.split("").reduce((s, c, i) => s + Number(c) * w[i], 0) % 10 === 0; }
function luhnValid(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = Number(d[i]); if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
const ALLOWED_DIGIT_RUNS = /^(0+|1234567890|9{8,}|0{8,}|12345678\d*|20\d{6}|19\d{6})$/; // fake-looking or date-like runs
function privacyFindings(text, where) {
  const out = [];
  for (const m of String(text).matchAll(/\d[\d -]{7,22}\d/g)) {
    const digits = m[0].replace(/[ -]/g, "");
    if (digits.length < 8 || ALLOWED_DIGIT_RUNS.test(digits)) continue;
    if (digits.length === 9 && routingValid(digits)) out.push({ where, rule: "routing_number_shaped", match: m[0] });
    else if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) out.push({ where, rule: "card_number_shaped", match: m[0] });
    else if (digits.length >= 10 && digits.length <= 17 && !/[-]/.test(m[0]) && !/^(1[0-9]{9}|[2-9]\d{9})$/.test(digits)) out.push({ where, rule: "account_number_shaped", match: m[0] });
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) out.push({ where, rule: "ssn_shaped", match: String(text).match(/\b\d{3}-\d{2}-\d{4}\b/)[0] });
  return out;
}

function check(schema, value, at, errors) {
  const t = schema.type;
  const typeOf = v => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
  if (t && typeOf(value) !== t && !(t === "integer" && Number.isInteger(value))) { errors.push(`${at}: expected ${t}, got ${typeOf(value)}`); return; }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  if (typeof value === "number") { if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`); if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`); }
  if (t === "array") { if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} items, has ${value.length}`); if (schema.items) value.forEach((v, i) => check(schema.items, v, `${at}[${i}]`, errors)); }
  if (t === "object") {
    for (const k of schema.required || []) if (value[k] === undefined) errors.push(`${at}: missing ${k}`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (value[k] !== undefined) check(s, value[k], `${at}.${k}`, errors);
  }
}

function validateSet(name) {
  const schema = JSON.parse(fs.readFileSync(path.join(schemasDir, name + ".json"), "utf8"));
  const file = path.join(dataDir, schema.file);
  const result = { set: name, file: schema.file, errors: [], privacy: [], count: 0 };
  if (!fs.existsSync(file)) { result.errors.push(`${schema.file} missing`); return result; }
  const raw = fs.readFileSync(file, "utf8");
  let data; try { data = JSON.parse(raw); } catch (e) { result.errors.push(`${schema.file}: invalid JSON (${e.message})`); return result; }
  check(schema.schema, data, name, result.errors);
  result.privacy = privacyFindings(raw, schema.file);
  const rows = schema.count_path ? schema.count_path.split(".").reduce((v, k) => v && v[k], data) : data;
  result.count = Array.isArray(rows) ? rows.length : Object.keys(rows || {}).length;
  if (schema.min_count && result.count < schema.min_count) result.errors.push(`${name}: ${result.count} rows, needs ${schema.min_count}`);
  if (schema.unique_key && Array.isArray(rows)) { const seen = new Set(); for (const r of rows) { const k = r[schema.unique_key]; if (seen.has(k)) result.errors.push(`${name}: duplicate ${schema.unique_key} ${k}`); seen.add(k); } }
  return result;
}

function validateAll() {
  const sets = fs.readdirSync(schemasDir).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort();
  const results = sets.map(validateSet);
  // The privacy lint also sweeps every file under evals/, not only the schema-backed sets.
  const sweep = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(json|md|cjs|js|txt|csv)$/.test(f)) sweep.push(...privacyFindings(fs.readFileSync(p, "utf8"), path.relative(root, p))); } })(path.join(root, "evals"));
  return { results, sweep, ok: results.every(r => !r.errors.length && !r.privacy.length) && !sweep.length };
}

if (require.main === module) {
  const out = validateAll();
  if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
  else {
    for (const r of out.results) console.log(`${r.errors.length || r.privacy.length ? "FAIL" : "ok  "} ${r.set.padEnd(22)} ${String(r.count).padStart(6)} rows  ${r.file}${r.errors.map(e => "\n       " + e).join("")}${r.privacy.map(p => "\n       privacy: " + p.rule + " " + p.match).join("")}`);
    for (const p of out.sweep) console.log(`FAIL privacy sweep ${p.where}: ${p.rule} ${p.match}`);
    console.log(out.ok ? "datasets valid" : "datasets INVALID");
  }
  process.exit(out.ok ? 0 : 1);
}
module.exports = { validateAll, validateSet, privacyFindings, check };
