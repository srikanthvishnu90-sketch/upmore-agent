"use strict";
// GC GUARDS (Crew A, B-04 garbage collection, 2026-10-15; protocol
// docs/career/prod-verification-protocol.md §11; master issue MI-045):
// mechanical guards that close UNENFORCED forbidden rules whose
// enforcement is a tree/citation check. Each test names the rule it
// enforces; when one stands green, the rule flips to ENFORCED in the
// register (both copies) in the same commit.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// --- FR-011 / FR-020 CIR coverage (GC pass #2, 2026-10-19; MI-045) ---
// FR-011: a scenario must never claim a 'company fact from the CIR' for a
// company with no CIR. FR-020: a company brief must never be assembled
// without a CIR. Both rules prescribe the same enforcement: a coverage
// test asserting every scenario that names a company finds that CIR file
// on disk. Scope of "names": the scenario's ask strings (s.user(...)
// literals + the title comment) in scripts/career/scenarios/SC-*.cjs —
// the ask is what the graded conversation claims about the company.
// Firms named in an ask but holding no CIR sit in EXPECTED_ABSENT,
// explicit and deliberate: a NEW firm named in any ask fails this guard
// until it is either given a CIR or added to that list with a reason;
// a firm that GAINS a CIR also fails until it leaves the list (the list
// can only shrink deliberately). Remediation: author the CIR under
// packages/career-data/cirs/ (Crew B content) or record the firm in
// EXPECTED_ABSENT here with its scenario (MI-045 / GC pass #2).
const CIR_DIR = path.join(ROOT, "packages/career-data/cirs");
const SCEN_DIR = path.join(ROOT, "scripts/career/scenarios");
// Display name -> CIR slug for every firm with a file (2026-10-19).
const COVERED_FIRMS = {
  "Airbnb": "airbnb", "Amazon": "amazon", "Anduril": "anduril", "Bain": "bain",
  "BCG": "bcg", "Blackstone": "blackstone", "Citadel Securities": "citadel-securities",
  "Coinbase": "coinbase", "Datadog": "datadog", "D.E. Shaw": "de-shaw",
  "Deloitte": "deloitte-consulting", "Duolingo": "duolingo", "Evercore": "evercore",
  "Figma": "figma", "Goldman Sachs": "goldman-sachs-ibd", "Google": "google",
  "Hudson River Trading": "hudson-river-trading", "Jane Street": "jane-street",
  "JPMorgan": "jpmorgan-ibd", "KKR": "kkr", "Lazard": "lazard", "McKinsey": "mckinsey",
  "Microsoft": "microsoft", "Millennium": "millennium", "Morgan Stanley": "morgan-stanley-ibd",
  "Notion": "notion", "Palantir": "palantir", "Plaid": "plaid", "Point72": "point72",
  "Ramp": "ramp", "Snowflake": "snowflake", "Stripe": "stripe", "Two Sigma": "two-sigma",
};
const FIRM_ALIASES = {
  "BCG": ["Boston Consulting Group"], "D.E. Shaw": ["DE Shaw"],
  "Hudson River Trading": ["HRT"], "JPMorgan": ["JP Morgan", "J.P. Morgan"],
  "Goldman Sachs": ["Goldman"], "Deloitte": ["Deloitte Consulting"],
  "Citadel Securities": ["Citadel"], "Point72": ["Point 72"],
};
// Firms the coverage scan watches for beyond the covered set: the firms
// the live corpus and the bug record name (FR-011/020's own companies,
// the P-set's Databricks, the IB fixture firms of SC-011, common corpus
// firms). A watchlist firm appearing in an ask must be covered or listed
// in EXPECTED_ABSENT.
const WATCHLIST_FIRMS = [
  "Databricks", "Lincoln International", "Meridian Capital", "Houlihan Lokey",
  "William Blair", "Piper Sandler", "Baird", "Jefferies", "Stifel",
  "Raymond James", "Cowen", "Truist", "Barclays", "UBS", "Citi",
  "Bank of America", "Wells Fargo", "RBC", "Centerview", "Moelis",
  "Perella Weinberg", "Greenhill", "Guggenheim", "Rothschild", "Accenture",
  "PwC", "EY", "KPMG", "ZS Associates", "Oliver Wyman", "Kearney",
  "Booz Allen", "Salesforce", "Oracle", "Adobe", "Uber", "Lyft", "DoorDash",
  "Instacart", "Pinterest", "Snap", "Reddit", "Roblox", "OpenAI", "Anthropic",
  "Netflix", "Meta", "Apple", "Tesla", "SpaceX",
];
// Named in an ask, no CIR on disk — the explicit expected-absent list.
// Centerview: named in SC-012's ask; the missing CIR content is Crew B's
// (MI-084 per gc-pass-001). Shrink this list only by adding the CIR.
const EXPECTED_ABSENT = ["Centerview"];

