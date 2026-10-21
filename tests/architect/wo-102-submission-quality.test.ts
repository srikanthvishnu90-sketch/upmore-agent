// WO-102: the second judge's submission-quality contract, the pure part. Only facts the owner gave reach a batch (a
// positive allowlist: confirmed, his own, a positive provenance, a confirmation event, not quarantined, not derived from
// anything excluded); every answer carries its ledger row; what is missing, conflicting, quarantined or unsupported and
// required is asked and blocks that posting, optional unknowns stay empty; attestations and personal choices need his
// own answer; the batch approval binds the posting, the question set, the payload, the attachment's bytes, the trusted
// fact manifest and the quarantine version, and any change to them stops the send. Synthetic TEST data only.
import {
  batchHash, batchMatch, batchPlan, type BatchPosting, planForm, QUARANTINE_VERSION, type SnapField, trustedManifest,
} from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
type F = { name: string; label: string; type: string; required: boolean; options: { label: string; value: string }[] };
const f = (name: string, label: string, type = "input_text", required = true, options: { label: string; value: string }[] = []): F =>
  ({ name, label, type, required, options });
const YN = (a: string, b: string) => [{ label: "Yes", value: a }, { label: "No", value: b }];
const SCHEMA: F[] = [
  f("fn", "First name"), f("ln", "Last name"), f("email", "Email"), f("resume", "Resume/CV", "input_file"),
  f("spons", "Will you now or in the future require visa sponsorship?", "multi_value_single_select", true, YN("1", "0")),
  f("auth", "Are you legally authorized to work in the United States?", "multi_value_single_select", true, YN("y", "n")),
  f("li", "LinkedIn Profile", "input_text", false),
];
const OWNER = "TEST-owner";
const RESUME = { filename: "TEST-resume.pdf", sha256: "b".repeat(64) };
const NOW = Date.UTC(2026, 9, 21);
const URL_ = "https://jobs.lever.co/test-co/1111-2222/apply";
// A fact the owner stated himself: confirmed, his, a positive provenance, the event that confirmed it.
const own = (factId: string, value: string, extra: Record<string, unknown> = {}) =>
  ({ value, factId, confirmed: true, user_id: OWNER, provenance: "owner stated in chat 2026-10-18", confirmation_event_id: `evt-${factId}`, ...extra });
