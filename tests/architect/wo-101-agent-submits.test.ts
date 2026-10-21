// WO-101 (A1-A3): the agent submits, approved up front as a batch of exact answers. The pure part: what one posting's
// batch entry is (every answer exactly as it will be sent, and what is left blank), which postings stay out of a batch
// (anything the person must answer or do first), and the check at the send that lets code approve a card itself only
// when the page holds exactly what the person approved. Contract: docs/architect/work-orders/WO-101-agent-submits.md.
// Synthetic TEST persona; no network, no model.
import {
  batchHash, batchMatch, batchPlan, type BatchPosting, NO_UNCHECKED, planForm, type SnapField,
} from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
type F = { name: string; label: string; type: string; required: boolean; options: { label: string; value: string }[] };
const f = (name: string, label: string, type = "input_text", required = true, options: { label: string; value: string }[] = []): F =>
  ({ name, label, type, required, options });
const AUTH = "Are you legally authorized to work in the United States?";
const SCHEMA: F[] = [
  f("first", "First name"), f("email", "Email"), f("resume", "Resume/CV", "input_file"),
  f("auth", AUTH, "multi_value_single_select", true, [{ label: "Yes", value: "y" }, { label: "No", value: "n" }]),
  f("ssn", "Social Security Number", "input_text", false), f("notes", "Anything else you want us to know?", "textarea", false),
];
const ANSWERS = {
  first_name: { value: "Test", factId: "TEST-f1" }, email: { value: "test.person@example.test", factId: "TEST-f2" },
  resume: { value: "TEST-resume.pdf", factId: "TEST-f3" }, work_authorization: { value: "Yes", factId: "TEST-f4" },
};
const RESUME = { filename: "TEST-resume.pdf", sha256: "b".repeat(64) };
const NOW = Date.UTC(2026, 9, 21);
const URL_ = "https://jobs.lever.co/test-co/1111-2222";
function entry(o: Partial<{ schema: F[]; answers: Record<string, { value: string; factId: string }>; challenge: boolean; family: string; resume: typeof RESUME | null }> = {}) {
  const schema = o.schema ?? SCHEMA;
  const family = (o.family ?? "lever") as "lever";
  const plan = planForm({ userId: "TEST", jobId: "lever:test-co:1111-2222", company: "test-co", family, schema, answers: o.answers ?? ANSWERS, saved: {}, now: NOW });
  return batchPlan({ jobId: "lever:test-co:1111-2222", company: "test-co", url: URL_, family, schema, plan, challenge: o.challenge ?? false, resume: o.resume === undefined ? RESUME : o.resume });
}
function approved(): BatchPosting {
  const e = entry();
  assert(e.ok, JSON.stringify(e));
  return e.posting;
}
// The card the extension builds after filling the form with exactly the approved answers (what readValue/readDetail read).
function card(p: BatchPosting): SnapField[] {
  return p.answers.map((a) => ({
    name: a.name, label: a.label, value: a.shown, source: "trainee" as const, factId: a.factId, masked: false,
    detail: a.kind === "file" ? `${a.file}:2048:application/pdf` : a.kind === "select" ? `value=${a.value}` : "",
  }));
}
const match = (c: SnapField[], o: Partial<{ now: ReturnType<typeof entry>; openRequired: string[]; blockers: string[] }> = {}) =>
  batchMatch({ approved: approved(), now: o.now ?? entry(), card: c, openRequired: o.openRequired ?? [], blockers: o.blockers ?? [] });

Deno.test("WO-101/A1 a posting's batch entry: every answer as it will be sent and shown, what is left blank; same input, same hash", async () => {
  const p = approved();
  eq(p.answers.map((a) => a.name), ["auth", "email", "first", "resume"], "sorted by field name");
  const auth = p.answers.find((a) => a.name === "auth")!;
  eq([auth.value, auth.shown, auth.kind], ["y", "Yes", "select"], "a select sends its option value and shows the employer's own option text");
  const resume = p.answers.find((a) => a.name === "resume")!;
  eq([resume.shown, resume.file, resume.kind], ["TEST-resume.pdf", RESUME.sha256, "file"], "the upload is the person's resume file, by its bytes' hash");
  eq(p.blank, ["Anything else you want us to know?", "Social Security Number"], "what is left blank is part of what they approve");
  eq([p.jobId, p.company, p.url], ["lever:test-co:1111-2222", "test-co", URL_]);
  const h1 = await batchHash(p), h2 = await batchHash(approved());
  assert(/^[0-9a-f]{64}$/.test(h1) && h1 === h2, "deterministic");
  const other = entry({ answers: { ...ANSWERS, email: { value: "other@example.test", factId: "TEST-f2" } } });
  assert(other.ok && (await batchHash(other.posting)) !== h1, "one answer different, another hash");
});

