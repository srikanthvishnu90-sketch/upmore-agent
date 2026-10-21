// FRS Greenhouse widgets: a dropdown widget (react-select) or a place/school search is held to the same option rules as a
// select. Its answer reaches the page only on an employer option that derives from the person's fact (option-exact,
// option-yes-no) or, for a place or school search, on an entry that names it (listed-name: its first word); a choice
// made only by meaning is asked, never clicked; and a page whose widget holds another option than the one approved
// stops at the send with nothing sent. Synthetic TEST data only.
import { batchMatch, batchPlan, type BatchPosting, chooseWidgetOption, contractFill, planForm, type SnapField, trustedManifest } from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const OWNER = "TEST-owner", NOW = Date.UTC(2026, 9, 21), JOB = "greenhouse:test-co:1111", URL_ = "https://job-boards.greenhouse.io/test-co/jobs/1111";
const RESUME = { filename: "TEST-resume.pdf", sha256: "c".repeat(64) };
const own = (factId: string, value: string) => ({ value, factId, confirmed: true, user_id: OWNER, provenance: "owner stated (TEST)", confirmation_event_id: `evt-${factId}` });
const M = trustedManifest({ owner: OWNER, resume: RESUME, rows: [], file: { user_id: OWNER, saved: {}, answers: {
  first_name: own("TEST-1", "Test"), work_authorization: own("TEST-2", "Yes"), citizenship: own("TEST-3", "United States"),
  how_heard: own("TEST-4", "Company website"), location: own("TEST-5", "Chicago, IL"), school: own("TEST-6", "Example State University"),
  country: own("TEST-7", "United States"),
} } });
type O = { label: string; value: string };
const w = (name: string, label: string, options: O[] = [], type = "multi_value_single_select") => ({ name, label, type, required: true, options, widget: "react-select" });
const FN = { name: "fn", label: "First Name", type: "input_text", required: true, options: [] as O[] };
const plan = (schema: any[]) => planForm({ userId: OWNER, jobId: JOB, company: "test-co", family: "greenhouse", schema, answers: M.answers, saved: M.saved, now: NOW });
const fill = (schema: any[]) => contractFill({ schema, plan: plan(schema), manifest: M, listed: schema.filter((s) => s.widget).map((s) => s.name), resume: RESUME });
const choose = (field: any, labels: string[]) => chooseWidgetOption({ userId: OWNER, jobId: JOB, company: "test-co", family: "greenhouse", field, labels,
  answers: M.answers, saved: M.saved, now: NOW, form: [FN, field] });
const entry = (schema: any[]) => batchPlan({ jobId: JOB, company: "test-co", url: URL_, family: "greenhouse", schema, plan: plan(schema), challenge: false,
  resume: RESUME, listed: schema.filter((s) => s.widget).map((s) => s.name), manifest: M });
// The card as the page reads it after the fill: every answer Trainee's, a widget holding the option it clicked.
const card = (p: BatchPosting, picked: Record<string, string>): SnapField[] => p.answers.map((a) => ({ name: a.name, label: a.label,
  value: picked[a.name] ?? a.shown, source: "trainee" as const, factId: a.factId, masked: false, detail: a.kind === "select" ? `value=${a.value}` : "" }));
const AUTH = "Are you legally authorized to work in the United States?";

Deno.test("FRS-widget/1 a select-like widget whose options are known: the exact option fills; a choice by meaning only is asked", () => {
  const exact = w("auth", AUTH, [{ label: "Yes", value: "101" }, { label: "No", value: "102" }]);
  const r = fill([FN, exact]);
  assert(r.fill.some((p) => p.name === "auth") && !r.asks.length, `the employer's "Yes" option is the fact: filled ${JSON.stringify(r)}`);
  const e = entry([FN, exact]);
  assert(e.ok && e.posting.ledger.find((l) => l.field_id === "auth")?.derivation_rule === "option-exact", JSON.stringify(e));
  assert(choose(exact, ["Yes", "No"]) === "Yes", "and the widget clicks that option");
  const yesWords = w("auth", AUTH, [{ label: "Yes, I am authorized", value: "1" }, { label: "No", value: "2" }]);
  assert(fill([FN, yesWords]).fill.some((p) => p.name === "auth"), "a yes put on the employer's yes option (option-yes-no) fills");
  const meaning = w("auth", AUTH, [{ label: "I am authorized to work in the United States for any employer", value: "a" }, { label: "I require sponsorship", value: "b" }]);
  const m = fill([FN, meaning]);
  assert(!m.fill.some((p) => p.name === "auth") && m.asks.some((q) => q.label === AUTH), `"Yes" mapped by meaning is asked: ${JSON.stringify(m)}`);
  assert(choose(meaning, meaning.options.map((o) => o.label)) === null, "and the widget clicks nothing");
});

