// Invented repeated-row fields. Pure protocol tests; no providers, pages, account data, or network.
import { rowAnswerKey, rowQuestionType, decodeRowQuestionType, rowQuestionLabel } from "../../supabase/functions/_shared/row_answer.ts";
const assert = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const eq = (a: unknown, b: unknown) => assert(JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b]));
const field = () => ({ name: "workExperience-2--startDate", label: "From", type: "date", options: [] as { label: string; value: string }[], section: { kind: "work", row: 2, part: "start", anchor: "Synthetic Studio", format: "MM/YYYY" } });
const JOB = "SYN-POSTING-1";
Deno.test("row answer: exact snapshot round-trips a posting-only stable binding", () => {
  const f = field(), before = JSON.stringify(f), key = rowAnswerKey(f, JOB);
  assert(/^job:[0-9a-f]{16}$/.test(key ?? ""), "row answer escaped posting-only scope");
  eq(decodeRowQuestionType(rowQuestionType(f, JOB)), { key, type: "month" });
  eq(rowAnswerKey(JSON.parse(before), JOB), key);eq(JSON.stringify(f), before);
});
Deno.test("row answer: every field identity component and exact posting changes binding", () => {
  const key = rowAnswerKey(field(), JOB);
  const mutations: ((f: ReturnType<typeof field>) => void)[] = [
    f => { f.name += "-other"; }, f => { f.label += " date"; }, f => { f.type = "text"; },
    f => { f.section.kind = "education"; f.section.part = "end"; }, f => { f.section.row++; },
    f => { f.section.part = "end"; }, f => { f.section.anchor += " Two"; }, f => { f.section.format = "YYYY"; },
    f => { f.options = [{ label: "June", value: "06" }]; },
  ];
  for (const mutate of mutations) { const f = field(); mutate(f); assert(rowAnswerKey(f, JOB) !== key, "identity mutation reused an old answer");assert(rowAnswerKey(f, JOB) !== null, "valid mutation became unbound"); }
  for (const job of [JOB + "2", JOB.toLowerCase(), JOB + " "]) assert(rowAnswerKey(field(), job) !== key, "posting bytes were normalized");
});
Deno.test("row answer: option labels values and order bind while object property order does not", () => {
  const f = field();f.options = [{ label: "One", value: "1" }, { label: "Two", value: "2" }];
  const key = rowAnswerKey(f, JOB), reordered = { section: { format: f.section.format, anchor: f.section.anchor, part: f.section.part, row: f.section.row, kind: f.section.kind }, options: f.options.map(o => ({ value: o.value, label: o.label })), type: f.type, label: f.label, name: f.name };
  eq(rowAnswerKey(reordered, JOB), key);
  for (const mutate of [(x: typeof f) => { x.options[0].label += "x"; }, (x: typeof f) => { x.options[0].value += "x"; }, (x: typeof f) => { x.options.reverse(); }]) { const x = structuredClone(f);mutate(x);assert(rowAnswerKey(x, JOB) !== key, "option mutation replayed answer"); }
});
Deno.test("row answer: row zero unknown parts malformed rows and missing bindings never yield a key", () => {
  for (const f of [null, [], {}, { ...field(), section: undefined }, { ...field(), name: "" }, { ...field(), label: "" }, { ...field(), options: "bad" }, { ...field(), options: [{ label: "bad" }] }, ...[0, -1, 1.5, "2", NaN].map(row => ({ ...field(), section: { ...field().section, row } })), ...[{ kind: "other" }, { part: "unknown" }, { anchor: 1 }, { format: [] }].map(extra => ({ ...field(), section: { ...field().section, ...extra } }))]) eq(rowAnswerKey(f, JOB), null);
  for (const job of [null, undefined, "", " ", 1]) eq(rowAnswerKey(field(), job), null);
});
Deno.test("row answer: date precision carries known format without changing native fields", () => {
  for (const [format, type] of [["MM/YYYY", "month"], ["YYYY-MM", "month"], ["YYYY", "year"], ["DD/MM/YYYY", "date"]]) {
    const f = field();f.section.format = format;eq(decodeRowQuestionType(rowQuestionType(f, JOB))?.type, type);
  }
  const f = field();f.options = [{ label: "2025", value: "2025" }];eq(decodeRowQuestionType(rowQuestionType(f, JOB))?.type, "date");
  eq(rowQuestionType({ ...field(), section: undefined }, JOB), "date");eq(rowQuestionType({ ...field(), section: { ...field().section, row: 0 } }, JOB), "row:unbound");
  eq(decodeRowQuestionType(rowQuestionType({ ...field(), section: { ...field().section, row: 0 } }, JOB)), null);
});
Deno.test("row answer: logical type overrides preserve raw field fingerprint", () => {
  const f = field(), key = rowAnswerKey(f, JOB);eq(decodeRowQuestionType(rowQuestionType(f, JOB, "year")), { key, type: "year" });
  eq(rowAnswerKey(f, JOB), key);assert(rowQuestionType(f, JOB).length <= 40, "type exceeds persisted column");
  let threw = false;try { rowQuestionType(f, JOB, "x".repeat(20)); } catch { threw = true; }assert(threw, "invalid logical override silently lost row scope");
});
Deno.test("row answer: malformed encoded types fail closed", () => {
  for (const type of [null, 1, "date", "row:date:123", "row:date:" + "F".repeat(16), "row::" + "a".repeat(16), "row:date:" + "a".repeat(16) + ":extra", "row:" + "x".repeat(20) + ":" + "a".repeat(16), " row:date:" + "a".repeat(16)]) eq(decodeRowQuestionType(type), null);
});
Deno.test("row answer: display names exact section row anchor format and original question", () => {
  const f = field(), label = rowQuestionLabel(f);assert(label.includes("Work experience row 2") && label.includes("Synthetic Studio") && label.includes("MM/YYYY") && label.endsWith(": From"), "question omitted exact row context");
  const blank = { ...f, section: { ...f.section, anchor: "" } };assert(rowQuestionLabel(blank).includes("entry not named"), "unnamed row invented an employer");
  eq(rowQuestionLabel({ label: "Ordinary field" }), "Ordinary field");
});
