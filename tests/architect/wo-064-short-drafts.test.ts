// WO-064: the panel's questions drafted from the person's confirmed facts; the person reviews and saves, never the model.
// The pure core (supabase/functions/_shared/answer_draft.ts) and the edge's core (career_answer_card.ts) with a stub
// model. Real wording from the captured CI question sets. No model, no network, no database.
import {
  BATCH, draftShortAnswers, neverDraft, type ShortQuestion, vetoDraft,
} from "../../supabase/functions/_shared/answer_draft.ts";
import {
  ANSWER_CAP, type AnswerCounter, handleAnswerDraft, readShortRequest,
} from "../../supabase/functions/_shared/career_answer_card.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}

const FACTS = [
  { id: "F-1", kind: "experience", text: "Data Analyst at Example Analytics since 2023; built SQL dashboards in Looker for the sales team", status: "confirmed" },
  { id: "F-2", kind: "education", text: "B.S. Statistics, Example State University, graduated May 2022", status: "confirmed" },
  { id: "F-3", kind: "preference", text: "Salary expectation: $95,000 a year", status: "confirmed" },
  { id: "F-4", kind: "other", text: "Has never been referred by an employee of any company applied to", status: "confirmed" },
  { id: "F-5", kind: "experience", text: "Led a team of 12 engineers at Stripe", needs_confirmation: true, status: "draft" },
  { id: "F-6", kind: "other", text: "Work authorization: US citizen; will not need visa sponsorship now or in the future", status: "confirmed" },
];
const q = (key: string, label: string, options: string[] = [], type = options.length ? "select" : "text"): ShortQuestion =>
  ({ key, label, type, options, company: "Acme", location: "Chicago, IL" });
const reply = (drafts: unknown) => ({ type: "message", role: "assistant", content: [{ type: "text", text: JSON.stringify({ drafts }) }], stop_reason: "end_turn" });
function stub(fn: (payload: any, n: number) => any) {
  const calls: any[] = [];
  return { calls, model: async (p: any) => { calls.push(p); const r = fn(p, calls.length); if (r instanceof Error) throw r; return r; } };
}
const payloadText = (p: any) => JSON.stringify(p);

Deno.test("WO-064/1 never drafted: crime, a government's question about the person, EEO, identity, consent; ordinary questions pass", () => {
  for (const l of [
    "Have you ever been convicted of a felony?",
    "Are you willing to undergo a background check and drug test?",
    "Do you currently hold an active security clearance?",
    "Have you ever renounced your United States citizenship?",
    "Have you previously been determined to be unsuitable for a federal public trust position?",
    "Are you subject to U.S. export control restrictions or sanctions?",
    "Do you identify as a veteran?",
    "What is your gender?",
    "Please indicate your race/ethnicity",
    "Do you have a disability?",
    "What is your date of birth?",
    "Social Security Number",
    "I certify that the information provided is true and complete",
    "I agree to the processing of my personal data",
    "Signature",
  ]) assert(neverDraft(l), `should never draft: ${l}`);
  for (const l of [
    "What is your most recent company?",
    "Do you have experience with SQL?",
    "What are your salary expectations?",
    "Will you now or in the future require sponsorship? If so, please explain",
    "Were you referred by a current employee? If yes, who?",
  ]) eq(neverDraft(l), null, l);
});

Deno.test("WO-064/2 the model sees confirmed facts only, and never a never-drafted question", async () => {
  const s = stub(() => reply([]));
  const out = await draftShortAnswers([q("a", "What is your most recent company?"), q("b", "Have you ever been convicted of a felony?", ["Yes", "No"])],
    { model: s.model, facts: () => FACTS });
  eq(s.calls.length, 1);
  const t = payloadText(s.calls[0]);
  assert(!/Stripe/.test(t), "an unconfirmed fact reached the model");
  assert(!/convicted/.test(t), "a never-drafted question reached the model");
  assert(/Example Analytics/.test(t), "a confirmed fact is missing from the model's payload");
  eq(out.find((d) => d.key === "b"), { key: "b", ok: false, why: "never" });
  eq(out.find((d) => d.key === "a"), { key: "a", ok: false, why: "no_fact" }, "a key the model left out is no_fact");
});

