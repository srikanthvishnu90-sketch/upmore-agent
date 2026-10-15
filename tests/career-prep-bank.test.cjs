// BUG-218 guard: the researched interview banks (packages/career-data/
// interview-banks/*.md — 304 cited canonical items across 9 sectors) must be
// WIRED into 127's questionBank, not just present on disk. Before the fix,
// data / law / medicine prep drew ZERO bank items (the product held no
// questions at all for those sectors), and the DCF item was a bare prompt
// ("Walk me through a DCF.") with keyword grading — not the bank's full
// model answer. These cases fail on the unmodified module and must stay
// green forever (bug law: a fix without a permanent guard does not count).
// Check: node --test tests/career-prep-bank.test.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const BANK_DIR = path.join(ROOT, "packages/career-data/interview-banks");
const bankText = (f) => fs.readFileSync(path.join(BANK_DIR, f), "utf8");
const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Items served from the wired bank carry source.type "interview_bank_<sector>";
// an item merged into an inline BUG-117 drill (same question) carries bank_item
// instead — both are bank-served items.
const bankItems = (bank, sector) =>
  (bank.questions || []).filter((q) =>
    (q.source && q.source.type === `interview_bank_${sector}`) ||
    (q.bank_item && q.bank_item.sector === sector));

for (const [sector, roleFamily, file, min] of [
  ["data", "data", "data.md", 30],
  ["law", "law", "law.md", 32],
  ["medicine", "medicine", "medicine.md", 30],
]) {
  test(`BUG-218: questionBank for ${sector} returns >=10 items drawn from the wired bank file`, () => {
    const bank = P.questionBank({ roleFamily });
    const items = bankItems(bank, sector);
    assert.ok(items.length >= 10, `${sector}: expected >=10 wired bank items, got ${items.length}`);
    assert.equal(items.length, min, `${sector}: the full canonical bank is reachable (${min} items)`);
    const fileNorm = norm(bankText(file));
    for (const q of items) {
      assert.ok(q.q && fileNorm.includes(norm(q.q).slice(0, 40)),
        `${sector}: served item text must come from ${file}: ${q.q}`);
      assert.equal((q.source && q.source.bank_file) || (q.bank_item && q.bank_item.bank_file), file, `${sector}: item carries its bank file`);
    }
    assert.equal(bank.interview_bank && bank.interview_bank.sector, sector);
    assert.equal(bank.interview_bank && bank.interview_bank.count, min);
  });
}

test("BUG-218: every sector's bank is reachable through questionBank (before: only finance/swe/pm inline sets)", () => {
  const cases = [
    ["finance", "finance", 48], ["quant", "quant", 42], ["swe", "swe", 32],
    ["consulting", "consulting", 30], ["pm", "product", 30], ["real_estate", "real estate", 30],
  ];
  for (const [sector, roleFamily, min] of cases) {
    const bank = P.questionBank({ roleFamily, role: sector === "quant" ? "quant" : undefined });
    const items = bankItems(bank, sector);
    assert.ok(items.length >= 10, `${sector}: >=10 bank items, got ${items.length}`);
    assert.equal(items.length, min, `${sector}: full bank reachable (${min})`);
  }
});

test("BUG-218: the DCF drill serves the bank's full MODEL ANSWER, not a keyword prompt", () => {
  const bank = P.questionBank({ roleFamily: "finance" });
  const dcf = (bank.questions || []).find((q) => /walk me through a dcf/i.test(q.q));
  assert.ok(dcf, "the DCF question is in the finance bank");
  const answer = dcf.answer || dcf.model_answer || "";
  // Distinctive verbatim fragments of the model answer in ib-finance.md §C.
  assert.ok(answer.includes("UFCF = EBIT × (1 − tax rate) + Depreciation & Amortisation − Change in Net Working Capital − Capital Expenditures"),
    "DCF answer carries the bank's UFCF formula line verbatim");
  assert.ok(answer.includes("Gordon growth / perpetuity"), "DCF answer carries both terminal-value methods");
  assert.ok(answer.includes("Sensitivity / sanity check"), "DCF answer closes with the sensitivity step");
  assert.ok(answer.length > 1500, `DCF answer is the full outline, not a one-line prompt (got ${answer.length} chars)`);
  // The graded drill surfaces the same model answer.
  const drill = P.financeDrill();
  const fin2 = drill.questions.find((q) => q.id === "fin-2");
  assert.ok(fin2.model_answer && fin2.model_answer.includes("UFCF = EBIT"),
    "financeDrill fin-2 (the DCF drill) carries the bank model answer");
});

