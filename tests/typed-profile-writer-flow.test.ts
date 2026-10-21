// Local writer -> metadata -> projection -> canonical contract. Event ids and provenance are written only by
// confirm_profile_fact; the in-memory event store represents persistence and never supplies invented evidence.
import { CareerProfile } from "../supabase/functions/_shared/router_core.career.js";
import { careerTools } from "../supabase/functions/_shared/agent/career_tools.ts";
import { typedProfileFile } from "../supabase/functions/_shared/typed_profile_fields.ts";
import { trustedManifest, planForm, contractFill } from "../extension/src/apply_core.ts";

const OWNER = "SYN-WRITER-OWNER", NOW = Date.UTC(2026, 9, 21, 20);
const assert = (v: unknown, m: string) => { if (!v) throw new Error(m); };
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)}`);
async function write(clauses: string[], persist = true) {
  const rows: any[] = [], profile = CareerProfile.createProfile({ user_id: OWNER });
  const tools = careerTools({ postings: async () => [], events: persist ? { add: async (e: any) => { rows.push(e); } } : null } as any);
  const add = tools.find(t => t.name === "add_profile_fact")!, confirm = tools.find(t => t.name === "confirm_profile_fact")!;
  for (const [i, text] of clauses.entries()) {
    const ctx = { userId: OWNER, threadId: "SYN-THREAD", now: NOW + i, state: { profile }, turn: { message: text, added: [] } } as any;
    const { fact } = await add.run({ kind: "other", text }, ctx) as any;
    // A subsequent turn provides the person's plain yes. Neither the adapter nor the test stamps evidence.
    ctx.turn = { message: "yes that's right", added: [] };
    await confirm.run({ id: fact.id }, ctx);
  }
  return { rows, profile };
}
const schema = [
  { name: "full_name", label: "Full name", type: "input_text", required: true, options: [] },
  { name: "email", label: "Email", type: "input_text", required: true, options: [] },
];
function application(profile: any, fields = schema) {
  const manifest = trustedManifest({ owner: OWNER, file: profile, rows: [], resume: null });
  const plan = planForm({ userId: OWNER, jobId: "SYN-JOB", company: "Synthetic Employer", family: "greenhouse", schema: fields,
    answers: manifest.answers, saved: manifest.saved, now: NOW });
  return { manifest, plan, checked: contractFill({ schema: fields, plan, manifest, resume: null }) };
}

Deno.test("typed writer flow: confirmed full name and email reach the canonical plan with the writer's exact evidence", async () => {
  const { profile, rows } = await write(["My full name is Test Person.", "My email is test.person@example.invalid."]);
  const before = JSON.stringify(profile), projected = typedProfileFile({ owner: OWNER, profile }), r = application(profile);
  eq(Object.fromEntries(r.checked.fill.map(f => [f.name, f.value])), { full_name: "Test Person", email: "test.person@example.invalid" }, "confirmed identity was not filled");
  eq(r.checked.asks, [], "usable identity asked again");
  eq(r.plan.needs, [], "usable identity left an open question");
  for (const [key, answer] of Object.entries(projected.file.answers)) {
    const event = rows.find(e => e.kind === "fact_confirmed" && e.detail.id === answer.factId), source = profile.facts.find((f: any) => f.id === answer.factId);
    assert(event?.user_id === OWNER && event.source === "chat", key + " lacks the real actor-bound writer event");
    eq(answer.confirmation_event_id, event.detail.confirmation_event_id, key + " event was fabricated");
    eq(answer.provenance, source.provenance, key + " provenance changed");
    eq(r.manifest.byFactId[answer.factId]?.event, event.detail.confirmation_event_id, key + " contract lost the event");
  }
  eq(JSON.stringify(profile), before, "projection mutated the writer record");
});

Deno.test("typed writer flow: a full name never supplies guessed first or last names", async () => {
  const { profile } = await write(["My full name is Test Person."]);
  const r = application(profile, [{ name: "first_name", label: "First name", type: "input_text", required: true, options: [] },
    { name: "last_name", label: "Last name", type: "input_text", required: true, options: [] }]);
  eq(r.checked.fill, [], "name was split without an explicit source");
  eq(r.plan.needs.length, 2, "missing names were not asked");
});

Deno.test("typed writer flow: existing country, phone and US authorization also retain the real writer event", async () => {
  const { profile, rows } = await write(["My country is United States.", "My phone is +1 202 555 0147.", "I am authorized to work in the US."]);
  const fields = [
    { name: "country", label: "Country", type: "input_text", required: true, options: [] },
    { name: "phone", label: "Phone", type: "input_text", required: true, options: [] },
    { name: "auth", label: "Are you legally authorized to work in the United States?", type: "multi_value_single_select", required: true,
      options: [{ label: "Yes", value: "Y" }, { label: "No", value: "N" }] },
  ];
  const r = application(profile, fields);
  eq(Object.fromEntries(r.checked.fill.map(f => [f.name, f.value])), { country: "United States", phone: "+1 202 555 0147", auth: "Y" }, "existing fields lost writer evidence");
  eq(r.plan.needs, [], "confirmed supported fields remained unanswered");
  for (const f of r.checked.fill) {
    const event = rows.find(e => e.kind === "fact_confirmed" && e.detail.id === f.factId);
    eq(r.manifest.byFactId[f.factId]?.event, event?.detail.confirmation_event_id, "canonical answer lost the actual writer event");
  }
});

Deno.test("typed writer flow: two genuinely confirmed emails require the owner's correction", async () => {
  const { profile } = await write(["My email is test@example.invalid.", "My email is other@example.invalid."]);
  const r = application(profile, schema.slice(1));
  eq(r.checked.fill, [], "one conflicting email silently won");
  eq(r.plan.needs.length, 1, "conflicting email was not asked");
});

Deno.test("typed writer flow: missing persisted confirmation cannot become application evidence", async () => {
  const { profile, rows } = await write(["My full name is Test Person.", "My email is test.person@example.invalid."], false);
  eq(rows, [], "unexpected persisted event");
  for (const f of profile.facts) assert(f.confirmation_event_id === undefined && f.provenance === undefined, "missing writer evidence was fabricated");
  const r = application(profile);
  eq(r.checked.fill, [], "unrecorded evidence authorized identity");
  eq(r.plan.needs.length, 2, "missing evidence was not asked");
});

for (const [label, change] of [
  ["cross-owner profile", (p: any) => { p.user_id = "SYN-OTHER"; }],
  ["cross-owner fact", (p: any) => { p.facts[0].user_id = "SYN-OTHER"; }],
  ["denied source", (p: any) => { p.facts[0].source = "assistant"; }],
  ["quarantined fact", (p: any) => { p.facts[0].quarantined = true; }],
  ["malformed derivation", (p: any) => { p.facts[0].derivedFrom = "F-033"; }],
] as const) Deno.test("typed writer flow: " + label + " remains a required question", async () => {
  const { profile } = await write(["My email is test.person@example.invalid."]);
  change(profile);
  const r = application(profile, schema.slice(1));
  eq(r.checked.fill, [], label + " supplied an answer");
  eq(r.plan.needs.length, 1, label + " was not asked");
});

Deno.test("typed writer flow: ambiguous identity and control characters are asked without guessing", async () => {
  for (const text of ["My full name is Test Person or Other Person.", "My full name is Test Person and Other Person.", "My full name is unknown.", "My full name is Test\nPerson.",
    "My email is test@example.invalid or other@example.invalid.", "My email is test\u200b@example.invalid.", "My email is test@example.invalid\n.",
    "My email is test..person@example.invalid.", "My email is " + "a".repeat(65) + "@example.invalid."]) {
    const { profile } = await write([text]), projected = typedProfileFile({ owner: OWNER, profile });
    eq(projected.file.answers, {}, "identity was guessed from " + JSON.stringify(text));
    assert(projected.needs.length > 0, "unsupported identity lacks a review question");
  }
});
