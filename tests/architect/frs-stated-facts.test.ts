// FRS stated facts: a block of facts the person pastes or texts about themselves becomes drafts (pure, deterministic, no
// model), each with its field, value and the exact words it came from; anything not read with confidence is shown back as
// leftover, never guessed. Only the person's confirm tap stamps them ("owner stated (<source>, <date>)" and a
// confirmation event), and only then does the WO-102 contract (trustedManifest) keep them and forms fill from them.
// Synthetic TEST data only.
import { confirmStatedFacts, parseStatedFacts, withStatedFacts } from "../../extension/src/stated_facts.ts";
import { contractFill, planForm, trustedManifest } from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const OWNER = "TEST-owner";
const NOW = Date.UTC(2026, 9, 21, 15);
const SRC = "pasted in the panel";
const TEXT = "Jane Test, Austin TX, (555)-010-0000, jane@example.test, linkedin.com/in/jane-test. State U BS CS 2024-2028, GPA 3.8. " +
  "Founder Acme 2023-present. Python/SQL. Work authorized: YES.";
const parse = (t: string) => parseStatedFacts(t, { source: SRC, now: NOW });
const val = (r: ReturnType<typeof parse>, field: string) => r.facts.find((f) => f.field === field)?.value;

Deno.test("FRS-stated/1 the example block: every field it states, each with the exact words it came from", () => {
  const r = parse(TEXT);
  const want: Record<string, string> = {
    full_name: "Jane Test", first_name: "Jane", last_name: "Test", location: "Austin, TX", city: "Austin", state: "TX",
    phone: "(555)-010-0000", email: "jane@example.test", linkedin: "https://linkedin.com/in/jane-test", school: "State U",
    education_level: "BS", major: "CS", education_start: "2024", graduation_date: "2028", gpa: "3.8", current_title: "Founder",
    current_employer: "Acme", skills: "Python, SQL", work_authorization: "Yes",
  };
  for (const [k, v] of Object.entries(want)) assert(val(r, k) === v, `${k}: ${JSON.stringify(val(r, k))} (want ${v}) ${JSON.stringify(r)}`);
  const wh = JSON.parse(String(val(r, "work_history")));
  assert(wh.length === 1 && wh[0].employer === "Acme" && wh[0].title === "Founder" && wh[0].start === "2023" && wh[0].end === "present", JSON.stringify(wh));
  for (const f of r.facts) assert(f.span && TEXT.includes(f.span), `${f.field}: span ${JSON.stringify(f.span)} is the person's own words`);
  assert(r.facts.find((f) => f.field === "phone")!.span === "(555)-010-0000");
  assert(r.leftover.length === 0, JSON.stringify(r.leftover));
  assert(JSON.stringify(parse(TEXT)) === JSON.stringify(r), "deterministic");
});

Deno.test("FRS-stated/2 never inferred: no month from a year range, no sponsorship from work authorization, no degree level from a program", () => {
  const r = parse(TEXT);
  assert(!r.facts.some((f) => f.field === "sponsorship"), "sponsorship stays absent");
  assert(!/[a-z]/i.test(String(val(r, "graduation_date"))) && !/\d{1,2}[\/-]\d{4}/.test(String(val(r, "graduation_date"))), "a year, never a month");
  const p = parse("Sam Example. Example University Computer Science 2022-2026.");
  assert(!p.facts.some((f) => f.field === "school") && p.leftover.some((l) => l.includes("Example University Computer Science")), `school and program run together: shown back ${JSON.stringify(p)}`);
  assert(!p.facts.some((f) => f.field === "education_level"), `no degree level guessed: ${JSON.stringify(p.facts)}`);
  const q = parse("Sam Example. Authorized to work in the US: no.");
  assert(val(q, "work_authorization") === "No" && !q.facts.some((f) => f.field === "sponsorship"), JSON.stringify(q));
  const s = parse("Sam Example. SAT 1500, ACT 34.");
  assert(val(s, "test_scores") === "SAT 1500; ACT 34", JSON.stringify(s));
});

Deno.test("FRS-stated/3 what is not read with confidence is shown back as leftover, never dropped or guessed", () => {
  const r = parse("Jane Test, jane@example.test. I love hiking and long walks. Citizen of somewhere. Expected May 2028?");
  assert(val(r, "email") === "jane@example.test" && val(r, "full_name") === "Jane Test", JSON.stringify(r));
  for (const bit of ["I love hiking and long walks", "Citizen of somewhere", "Expected May 2028?"]) {
    assert(r.leftover.some((l) => l.includes(bit.replace(/\?$/, ""))), `${bit} is shown back: ${JSON.stringify(r.leftover)}`);
  }
  assert(!r.facts.some((f) => f.field === "graduation_date"), "a month is never read from loose words");
  const two = parse("Jane Test, jane@example.test, other@example.test.");
  assert(!two.facts.some((f) => f.field === "email") && two.leftover.join(" ").includes("other@example.test"), `two emails: ask, not pick: ${JSON.stringify(two)}`);
  assert(parse("").facts.length === 0 && parse("").leftover.length === 0);
});