const CLEAN = {
  user_id: OWNER,
  answers: {
    first_name: own("F-001", "Test"), last_name: own("F-002", "Person"), email: own("F-003", "test.person@example.test"),
    sponsorship: own("F-005", "No"), work_authorization: own("F-006", "Yes"), linkedin: own("F-007", "https://www.linkedin.com/in/test-person"),
  },
  saved: {},
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const manifest = (file: unknown = CLEAN, rows: { id: string; key: string; kind: string; answer: string; answered_at: string }[] = []) =>
  trustedManifest({ owner: OWNER, file, rows, resume: RESUME });
function entry(o: Partial<{ schema: F[]; file: unknown; rows: any[]; plan: any }> = {}) {
  const schema = o.schema ?? SCHEMA;
  const m = manifest(o.file ?? CLEAN, o.rows ?? []);
  const plan = o.plan ?? planForm({ userId: OWNER, jobId: "lever:test-co:1111-2222", company: "test-co", family: "lever", schema, answers: m.answers, saved: m.saved, now: NOW });
  return { m, e: batchPlan({ jobId: "lever:test-co:1111-2222", company: "test-co", url: URL_, family: "lever", schema, plan, challenge: false, resume: RESUME, manifest: m }) };
}
function card(p: BatchPosting): SnapField[] {
  return p.answers.map((a) => ({
    name: a.name, label: a.label, value: a.shown, source: "trainee" as const, factId: a.factId, masked: false,
    detail: a.kind === "file" ? `${a.file}:2048:application/pdf` : a.kind === "select" ? `value=${a.value}` : "",
  }));
}

Deno.test("WO-102/1 a clean application passes: every answer is the owner's own fact, with its whole ledger row", () => {
  const { m, e } = entry();
  assert(m.excluded.length === 0 && m.conflicts.length === 0, JSON.stringify(m.excluded));
  assert(e.ok, JSON.stringify(e));
  const p = e.posting;
  assert(p.ledger.length === p.answers.length && p.answers.length === 7, JSON.stringify(p.ledger.map((l) => l.field_id)));
  for (const l of p.ledger) {
    assert(l.application_id === "lever:test-co:1111-2222" && l.field_id && /^[0-9a-f]{64}$/.test(l.question_hash) && /^[0-9a-f]{64}$/.test(l.answer_hash), JSON.stringify(l));
    assert(l.fact_refs.length >= 1 && l.source_refs.length >= 1 && l.confirmation_event_id && l.derivation_rule, JSON.stringify(l));
  }
  const rule = (n: string) => p.ledger.find((l) => l.field_id === n)!.derivation_rule;
  assert(rule("fn") === "verbatim" && rule("spons") === "option-exact" && rule("resume") === "attachment", JSON.stringify(p.ledger));
  assert(p.quarantine_version === QUARANTINE_VERSION && p.manifest_hash === m.hash && /^[0-9a-f]{64}$/.test(p.question_set_hash));
  assert(batchMatch({ approved: p, now: entry().e, card: card(p), openRequired: [], blockers: [] }).ok, "and the exact page goes");
});

Deno.test("WO-102/2 contaminated fixtures never reach a batch: the 47, their provenance, unlabelled invented facts, legacy facts", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["an invented id (F-033)", own("F-033", "No")],
    ["an invented id at the edge (F-027)", own("F-027", "No")],
    ["an invented id at the edge (F-065)", own("F-065", "No")],
    ["the delegation's provenance under a new id", own("F-200", "No", { provenance: "owner-delegated 2026-10-17 (answer-all directive)" })],
    ["quarantined:false does not clear an invented fact", own("F-040", "No", { quarantined: false })],
    ["a legacy fact with no provenance", { value: "No", factId: "F-010", confirmed: true, user_id: OWNER }],
    ["no confirmation event", own("F-011", "No", { confirmation_event_id: "" })],
    ["a provenance that is not the owner's", own("F-012", "No", { provenance: "inferred by Trainee from the resume" })],
    ["unconfirmed", own("F-013", "No", { confirmed: false })],
  ];
  for (const [what, fact] of cases) {
    const file = clone(CLEAN);
    (file.answers as any).sponsorship = fact;
    const { m, e } = entry({ file });
    assert(!m.answers.sponsorship, `${what}: not in the manifest`);
    assert(m.excluded.some((x) => x.key === "sponsorship"), `${what}: listed as excluded`);
    assert(!e.ok && e.why.some((w) => /sponsorship/i.test(w) && /needs your answer/.test(w)), `${what}: the required question is asked and blocks: ${JSON.stringify(e)}`);
  }
});

Deno.test("WO-102/3 anything derived from an excluded fact is excluded: answers, essays, profile fields", () => {
  const file = clone(CLEAN);
  (file.answers as any).linkedin = own("F-090", "https://www.linkedin.com/in/test-person", { derived_from: ["F-033"] });
  (file.answers as any).first_name = own("F-091", "Test", { derived_from: ["F-001", "F-999"] }); // an unknown source
  (file.saved as any)["label:aaaaaaaaaaaaaaaa"] = own("F-092", "TEST essay paragraph", { kind: "application_text", derived_from: ["F-067"] });
  const { m } = entry({ file });
  assert(!m.answers.linkedin && !m.answers.first_name && !m.saved["label:aaaaaaaaaaaaaaaa"], JSON.stringify(m.answers));
  assert(m.excluded.filter((x) => /derived/.test(x.why)).length === 3, JSON.stringify(m.excluded));
});

Deno.test("WO-102/4 forged or cross-user references stop: another person's file, another person's fact, a reserved id", () => {
  const theirs = { ...clone(CLEAN), user_id: "TEST-someone-else" };
  const a = manifest(theirs);
  assert(Object.keys(a.answers).filter((k) => k !== "resume").length === 0 && a.excluded.length > 0, "another person's file gives nothing (only the file he picked)");
  const one = clone(CLEAN);
  (one.answers as any).email = own("F-003", "x@example.test", { user_id: "TEST-someone-else" });
  (one.answers as any).first_name = own("text-answer:12", "Test"); // a file fact posing as a text answer
  (one.answers as any).last_name = own("approved-local-resume:abc", "Person");
  const b = manifest(one);
  assert(!b.answers.email && !b.answers.first_name && !b.answers.last_name, JSON.stringify(b.answers));
  // A planned answer whose fact id is not in the manifest (a forged reference) is never sent.
  const { e } = entry({ plan: { fill: [{ name: "fn", label: "First name", value: "Test", factId: "F-001" }, { name: "ln", label: "Last name", value: "Person", factId: "F-777" }], needs: [], identity: [], ambiguous: [] } });
  assert(!e.ok && e.why.some((w) => /Last name/.test(w)), JSON.stringify(e));
});