Deno.test("FRS-widget/2 a select-like widget whose options open only on the page: the exact option is clicked; a choice by meaning is not", () => {
  const auth = w("auth", AUTH), heard = w("heard", "How did you hear about us?"), cit = w("cit", "Citizenship status");
  const r = fill([FN, auth, heard, cit]);
  assert(["auth", "heard", "cit"].every((n) => r.fill.some((p) => p.name === n)), `the person's own words are approved before the list opens: ${JSON.stringify(r)}`);
  assert(choose(auth, ["Yes", "No"]) === "Yes" && choose(auth, ["Yes, I am authorized", "No"]) === "Yes, I am authorized", "exact and yes/no options are clicked");
  assert(choose(w("ctry", "Country"), ["United Kingdom", "United States", "Canada"]) === "United States", "a country by its name");
  const phone = Array.from({ length: 25 }, (_, i) => (i === 3 ? "United States +1" : `Testland ${i} +${i + 10}`));
  assert(choose(w("cc", "Country"), phone) === "United States +1", "a dial list is matched by its country");
  for (const [field, labels] of [
    [auth, ["I am authorized to work in the United States for any employer", "I require sponsorship now or in the future"]],
    [heard, ["Careers site", "LinkedIn", "Other"]],
    [cit, ["(a) U.S. citizen or national of the United States", "(b) Lawful permanent resident", "(c) Other"]],
  ] as const) assert(choose(field, [...labels]) === null, `${field.label}: an option chosen only by meaning is never clicked (${choose(field, [...labels])})`);
});

Deno.test("FRS-widget/3 a widget holding another option than the one approved stops at the send; the exact one goes", () => {
  const e = entry([FN, w("auth", AUTH), w("cit", "Citizenship status")]);
  assert(e.ok, JSON.stringify(e));
  const go = (picked: Record<string, string>) => batchMatch({ approved: e.posting, now: entry([FN, w("auth", AUTH), w("cit", "Citizenship status")]), card: card(e.posting, picked), openRequired: [], blockers: [] });
  assert(go({ auth: "Yes", cit: "United States" }).ok, "the exact options go");
  assert(go({ auth: "Yes, I am authorized", cit: "United States" }).ok, "a yes on the employer's yes option goes");
  const off = go({ auth: "Yes", cit: "(a) U.S. citizen or national of the United States" });
  assert(!off.ok && off.diffs.some((d) => /Citizenship status/.test(d)), `an option chosen by meaning stops the send: ${JSON.stringify(off)}`);
  const other = go({ auth: "No", cit: "United States" });
  assert(!other.ok && other.diffs.some((d) => d.includes(AUTH)), `another option stops the send: ${JSON.stringify(other)}`);
});

Deno.test("FRS-widget/4 a place or school search: an entry that names the fact fills; one that does not is not clicked and stops the send", () => {
  // Greenhouse's location and school are typed searches (an input with role=combobox): read as text boxes.
  const loc = w("loc", "Location (City)", [], "input_text"), sch = w("sch", "School", [], "input_text");
  const r = fill([FN, loc, sch]);
  assert(r.fill.some((p) => p.name === "loc") && r.fill.some((p) => p.name === "sch"), JSON.stringify(r));
  const e = entry([FN, loc, sch]);
  assert(e.ok && e.posting.ledger.filter((l) => l.derivation_rule === "listed-name").length === 2, `place and school searches: listed-name ${JSON.stringify(e)}`);
  assert(choose(loc, ["Chicago, Illinois, United States", "Springfield, Illinois, United States"]) === "Chicago, Illinois, United States", "the entry naming the city");
  assert(choose(sch, ["Example State University", "Other State University"]) === "Example State University", "the school by its name");
  assert(choose(loc, ["Cook County, IL", "Remote"]) === null && choose(sch, ["State University of Example", "Other"]) === null, "an entry by meaning only is not clicked");
  // A question read as the person's place whose list is countries: "United States" does not name "Chicago, IL".
  assert(choose(w("based", "Are you currently based in and can verify right to work from one of the following countries?"), ["United Kingdom", "United States"]) === null);
  const go = (picked: Record<string, string>) => batchMatch({ approved: e.posting, now: entry([FN, loc, sch]), card: card(e.posting, picked), openRequired: [], blockers: [] });
  assert(go({ loc: "Chicago, Illinois, United States", sch: "Example State University" }).ok, "the named entries go");
  const off = go({ loc: "Springfield, Illinois, United States", sch: "Example State University" });
  assert(!off.ok && off.diffs.some((d) => /Location \(City\)/.test(d)), `another place stops the send: ${JSON.stringify(off)}`);
});