Deno.test("WO-064/3 an option answer comes back in the option's own spelling; anything else is not_an_option", () => {
  const sq = q("s", "Will you now or in the future require sponsorship?", ["Yes", "No"]);
  const no = vetoDraft(sq, { answer: " no ", fact_ids: ["F-6"] }, FACTS);
  assert(no.ok, JSON.stringify(no));
  eq([no.answer, no.fact_ids, no.from.length], ["No", ["F-6"], 1]);
  assert(/Work authorization/.test(no.from[0]), "the panel names the fact it came from by label");
  eq(vetoDraft(sq, { answer: "Not now", fact_ids: ["F-6"] }, FACTS).ok, false);
  eq((vetoDraft(sq, { answer: "Not now", fact_ids: ["F-6"] }, FACTS) as any).why, "not_an_option");
  const multi = q("m", "Which tools have you used?", ["SQL", "Looker", "Tableau"], "multi_value_multi_select");
  const d = vetoDraft(multi, { answer: "sql; looker", fact_ids: ["F-1"] }, FACTS);
  assert(d.ok, JSON.stringify(d));
  eq(d.answer, "SQL; Looker");
});

Deno.test("WO-064/4 free text must trace to the cited facts: an employer, number or tool not in them is unverified", () => {
  const recent = q("r", "What is your most recent company?");
  const good = vetoDraft(recent, { answer: "Example Analytics", fact_ids: ["F-1"] }, FACTS);
  assert(good.ok, JSON.stringify(good));
  eq((vetoDraft(recent, { answer: "Stripe", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified");
  const pay = q("p", "What are your salary expectations?");
  assert(vetoDraft(pay, { answer: "$95,000 a year", fact_ids: ["F-3"] }, FACTS).ok);
  eq((vetoDraft(pay, { answer: "$120,000 a year", fact_ids: ["F-3"] }, FACTS) as any).why, "unverified");
  eq((vetoDraft(recent, { answer: "Example Analytics, using Kubernetes", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified");
});

Deno.test("WO-064/5 a no is never drafted from the absence of a fact; a yes to experience names the thing in a cited fact", () => {
  const sql = q("x", "Do you have experience with SQL?", ["Yes", "No"]);
  const tf = q("t", "Do you have experience with Terraform?", ["Yes", "No"]);
  eq((vetoDraft(tf, { answer: "No", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
  eq((vetoDraft(tf, { answer: "No", fact_ids: [] }, FACTS) as any).why, "no_fact");
  assert(vetoDraft(sql, { answer: "Yes", fact_ids: ["F-1"] }, FACTS).ok);
  eq((vetoDraft(tf, { answer: "Yes", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified", "a yes citing a fact that never names Terraform");
  const ref = q("f", "Were you referred by a current employee?", ["Yes", "No"]);
  assert(vetoDraft(ref, { answer: "No", fact_ids: ["F-4"] }, FACTS).ok, "a no stated by a fact passes");
  eq((vetoDraft(ref, { answer: "No", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
  const yrs = q("y", "How many years of experience do you have with Terraform?", ["No Experience", "1+ years", "2+ years"]);
  eq((vetoDraft(yrs, { answer: "No Experience", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
});

Deno.test("WO-064/5b years claimed in an option must be carried by a cited fact's dates or years", () => {
  const NOW = Date.UTC(2026, 9, 20);
  const yrs = q("y", "How many years of experience do you have with SQL?", ["Less than 1 year", "1-3 years", "3-5 years", "5+ years"]);
  assert(vetoDraft(yrs, { answer: "1-3 years", fact_ids: ["F-1"] }, FACTS, NOW).ok, "since 2023 carries 1-3 years in 2026");
  eq((vetoDraft(yrs, { answer: "5+ years", fact_ids: ["F-1"] }, FACTS, NOW) as any).why, "unverified", "since 2023 does not carry 5+ years");
  const sales = q("z", "Do you have 7+ years of direct software sales experience?", ["Yes", "No"]);
  eq((vetoDraft(sales, { answer: "Yes", fact_ids: ["F-1"] }, FACTS, NOW) as any).why, "unverified");
});

Deno.test("WO-064/6 a cited id that is not a confirmed fact is no_fact", () => {
  const recent = q("r", "What is your most recent company?");
  eq((vetoDraft(recent, { answer: "Stripe", fact_ids: ["F-5"] }, FACTS) as any).why, "no_fact");
  eq((vetoDraft(recent, { answer: "Example Analytics", fact_ids: ["F-99"] }, FACTS) as any).why, "no_fact");
  eq((vetoDraft(recent, { answer: "Example Analytics", fact_ids: "F-1" }, FACTS) as any).why, "no_fact");
});

Deno.test("WO-064/7 one model call per 25 questions; a failing call fails its own batch only; nothing throws", async () => {
  eq(BATCH, 25);
  const qs = Array.from({ length: 60 }, (_, i) => q(`k${i}`, `What is your most recent company? (${i})`));
  const s = stub((p, n) => {
    if (n === 2) return new Error("timeout");
    const keys = [...payloadText(p).matchAll(/k(\d+)/g)].map((m) => `k${m[1]}`);
    return reply([...new Set(keys)].map((key) => ({ key, answer: "Example Analytics", fact_ids: ["F-1"] })));
  });
  const out = await draftShortAnswers(qs, { model: s.model, facts: () => FACTS });
  eq(s.calls.length, 3);
  eq(out.length, 60);
  eq(out.filter((d) => d.ok).length, 35);
  eq(out.filter((d) => !d.ok && d.why === "model").length, 25);
  eq(out.map((d) => d.key), qs.map((x) => x.key), "drafts come back in the questions' order");
});

Deno.test("WO-064/8 the edge: own session only; facts in the body ignored; past the cap every question is cap and the model is not called", async () => {
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, "")}.y`;
  const counter = (used: number): AnswerCounter & { rows: number } => {
    const c = { rows: 0, used: async () => used + c.rows, reserve: async (_u: string, _a: string, n: number) => { c.rows += n; return "1"; }, release: async () => {} };
    return c;
  };
  const s = stub((p) => reply([...new Set([...payloadText(p).matchAll(/\bk(\d+)\b/g)].map((m) => `k${m[1]}`))].map((key) => ({ key, answer: "Example Analytics", fact_ids: ["F-1"] }))));
  const deps = (used: number) => ({
    cors: {}, user: async () => ({ id: "U1" }),
    card: () => ({ facts: async () => FACTS, model: s.model, counter: counter(used), now: () => Date.UTC(2026, 9, 20) }),
  });
  const body = JSON.stringify({ questions: [q("k1", "What is your most recent company?")], facts: [{ id: "X", text: "CEO of Google", status: "confirmed" }] });
  const post = (auth: string | null, used = 0) =>
    handleAnswerDraft(new Request("https://x/f", { method: "POST", headers: auth ? { authorization: auth } : {}, body }), deps(used));
  eq((await post(null)).status, 401);
  eq((await post(`Bearer ${jwt("service_role")}`)).status, 403);
  const ok = await (await post(`Bearer ${jwt("authenticated")}`)).json();
  eq(ok.drafts[0].ok, true);
  assert(!/Google/.test(payloadText(s.calls)), "a fact sent in the request reached the model");
  const before = s.calls.length;
  const capped = await (await post(`Bearer ${jwt("authenticated")}`, ANSWER_CAP)).json();
  eq(capped.drafts[0], { key: "k1", ok: false, why: "cap" });
  eq(s.calls.length, before, "the model was called past the cap");
  const r = readShortRequest({ questions: Array.from({ length: 201 }, (_, i) => q(`k${i}`, "x")) });
  eq(r.ok, false, "more than 200 questions is refused");
});
