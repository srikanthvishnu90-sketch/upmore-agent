#!/usr/bin/env node
// The owner's three method docs (2026-10-11), every method card as its own spec item.
//   docs/methods/methods-1-bonuses-bets-creative.md               bank, card and referral bonuses, bets, creative plays
//   docs/methods/methods-2-owed-idle-cash-investing-side-income.md money owed, unclaimed money, idle cash, investing, side income, renting
//   docs/methods/methods-3-saving-money.md                        subscriptions, shopping, health costs
// Each "###" card gets a stable id (M3-SUBS-01), its section, every field the card format promises (what it is, the
// real example, payout or saving, effort, odds and risk, how often, the three "How Upmore runs it" steps, what Upmore
// needs, tags, source), and the gates Upmore's standing rules (CLAUDE.md) put on it. A card missing a field fails the
// build: a method shown to a person must carry its terms and its source. Every card's terms were checked in October
// 2026 and change weekly, so each carries the recheck note.
// What Upmore has today for each card comes from docs/methods/map.cjs (capability-list items, registry ids, and one of
// IN_CHAT, MODULE_ONLY, GATED, NOT_BUILT), checked here against the repo: an IN_CHAT card names the answer file the chat
// runs and a test, by its exact name, that sends that kind of ask through it; a MODULE_ONLY card names its module and a
// test; a hard-gated card is GATED whatever is built. Any map problem fails the build.
// Writes docs/methods/methods.json and docs/methods/README.md; --check fails when either is stale or the map has a problem.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/methods");
const DOCS = [
  { n: 1, file: "methods-1-bonuses-bets-creative.md", title: "Bonuses, Bets and Creative Plays" },
  { n: 2, file: "methods-2-owed-idle-cash-investing-side-income.md", title: "Money Owed, Idle Cash, Investing and Side Income" },
  { n: 3, file: "methods-3-saving-money.md", title: "Saving Money" },
];
const SECTION_CODE = {
  "Bank and brokerage bonuses": "BANK", "Credit card bonuses and rewards plays": "CARD", "Referral and sign-up money": "REFER",
  "Prediction markets": "PRED", "Sportsbook and casino promos": "BET", "Creative plays most people miss": "CREATIVE",
  "Money owed to you": "OWED", "Unclaimed and forgotten money": "UNCLAIMED", "Making idle cash earn more": "CASH",
  "Investing plays": "INVEST", "Side income and selling": "SIDE", "Renting out what you already own": "RENT",
  "Subscriptions": "SUBS", "Shopping and groceries": "SHOP", "Health costs": "HEALTH",
};

// Standing rules (CLAUDE.md) a card runs into, from its section, its tags and its own words. A hard gate is never built
// past until the owner decides in writing; a soft gate is built inside the rule it names.
const words = c => `${c.title} ${c.what} ${c.example} ${c.odds} ${c.steps.join(" ")} ${c.needs}`;
const GATES = [
  { code: "flag", rule: "regulated: a licensed partner or a lawyer first, and the owner decides", hard: true,
    test: c => c.tags.includes("Flag") },
  { code: "decision_2", rule: "prediction markets stay off (decision 2)", hard: true,
    test: c => c.section_code === "PRED" || /\b(kalshi|polymarket|event contracts?|prediction markets?)\b/i.test(words(c)) },
  { code: "gambling", rule: "sportsbooks and casinos stay off (the gambling guard stands)", hard: true,
    test: c => c.section_code === "BET" || /\b(sportsbook|casino|bonus bets?|no sweat bet)\b/i.test(words(c)) },
  { code: "decision_3", rule: "crypto stays off (decision 3)", hard: true,
    test: c => /\b(crypto|usdc|stablecoin|bitcoin|ethereum)\b/i.test(`${c.title} ${c.what}`) },
  { code: "identity_digits", rule: "never store identity digits (SSN, tax id)", hard: true,
    test: c => /\b(SSN|social security number)\b/.test(words(c)) },
  { code: "phone_calls", rule: "no phone calls", hard: true,
    test: c => /\b(calling or chat helper|negotiators? call|upmore calls)\b/i.test(words(c)) },
  { code: "lending", rule: "lending, advances and balance transfers are not in Upmore's plan", hard: true,
    test: c => /\b(balance transfer|cash advance|personal loan|line of credit)\b/i.test(`${c.title} ${c.what}`) },
  { code: "securities_advice", rule: "no securities advice; options and copying funds or Congress are not offered", hard: true,
    test: c => /\b(covered calls?|puts?|options|13F|congressional|fund managers?)\b/i.test(`${c.title} ${c.what}`) },
  { code: "per_run_yes", rule: "a [Rule] that moves money or places orders is a per-person toggle; every run still asks a one-line yes", hard: false,
    test: c => c.tags.includes("Rule") && /\b(transfers?|moves? (money|cash|funds|the excess)|sweeps?|buys?|invests?|places? (the |an? )?orders?)\b/i.test(c.steps.join(" ").replace(/Best Buy|the user buys/gi, "")) },
  { code: "one_approval", rule: "one explicit approval per cancellation", hard: false,
    test: c => /\bcancel/i.test(c.steps.join(" ")) },
];

