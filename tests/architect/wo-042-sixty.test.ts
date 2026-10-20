// WO-042 (60 reviewed applications in 30 minutes): the planner rules added from live run 4 on the 17 real pages
// (evals/apply/results/live-fill.json), each a wrong answer or a miss seen there. Contract:
// docs/architect/work-orders/WO-042-sixty-in-thirty.md.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type Answer, type FormField, planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { chooseOption, placeQuery } from "../../supabase/functions/_shared/answer_options.ts";
import { chooseWidgetOption } from "../../extension/src/apply_core.ts";
import CONTENT from "../../extension/content.js" with { type: "text" };
import DOM from "../../extension/src/dom.ts" with { type: "text" };
import BACKGROUND from "../../extension/background.js" with { type: "text" };
import GRADE from "../fixtures/extension/grade.cjs" with { type: "text" };

const fact = (value: string, id = "f-" + value): Answer => ({ value, factId: id });
const opts = (xs: string[]) => xs.map((l) => ({ label: l, value: l }));
const field = (name: string, label: string, options: string[] = [], type = "input_text"): FormField => ({ name, label, required: true, type, options: opts(options) });
const plan = (company: string, fields: FormField[], answers: Record<string, Answer>) =>
  planBatch({ userId: "u", postings: [{ job_id: "j", company, title: "", fields }], answers, saved: {}, log: [], now: Date.now() });
const filled = (company: string, fields: FormField[], answers: Record<string, Answer>) =>
  Object.fromEntries((plan(company, fields.map((f) => ({ ...f, required: false })), answers).ready[0]?.fields ?? []).map((p) => [p.name, p.value]));

const SPACEX = [
  "I have never worked for SpaceX, SpaceXAI, xAI, X, or Twitter",
  "I am a former SpaceX, SpaceXAI, xAI, X, or Twitter employee",
  "I am a current SpaceX employee",
];
Deno.test("WO-042/1 worked here before: a No covers only the companies checked; a former employer named in the question or its options is asked", () => {
  const q = field("q1", "SpaceX & SpaceXAI Employment History", SPACEX);
  assertEquals(filled("SpaceX", [q], { former_employers: fact("Example Analytics; Sample Retail") }).q1, SPACEX[0]);
  // The person once worked at Twitter: "never worked for ... Twitter" would be false, so nothing is filled.
  assertEquals(filled("SpaceX", [q], { former_employers: fact("Example Analytics; Twitter") }).q1, undefined);
  assertEquals(plan("SpaceX", [q], { former_employers: fact("Example Analytics; Twitter") }).needs.length, 1, "asked instead");
  // A former employer that is the company itself is a plain yes, as before.
  assertEquals(filled("Acme", [field("q2", "Have you worked for Acme before?", ["Yes", "No"])], { former_employers: fact("Acme Inc") }).q2, "Yes");
});

Deno.test("WO-042/2 a degree: synonyms are one answer, the one that says degree; different degrees or one in progress are not", () => {
  const anduril = ["Accelerated Master's", "Associates", "Associate's Degree", "Bachelors", "Bachelor's Degree", "Master's Degree", "MBA"];
  assertEquals(chooseOption("education_level", "bachelor", opts(anduril), "Degree"), "Bachelor's Degree");
  assertEquals(chooseOption("education_level", "bachelor", opts(["Bachelor of Arts", "Bachelor of Science", "Master's"]), "Degree"), null);
  assertEquals(chooseOption("education_level", "bachelor", opts(["Bachelor's Degree (in progress)", "Bachelor's Degree"]), "Degree"), "Bachelor's Degree");
  assertEquals(chooseOption("education_level", "bachelor", opts(["Bachelor's Degree (in progress)", "High School"]), "Degree"), null);
  assertEquals(chooseOption("education_level", "master", opts(["Master's Degree", "Masters", "Master of Business Administration (M.B.A.)"]), "Degree"), null);
});

Deno.test("WO-042/3 Greenhouse's education end date is the stated graduation date, only beside its school, only the first entry", () => {
  const edu = [field("school--0", "School"), field("end-month--0", "End date month"), field("end-year--0", "End date year")];
  const a = { graduation_date: fact("05/2022", "g1"), school: fact("Example State University") };
  const got = filled("Anduril", edu, a);
  assertEquals(got["end-year--0"], "2022");
  assertEquals(got["end-month--0"], "May");
  assertEquals(filled("Anduril", edu, { graduation_date: fact("2022-12") })["end-month--0"], "December");
  assertEquals(filled("Anduril", edu, { graduation_date: fact("May 2022") })["end-month--0"], "May");
  // Not an education block: an end date with no school beside it is a job's, never the graduation date.
  assertEquals(filled("Anduril", [field("end-year--0", "End date year")], a)["end-year--0"], undefined);
  assertEquals(filled("Anduril", [field("school--1", "School"), field("end-year--1", "End date year")], a)["end-year--1"], undefined);
  // On a widget the month is chosen among the employer's own options, with the whole form beside it.
  const month = chooseWidgetOption({ userId: "u", jobId: "j", company: "Anduril", family: "greenhouse", field: edu[1],
    labels: ["January", "February", "March", "April", "May", "June"], answers: a, saved: {}, now: Date.now(), form: edu });
  assertEquals(month, "May");
  const alone = chooseWidgetOption({ userId: "u", jobId: "j", company: "Anduril", family: "greenhouse", field: edu[1],
    labels: ["January", "May"], answers: a, saved: {}, now: Date.now() });
  assertEquals(alone, null, "without the form, no school beside it: not filled");
});