Deno.test("WO-101/A2 a posting with anything the person must answer or do first stays out of the batch, with why", () => {
  const cases: [string, ReturnType<typeof entry>, RegExp][] = [
    ["an open required question", entry({ schema: [...SCHEMA, f("agree", "I agree to the privacy notice", "checkbox")] }), /"I agree to the privacy notice" needs your answer first/],
    ["a required identity number", entry({ schema: [...SCHEMA.filter((x) => x.name !== "ssn"), f("ssn", "Social Security Number")] }), /"Social Security Number" is an identity number/],
    ["a verification on the page", entry({ challenge: true }), /verification/],
    ["a required question asked twice", entry({ schema: [...SCHEMA, f("p1", "Phone"), f("p2", "Phone")] }), /"Phone" is asked twice/],
    ["Workday", entry({ family: "workday" }), /Workday/],
    ["an upload with no resume file", entry({ resume: null }), /"Resume\/CV" needs your resume file/],
    ["no form read", entry({ schema: [] }), /No application form/],
  ];
  for (const [what, e, why] of cases) {
    assert(!e.ok, `${what}: left out`);
    assert(e.why.some((w) => why.test(w)), `${what}: ${JSON.stringify(e.why)}`);
  }
  assert(entry().ok, "and a posting with nothing open is in");
});

Deno.test("WO-101/A3 code approves a card itself only when the page holds exactly the approved answers", () => {
  const p = approved();
  const exact = match(card(p));
  assert(exact.ok && exact.diffs.length === 0, JSON.stringify(exact));
  const variants: [string, (c: SnapField[]) => SnapField[], RegExp][] = [
    ["a value differs", (c) => c.map((x) => x.name === "email" ? { ...x, value: "else@example.test" } : x), /"Email"/],
    ["a label differs", (c) => c.map((x) => x.name === "first" ? { ...x, label: "Preferred name" } : x), /Preferred name|First name/],
    ["set by the page", (c) => c.map((x) => x.name === "first" ? { ...x, source: "page" as const } : x), /"First name".*set by the page|page/],
    ["typed by someone on the page", (c) => c.map((x) => x.name === "first" ? { ...x, source: "you" as const } : x), /"First name"/],
    ["an extra answer", (c) => [...c, { name: "notes", label: "Anything else you want us to know?", value: "hi", source: "trainee", factId: "TEST-f9", masked: false }], /"Anything else you want us to know\?"/],
    ["a page-set read-only field", (c) => [...c, { name: "fixed:ref", label: "Reference", value: "R-1", source: "fixed", factId: null, masked: false }], /"Reference"/],
    ["a missing answer", (c) => c.filter((x) => x.name !== "email"), /"Email" was not filled/],
    ["another fact behind it", (c) => c.map((x) => x.name === "first" ? { ...x, factId: "TEST-other" } : x), /"First name"/],
    ["the select sends another option", (c) => c.map((x) => x.name === "auth" ? { ...x, detail: "value=n" } : x), /"Are you legally authorized/],
    ["another file", (c) => c.map((x) => x.name === "resume" ? { ...x, detail: `${"c".repeat(64)}:2048:application/pdf` } : x), /"Resume\/CV"/],
  ];
  for (const [what, change, why] of variants) {
    const r = match(change(card(p)));
    assert(!r.ok, `${what}: blocks`);
    assert(r.diffs.some((d) => why.test(d)), `${what}: ${JSON.stringify(r.diffs)}`);
  }
  const replanned = entry({ answers: { ...ANSWERS, email: { value: "new@example.test", factId: "TEST-f2" } } });
  assert(!match(card(p), { now: replanned }).ok, "the planner would now send another answer than the one approved");
  assert(!match(card(p), { now: entry({ challenge: true }) }).ok, "the posting would no longer be in a batch");
  assert(!match(card(p), { openRequired: ["Cover letter"] }).ok, "a required question open on the page");
  assert(!match(card(p), { blockers: ["A verification check is showing on the page."] }).ok, "any blocker");
});

Deno.test("WO-101/A3 a checkbox the planner leaves unchecked, and one it checks, match as the page reads them", () => {
  const schema = [...SCHEMA, f("relocate", "Are you willing to relocate?", "checkbox", false), f("authbox", "Are you authorized to work in the US?", "checkbox", false)];
  const answers = { ...ANSWERS, relocation: { value: "No", factId: "TEST-f5" } };
  const e = entry({ schema, answers });
  assert(e.ok, JSON.stringify(e));
  const box = e.posting.answers.find((a) => a.name === "relocate")!, yes = e.posting.answers.find((a) => a.name === "authbox")!;
  eq([box?.kind, box?.shown], ["checkbox", NO_UNCHECKED], "a no is a box left unchecked");
  eq([yes?.kind, yes?.shown], ["checkbox", "Yes (checked)"], "a yes is a checked box");
  const c = card(e.posting);
  assert(batchMatch({ approved: e.posting, now: e, card: c, openRequired: [], blockers: [] }).ok, "as the page reads them");
  const flipped = c.map((x) => x.name === "relocate" ? { ...x, value: "Yes (checked)" } : x);
  assert(!batchMatch({ approved: e.posting, now: e, card: flipped, openRequired: [], blockers: [] }).ok, "the other state blocks");
});