function scenarioAsks(file) {
  const text = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of text.matchAll(/s\.user\(\s*"((?:[^"\\]|\\.)*)"/g)) out.push(m[1]);
  for (const m of text.matchAll(/s\.user\(\s*'((?:[^'\\]|\\.)*)'/g)) out.push(m[1]);
  const first = text.split("\n")[0] || "";
  out.push(first);
  return out.join("\n");
}
function namesFirm(askText, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`).test(askText);
}

test("FR-011/FR-020 (BUG-011/BUG-020): every company named in a scenario ask has a CIR on disk, or is explicitly expected-absent", () => {
  const files = fs.readdirSync(SCEN_DIR).filter((f) => /^SC-.*\.cjs$/.test(f)).sort();
  assert.ok(files.length >= 300, `FR-011/020: expected the 300-scenario corpus, found ${files.length} scenario files. Remediation: the coverage guard is meaningless on a partial corpus — restore scripts/career/scenarios/ (MI-045).`);
  const asks = new Map(files.map((f) => [f, scenarioAsks(path.join(SCEN_DIR, f))]));
  // (1) Every covered firm named in any ask still has its CIR file.
  for (const [firm, slug] of Object.entries(COVERED_FIRMS)) {
    const names = [firm, ...(FIRM_ALIASES[firm] || [])];
    const namedBy = files.filter((f) => names.some((n) => namesFirm(asks.get(f), n)));
    if (!namedBy.length) continue;
    assert.ok(fs.existsSync(path.join(CIR_DIR, slug + ".json")),
      `FR-011/020: ${firm} is named in ${namedBy.join(", ")} but packages/career-data/cirs/${slug}.json is missing — a scenario claims CIR facts for a company with no CIR. Remediation: restore/author the CIR or move the firm to EXPECTED_ABSENT with its scenarios named (MI-045 / GC pass #2).`);
  }
  // (2) Every watchlist firm named in any ask is covered or expected-absent.
  for (const firm of WATCHLIST_FIRMS) {
    if (COVERED_FIRMS[firm] || EXPECTED_ABSENT.includes(firm)) continue;
    const namedBy = files.filter((f) => namesFirm(asks.get(f), firm));
    assert.equal(namedBy.length, 0,
      `FR-011/020: ${firm} is named in ${namedBy.join(", ")} and has no CIR and no EXPECTED_ABSENT entry. Remediation: author packages/career-data/cirs for it (Crew B, MI-084) or record it in EXPECTED_ABSENT in tests/career-gc-guards.test.cjs with the naming scenario (MI-045).`);
  }
  // (3) EXPECTED_ABSENT stays honest: absent means absent, and each entry
  // is still actually named (no stale entries hiding a landed CIR).
  for (const firm of EXPECTED_ABSENT) {
    const slugGuess = firm.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    assert.ok(!fs.existsSync(path.join(CIR_DIR, slugGuess + ".json")),
      `FR-011/020: ${firm} is in EXPECTED_ABSENT but a CIR now exists (${slugGuess}.json) — shrink the list deliberately: move it to COVERED_FIRMS (MI-045).`);
    const namedBy = files.filter((f) => namesFirm(asks.get(f), firm));
    assert.ok(namedBy.length > 0,
      `FR-011/020: ${firm} sits in EXPECTED_ABSENT but no scenario ask names it any more — remove the stale entry (MI-045).`);
  }
  // (4) The original FR-011/020 failure companies hold CIRs today.
  for (const slug of ["ramp", "figma", "stripe", "datadog", "palantir"]) {
    assert.ok(fs.existsSync(path.join(CIR_DIR, slug + ".json")),
      `FR-011/020: ${slug}.json (a company named in the original BUG-011/BUG-020 record) is missing from packages/career-data/cirs/. Remediation: restore the CIR (MI-045).`);
  }
});

test("FR-031 (BUG-031): exactly one module 126 exists in the tree", () => {
  const hits = walk(ROOT, []).filter((p) => path.basename(p) === "126-career-track.js");
  assert.equal(hits.length, 1, `FR-031: expected exactly one 126-career-track.js, found ${hits.length}: ${hits.map((h) => path.relative(ROOT, h)).join(", ") || "none"}. Remediation: when the upstream branch merges, drop the vendored copy — never carry two (MI-045 / GC guards).`);
});