Deno.test("WO-042/4 a place search: the city or the state's name is typed; a state is picked from places that name it", () => {
  assertEquals(placeQuery("Chicago, IL"), "Chicago");
  assertEquals(placeQuery("IL"), "Illinois");
  assertEquals(placeQuery("NY"), "New York");
  const places = ["Illinois, United States", "Illinois City, Illinois, United States", "Chicago, Illinois, United States"];
  assertEquals(chooseOption("state", "IL", opts(places), "Which state do you live in?"), "Illinois, United States");
  assertEquals(chooseOption("location", "Chicago, IL", opts(["North Chicago, Illinois, United States", ...places]), "Location"), "Chicago, Illinois, United States");
});

Deno.test("WO-042/5 nothing that happens while Trainee fills counts as the person's edit, and no card goes out mid-fill", () => {
  // Every trusted input, change and widget mousedown goes through personEdit, which ignores everything while busy.
  const edit = CONTENT.slice(CONTENT.indexOf("const personEdit"), CONTENT.indexOf("const personEdit") + 300);
  assert(/if \(busy\) return;/.test(edit), "personEdit ignores events while Trainee fills");
  assert(/document\.addEventListener\(t, \(e\) => \{[\s\S]{0,200}personEdit\(/.test(CONTENT), "input/change go through personEdit");
  assert(/addEventListener\("mousedown"[\s\S]{0,250}personEdit\(n\)/.test(CONTENT), "widget mousedown goes through personEdit");
  assert(/setTimeout\(\(\) => \(busy \? undefined : refresh\(\)/.test(CONTENT), "a scheduled refresh never runs mid-fill");
  // The queue's record before the card says done.
  const q = BACKGROUND.indexOf("await queueAfter(tabId,"), c = BACKGROUND.indexOf('return await withCards(tabId, "finish:"');
  assert(q > 0 && c > 0 && q < c, "queue updated before the done card");
});

Deno.test("WO-042/6 the grader: a place picked from the employer's list is the persona's place; another city is not", async () => {
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", GRADE)(mod, mod.exports, () => ({}));
  const { same, yn } = mod.exports;
  assert(same("Chicago, Illinois, United States", "Chicago, IL"));
  assert(same("Illinois, United States", "IL"));
  assert(!same("North Chicago, Illinois, United States", "Chicago, IL"));
  assert(!same("Chicago, Indiana, United States", "Chicago, IL"));
  assert(same("I have never worked for SpaceX, SpaceXAI, xAI, X, or Twitter", "No"), "an option that says no meets the key's No");
  assert(!same("I am a former SpaceX, SpaceXAI, xAI, X, or Twitter employee", "No"));
  assertEquals(yn("I have never worked for SpaceX"), "no");
  assertEquals(yn("I am a former SpaceX employee"), null);
});

Deno.test("WO-042/7 a place search waits for the page's load, types once and awaits a slow first lookup (Lever, live runs 5 and 6)", () => {
  const body = DOM.slice(DOM.indexOf("async function drivePlace"), DOM.indexOf("export interface Resume"));
  assert(/readyState === "complete"/.test(body), "the load is awaited before typing");
  assert((body.match(/\btype\(\);/g) || []).length === 1, "typed once: a second typing cancels a slow first lookup");
  assert(/until\(listed, 8000\)/.test(body), "the list is awaited up to 8 s");
  assert(/press\(hit\)/.test(body) && /if \(!hit\)/.test(body), "a place is clicked only when the planner names one");
});

Deno.test("WO-042/8 Lever's place search gets the city key by key: its lookup starts only on a keydown (live run 10)", async () => {
  const body = DOM.slice(DOM.indexOf("async function drivePlace"), DOM.indexOf("export interface Resume"));
  assert(/contains\("location-input"\)/.test(body), "Lever's input is told apart");
  assert(/for \(const ch of city\)[\s\S]{0,200}"keydown"[\s\S]{0,300}"keyup"/.test(body), "a keydown and a keyup per character");
  // The offline stand-in follows Lever's own rules, so a driver without the keydown fails offline as it did live.
  const WORLD = await Deno.readTextFile(new URL("../fixtures/extension/world.cjs", import.meta.url));
  assert(/addEventListener\("keydown"[\s\S]{0,900}\}, 500\)/.test(WORLD), "the stand-in looks up 500 ms after a keydown");
  const lever = WORLD.slice(WORLD.indexOf("function wireLever"), WORLD.indexOf("function wire(input)"));
  assert(/addEventListener\("input", function \(\) \{ box\.style\.display = "flex"; \}\)/.test(lever), "input only shows the dropdown");
});

Deno.test("WO-042/9 a page that loads before the click's message is still read; a late 'submitting' never undoes a done card", () => {
  // CI on #62 (2cb555b7, 5f686b78, 192b27b3): Lever's thank-you page finished loading before "clicked" landed, so the
  // load event passed the tab by and the card stayed at "submitting".
  const clicked = BACKGROUND.slice(BACKGROUND.indexOf('case "clicked"'), BACKGROUND.indexOf('case "outcome"'));
  assert(/tab\?\.status === "complete"/.test(clicked) && /__traineeClicked === true/.test(clicked) && /afterNavigation\(tabId\)/.test(clicked),
    "the clicked handler reads a page that already loaded without the clicking page's mark");
  assert(/globalThis\.__traineeClicked = true;[^\n]*\n\s*button\.click\(\);/.test(CONTENT), "the clicking page marks itself just before the click");
  assert(/patch\.status === "submitting" && prev\?\.status === "done"\) return null/.test(BACKGROUND), "submitting never lands on done");
  assert(/addListener\(\(tabId, info\) => \{\s*if \(info\.status === "complete"\) afterNavigation\(tabId\);/.test(BACKGROUND), "the load event uses the same reader");
});
