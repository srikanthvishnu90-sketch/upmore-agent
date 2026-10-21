// FRS cover letter: a posting that asks for a cover letter gets one built only from the person's confirmed facts, shown
// in full and put on the form only by their own Use, or (a file) attached by them; never a silent skip, never the resume
// as a cover letter, never an invented claim. Labels are the captured forms' own (tests/fixtures/forms-ci, and the CI
// question sets). Synthetic TEST facts; a fake model; no network.
import { essayCardDraft, type EssayCardDeps } from "../../supabase/functions/_shared/career_essay_card.ts";
import * as AC from "../../extension/src/apply_core.ts";
import type { SnapField } from "../../extension/src/apply_core.ts";
import { mapQuestion } from "../../supabase/functions/_shared/question_map.ts";
import CONTENT from "../../extension/content.js" with { type: "text" };

const {
  answerOnceQuestions, batchPlan, cardLines, contractFill, draftFactId, essayQuestions, evidenceRecord, OWN_WORDS_BANNED, planForm, questionsForTrainee,
  reviewPayload, trustedManifest,
} = AC;
const coverLetterFiles = (o: { schema: any[]; fields: { name: string }[] }) => (AC as any).coverLetterFiles(o) as { name: string; required: boolean; attached: boolean; pasted: boolean }[];

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const T = Date.UTC(2026, 9, 21, 15);
const f = (name: string, label: string, type: string, required: boolean) => ({ name, label, type, required, options: [] as { label: string; value: string }[] });
const BASE = [f("first_name", "First Name", "input_text", true), f("email", "Email", "input_text", true), f("resume", "Resume/CV", "file", true)];
const ev = (value: string, factId: string) => ({ value, factId, confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: "evt-" + factId });
const MANIFEST = trustedManifest({ owner: "U", rows: [], resume: { sha256: "a".repeat(64) },
  file: { user_id: "U", answers: { first_name: ev("Testy", "T-1"), email: ev("testy@example.test", "T-2") }, saved: {} } });
const RESUME = { filename: "TEST-resume.pdf", sha256: "a".repeat(64) };
const plan = (schema: any[], manifest = MANIFEST) =>
  planForm({ userId: "U", jobId: "greenhouse:acme:1", company: "Acme", family: "greenhouse", schema, answers: manifest.answers, saved: manifest.saved, now: T });
const batch = (schema: any[], manifest = MANIFEST) => batchPlan({ jobId: "greenhouse:acme:1", company: "Acme", url: "https://job-boards.greenhouse.io/acme/jobs/1",
  family: "greenhouse", schema, plan: plan(schema, manifest), challenge: false, resume: RESUME, manifest });

Deno.test("FRS-CL/1 a cover letter typed into a text box is a written answer: kept for this posting, left for the card, never a panel question that travels", () => {
  for (const label of ["Cover Letter", "Add a cover letter or anything else you want to share", "Additional Information: Paste your cover letter or anything else"]) {
    eq(mapQuestion({ label, type: "textarea" }).kind, "essay", label);
  }
  eq(mapQuestion({ label: "Cover Letter", type: "file" }).fact, "cover_letter", "an upload stays a file");
  assert(mapQuestion({ label: "Have you uploaded your cover letter?", type: "select", options: [{ label: "Yes" }, { label: "No" }] }).kind !== "essay");
  const needs = [{ label: "Cover Letter", type: "textarea", options: [] }];
  const row = (questionsForTrainee({ jobId: "greenhouse:acme:1", company: "Acme", needs, answers: {}, answered: new Set() }).questions as any[])[0];
  assert(/^job:[0-9a-f]{16}$/.test(row.key), `this posting's only, never a wording another employer's form would read: ${row.key}`);
  const ao = answerOnceQuestions({ postings: [{ jobId: "greenhouse:acme:1", company: "Acme", needs }], answers: {}, answered: new Set() });
  eq(ao.questions, [], "not typed once in the panel");
  eq(ao.left, [{ jobId: "greenhouse:acme:1", label: "Cover Letter", why: "essay" }], "left for the card's Draft from my facts");
});

