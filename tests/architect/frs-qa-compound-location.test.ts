// FRS QA bug 4: a question that asks where the person is based AND whether they can verify their right to work there
// (Prolific, greenhouse-prolificacademicltd-4979452101: "Are you currently based in and can verify right to work from one
// of the following countries?", a country list) was read as the person's location and approved as "Chicago, IL" from the
// location fact alone (listed-name). The person stated where they live and their US work authorization, never that they
// can verify right to work from a listed country: the compound question is asked, never filled from one half (D-007,
// WO-102). Synthetic TEST data only.
import { batchPlan, chooseWidgetOption, contractFill, planForm, trustedManifest } from "../../extension/src/apply_core.ts";
import { mapQuestion } from "../../supabase/functions/_shared/question_map.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const OWNER = "TEST-owner", NOW = Date.UTC(2026, 9, 21), JOB = "greenhouse:test-co:2222", URL_ = "https://job-boards.greenhouse.io/test-co/jobs/2222";
const RESUME = { filename: "TEST-resume.pdf", sha256: "d".repeat(64) };
const own = (factId: string, value: string) => ({ value, factId, confirmed: true, user_id: OWNER, provenance: "owner stated (TEST)", confirmation_event_id: `evt-${factId}` });
const manifest = (extra: Record<string, ReturnType<typeof own>> = {}) => trustedManifest({ owner: OWNER, resume: RESUME, rows: [], file: { user_id: OWNER, saved: {}, answers: {
  first_name: own("TEST-1", "Test"), location: own("TEST-5", "Chicago, IL"), work_authorization: own("TEST-2", "Yes"), ...extra,
} } });
const LABEL = "Are you currently based in and can verify right to work from one of the following countries?";
const COUNTRIES = ["Australia", "Canada", "Germany", "United Kingdom", "United States", "REST OF WORLD"];
type O = { label: string; value: string };
const FN = { name: "fn", label: "First Name", type: "input_text", required: true, options: [] as O[] };
// As the extension reads it on the page: a react-select widget (its options open only on the page), required.
const widget = { name: "based", label: LABEL, type: "input_text", required: true, options: [] as O[], widget: "react-select" };
const select = { name: "based", label: LABEL, type: "multi_value_single_select", required: true, options: COUNTRIES.map((c, i) => ({ label: c, value: String(i) })) };
const PERSONAS = { "location and work authorization": manifest(), "and a stated country": manifest({ country: own("TEST-7", "United States") }) };

for (const [who, M] of Object.entries(PERSONAS)) {
  const plan = (schema: any[], location?: string) => planForm({ userId: OWNER, jobId: JOB, company: "test-co", family: "greenhouse", schema, answers: M.answers, saved: M.saved, now: NOW, location });
  const listed = (schema: any[]) => schema.filter((s) => s.widget).map((s) => s.name);

  Deno.test(`FRS-QA/4 compound residence and right to work (${who}): a widget is asked, never filled from the location`, () => {
    for (const where of [undefined, "Germany", "Chicago, IL"]) {
      const schema = [FN, widget];
      const p = plan(schema, where);
      const cf = contractFill({ schema, plan: p, manifest: M, listed: listed(schema), resume: RESUME });
      const kept = cf.fill.find((x) => x.name === "based");
      assert(!kept, `posting at ${where}: the compound question was filled with "${kept?.value}" from one half: ${JSON.stringify(cf)}`);
      const e = batchPlan({ jobId: JOB, company: "test-co", url: URL_, family: "greenhouse", schema, plan: p, challenge: false, resume: RESUME, listed: listed(schema), manifest: M });
      assert(!e.ok && e.why.some((w) => w.includes(LABEL)), `posting at ${where}: the batch asks the person: ${JSON.stringify(e)}`);
      const choice = chooseWidgetOption({ userId: OWNER, jobId: JOB, company: "test-co", family: "greenhouse", field: widget, labels: COUNTRIES, answers: M.answers,
        saved: M.saved, now: NOW, form: schema, location: where });
      assert(choice === null, `posting at ${where}: no country is clicked for it (${choice})`);
    }
  });

  Deno.test(`FRS-QA/4 compound residence and right to work (${who}): a select of countries is asked`, () => {
    const schema = [FN, select];
    const p = plan(schema);
    const cf = contractFill({ schema, plan: p, manifest: M, resume: RESUME });
    assert(!cf.fill.some((x) => x.name === "based"), `filled from one half: ${JSON.stringify(cf.fill)}`);
  });
}

Deno.test("FRS-QA/4 the question is not read as the person's location; a plain location question still is", () => {
  for (const l of [LABEL, "Do you reside in and have the right to work in the UK?", "Are you currently located in and authorized to work in Canada?"]) {
    const m = mapQuestion({ label: l, type: "multi_value_single_select", options: [] });
    assert(m.fact !== "location", `${l}: read as ${m.fact} (${m.why})`);
  }
  for (const l of ["Where are you currently located?", "Are you currently based in Europe?", "Location"]) {
    const m = mapQuestion({ label: l, type: "input_text", options: [] });
    assert(m.fact === "location", `${l}: still the person's location, read as ${m.fact}`);
  }
});