test("BUG-218: sector isolation — a SWE prep ask never receives law/medicine items", () => {
  const bank = P.questionBank({ roleFamily: "swe" });
  const lawNorm = norm(bankText("law.md")), medNorm = norm(bankText("medicine.md"));
  for (const q of bank.questions || []) {
    assert.ok(!q.source || !/interview_bank_(law|medicine)/.test(q.source.type || ""),
      `SWE bank must not carry law/medicine bank items: ${q.q}`);
  }
  const lawOnly = bankItems(P.questionBank({ roleFamily: "law" }), "law");
  assert.ok(lawOnly.length >= 10);
  const sweBank = P.questionBank({ roleFamily: "swe" });
  const lawQs = new Set(lawOnly.map((q) => norm(q.q)));
  for (const q of sweBank.questions || []) assert.ok(!lawQs.has(norm(q.q)), `law item leaked into SWE bank: ${q.q}`);
  assert.ok(lawNorm.length > 0 && medNorm.length > 0, "bank files read for the isolation check");
});

test("BUG-218: no regression — the BUG-117 inline sets remain available alongside the banks", () => {
  const fin = P.questionBank({ roleFamily: "finance" });
  const finQs = (fin.questions || []).map((q) => q.q).join(" ");
  assert.match(finQs, /three financial statements/i);
  assert.match(finQs, /\bDCF\b/);
  assert.match(finQs, /\bLBO\b/);
  assert.match(finQs, /comps/i);
  assert.ok((fin.questions || []).some((q) => q.source && q.source.type === "finance_drill_bank"),
    "the inline finance drill set (BUG-117) is still served");
  const swe = P.questionBank({ roleFamily: "swe" });
  assert.ok((swe.questions || []).some((q) => q.source && q.source.type === "swe_coding_bank"),
    "the inline SWE coding set (BUG-117) is still served");
  const generic = P.questionBank({});
  assert.ok((generic.questions || []).length >= 5, "the no-track bank still serves the generic behavioral set");
  assert.ok(!(generic.interview_bank && generic.interview_bank.sector),
    "no sector named in the ask -> no sector's bank is served");
});

test("BUG-218: stated focus/weakness re-orders the sector bank (prep state honored in 127)", () => {
  const plain = P.questionBank({ roleFamily: "consulting" });
  const focused = P.questionBank({ roleFamily: "consulting", focus: "profitability cases", weakness: "profitability" });
  const firstBank = bankItems(focused, "consulting")[0];
  assert.ok(firstBank && /profitability/i.test(firstBank.q),
    `focus must lead with the profitability item, got: ${firstBank && firstBank.q}`);
  assert.equal(focused.focus_applied, "profitability cases");
  assert.notEqual(firstBank.q, bankItems(plain, "consulting")[0].q,
    "focus ordering differs from the unfocused ordering");
});

test("BUG-218: 144 guidance exposes the wired bank for a sector (prep/guidance seam)", () => {
  const G = require(path.join(ROOT, "packages/domain/144-career-guidance.js"));
  assert.equal(typeof G.interviewBankFor, "function", "144 exports interviewBankFor");
  const r = G.interviewBankFor({ sector: "data" });
  assert.equal(r.ok, true);
  assert.equal(r.sector, "data");
  assert.ok(r.count >= 30 && (r.questions || []).length >= 30,
    `144 serves the data bank through 127 (got ${r.count})`);
  assert.ok((r.questions || []).every((q) => q.source && /interview_bank_data/.test(q.source.type || "")),
    "144 serves only the asked sector's items");
});