Deno.test("FRS-CL/2 the card offers Draft from my facts on a cover-letter text box, required or optional; a form that bans AI gets none", () => {
  const req = f("cover_letter_text", "Cover Letter", "textarea", true), opt = f("cl", "Cover letter", "textarea", false);
  eq(essayQuestions({ schema: [...BASE, req] as any, fields: [] }).map((e) => [e.name, e.own]), [["cover_letter_text", null]]);
  eq(essayQuestions({ schema: [...BASE, opt] as any, fields: [] }).map((e) => e.name), ["cl"], "an optional cover letter is offered too");
  eq(essayQuestions({ schema: [...BASE, opt] as any, fields: [{ name: "cl", source: "you" }] }), [], "one the person wrote is theirs");
  const ban = f("ack", "I confirm my answers are only my own words, written without AI tools.", "checkbox", true);
  eq(essayQuestions({ schema: [...BASE, req, ban] as any, fields: [] })[0].own, OWN_WORDS_BANNED, "the person writes it");
  // An optional essay that is not a cover letter is still not offered (WO-049/10).
  eq(essayQuestions({ schema: [f("why", "Why do you want to work here?", "textarea", false)] as any, fields: [] }), []);
});

// The server drafts it: only confirmed facts, never a quarantined one (D-007), every item traced (factLock).
const FACTS = [
  { id: "F-001", kind: "experience", text: "TEST Analyst at TEST Corp, 2021 to 2024; cut report build time from 9 hours to 2", status: "confirmed", needs_confirmation: false },
  { id: "F-002", kind: "project", text: "Built a TEST Tracker reconciliation app in Python used by 40 analysts", status: "confirmed", needs_confirmation: false },
  { id: "F-003", kind: "preference", text: "Wants to build analytics tools for finance teams", status: "confirmed", needs_confirmation: false },
  { id: "F-004", kind: "experience", text: "ZEBRA-INVENTED Lead at Delegated Co running a platform team", status: "confirmed", needs_confirmation: false, provenance: "owner-delegated 2026-10-17 (answer-all directive)" },
  { id: "F-005", kind: "experience", text: "Led a team of 12 engineers at Stripe as engineering manager", status: "draft", needs_confirmation: true },
];
const CLEAN = "At TEST Corp I cut report build time from 9 hours to 2 as a TEST Analyst. I built a TEST Tracker reconciliation app in Python used by 40 analysts, and I want to build analytics tools for finance teams like Acme's.";
const INVENTED = "At Stripe I led a team of 12 engineers and doubled revenue to $2M using Kubernetes.";
function stub(...texts: string[]) {
  const calls: any[] = [];
  const model = async (p: any) => {
    calls.push(p);
    return { type: "message", role: "assistant", content: [{ type: "text", text: texts[Math.min(calls.length - 1, texts.length - 1)] }], stop_reason: "end_turn" };
  };
  return { model, calls };
}
const deps = (model: any): EssayCardDeps => ({
  facts: async () => FACTS, model, now: () => T,
  counter: { used: async () => 0, reserve: async () => "r-1", release: async () => {} },
});
const ask = (o: Record<string, unknown> = {}) =>
  ({ posting: "greenhouse:acme:1", company: "Acme", label: "Cover Letter", type: "textarea", siblings: ["First Name", "Email"], limit: { chars: null, words: null }, previous: null, ...o });

