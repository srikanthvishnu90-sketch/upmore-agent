#!/usr/bin/env node
// The owner's two feature teardowns (2026-10-11), every feature row as its own spec item.
//   docs/teardowns/teardown-1-investing-copy-trading.md      dub, Alinea, Autopilot, Origin, Albert
//   docs/teardowns/teardown-2-budgeting-money-management.md  Rocket Money, Monarch, Copilot Money, YNAB, Cleo
// Each row of a "Feature | What it does | Plan | Upmore" table gets a stable id (T1-DUB-001), its app, section, words,
// plan and permission tags ([Read] looks, [Ask] acts after one approval, [Rule] repeats an approved action, [Flag]
// regulated: a licensed partner or a lawyer first), and the gates Upmore's standing rules (CLAUDE.md) put on it. A gated
// row is never built past its gate. The doc's own "At a glance" counts are checked against the parse, so a dropped or
// doubled row fails the build.
// Writes docs/teardowns/features.json and docs/teardowns/README.md; --check fails when either is stale.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/teardowns");
const DOCS = [
  { n: 1, file: "teardown-1-investing-copy-trading.md", title: "Investing and Copy Trading" },
  { n: 2, file: "teardown-2-budgeting-money-management.md", title: "Budgeting and Money Management" },
];
const APP_CODE = { "dub": "DUB", "Alinea": "ALINEA", "Autopilot": "AUTOPILOT", "Origin": "ORIGIN", "Albert": "ALBERT",
  "Rocket Money": "ROCKET", "Monarch": "MONARCH", "Copilot Money": "COPILOT", "YNAB": "YNAB", "Cleo": "CLEO" };
const NOT_FEATURES = /^checked and not found$/i; // the doc says these rows are not features