Deno.test("WO-102/5 conflicts and stale caches are asked: a text answer that disagrees with the file excludes both", () => {
  const rows = [{ id: "41", key: "fact:sponsorship", kind: "fact", answer: "Yes", answered_at: "2026-10-20T00:00:00Z" }];
  const { m, e } = entry({ rows });
  assert(!m.answers.sponsorship && m.conflicts.some((c) => c.key === "sponsorship"), JSON.stringify(m.conflicts));
  assert(!e.ok && e.why.some((w) => /sponsorship/i.test(w)), JSON.stringify(e));
  const same = entry({ rows: [{ id: "42", key: "fact:sponsorship", kind: "fact", answer: "no", answered_at: "2026-10-20T00:00:00Z" }] });
  assert(same.e.ok && same.m.conflicts.length === 0, "the same answer twice is no conflict");
});

Deno.test("WO-102/6 an unsupported change of meaning is asked when required and left empty when optional", () => {
  const plan = { fill: [
    { name: "fn", label: "First name", value: "Test", factId: "F-001" }, { name: "ln", label: "Last name", value: "Person", factId: "F-002" },
    { name: "email", label: "Email", value: "test.person@example.test", factId: "F-003" },
    { name: "resume", label: "Resume/CV", value: "b".repeat(64), factId: "approved-local-resume:" + "b".repeat(64) },
    { name: "spons", label: SCHEMA[4].label, value: "0", factId: "F-005" },
    { name: "auth", label: SCHEMA[5].label, value: "n", factId: "F-006" }, // the fact says Yes; the planner says No
    { name: "li", label: "LinkedIn Profile", value: "linkedin.com/in/someone-else", factId: "F-007" }, // not his words
  ], needs: [], identity: [], ambiguous: [] };
  const { e } = entry({ plan });
  assert(!e.ok && e.why.some((w) => /authorized to work/.test(w) && /not what you said/.test(w)), JSON.stringify(e));
  const optionalOnly = { ...plan, fill: plan.fill.map((x) => x.name === "auth" ? { ...x, value: "y" } : x) };
  const r = entry({ plan: optionalOnly }).e;
  assert(r.ok && !r.posting.answers.some((a) => a.name === "li") && r.posting.blank.includes("LinkedIn Profile"), JSON.stringify(r));
});

Deno.test("WO-102/7 attestations and personal choices go only on the owner's own answer to that question", () => {
  const schema = [...SCHEMA, f("cert", "I certify that the information in this application is true and complete", "checkbox", true),
    f("gender", "Gender", "multi_value_single_select", false, [{ label: "Male", value: "m" }, { label: "Female", value: "f" }])];
  const file = clone(CLEAN);
  (file.answers as any).gender = own("F-020", "Male");
  const plan = (m: any) => {
    const p = planForm({ userId: OWNER, jobId: "lever:test-co:1111-2222", company: "test-co", family: "lever", schema, answers: m.answers, saved: m.saved, now: NOW });
    return { ...p, fill: [...p.fill, { name: "cert", label: schema[7].label, value: "Yes", factId: "F-001" }, { name: "gender", label: "Gender", value: "m", factId: "F-020" }], needs: [] };
  };
  const m1 = manifest(file);
  const e1 = batchPlan({ jobId: "j", company: "c", url: URL_, family: "lever", schema, plan: plan(m1), challenge: false, resume: RESUME, manifest: m1 });
  assert(!e1.ok && e1.why.some((w) => /certify/.test(w) && /your own answer/.test(w)), JSON.stringify(e1));
  // His own answer to that exact question (a label-keyed answer he gave) authorizes it; the gender fact alone does not.
  const rows = [{ id: "51", key: "label:cccccccccccccccc", kind: "label", answer: "Yes", answered_at: "2026-10-21T00:00:00Z" }];
  const m2 = manifest(file, rows);
  const p2 = plan(m2);
  p2.fill = p2.fill.map((x: any) => x.name === "cert" ? { ...x, factId: "text-answer:51" } : x);
  const e2 = batchPlan({ jobId: "j", company: "c", url: URL_, family: "lever", schema, plan: p2, challenge: false, resume: RESUME, manifest: m2 });
  assert(e2.ok, JSON.stringify(e2));
  assert(e2.posting.answers.some((a) => a.name === "cert") && !e2.posting.answers.some((a) => a.name === "gender"), "certified on his answer; gender left empty");
});