const SCHEMA = [
  { name: "name", label: "Full name", type: "input_text", required: true, options: [] },
  { name: "email", label: "Email", type: "input_text", required: true, options: [] },
  { name: "phone", label: "Phone", type: "input_text", required: false, options: [] },
  { name: "urls[LinkedIn]", label: "LinkedIn URL", type: "input_text", required: false, options: [] },
  { name: "cards[test][field0]", label: "School", type: "input_text", required: true, options: [] },
];
const fillWith = (file: unknown) => {
  const m = trustedManifest({ owner: OWNER, file, rows: [], resume: null });
  const plan = planForm({ userId: OWNER, jobId: "lever:test-co:1111", company: "test-co", family: "lever", schema: SCHEMA as any, answers: m.answers, saved: m.saved, now: NOW });
  return { m, fill: contractFill({ schema: SCHEMA as any, plan, manifest: m, resume: null }).fill };
};

Deno.test("FRS-stated/4 confirmed stated facts pass the WO-102 contract and fill a TEST Lever form's name, email, phone, LinkedIn and school", () => {
  const r = parse(TEXT);
  const confirmed = confirmStatedFacts({ owner: OWNER, drafts: r.facts, keep: r.facts.map((_, i) => i), source: SRC, now: NOW, eventId: "stated-confirm:TEST-1" });
  for (const f of Object.values(confirmed)) {
    assert(/^owner stated \(pasted in the panel, 2026-10-21\)$/.test(f.provenance) && f.confirmation_event_id === "stated-confirm:TEST-1" && f.confirmed === true, JSON.stringify(f));
    assert(TEXT.includes(f.span) && f.user_id === OWNER, JSON.stringify(f));
  }
  const file = withStatedFacts({ user_id: OWNER, answers: { email: { value: "old@example.test", factId: "F-003" } }, saved: {} }, OWNER, confirmed);
  const { m, fill } = fillWith(file);
  assert(m.excluded.length === 0, JSON.stringify(m.excluded));
  const got = Object.fromEntries(fill.map((p) => [p.name, p.value]));
  assert(got.name === "Jane Test" && got.email === "jane@example.test" && got.phone === "(555)-010-0000", JSON.stringify(got));
  assert(got["urls[LinkedIn]"] === "https://linkedin.com/in/jane-test" && got["cards[test][field0]"] === "State U", JSON.stringify(got));
  assert(fill.every((p) => m.byFactId[p.factId]?.provenance.startsWith("owner stated")), "every fill stands on a stated fact");
  // Only the facts the person kept are confirmed.
  const some = confirmStatedFacts({ owner: OWNER, drafts: r.facts, keep: [r.facts.findIndex((f) => f.field === "email")], source: SRC, now: NOW, eventId: "stated-confirm:TEST-2" });
  assert(Object.keys(some).join() === "email", JSON.stringify(Object.keys(some)));
});

Deno.test("FRS-stated/5 unconfirmed drafts never fill: no tap, no event, nothing kept", () => {
  const r = parse(TEXT);
  const asDrafts = Object.fromEntries(r.facts.map((f) => [f.field, { ...f, factId: "stated:draft:" + f.field, user_id: OWNER }]));
  const { m, fill } = fillWith({ user_id: OWNER, answers: asDrafts, saved: {} });
  assert(fill.length === 0 && Object.keys(m.answers).length === 0, JSON.stringify(fill));
  let threw = false;
  try {
    confirmStatedFacts({ owner: OWNER, drafts: r.facts, keep: [0], source: SRC, now: NOW, eventId: "" });
  } catch {
    threw = true;
  }
  assert(threw, "no confirmation event, no confirmed fact");
  assert(Object.keys(confirmStatedFacts({ owner: OWNER, drafts: r.facts, keep: [], source: SRC, now: NOW, eventId: "e" })).length === 0);
});

Deno.test("FRS-stated/6 wiring: the panel's own tap confirms; the background mints the event and stores into the file the manifest reads", async () => {
  const BG = await Deno.readTextFile(new URL("../../extension/background.js", import.meta.url));
  const PANEL = await Deno.readTextFile(new URL("../../extension/panel.js", import.meta.url));
  const HTML = await Deno.readTextFile(new URL("../../extension/panel.html", import.meta.url));
  const CORE = await Deno.readTextFile(new URL("../../extension/src/core.ts", import.meta.url));
  assert(/stated_facts\.ts/.test(CORE), "bundled into TraineeCore");
  assert(/case "import-text"/.test(BG) && /case "confirm-stated"/.test(BG), "the two steps");
  assert(/PANEL_ONLY\.add\("import-text"\)/.test(BG) && /PANEL_ONLY\.add\("confirm-stated"\)/.test(BG), "panel only");
  assert(/C\.confirmStatedFacts\(/.test(BG) && /randomUUID\(\)/.test(BG) && /"imported_file"/.test(BG.slice(BG.indexOf("async function statedStep"))), "the event is minted at confirm and stored where facts() reads");
  assert(/confirm-stated[\s\S]{0,300}isTrusted|isTrusted[\s\S]{0,300}confirm-stated/.test(PANEL), "only the person's own click confirms");
  assert(/id="stated-text"/.test(HTML) && /id="stated-read"/.test(HTML) && /id="stated-confirm"/.test(HTML), "textarea, Read, Confirm");
});