const cryptoItself = r => /\b(crypto|coinbase|bitcoin|ethereum|xpub)\b|^add token$/i.test(r.feature) || /\b(crypto (address|exchange)|ethereum address|bitcoin address)/i.test(r.what);
// Standing rules (CLAUDE.md) a row runs into, from its own words and tags. Order is the order shown.
const GATES = [
  { code: "flag", rule: "regulated: a licensed partner or a lawyer first, and the owner decides", hard: true,
    test: r => r.tags.includes("Flag") },
  { code: "decision_2", rule: "prediction markets stay off (decision 2)", hard: true,
    test: r => /\b(prediction market|event contract|kalshi|polymarket)/i.test(r.text) },
  // Crypto as the feature itself (a crypto connection, address, token or exchange) is off. Crypto named only as one of
  // several things a feature covers is a soft gate: the feature is built without its crypto part. "No crypto" is neither.
  { code: "decision_3", rule: "crypto stays off (decision 3)", hard: true,
    test: r => cryptoItself(r) },
  { code: "crypto_part_off", rule: "built without its crypto part (decision 3)", hard: false,
    test: r => /\b(crypto|bitcoin|ethereum)/i.test(r.what) && !/\b(no|not|cannot|can't|without)\b[^.]{0,40}\bcrypto/i.test(r.what)
      && !(cryptoItself(r)) },
  { code: "identity_digits", rule: "never store identity digits (SSN, tax id)", hard: true,
    test: r => /\b(SSN|social security number|taxpayer id|ITIN|tax id(entification)? number)\b/i.test(r.text) },
  { code: "phone_calls", rule: "no phone calls", hard: true,
    test: r => /\b(phone calls?|calls? (the |your )?(provider|company|companies|merchant|biller|bank)|negotiators? call)/i.test(r.text) },
  { code: "lending", rule: "lending and advances are not in Upmore's plan", hard: true,
    // Lending to the person, not tracking a loan they already have ("Loan accounts ... track balances" is not lending).
    test: r => /\b(cash advances?|instant advance|payday loan|overdraft cover|line of credit|albert loans|repay)\b/i.test(r.text) && !/\btrack balances|count toward the plan\b/i.test(r.what) },
  { code: "per_run_yes", rule: "automation is a per-person toggle; every run still asks a one-line yes and stays under the $5 cap", hard: false,
    // Money that moves or orders that run on a schedule, not bookkeeping rules ("transfers are marked as internal").
    test: r => r.tags.includes("Rule") && /\b(invest(s|ing|ments)?|buys?|sells?|trades?|copies|copying|auto-copy|mirrors?|rebalanc\w*|deposits?|sweeps?|round[- ]?ups?|moves? (money|cash|funds|small)|transfers? (money|cash|funds)|automatic transfers|saves? automatically)\b/i.test(r.text)
      && !/\b(marked as|detect|matching|approving one side|close-out|holdings update|price refresh)/i.test(r.text) },
];
// Hand corrections, each with its reason and the feature name it was written for (a renumbered row fails the build).
const OVERRIDES = {
  "T1-DUB-005": { feature: "Eligibility rules", drop: ["identity_digits"], why: "states dub's own eligibility; Upmore collects no identity number for it" },
  "T2-ROCKET-125": { feature: "Multi-Factor Authentication", drop: ["phone_calls"], why: "a sign-in code sent to the person by call is not Upmore placing a call" },
};

function parse(doc) {
  const lines = fs.readFileSync(path.join(DIR, doc.file), "utf8").split("\n");
  const rows = [], glance = {};
  let app = null, section = null, header = null, inGlance = false;
  for (const line of lines) {
    let m;
    if ((m = /^## (.+)$/.exec(line))) { app = APP_CODE[m[1].trim()] ? m[1].trim() : null; section = null; header = null; inGlance = false; continue; }
    if ((m = /^### (.+)$/.exec(line))) { section = m[1].trim(); header = null; inGlance = section === "At a glance"; continue; }
    if (!line.startsWith("|")) { header = null; continue; }
    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (/^-+$/.test(cells[0])) continue;
    if (!header) { header = cells; continue; }
    if (inGlance && header[0] === "App" && header[1] === "Features listed") { glance[cells[0]] = cells[1]; continue; }
    if (!app || header.join("|") !== "Feature|What it does|Plan|Upmore") continue;
    const tags = (cells[3].match(/\[(Read|Ask|Rule|Flag)\]/g) || []).map(t => t.slice(1, -1));
    rows.push({ teardown: doc.n, app, section, feature: cells[0], what: cells[1], plan: cells[2], tags,
      not_a_feature: NOT_FEATURES.test(section) });
  }
  return { rows, glance };
}

function build() {
  const all = [], counts = {}, problems = [];
  for (const doc of DOCS) {
    const { rows, glance } = parse(doc);
    const seq = {};
    for (const r of rows) {
      const code = APP_CODE[r.app];
      seq[code] = (seq[code] || 0) + 1;
      r.id = `T${doc.n}-${code}-${String(seq[code]).padStart(3, "0")}`;
      r.text = `${r.feature} ${r.what}`;
      r.gates = GATES.filter(g => g.test(r)).map(g => g.code);
      const o = OVERRIDES[r.id];
      if (o) {
        if (o.feature !== r.feature) problems.push(`override ${r.id} was written for "${o.feature}", the row is "${r.feature}"`);
        else { r.gates = r.gates.filter(c => !o.drop.includes(c)); r.override = o.why; }
      }
      r.hard_gated = r.gates.some(c => GATES.find(g => g.code === c).hard);
      if (!r.tags.length) problems.push(`${r.id} ${r.feature}: no permission tag`);
      delete r.text;
      all.push(r);
    }
    // The doc's own count per app, against the parse ("85, including 6 checked-and-not-found rows" counts both).
    for (const [app, said] of Object.entries(glance)) {
      const mine = rows.filter(r => r.app === app);
      const features = mine.filter(r => !r.not_a_feature).length, notFound = mine.length - features;
      const n = parseInt(said, 10), inc = /including (\d+)/.exec(said);
      const expect = inc ? mine.length : features;
      counts[app] = { teardown: doc.n, said, features, not_a_feature: notFound, matches: n === expect };
      if (n !== expect) problems.push(`${app}: the doc says ${said}, the tables hold ${features} features${notFound ? ` + ${notFound} not-found rows` : ""}`);
      if (inc && +inc[1] !== notFound) problems.push(`${app}: the doc says ${inc[1]} checked-and-not-found rows, the table holds ${notFound}`);
    }
  }
  return { rows: all, counts, problems };
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
function report({ rows, counts, problems }) {
  const feats = rows.filter(r => !r.not_a_feature);
  const out = [];
  out.push("# Feature teardowns: every row as a spec item", "");
  out.push("Generated by `node scripts/build-teardowns.cjs` from the owner's two teardowns (2026-10-11); do not edit by hand.",
    "Data: `docs/teardowns/features.json` (one entry per row, stable ids such as `T1-DUB-001`). Source docs, verbatim:",
    "[Teardown 1: Investing and Copy Trading](teardown-1-investing-copy-trading.md),",
    "[Teardown 2: Budgeting and Money Management](teardown-2-budgeting-money-management.md).", "");
  out.push("Tags are the docs' own: [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an action approved",
    "in advance, [Flag] is regulated and needs a licensed partner or a lawyer first. Gates come from Upmore's standing rules",
    "(CLAUDE.md), read off each row's own words: a hard-gated row is not built past its gate until the owner decides in",
    "writing. Nothing here says a feature is built in Upmore; it lists what the five apps in each doc offer.", "");
  const hard = feats.filter(r => r.hard_gated);
  out.push(`**Feature rows: ${feats.length}** (Teardown 1: ${feats.filter(r => r.teardown === 1).length}, Teardown 2: ${feats.filter(r => r.teardown === 2).length}),`,
    `plus ${rows.length - feats.length} checked-and-not-found rows that are not features. **Hard-gated: ${hard.length}** (${pct(hard.length, feats.length)}%).`,
    `**Count problems: ${problems.length}.**`, "");
  if (problems.length) { out.push("## Count problems (the doc's own numbers against its tables)", ""); for (const p of problems) out.push(`- ${p}`); out.push(""); }

  out.push("## Per app", "", "| Teardown | App | Doc says | Parsed | Read | Ask | Rule | Flag | Hard-gated | Buildable without a gate |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [app, c] of Object.entries(counts)) {
    const r = feats.filter(x => x.app === app), t = k => r.filter(x => x.tags.includes(k)).length;
    const h = r.filter(x => x.hard_gated).length;
    out.push(`| ${c.teardown} | ${app} | ${c.said} | ${c.features}${c.not_a_feature ? ` + ${c.not_a_feature} not found` : ""}${c.matches ? "" : " (mismatch)"} | ${t("Read")} | ${t("Ask")} | ${t("Rule")} | ${t("Flag")} | ${h} | ${r.length - h} |`);
  }
  out.push("");

  out.push("## Gates", "", "| Gate | Standing rule | Hard | Rows |", "| --- | --- | --- | --- |");
  for (const g of GATES) out.push(`| \`${g.code}\` | ${g.rule} | ${g.hard ? "yes" : "no: buildable inside the rule"} | ${feats.filter(r => r.gates.includes(g.code)).length} |`);
  out.push("", "A row can carry more than one gate. Gates are read from the words, so they are a floor: a row the regexes miss is",
    "still bound by the rules, and the spec for each feature restates the rule it runs into.", "");

  out.push("## Sections, ungated rows first", "", "Each app's sections with how many rows are buildable without a hard gate. The build",
    "order each teardown suggests is in its own \"Build order suggestion\" section.", "");
  for (const app of Object.keys(counts)) {
    out.push(`### ${app}`, "", "| Section | Rows | Read | Ask | Rule | Hard-gated | Ungated ids |", "| --- | --- | --- | --- | --- | --- | --- |");
    const secs = [...new Set(feats.filter(r => r.app === app).map(r => r.section))];
    for (const s of secs) {
      const r = feats.filter(x => x.app === app && x.section === s), t = k => r.filter(x => x.tags.includes(k)).length;
      const open = r.filter(x => !x.hard_gated);
      const ids = open.length ? `${open[0].id}${open.length > 1 ? ` .. ${open[open.length - 1].id}` : ""} (${open.length})` : "none";
      out.push(`| ${s} | ${r.length} | ${t("Read")} | ${t("Ask")} | ${t("Rule")} | ${r.length - open.length} | ${ids} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

function main() {
  const res = build();
  const json = JSON.stringify({ generated_by: "scripts/build-teardowns.cjs", gates: GATES.map(({ code, rule, hard }) => ({ code, rule, hard })), counts: res.counts, problems: res.problems, rows: res.rows }, null, 1) + "\n";
  const md = report(res) + "\n";
  const targets = [[path.join(DIR, "features.json"), json], [path.join(DIR, "README.md"), md]];
  if (process.argv.includes("--check")) {
    const stale = targets.filter(([f, s]) => !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s).map(([f]) => path.relative(ROOT, f));
    if (stale.length) { console.error(`stale: ${stale.join(", ")} (run node scripts/build-teardowns.cjs)`); process.exit(1); }
    console.log(`teardowns verified: ${res.rows.length} rows, ${res.problems.length} count problems`);
    return;
  }
  for (const [f, s] of targets) fs.writeFileSync(f, s);
  const feats = res.rows.filter(r => !r.not_a_feature);
  console.log(`teardowns: ${feats.length} feature rows (+${res.rows.length - feats.length} not-found), hard-gated ${feats.filter(r => r.hard_gated).length}, count problems ${res.problems.length}`);
  for (const p of res.problems) console.log(`  ${p}`);
}

if (require.main === module) main();
module.exports = { build, parse, GATES, DOCS };