Deno.test("WO-102/8 the approval binds the question set, the manifest, the attachment and the quarantine version; a change stops the send", async () => {
  const base = entry().e;
  assert(base.ok);
  const h = await batchHash(base.posting);
  const asked = entry({ schema: SCHEMA.map((x) => x.name === "spons" ? { ...x, options: [...x.options, { label: "Not sure", value: "2" }] } : x) }).e;
  assert(asked.ok && asked.posting.question_set_hash !== base.posting.question_set_hash && (await batchHash(asked.posting)) !== h, "the question set is bound");
  const changed = clone(CLEAN);
  (changed.answers as any).email = own("F-003", "new.address@example.test");
  const later = entry({ file: changed }).e;
  const r = batchMatch({ approved: base.posting, now: later, card: card(base.posting), openRequired: [], blockers: [] });
  assert(!r.ok && r.diffs.some((d) => /facts behind/.test(d)), JSON.stringify(r.diffs));
  const withdrawn = clone(CLEAN);
  delete (withdrawn.answers as any).linkedin;
  const r2 = batchMatch({ approved: base.posting, now: entry({ file: withdrawn }).e, card: card(base.posting), openRequired: [], blockers: [] });
  assert(!r2.ok, "a withdrawn fact stops it");
  const older = { ...base.posting, quarantine_version: "d007-v0" };
  assert(!batchMatch({ approved: older, now: base, card: card(base.posting), openRequired: [], blockers: [] }).ok, "an approval under another quarantine version stops it");
  const bytes = card(base.posting).map((x) => x.name === "resume" ? { ...x, detail: `${"c".repeat(64)}:2048:application/pdf` } : x);
  assert(!batchMatch({ approved: base.posting, now: base, card: bytes, openRequired: [], blockers: [] }).ok, "other attachment bytes stop it");
});

Deno.test("WO-102/9 the manifest is deterministic and its hash covers every kept fact and the quarantine version", () => {
  const a = manifest(), b = manifest(clone(CLEAN));
  assert(a.hash === b.hash && /^[0-9a-f]{64}$/.test(a.hash) && a.version === QUARANTINE_VERSION);
  const c = clone(CLEAN);
  (c.answers as any).first_name = own("F-001", "Tess");
  assert(manifest(c).hash !== a.hash);
});

Deno.test("WO-102/10 before anything is filled, in every path: the contract keeps only supported answers and turns the rest back into questions", async () => {
  const { contractFill } = await import("../../extension/src/apply_core.ts");
  const m = manifest();
  const plan = { fill: [
    { name: "fn", label: "First name", value: "Test", factId: "F-001" },
    { name: "auth", label: SCHEMA[5].label, value: "n", factId: "F-006" }, // not what he said: asked
    { name: "li", label: "LinkedIn Profile", value: "linkedin.com/in/someone-else", factId: "F-007" }, // optional: left empty
    { name: "email", label: "Email", value: "test.person@example.test", factId: "F-999" }, // no trusted fact: asked
  ], needs: [], identity: [], ambiguous: [] };
  const r = contractFill({ schema: SCHEMA, plan, manifest: m, resume: RESUME });
  assert(r.fill.map((x) => x.name).join(",") === "fn", JSON.stringify(r.fill));
  assert(r.asks.map((x) => x.label).sort().join("|") === ["Are you legally authorized to work in the United States?", "Email"].sort().join("|"), JSON.stringify(r.asks));
  assert(r.asks.find((x) => x.label === "Email")!.type === "input_text" && r.asks.find((x) => /authorized/.test(x.label))!.options.join(",") === "Yes,No");
  assert(r.dropped.join() === "LinkedIn Profile");
});