function field(lines, label) {
  const re = new RegExp(`^(?:- )?\\*\\*${label}:\\*\\*\\s*(.*)$`);
  for (const l of lines) { const m = re.exec(l); if (m) return m[1].trim(); }
  return null;
}

function parse(doc) {
  const text = fs.readFileSync(path.join(DIR, doc.file), "utf8");
  const cards = [], problems = [];
  let section = null, cur = null;
  const flush = () => { if (cur) cards.push(cur); cur = null; };
  for (const line of text.split("\n")) {
    let m;
    if ((m = /^## (.+)$/.exec(line))) { flush(); section = m[1].trim(); continue; }
    if ((m = /^### (.+)$/.exec(line))) { flush(); cur = { section, raw: [], title: m[1].trim() }; continue; }
    if (cur) cur.raw.push(line);
  }
  flush();
  const seq = {};
  return {
    problems,
    cards: cards.map(c => {
      const code = SECTION_CODE[c.section];
      if (!code) problems.push(`M${doc.n} "${c.title}": section "${c.section}" has no code`);
      seq[code] = (seq[code] || 0) + 1;
      const id = `M${doc.n}-${code}-${String(seq[code]).padStart(2, "0")}`;
      const stepsStart = c.raw.findIndex(l => /^\*\*How Upmore runs it:\*\*/.test(l));
      const steps = [];
      for (let i = stepsStart + 1; stepsStart >= 0 && i < c.raw.length; i++) {
        const s = /^\d+\.\s+(.*)$/.exec(c.raw[i]);
        if (s) steps.push(s[1].trim()); else if (/^\*\*/.test(c.raw[i])) break;
      }
      const tagLine = field(c.raw, "Tag") || "";
      const src = /^\[(.+?)\]\((https?:\/\/[^)\s]+)\)$/.exec(field(c.raw, "Source") || "");
      const card = {
        id, doc: doc.n, section: c.section, section_code: code, title: c.title.replace(/\s*\(creative\)$/, ""), creative: /\(creative\)$/.test(c.title),
        what: field(c.raw, "What it is"), example: field(c.raw, "Real example"),
        value_kind: field(c.raw, "Saving") != null ? "saving" : "payout", value: field(c.raw, "Payout") ?? field(c.raw, "Saving"),
        effort: field(c.raw, "Effort"), odds: field(c.raw, "Odds and risk"), how_often: field(c.raw, "How often"),
        steps, needs: field(c.raw, "What Upmore needs"),
        tags: (tagLine.match(/\[(Read|Ask|Rule|Flag)\]/g) || []).map(t => t.slice(1, -1)),
        source: src ? { title: src[1], url: src[2] } : null,
        checked: /october 2026/i.test(`${field(c.raw, "Real example")} ${c.raw.join(" ")}`) ? "2026-10" : null,
      };
      for (const k of ["what", "example", "value", "effort", "odds", "how_often", "needs"]) if (!card[k]) problems.push(`${id} ${card.title}: no ${k}`);
      if (steps.length !== 3) problems.push(`${id} ${card.title}: ${steps.length} steps under "How Upmore runs it", the format promises 3`);
      if (!card.tags.length) problems.push(`${id} ${card.title}: no tag`);
      if (!card.source) problems.push(`${id} ${card.title}: no source link`);
      card.gates = GATES.filter(g => g.test(card)).map(g => g.code);
      card.hard_gated = card.gates.some(g => GATES.find(x => x.code === g).hard);
      return card;
    }),
  };
}

// ---------------------------------------------------------------- what Upmore has today (docs/methods/map.cjs)
const TODAY = ["IN_CHAT", "MODULE_ONLY", "GATED", "NOT_BUILT"];
const TODAY_WORDS = {
  IN_CHAT: "a person can ask in chat today and a direct answer or flow does this card's job (at least in part); offline tests with MOCK rows, not proven live",
  MODULE_ONLY: "a tested domain module does it, but nothing reachable calls it for this card",
  GATED: "the card's own hard gate blocks it, whatever is built",
  NOT_BUILT: "nothing does this card's job (a reachable prerequisite is not counted)",
};
const HARD = new Set(GATES.filter(g => g.hard).map(g => g.code));
const SOFT = GATES.filter(g => !g.hard).map(g => g.code);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function itemCount(root) {
  const doc = path.join(root, "docs/capability-list/full-agent-capability-list-2026-10-11.md");
  return require(path.join(root, "scripts/capability-list.cjs")).parse(fs.readFileSync(doc, "utf8")).length;
}
function registryIds(root) {
  return new Set(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")).capabilities.map(c => c.id));
}

// Every problem with the map, against the cards and the repo at `root`. Pure apart from reading files.
function validateMap(cards, map, root = ROOT) {
  const problems = [], ids = new Set(cards.map(c => c.id)), caps = registryIds(root), maxItem = itemCount(root);
  const read = rel => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; } };
  for (const id of Object.keys(map)) if (!ids.has(id)) problems.push(`map.cjs names ${id}, which is not a card`);
  for (const c of cards) {
    const m = map[c.id], at = `${c.id} (${c.title})`;
    if (!m) { problems.push(`${at}: no entry in map.cjs`); continue; }
    const items = m.items, capIds = m.caps;
    if (!Array.isArray(items) || items.some(n => !Number.isInteger(n) || n < 1 || n > maxItem)) problems.push(`${at}: items must be capability-list numbers 1..${maxItem}`);
    else if (new Set(items).size !== items.length) problems.push(`${at}: an item is named twice`);
    if (!Array.isArray(capIds)) problems.push(`${at}: caps must be a list`);
    else for (const k of capIds) if (!caps.has(k)) problems.push(`${at}: unknown registry capability ${k}`);
    if (!TODAY.includes(m.today)) { problems.push(`${at}: today "${m.today}" is not one of ${TODAY.join(", ")}`); continue; }
    if (typeof m.note !== "string" || !m.note.trim()) problems.push(`${at}: no note`);
    const hard = c.gates.filter(g => HARD.has(g));
    if (hard.length && m.today !== "GATED") problems.push(`${at}: hard-gated (${hard.join(", ")}), so it is GATED whatever is built, never ${m.today}`);
    if (!hard.length && m.today === "GATED") problems.push(`${at}: GATED, but the card has no hard gate in methods.json`);
    if (m.today !== "GATED") for (const g of SOFT) if (c.gates.includes(g) && !String(m.note || "").includes(g)) problems.push(`${at}: the soft gate ${g} applies, so the note must keep it`);
    const built = m.today === "IN_CHAT" || m.today === "MODULE_ONLY";
    if (built ? !["full", "part"].includes(m.coverage) : m.coverage !== "none") problems.push(`${at}: coverage "${m.coverage}" (${built ? "full or part" : "none"} for ${m.today})`);
    if (!built) {
      for (const k of ["answer", "module", "evidence"]) if (m[k] !== undefined) problems.push(`${at}: ${m.today} carries no ${k}`);
      continue;
    }
    const answers = m.answer === undefined ? [] : [].concat(m.answer);
    if (m.today === "IN_CHAT" && !answers.length) problems.push(`${at}: IN_CHAT needs the answer file the chat runs`);
    if (m.today === "MODULE_ONLY" && answers.length) problems.push(`${at}: MODULE_ONLY has no answer file (an answer file makes it IN_CHAT)`);
    for (const a of answers) if (typeof a !== "string" || !a.startsWith("supabase/functions/") || read(a) === null) problems.push(`${at}: answer ${a} is not a file under supabase/functions/`);
    if (m.today === "MODULE_ONLY" && m.module === undefined) problems.push(`${at}: MODULE_ONLY needs its module`);
    if (m.module !== undefined && (typeof m.module !== "string" || !/^packages\/domain\/\d\d-[\w-]+\.js$/.test(m.module) || read(m.module) === null)) problems.push(`${at}: module ${m.module} is not a packages/domain/NN-*.js file`);
    const evidence = Array.isArray(m.evidence) ? m.evidence : [];
    if (!evidence.length) { problems.push(`${at}: ${m.today} needs evidence (a test file and the exact test name)`); continue; }
    const texts = [];
    for (const e of evidence) {
      const text = e && typeof e.file === "string" && e.file.startsWith("tests/") ? read(e.file) : null;
      if (text === null) { problems.push(`${at}: evidence file ${e && e.file} is not a file under tests/`); continue; }
      if (!e.test || !new RegExp(`\\btest\\(\\s*(["'\`])${reEsc(String(e.test))}\\1`).test(text)) problems.push(`${at}: no test named "${e.test}" in ${e.file}`);
      texts.push(text);
    }
    // The chat path, or the module, is what the evidence must exercise: some evidence file imports it.
    for (const f of answers.concat(m.today === "MODULE_ONLY" ? [m.module] : [])) {
      if (typeof f === "string" && texts.length && !texts.some(t => t.includes(path.basename(f)))) problems.push(`${at}: no evidence test imports ${path.basename(f)}`);
    }
  }
  return problems;
}

function build(opts = {}) {
  const cards = [], problems = [];
  for (const d of DOCS) { const r = parse(d); cards.push(...r.cards); problems.push(...r.problems); }
  if (new Set(cards.map(c => c.id)).size !== cards.length) problems.push("duplicate ids");
  const map = opts.map || require(path.join(DIR, "map.cjs")).MAP;
  const mapProblems = validateMap(cards, map, opts.root || ROOT);
  for (const c of cards) {
    const m = map[c.id];
    if (!m) continue;
    c.upmore = { today: m.today, coverage: m.coverage, capability_items: [...(m.items || [])].sort((a, b) => a - b), capabilities: [...(m.caps || [])], note: m.note };
    for (const k of ["answer", "module"]) if (m[k] !== undefined) c.upmore[k] = [].concat(m[k]);
    if (m.evidence !== undefined) c.upmore.evidence = m.evidence.map(e => ({ file: e.file, test: e.test }));
  }
  return { cards, problems, mapProblems };
}

const esc = s => String(s).replace(/\|/g, "/");
const countToday = list => TODAY.map(s => list.filter(c => c.upmore && c.upmore.today === s).length);
const items = c => (c.upmore && c.upmore.capability_items.length ? c.upmore.capability_items.join(", ") : "none");
const capList = c => (c.upmore && c.upmore.capabilities.length ? c.upmore.capabilities.join(" ") : "none");

function report({ cards, problems, mapProblems = [] }) {
  const hard = cards.filter(c => c.hard_gated), out = [];
  const built = cards.filter(c => c.upmore && (c.upmore.today === "IN_CHAT" || c.upmore.today === "MODULE_ONLY"));
  const [inChat, moduleOnly, gated, notBuilt] = countToday(cards);
  out.push("# Method cards: every card as a spec item", "",
    "Generated by `node scripts/build-methods.cjs` from the owner's three method docs (2026-10-11); do not edit by hand.",
    "Data: `docs/methods/methods.json` (one entry per card, stable ids such as `M3-SUBS-01`). Source docs, verbatim:",
    ...DOCS.map(d => `[Methods ${d.n}: ${d.title}](${d.file})${d.n < 3 ? "," : "."}`), "",
    "Tags are the docs' own: [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an approved action,",
    "[Flag] is regulated. Gates come from Upmore's standing rules (CLAUDE.md): a hard-gated card is not built past its gate",
    "until the owner decides in writing. Every card's terms were checked in October 2026 and change weekly; Upmore re-checks",
    "the live terms before showing one. What Upmore has today for each card is its `today` below, from [`map.cjs`](map.cjs);",
    "nothing is proven live.", "",
    `**Cards: ${cards.length}** (${DOCS.map(d => `Methods ${d.n}: ${cards.filter(c => c.doc === d.n).length}`).join(", ")}). ` +
    `**Hard-gated: ${hard.length}**; buildable inside the rules: ${cards.length - hard.length}. **Format problems: ${problems.length}.**`, "",
    `**Upmore today: IN_CHAT ${inChat}, MODULE_ONLY ${moduleOnly}, GATED ${gated}, NOT_BUILT ${notBuilt}.** Of the ${built.length} cards with ` +
    `something built, ${built.filter(c => c.upmore.coverage === "full").length} are covered in full and ${built.filter(c => c.upmore.coverage === "part").length} in part. **Map problems: ${mapProblems.length}.**`, "");
  if (problems.length) { out.push("## Format problems", "", ...problems.map(p => `- ${p}`), ""); }
  if (mapProblems.length) { out.push("## Map problems", "", ...mapProblems.map(p => `- ${esc(p)}`), ""); }
  out.push("## Upmore today", "",
    "Each card is placed by `docs/methods/map.cjs` on the owner's Full Agent Capability List (items 1..149; item 1, linked",
    "accounts, is assumed by nearly every card and not listed), on the capability registry, and on what a person has on this",
    "branch today. The build checks every placement against the repo: an IN_CHAT card names the answer file the chat runs and",
    "a test, by its exact name, that imports it and sends that kind of ask through it; a MODULE_ONLY card names its module and",
    "a test that imports it; a hard-gated card is GATED whatever is built; a soft gate stays in the note. Registry status is",
    "the registry's own and can lag what is built; `today` is read from the code and its tests. Branch work not merged here is",
    "not counted.", "",
    ...TODAY.map(s => `- **${s}**: ${TODAY_WORDS[s]}.`),
    "- **Coverage** (`full` or `part`) applies to IN_CHAT and MODULE_ONLY; a `part` note names the missing half.", "",
    "| Doc | Cards | IN_CHAT | MODULE_ONLY | GATED | NOT_BUILT | Built in part | Built in full |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  const builtCounts = list => [list.filter(c => c.upmore && c.upmore.coverage === "part").length, list.filter(c => c.upmore && c.upmore.coverage === "full").length];
  for (const d of DOCS) { const r = cards.filter(c => c.doc === d.n); out.push(`| ${d.n}: ${d.title} | ${r.length} | ${countToday(r).join(" | ")} | ${builtCounts(r).join(" | ")} |`); }
  out.push(`| **all** | **${cards.length}** | ${countToday(cards).map(n => `**${n}**`).join(" | ")} | ${builtCounts(cards).map(n => `**${n}**`).join(" | ")} |`, "");
  out.push("## Per section", "", "| Doc | Section | Cards | Read | Ask | Rule | Flag | Hard-gated | Buildable | IN_CHAT | MODULE_ONLY | NOT_BUILT |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const s of [...new Set(cards.map(c => c.section))]) {
    const r = cards.filter(c => c.section === s), t = k => r.filter(c => c.tags.includes(k)).length, h = r.filter(c => c.hard_gated).length, n = countToday(r);
    out.push(`| ${r[0].doc} | ${s} | ${r.length} | ${t("Read")} | ${t("Ask")} | ${t("Rule")} | ${t("Flag")} | ${h} | ${r.length - h} | ${n[0]} | ${n[1]} | ${n[3]} |`);
  }
  out.push("", "## Gates", "", "| Gate | Standing rule | Hard | Cards |", "| --- | --- | --- | --- |");
  for (const g of GATES) out.push(`| \`${g.code}\` | ${g.rule} | ${g.hard ? "yes" : "no: built inside the rule"} | ${cards.filter(c => c.gates.includes(g.code)).length} |`);
  out.push("", "## Buildable cards (no hard gate)", "", "| Id | Card | Tags | Value | Soft rules | Today | Coverage | Items | Capabilities | What Upmore has |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of cards.filter(c => !c.hard_gated)) {
    const u = c.upmore || {};
    out.push(`| ${c.id} | ${c.title} | ${c.tags.join(" ")} | ${esc(c.value)} | ${c.gates.join(", ") || "none"} | ${u.today || "?"} | ${u.coverage || "?"} | ${items(c)} | ${capList(c)} | ${esc(u.note || "")} |`);
  }
  out.push("", "## Evidence for every IN_CHAT and MODULE_ONLY card", "",
    "Each test name below is checked to appear verbatim in its file, and at least one test imports the answer file (or the module).", "",
    "| Id | Today | Answer the chat runs | Module | Tests |", "| --- | --- | --- | --- | --- |");
  for (const c of built) {
    const u = c.upmore;
    out.push(`| ${c.id} | ${u.today} | ${(u.answer || []).map(a => `\`${a}\``).join(", ") || "none"} | ${(u.module || []).map(m => `\`${m}\``).join(", ") || "none"} | ${u.evidence.map(e => `\`${e.file}\`: "${esc(e.test)}"`).join("; ")} |`);
  }
  out.push("", "## Hard-gated cards", "", "Every one is GATED whatever is built; the note says what exists nearby, if anything.", "",
    "| Id | Card | Gates | Items | Capabilities | Note |", "| --- | --- | --- | --- | --- | --- |");
  for (const c of hard) out.push(`| ${c.id} | ${c.title} | ${c.gates.filter(g => GATES.find(x => x.code === g).hard).join(", ")} | ${items(c)} | ${capList(c)} | ${esc((c.upmore && c.upmore.note) || "")} |`);
  return out.join("\n") + "\n";
}

function main() {
  const res = build();
  const json = JSON.stringify({ generated_by: "scripts/build-methods.cjs", gates: GATES.map(({ code, rule, hard }) => ({ code, rule, hard })), problems: res.problems, cards: res.cards }, null, 1) + "\n";
  const targets = [[path.join(DIR, "methods.json"), json], [path.join(DIR, "README.md"), report(res)]];
  const counts = TODAY.map((s, i) => `${s} ${countToday(res.cards)[i]}`).join(", ");
  if (res.mapProblems.length) {
    console.error(`docs/methods/map.cjs has ${res.mapProblems.length} problem(s):\n  ${res.mapProblems.join("\n  ")}`);
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    const stale = targets.filter(([f, s]) => !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s).map(([f]) => path.relative(ROOT, f));
    if (stale.length || res.problems.length) { console.error(stale.length ? `stale: ${stale.join(", ")} (run node scripts/build-methods.cjs)` : `format problems: ${res.problems.join("; ")}`); process.exit(1); }
    console.log(`methods verified: ${res.cards.length} cards, ${res.cards.filter(c => c.hard_gated).length} hard-gated; today ${counts}; map problems 0`);
    return;
  }
  for (const [f, s] of targets) fs.writeFileSync(f, s);
  console.log(`methods: ${res.cards.length} cards, hard-gated ${res.cards.filter(c => c.hard_gated).length}, format problems ${res.problems.length}; today ${counts}`);
  for (const p of res.problems) console.log(`  ${p}`);
}

if (require.main === module) main();
module.exports = { build, validateMap, GATES, DOCS, TODAY };
