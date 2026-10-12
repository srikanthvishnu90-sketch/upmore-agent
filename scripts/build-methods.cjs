#!/usr/bin/env node
// The owner's three method docs (2026-10-11), every method card as its own spec item.
//   docs/methods/methods-1-bonuses-bets-creative.md               bank, card and referral bonuses, bets, creative plays
//   docs/methods/methods-2-owed-idle-cash-investing-side-income.md money owed, unclaimed money, idle cash, investing, side income, renting
//   docs/methods/methods-3-saving-money.md                        subscriptions, shopping, health costs
// Each "###" card gets a stable id (M3-SUBS-01), its section, every field the card format promises (what it is, the
// real example, payout or saving, effort, odds and risk, how often, the three "How Upmore runs it" steps, what Upmore
// needs, tags, source), and the gates Upmore's standing rules (CLAUDE.md) put on it. A card missing a field fails the
// build: a method shown to a person must carry its terms and its source. Every card's terms were checked in October
// 2026 and change weekly, so each carries the recheck note; nothing here says a method is built in Upmore.
// Writes docs/methods/methods.json and docs/methods/README.md; --check fails when either is stale.
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

function build() {
  const cards = [], problems = [];
  for (const d of DOCS) { const r = parse(d); cards.push(...r.cards); problems.push(...r.problems); }
  if (new Set(cards.map(c => c.id)).size !== cards.length) problems.push("duplicate ids");
  return { cards, problems };
}

function report({ cards, problems }) {
  const hard = cards.filter(c => c.hard_gated), out = [];
  out.push("# Method cards: every card as a spec item", "",
    "Generated by `node scripts/build-methods.cjs` from the owner's three method docs (2026-10-11); do not edit by hand.",
    "Data: `docs/methods/methods.json` (one entry per card, stable ids such as `M3-SUBS-01`). Source docs, verbatim:",
    ...DOCS.map(d => `[Methods ${d.n}: ${d.title}](${d.file})${d.n < 3 ? "," : "."}`), "",
    "Tags are the docs' own: [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an approved action,",
    "[Flag] is regulated. Gates come from Upmore's standing rules (CLAUDE.md): a hard-gated card is not built past its gate",
    "until the owner decides in writing. Every card's terms were checked in October 2026 and change weekly; Upmore re-checks",
    "the live terms before showing one. Nothing here says a method is built in Upmore.", "",
    `**Cards: ${cards.length}** (${DOCS.map(d => `Methods ${d.n}: ${cards.filter(c => c.doc === d.n).length}`).join(", ")}). ` +
    `**Hard-gated: ${hard.length}**; buildable inside the rules: ${cards.length - hard.length}. **Format problems: ${problems.length}.**`, "");
  if (problems.length) { out.push("## Format problems", "", ...problems.map(p => `- ${p}`), ""); }
  out.push("## Per section", "", "| Doc | Section | Cards | Read | Ask | Rule | Flag | Hard-gated | Buildable |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const s of [...new Set(cards.map(c => c.section))]) {
    const r = cards.filter(c => c.section === s), t = k => r.filter(c => c.tags.includes(k)).length, h = r.filter(c => c.hard_gated).length;
    out.push(`| ${r[0].doc} | ${s} | ${r.length} | ${t("Read")} | ${t("Ask")} | ${t("Rule")} | ${t("Flag")} | ${h} | ${r.length - h} |`);
  }
  out.push("", "## Gates", "", "| Gate | Standing rule | Hard | Cards |", "| --- | --- | --- | --- |");
  for (const g of GATES) out.push(`| \`${g.code}\` | ${g.rule} | ${g.hard ? "yes" : "no: built inside the rule"} | ${cards.filter(c => c.gates.includes(g.code)).length} |`);
  out.push("", "## Buildable cards (no hard gate)", "", "| Id | Card | Tags | Value | Soft rules |", "| --- | --- | --- | --- | --- |");
  for (const c of cards.filter(c => !c.hard_gated)) out.push(`| ${c.id} | ${c.title} | ${c.tags.join(" ")} | ${c.value.replace(/\|/g, "/")} | ${c.gates.join(", ") || "none"} |`);
  out.push("", "## Hard-gated cards", "", "| Id | Card | Gates |", "| --- | --- | --- |");
  for (const c of hard) out.push(`| ${c.id} | ${c.title} | ${c.gates.filter(g => GATES.find(x => x.code === g).hard).join(", ")} |`);
  return out.join("\n") + "\n";
}

function main() {
  const res = build();
  const json = JSON.stringify({ generated_by: "scripts/build-methods.cjs", gates: GATES.map(({ code, rule, hard }) => ({ code, rule, hard })), problems: res.problems, cards: res.cards }, null, 1) + "\n";
  const targets = [[path.join(DIR, "methods.json"), json], [path.join(DIR, "README.md"), report(res)]];
  if (process.argv.includes("--check")) {
    const stale = targets.filter(([f, s]) => !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== s).map(([f]) => path.relative(ROOT, f));
    if (stale.length || res.problems.length) { console.error(stale.length ? `stale: ${stale.join(", ")} (run node scripts/build-methods.cjs)` : `format problems: ${res.problems.join("; ")}`); process.exit(1); }
    console.log(`methods verified: ${res.cards.length} cards, ${res.cards.filter(c => c.hard_gated).length} hard-gated`);
    return;
  }
  for (const [f, s] of targets) fs.writeFileSync(f, s);
  console.log(`methods: ${res.cards.length} cards, hard-gated ${res.cards.filter(c => c.hard_gated).length}, format problems ${res.problems.length}`);
  for (const p of res.problems) console.log(`  ${p}`);
}

if (require.main === module) main();
module.exports = { build, GATES, DOCS };
