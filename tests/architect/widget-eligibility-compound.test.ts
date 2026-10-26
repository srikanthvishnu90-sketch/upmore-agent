// Convergence pin (widget-gap x eligibility separation): the two-class sponsorship classification in
// answer_options.ts is exported so every path tests the same predicates — chooseOption's work_authorization
// rule and apply_core's optionRule (the widget contract gate). For a compound two-fact option like
// "Yes, I am authorized and do not require sponsorship" both paths must classify it identically and neither
// path may pick it from the authorization fact alone. Combined answers are answered from both facts by the
// planner (career_apply's authorizedWithoutSponsorship), never clicked from one fact alone.
// Synthetic TEST data only; never a real user's answers.
import { chooseOption, assertsSeparateSponsorshipPosition, assertsSponsorshipNeed } from "../../supabase/functions/_shared/answer_options.ts";
import { batchPlan, chooseWidgetOption, contractFill, planForm, trustedManifest } from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq<T>(a: T, b: T, m: string) { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
const OWNER = "TEST-owner", NOW = Date.UTC(2026, 9, 24), JOB = "greenhouse:test-co:2222";
const RESUME = { filename: "TEST-resume.pdf", sha256: "c".repeat(64) };
const own = (factId: string, value: string) => ({ value, factId, confirmed: true, user_id: OWNER, provenance: "owner stated (TEST)", confirmation_event_id: `evt-${factId}` });
const M = trustedManifest({ owner: OWNER, resume: RESUME, rows: [], file: { user_id: OWNER, saved: {}, answers: {
  first_name: own("TEST-1", "Test"), work_authorization: own("TEST-2", "Yes"), sponsorship: own("TEST-9", "No"),
} } });
type O = { label: string; value: string };
const opts = (labels: string[]): O[] => labels.map((l) => ({ label: l, value: l }));
const AUTH = "Are you legally authorized to work in the United States?";
const w = (name: string, label: string) => ({ name, label, type: "multi_value_single_select", required: true, options: [] as O[], widget: "react-select" });
const choose = (field: any, labels: string[]) => chooseWidgetOption({ userId: OWNER, jobId: JOB, company: "test-co", family: "greenhouse", field, labels,
  answers: M.answers, saved: M.saved, now: NOW, form: [field] });

// The corpus both paths classify. need/separate are the exported verdicts; nothing in this file tests the predicates
// against a private copy — every consumer below calls the same exported functions, so an inconsistency cannot be local.
const CORPUS: Array<[string, boolean, boolean]> = [
  ["Yes, I am authorized and do not require sponsorship", false, true],   // combined: a need assertion's negation in a compound reply
  ["Yes, I will require sponsorship to work in the United States", true, true], // combined AND need-positive
  ["I will require sponsorship", true, false],
  ["I require sponsorship now or in the future", true, false],
  ["Sponsorship is necessary", true, false],
  ["Authorized to work in the U.S. without sponsorship", false, false],   // a modifier of the status, not a clause
  ["I am authorized to work in the United States for any employer", false, false],
  ["Yes, I am authorized", false, false],
  ["No sponsorship required", false, true],                                // compound-phrased (leading No + clause)
];

Deno.test("compound/1 the exported two-class classification is exactly the one both paths consume", () => {
  for (const [label, need, separate] of CORPUS) {
    eq(assertsSponsorshipNeed(label), need, `assertsSponsorshipNeed(${label})`);
    eq(assertsSeparateSponsorshipPosition(label), separate, `assertsSeparateSponsorshipPosition(${label})`);
  }
});

Deno.test("compound/2 chooseOption never picks a classified option from the authorization fact alone", () => {
  for (const [label, need, separate] of CORPUS) {
    const menu = opts([label, "No, I am not authorized to work in the United States"]);
    const picked = chooseOption("work_authorization", "Yes", menu, AUTH);
    if (need || separate) {
      eq(picked, null, `classified option refused on the chooseOption path: ${label}`);
    } else if (label === "Authorized to work in the U.S. without sponsorship") {
      eq(picked, label, "the without-sponsorship status fill stays fillable (spent-s1)");
    }
  }
  // A menu whose only yes is a need assertion is asked, not landed on the assertion.
  eq(chooseOption("work_authorization", "Yes", opts(["I require sponsorship now or in the future", "No, I am not authorized to work in the United States"]), AUTH), null,
    "the generic yes/no fall-through cannot reach a classified option on a plain authorization question");
});

Deno.test("compound/3 the widget gate vetoes the same two classes from the authorization fact alone", () => {
  for (const [label, need, separate] of CORPUS) {
    const field = w("auth", AUTH);
    const picked = choose(field, [label, "No, I am not authorized to work in the United States"]);
    if (need || separate) {
      eq(picked, null, `classified option refused on the widget path: ${label}`);
    }
  }
  // The gate's allowed classes are untouched by the veto: option-yes-no still clicks.
  eq(choose(w("auth", AUTH), ["Yes, I am authorized", "No"]), "Yes, I am authorized", "option-yes-no still derives at the widget gate");
});

Deno.test("compound/4 the sanctioned combined route stays open when the question itself asks combined", () => {
  // career_apply's both-facts derivation (authorizedWithoutSponsorship) maps its combined answer through
  // chooseOption carrying the combined question; that landing is the derivation's, not one fact's alone.
  const combinedQ = "Are you authorized to work in the United States without sponsorship?";
  const picked = chooseOption("work_authorization", "Yes", opts(["Yes, I am authorized and do not require sponsorship", "No"]), combinedQ);
  eq(picked, "Yes, I am authorized and do not require sponsorship", "the both-facts combined landing still reaches its option");
});

Deno.test("compound/5 a compound-phrased option on the sponsorship question is asked, never invented", () => {
  // "No sponsorship required" asserts the sponsorship position in a compound phrasing; the gate asks the
  // person rather than inferring the compound. Recorded, not asserted as ideal: asked is the safe direction.
  const picked = choose(w("sp", "Will you now or in the future require sponsorship?"), ["No sponsorship required", "Yes"]);
  eq(picked, null, "the person answers the compound themselves");
  // Sanity on the plain menus: a bare No is still their fact.
  eq(choose(w("sp", "Will you now or in the future require sponsorship?"), ["No", "Yes"]), "No", "the sponsorship fact's own no still clicks");
});

Deno.test("compound/6 the both-facts derivation carries through the batch contract, and only with both facts", () => {
  // The widget as the batch path sees it: options known at plan time. With both facts standing in the
  // sanctioned conjunction, the combined answer fills and its ledger derivation names the both-facts
  // rule; with the sponsorship fact missing, the same widget is asked — never filled from authorization
  // alone. (Chooser-path states are pinned in tests/career-extension-react-select.test.cjs.)
  const COMBINED_Q = "Are you authorized to work in the United States without sponsorship?";
  const menu = opts(["Yes, I am authorized and do not require sponsorship", "No, I am not authorized to work in the United States"]);
  const fieldW = { name: "auth", label: COMBINED_Q, type: "multi_value_single_select", required: true, options: menu, widget: "react-select" };
  const FN = { name: "fn", label: "First Name", type: "input_text", required: true, options: [] as O[] };
  const planW = (man: any) => planForm({ userId: OWNER, jobId: JOB, company: "test-co", family: "greenhouse", schema: [FN, fieldW], answers: man.answers, saved: man.saved, now: NOW });
  const entryW = (man: any) => batchPlan({ jobId: JOB, company: "test-co", url: "https://job-boards.greenhouse.io/test-co/jobs/2222", family: "greenhouse", schema: [FN, fieldW], plan: planW(man), challenge: false,
    resume: RESUME, listed: ["auth"], manifest: man });
  const e = entryW(M);
  assert(e.ok, JSON.stringify(e));
  const led = e.posting.ledger.find((l) => l.field_id === "auth");
  eq(led?.derivation_rule, "option-combined-eligibility", "the ledger names the both-facts derivation");
  const M2 = trustedManifest({ owner: OWNER, resume: RESUME, rows: [], file: { user_id: OWNER, saved: {}, answers: {
    first_name: own("TEST-1", "Test"), work_authorization: own("TEST-2", "Yes"),
  } } });
  const r2 = contractFill({ schema: [FN, fieldW], plan: planW(M2), manifest: M2, listed: ["auth"], resume: RESUME });
  assert(!r2.fill.some((p) => p.name === "auth"), "authorization alone: the combined widget is not in the contract fill");
});
