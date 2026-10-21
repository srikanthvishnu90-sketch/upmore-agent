// Synthetic retained browser attributes through the real trusted manifest, planner and fill contract.
// No browser, provider, application execution or network. Explicit constraints never change the owner's value.
import { batchMatch, batchPlan, contractFill, planForm, trustedManifest } from "../../extension/src/apply_core.ts";
import { type FormField } from "../../supabase/functions/_shared/career_apply.ts";
import { answerKey } from "../../supabase/functions/_shared/question_map.ts";
import { readWorkday } from "../../extension/src/dom.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
const OWNER = "SYN-CONSTRAINT-OWNER", JOB = "workday:synthetic:constraints";
type Field = FormField & { min?: string; max?: string; step?: string };
const eq = (a: unknown, b: unknown, why = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${why}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const field = (type: string, attrs: Partial<Field> = {}): Field => ({ name: "native-field", label: ["date", "month"].includes(type) ? "Available start date" : "Numeric or ordinary response", type, required: true, options: [], ...attrs });
function prepared(f: Field, value: string) {
  const key = answerKey(f, JOB, { haveFact: true });
  const manifest = trustedManifest({ owner: OWNER, file: { user_id: OWNER, saved: { [key]: { value, factId: "SYN-OWN-ANSWER", confirmed: true,
    provenance: "owner stated answer in chat", confirmation_event_id: "SYN-CONFIRMATION" } } }, rows: [], resume: null });
  const plan = planForm({ userId: OWNER, jobId: JOB, company: "Synthetic Hiring", family: "workday", workdayFlow: true, schema: [f],
    answers: manifest.answers, saved: manifest.saved, now: 0 });
  const contract = contractFill({ schema: [f], plan, manifest, resume: null, jobId: JOB });
  return { plan, manifest, contract };
}
for (const [label, f, value] of [
  ["numeric lower bound", field("number", { min: "0", step: "any" }), "-1"],
  ["numeric upper bound", field("number", { max: "10", step: "any" }), "11"],
  ["numeric fractional step", field("number", { min: "0", step: "0.25" }), "0.30"],
  ["numeric shifted step", field("number", { min: "0.1", step: "0.2" }), "0.2"],
  ["date lower bound", field("date", { min: "2028-02-01", step: "any" }), "January 31, 2028"],
  ["date upper bound", field("date", { max: "2028-03-01", step: "any" }), "March 2, 2028"],
  ["date day step across leap day", field("date", { min: "2028-02-28", step: "2" }), "2028-02-29"],
  ["month lower bound", field("month", { min: "2028-02", step: "any" }), "January 2028"],
  ["month upper bound", field("month", { max: "2028-04", step: "any" }), "May 2028"],
  ["month step", field("month", { min: "2028-02", step: "2" }), "March 2028"],
] as const) Deno.test(`native constraints: ${label} asks before any planned fill`, () => {
  const result = prepared(f, value); eq(result.plan.fill, []); eq(result.plan.needs.length, 1); eq(result.contract.fill, []);
});

for (const [label, f, value, expected] of [
  ["zero", field("number", { min: "0", max: "10", step: "1" }), "0", "0"],
  ["negative fraction", field("number", { min: "-0.2", max: "0.4", step: "0.1" }), "-0.1", "-0.1"],
  ["decimal step without float drift", field("number", { min: "0.1", step: "0.2" }), "0.30", "0.30"],
  ["any fraction", field("number", { min: "0", step: "any" }), "0.123", "0.123"],
  ["valid leap day", field("date", { min: "2028-02-28", max: "2028-03-01", step: "any" }), "February 29, 2028", "2028-02-29"],
  ["day step", field("date", { min: "2028-02-28", step: "2" }), "March 1, 2028", "2028-03-01"],
  ["month step", field("month", { min: "2028-02", step: "2" }), "April 2028", "2028-04"],
] as const) Deno.test(`native constraints control: ${label} uses the stated value unchanged in meaning`, () => {
  const result = prepared(f, value); eq(result.plan.fill[0]?.value, expected); eq(result.contract.fill[0]?.value, expected); eq(result.plan.needs, []);
});

Deno.test("native constraints: a tightened live limit rejects a stale plan in contract and batch preparation", () => {
  for (const [f, value, max] of [[field("number", { max: "10", step: "any" }), "5", "4"],
    [field("date", { max: "2028-03-01", step: "any" }), "2028-02-29", "2028-02-28"],
    [field("month", { max: "2028-04", step: "any" }), "2028-03", "2028-02"]] as const) {
    const old = prepared(f, value), changed = { ...f, max }; eq(old.contract.fill.length, 1, "positive before mutation");
    const result = contractFill({ schema: [changed], plan: old.plan, manifest: old.manifest, resume: null, jobId: JOB });
    eq(result.fill, []); eq(result.asks.length, 1, "changed range requires own answer before execution");
    const batch = batchPlan({ jobId: JOB, company: "Synthetic Hiring", url: "https://synthetic.invalid/apply", family: "lever", schema: [changed],
      plan: old.plan, challenge: false, resume: null, manifest: old.manifest }); eq(batch.ok, false);
  }
});
Deno.test("native constraints: optional out-of-range answer stays blank without a fabricated replacement", () => {
  const result = prepared(field("number", { min: "0", step: "any", required: false }), "-2");
  eq(result.plan.fill, []); eq(result.plan.needs, []); eq(result.contract.fill, []);
});
Deno.test("native constraints: unknown explicit step base is refused rather than invented", () => {
  // The original value content attribute is not retained by the reader. It can set the step base when min is absent.
  const result = prepared(field("number", { step: "2" }), "4"); eq(result.plan.fill, []); eq(result.plan.needs.length, 1);
});
Deno.test("native constraints controls: unconstrained and ordinary text answers retain prior behavior", () => {
  eq(prepared(field("number"), "0.25").contract.fill[0]?.value, "0.25");
  eq(prepared(field("text", { min: "5", max: "8", step: "2" }), "Owner's exact free text.").contract.fill[0]?.value, "Owner's exact free text.");
});
Deno.test("native constraints: a proven absent value attribute permits the standard zero step base and default step", () => {
  const f = field("number", { nativeValueAttribute: null });
  eq(prepared(f, "2").contract.fill[0]?.value, "2"); eq(prepared(f, "2.5").plan.fill, []);
  eq(prepared({ ...f, step: "2" }, "4").contract.fill[0]?.value, "4"); eq(prepared({ ...f, step: "2" }, "5").plan.fill, []);
});
Deno.test("native constraints: original value content attribute sets step base while valid min takes precedence", () => {
  const f = field("number", { nativeValueAttribute: "0.5", step: "1" });
  eq(prepared(f, "1.5").contract.fill[0]?.value, "1.5"); eq(prepared(f, "1").plan.fill, []);
  eq(prepared({ ...f, min: "0" }, "1").contract.fill[0]?.value, "1"); eq(prepared({ ...f, min: "0" }, "1.5").plan.fill, []);
});
Deno.test("native constraints: native calendar step bases retain day and month units", () => {
  for (const [f, good, bad] of [[field("date", { nativeValueAttribute: "2028-02-28", step: "2" }), "2028-03-01", "2028-02-29"],
    [field("month", { nativeValueAttribute: "2028-02", step: "2" }), "2028-04", "2028-03"]] as const) {
    eq(prepared(f, good).contract.fill.length, 1); eq(prepared(f, bad).plan.fill, []);
  }
});
Deno.test("native constraints: invalid or underflowed native steps use the specified default", () => {
  for (const step of ["0", "-2", "not-a-step", "1e-400"]) {
    const f = field("number", { nativeValueAttribute: null, step });
    eq(prepared(f, "2").contract.fill[0]?.value, "2"); eq(prepared(f, "2.5").plan.fill, []);
  }
});
Deno.test("native constraints: HTML numeric attribute parsing cannot silently drop a real bound or step", () => {
  for (const min of ["+1", " 1", "1suffix"]) { const f = field("number", { min, step: "any" }); eq(prepared(f, "0").plan.fill, []); eq(prepared(f, "1").contract.fill.length, 1); }
  const f = field("number", { min: "0", step: "+0.2suffix" }); eq(prepared(f, "0.3").plan.fill, []); eq(prepared(f, "0.4").contract.fill.length, 1);
});
Deno.test("native constraints: changing valid field metadata invalidates the approved question schema", async () => {
  const f = field("number", { min: "0", max: "10", step: "any", nativeValueAttribute: null }), old = prepared(f, "4");
  const batch = (schema: Field[]) => batchPlan({ jobId: JOB, company: "Synthetic Hiring", url: "https://synthetic.invalid/apply", family: "lever", schema,
    plan: old.plan, challenge: false, resume: null, manifest: old.manifest });
  const approved = batch([f]); if (!approved.ok) throw new Error(JSON.stringify(approved));
  const card = old.plan.fill.map((p) => ({ ...p, source: "trainee" as const, masked: false }));
  eq(batchMatch({ approved: approved.posting, now: approved, card, openRequired: [], blockers: [] }).ok, true, "unchanged approval control");
  for (const changed of [{ ...f, max: "20" }, { ...f, nativeValueAttribute: "1" }]) {
    const next = batch([changed]); if (!next.ok) throw new Error(JSON.stringify(next));
    if (next.posting.question_set_hash === approved.posting.question_set_hash) throw new Error("constraint metadata missing from schema approval");
    eq(batchMatch({ approved: approved.posting, now: next, card, openRequired: [], blockers: [] }).ok, false);
    if (await hashApplyPayload([f]) === await hashApplyPayload([changed])) throw new Error("engine's full-schema approval digest lost native metadata");
  }
});

// Minimal element tree for the actual source reader, with independently mutable live value and content attribute.
// This is source-boundary verification; browser constraint-validation replay remains separately NOT_RUN.
class Element {
  parentElement?: Element; isConnected = true; liveValue?: string;
  constructor(public tagName: string, public attrs: Record<string, string> = {}, public children: Element[] = [], public text = "") {
    this.tagName = tagName.toUpperCase(); for (const child of children) child.parentElement = this;
  }
  getAttribute(key: string) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; }
  get id() { return this.attrs.id || ""; } get type() { return this.attrs.type || "text"; }
  get value() { return this.liveValue ?? this.attrs.value ?? ""; } get required() { return Object.hasOwn(this.attrs, "required"); }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(""); }
  getClientRects() { return [{}]; }
  matches(selector: string): boolean { return selector.split(",").some((raw) => {
    let s = raw.trim(); if (s.includes(":scope") || s.includes(" ")) return false;
    if ([...s.matchAll(/:not\(\[([^\]]+)\]\)/g)].some((m) => this.getAttribute(m[1]) !== null)) return false;
    s = s.replace(/:not\(\[[^\]]+\]\)/g, ""); const tag = /^[a-z]+/i.exec(s)?.[0];
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (s.startsWith("#")) return this.id === s.slice(1);
    return [...s.matchAll(/\[([\w-]+)(?:(\^=|\$=|\*=|=)['"]?([^'"\]]*)['"]?)?\]/g)].every((m) => {
      const v = this.getAttribute(m[1]); return m[2] === "=" ? v === m[3] : m[2] === "^=" ? !!v?.startsWith(m[3]) : m[2] === "$=" ? !!v?.endsWith(m[3]) : m[2] === "*=" ? !!v?.includes(m[3]) : v !== null;
    });
  }); }
  closest(s: string): Element | null { return this.matches(s) ? this : this.parentElement?.closest(s) ?? null; }
  querySelectorAll(s: string): Element[] { return this.children.flatMap((c) => [...(c.matches(s) ? [c] : []), ...c.querySelectorAll(s)]); }
  querySelector(s: string) { return this.querySelectorAll(s)[0] ?? null; }
}
Deno.test("native constraints actual reader: VALUE attribute and proven absence reach planner without copying live value", () => {
  const globals = globalThis as any, oldDocument = globals.document, oldStyle = globals.getComputedStyle;
  try {
    globals.getComputedStyle = () => ({ visibility: "visible" });
    for (const [attrs, expected, good, bad] of [[{ step: "2" }, null, "4", "5"], [{ step: "1", value: "0.5" }, "0.5", "1.5", "1"]] as const) {
      const control = new Element("input", { id: "native-field", type: "number", required: "", ...attrs }); control.liveValue = "17.5";
      const wrapper = new Element("div", { "data-automation-id": "formField-native" }, [new Element("label", { for: control.id }, [], "Synthetic numeric question"), control]);
      const body = new Element("body", {}, [new Element("div", { "data-automation-id": "applyFlowPage" }, [wrapper])]);
      globals.document = { body, querySelector: (s: string) => body.querySelector(s), querySelectorAll: (s: string) => body.querySelectorAll(s), getElementById: (id: string) => body.querySelector("#" + id) };
      const actual = readWorkday().schema[0] as Field; eq(actual.nativeValueAttribute, expected); eq(actual.step, attrs.step);
      eq(prepared(actual, good).contract.fill[0]?.value, good); eq(prepared(actual, bad).plan.fill, []);
    }
  } finally { globals.document = oldDocument; globals.getComputedStyle = oldStyle; }
});