Deno.test("FRS-CL/3 the cover letter is drafted only from confirmed facts, never a quarantined or unconfirmed one, and an invented claim is never shown", async () => {
  const m = stub(CLEAN);
  const r = await essayCardDraft("u1", ask(), deps(m.model));
  assert(r.ok, JSON.stringify(r));
  eq((r as any).text, CLEAN, "shown whole");
  assert(!(r as any).fact_ids.includes("F-004") && !(r as any).fact_ids.includes("F-005"), `facts used: ${(r as any).fact_ids}`);
  assert(["F-001", "F-002"].every((id) => (r as any).fact_ids.includes(id)));
  const given = JSON.stringify(m.calls[0]);
  assert(!given.includes("ZEBRA-INVENTED") && !given.includes("Stripe"), "the model never sees a quarantined or unconfirmed fact");
  assert(/goes on the form only if you tap Use this/.test(r.message), r.message);
  const bad = stub(INVENTED, INVENTED);
  const no = await essayCardDraft("u1", ask(), deps(bad.model));
  eq([no.ok, (no as any).why, (no as any).text], [false, "unverified", undefined], "the factLock holds for a cover letter");
  const banned = stub(CLEAN);
  const own = await essayCardDraft("u1", ask({ siblings: ["I confirm my answers are only my own words, written without AI tools."] }), deps(banned.model));
  eq([own.ok, (own as any).why, banned.calls.length], [false, "policy", 0], "an employer that bans AI gets the person's own words; no model call");
});

Deno.test("FRS-CL/4 a used cover-letter draft names the draft and its facts in what is approved, on the card and in the proof; a batch never fills one", async () => {
  const snap = (o: Partial<SnapField>): SnapField => ({ name: "n", label: "L", value: "v", source: "trainee", factId: "T-1", masked: false, ...o });
  const cl = snap({ name: "cover_letter_text", label: "Cover Letter", value: CLEAN, source: "drafted", factId: draftFactId(["F-001", "F-002", "F-003"]) });
  const payload = reviewPayload({ userId: "U", jobId: "greenhouse:acme:1", company: "Acme", url: "https://job-boards.greenhouse.io/acme/jobs/1", family: "greenhouse",
    fields: [snap({ name: "first_name", label: "First Name", value: "Testy" }), cl], resume: RESUME, account: { epoch: 0, version: 1 }, expiresAt: "2026-10-21T17:00:00.000Z" });
  const row = payload.fields.find((x) => x.name === "cover_letter_text")!;
  eq([row.source, row.factId, row.value], ["drafted", "essay-draft:F-001,F-002,F-003", CLEAN]);
  const lines = cardLines({ company: "Acme", family: "greenhouse", payload, openRequired: [], identity: [], blockers: [], verification: [] });
  assert(lines.includes(`Cover Letter: ${CLEAN} (drafted by Trainee from your confirmed facts F-001, F-002, F-003; put on the form by you)`), lines.join("\n"));
  const proof = await evidenceRecord({ payload, hash: "h", outcome: { state: "confirmed", reason: "r", confirmation_id: null }, pageText: "Thanks", urlAfter: "https://x.test",
    screenshotSha256: null, screenshotAfterSha256: null, times: { card: T, approved: T, clicked: T, done: T }, drafts: { cover_letter_text: { original: CLEAN, factIds: ["F-001", "F-002", "F-003"] } } });
  eq((proof.answers as any[]).find((a) => a.label === "Cover Letter").fact_ids, ["F-001", "F-002", "F-003"]);
  // The agent's batch never writes or fills one: a required cover letter keeps the posting for the person; an optional one is left blank.
  const req = batch([...BASE, f("cl", "Cover letter", "textarea", true)]);
  assert(!req.ok && req.why.some((w) => w.startsWith('"Cover letter"')), JSON.stringify(req));
  const opt = batch([...BASE, f("cl", "Cover letter", "textarea", false)]);
  assert(opt.ok && opt.posting.blank.includes("Cover letter") && !opt.posting.answers.some((a) => a.name === "cl"), JSON.stringify(opt));
});

Deno.test("FRS-CL/5 a required cover-letter upload is asked (the person attaches one) and the batch waits; an optional one is left empty and the card says so", () => {
  const req = f("cover_letter", "Cover Letter*", "file", true), opt = f("cover_letter", "Portfolio or Cover Letter", "file", false);
  const b = batch([...BASE, req]);
  assert(!b.ok, "not ready");
  assert(b.why.some((w) => /^"Cover Letter\*" asks for a cover letter file: only you attach one/.test(w)), b.why.join("\n"));
  const payload = reviewPayload({ userId: "U", jobId: "greenhouse:acme:1", company: "Acme", url: "https://job-boards.greenhouse.io/acme/jobs/1", family: "greenhouse",
    fields: [], resume: RESUME, account: { epoch: 0, version: 1 }, expiresAt: "2026-10-21T17:00:00.000Z" });
  const card = (schema: any[], fields: { name: string }[], open: string[]) =>
    cardLines({ company: "Acme", family: "greenhouse", payload, openRequired: open, identity: [], blockers: [], verification: [], coverFiles: coverLetterFiles({ schema, fields }) });
  const asked = card([...BASE, req], [], ["Cover Letter"]);
  assert(asked.includes("Still needed: Cover Letter. Attach your cover letter on the form yourself; Trainee never attaches your resume as a cover letter."), asked.join("\n"));
  assert(!asked.some((l) => /Cover Letter\. Answer it on the form, or answer Trainee once by text/.test(l)), "a file is never asked by text");
  const left = card([...BASE, opt], [], []);
  assert(left.includes("Left empty: Portfolio or Cover Letter (optional). Trainee doesn't attach a cover letter, and never your resume as one; attach one yourself if you want to send it."), left.join("\n"));
  eq(card([...BASE, opt], [{ name: "cover_letter" }], []).filter((l) => /Left empty/.test(l)), [], "attached by the person: nothing to say");
  // Greenhouse's paste box beside the upload answers it: a cover letter pasted (or drafted and used) there is not still needed.
  const pair = [...BASE, req, f("cover_letter_text", "Cover Letter", "textarea", true)];
  eq(coverLetterFiles({ schema: pair as any, fields: [{ name: "cover_letter_text" }] }).map((c) => [c.name, c.required, c.attached, c.pasted]), [["cover_letter", true, false, true]]);
  eq(essayQuestions({ schema: pair as any, fields: [] }).map((e) => e.name), ["cover_letter_text"], "the paste box is offered a draft");
});

Deno.test("FRS-CL/6 the resume is never attached as a cover letter, even if the planner offered it", () => {
  // A planner answer that would put the approved resume into the cover-letter upload (simulated: the resume's fact under cover_letter).
  const forged = { ...MANIFEST, answers: { ...MANIFEST.answers, cover_letter: MANIFEST.answers.resume } };
  for (const required of [true, false]) {
    const schema = [...BASE, f("cover_letter", "Cover Letter", "file", required)];
    const p = plan(schema, forged);
    assert(p.fill.some((x) => x.name === "cover_letter"), "the simulated planner answer is there");
    const c = contractFill({ schema: schema as any, plan: p, manifest: forged, resume: RESUME });
    assert(!c.fill.some((x) => x.name === "cover_letter"), `required=${required}: never filled with the resume`);
    assert(c.fill.some((x) => x.name === "resume"), "the resume still goes in the resume upload");
    eq(required ? c.asks.map((a) => a.label) : c.dropped, ["Cover Letter"], `required=${required}`);
    const b = batchPlan({ jobId: "greenhouse:acme:1", company: "Acme", url: "https://x.test", family: "greenhouse", schema: schema as any, plan: p, challenge: false, resume: RESUME, manifest: forged });
    assert(!(b.ok && b.posting.answers.some((a) => a.name === "cover_letter")), "never in a batch");
  }
});

Deno.test("FRS-CL/7 wiring: the card reads the cover-letter uploads, and a cover letter pasted in its text box is not still needed", () => {
  assert(/C\.coverLetterFiles\(\{ schema: form\.schema, fields \}\)/.test(CONTENT), "the content script reads them from the live form");
  assert(/coverFiles/.test(CONTENT.slice(CONTENT.indexOf("C.cardLines("), CONTENT.indexOf("C.cardLines(") + 600)), "and gives them to the card");
  assert(/pasted/.test(CONTENT.slice(CONTENT.indexOf("function openRequired"), CONTENT.indexOf("function openRequired") + 500)));
});
