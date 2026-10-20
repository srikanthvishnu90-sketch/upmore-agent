// WO-054: answer once, before the session, measured offline. Every captured form of samples A and B goes through the
// extension's own path: planForm (strict) with the complete synthetic TEST persona of fill-coverage.ts and each posting's
// own location, then answerOnceQuestions (what the panel would ask), then a TEST answer to every panel question
// (answerOnceRows: the first of the shown options, or a typed TEST answer), read back the way the store hands answers
// back (factsWithTextAnswers), and every posting planned again. Each sample is measured as one queue, and in sessions of
// 20 in order (what one Prepare reads), where a later session already has the earlier sessions' answers. Synthetic:
// this measures the mechanism, not any person (VERIFIED-S). A real person's rate is NOT_RUN.
//   deno run --allow-read --allow-write evals/apply/answer-once.ts [--write docs/apply/answer-once.md]
import { answerOnceQuestions, answerOnceRows, planForm } from "../../extension/src/apply_core.ts";
import { factsWithTextAnswers } from "../../workers/career-browser/ask-once.ts";
import { answerKey, mapQuestion } from "../../supabase/functions/_shared/question_map.ts";
import { PERSONA, postingLocation } from "./fill-coverage.ts";

const NOW = Date.UTC(2026, 9, 19);
interface Posting { id: string; company: string; family: any; fields: any[]; location?: string }
const postingsOf = (set: { postings: any[] }): Posting[] => set.postings.filter((p) => !p.reason).map((p) => ({
  id: p.id, company: p.company, family: p.family, location: postingLocation(p),
  fields: p.fields.map((f: any) => ({ name: f.name, label: f.label, required: !!f.required, type: f.type,
    options: (f.options || []).map((o: any) => ({ label: String(o.label), value: String(o.value ?? o.label) })) })),
}));
type Facts = { answers: Record<string, any>; saved: Record<string, any> };
const plan = (p: Posting, f: Facts) => planForm({ userId: "TEST", jobId: p.id, company: p.company, family: p.family, schema: p.fields, answers: f.answers, saved: f.saved, now: NOW, location: p.location });
// A card is fully ready when nothing required is left: no open question, no identity number to type, no shared label.
const ready = (r: ReturnType<typeof plan>) => !r.needs.length && !r.identity.some((x) => x.required) && !r.ambiguous.some((x) => x.required);
const keyOf = (n: { label: string; type: string; options: string[] }, jobId: string, persona: Record<string, unknown>) => {
  const q = { label: n.label, type: n.type, options: n.options.map((l) => ({ label: l })) }, m = mapQuestion(q);
  return answerKey(q, jobId, { haveFact: m.kind === "fact" && Object.hasOwn(persona, m.fact) });
};
// A person on their first session who gave only their contact details and resume (TEST values from PERSONA).
export const CONTACT_ONLY = Object.fromEntries(Object.entries(PERSONA).filter(([k]) =>
  ["full_name", "legal_name", "first_name", "last_name", "preferred_name", "email", "phone", "city", "state", "country", "location", "linkedin", "resume"].includes(k)));

// One Prepare over `ps` with what the person has answered so far; every panel question answered with a TEST answer.
function session(ps: Posting[], f: Facts, answered: Set<string>, tag: string, persona: Record<string, unknown>) {
  const before = ps.map((p) => ({ p, r: plan(p, f) }));
  const open = before.reduce((n, x) => n + x.r.needs.length, 0);
  const jobOpen = before.reduce((n, x) => n + x.r.needs.filter((q) => keyOf(q, x.p.id, persona).startsWith("job:")).length, 0);
  const m = answerOnceQuestions({ postings: before.map((x) => ({ jobId: x.p.id, company: x.p.company, needs: x.r.needs })), answers: f.answers, answered });
  const picks = m.questions.map((q) => ({ key: q.key, answer: q.options.length ? q.options[0] : "TEST answer" }));
  const rows = answerOnceRows({ questions: m.questions, picks });
  const stored = rows.groups.flatMap((g) => g.answers).map((a, i) => ({ id: `${tag}-${i}`, key: a.key, kind: a.kind, answer: a.answer }));
  for (const s of stored) answered.add(s.key);
  const next = factsWithTextAnswers(f, stored) as Facts;
  const after = ps.map((p) => ({ p, r: plan(p, next) }));
  const panelKeys = new Set(stored.map((s) => s.key));
  const left: Record<string, number> = {};
  for (const x of m.left) left[x.why] = (left[x.why] || 0) + 1;
  return {
    facts: next, postings: ps.length, open, jobOpen, panel: m.questions.length, panelJob: m.questions.filter((q) => q.perPosting).length,
    merged: m.questions.filter((q) => q.postings.length > 1).length, askedByMerged: m.questions.filter((q) => q.postings.length > 1).reduce((n, q) => n + q.postings.length, 0),
    left, refused: rows.refused.length, readyBefore: before.filter((x) => ready(x.r)).length, readyAfter: after.filter((x) => ready(x.r)).length,
    openAfter: after.reduce((n, x) => n + x.r.needs.length, 0),
    askedAgain: after.reduce((n, x) => n + x.r.needs.filter((q) => panelKeys.has(keyOf(q, x.p.id, persona))).length, 0),
  };
}

export function measure(set: { postings: any[] }, size = Infinity, persona: Record<string, any> = PERSONA) {
  const ps = postingsOf(set);
  let f: Facts = { answers: persona, saved: {} };
  const answered = new Set<string>(), out: ReturnType<typeof session>[] = [];
  for (let i = 0; i < ps.length; i += size === Infinity ? ps.length : size) {
    const s = session(ps.slice(i, i + (size === Infinity ? ps.length : size)), f, answered, `TEST-${i}`, persona);
    f = s.facts;
    out.push(s);
  }
  const sum = (k: keyof ReturnType<typeof session>) => out.reduce((n, s) => n + (s[k] as number), 0);
  return { sessions: out, postings: ps.length, open: sum("open"), jobOpen: sum("jobOpen"), panel: sum("panel"), panelJob: sum("panelJob"), merged: sum("merged"),
    askedByMerged: sum("askedByMerged"), refused: sum("refused"), readyBefore: out[0] ? sum("readyBefore") : 0, readyAfter: sum("readyAfter"), openAfter: sum("openAfter"),
    askedAgain: sum("askedAgain"), left: out.reduce((a, s) => { for (const [k, v] of Object.entries(s.left)) a[k] = (a[k] || 0) + v; return a; }, {} as Record<string, number>) };
}

if (import.meta.main) {
  const read = async (f: string) => JSON.parse(await Deno.readTextFile(new URL(f, import.meta.url)));
  const A = await read("./questions-ci.json"), B = await read("./questions-ci-b.json");
  const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 1000) / 10 : 0}%`;
  const rows: string[] = [], rows2: string[] = [];
  const per: string[] = [];
  for (const [name, set, persona, who] of [["A", A, PERSONA, "complete"], ["B", B, PERSONA, "complete"], ["A", A, CONTACT_ONLY, "contact only"], ["B", B, CONTACT_ONLY, "contact only"]] as const) {
    for (const [how, size] of [["one queue", Infinity], ["sessions of 20", 20]] as const) {
      const m = measure(set, size, persona);
      if (persona !== PERSONA) {
        if (size === Infinity) rows2.push(`| ${name} | ${m.postings} | ${m.open} | ${m.panel} (${m.merged} asked by 2 or more postings, standing for ${m.askedByMerged} card questions) | ${m.readyBefore} | ${m.readyAfter} | ${m.askedAgain} |`);
        else rows2.push(`| ${name}, sessions of 20 | ${m.postings} | ${m.open} | ${m.panel} (per session ${m.sessions.map((s) => s.panel).join(", ")}) | ${m.readyBefore} | ${m.readyAfter} | ${m.askedAgain} |`);
        continue;
      }
      rows.push(`| ${name} | ${how} | ${m.postings} | ${m.open} | ${m.panel} (${m.panelJob} one posting's) | ${m.jobOpen} (${pct(m.jobOpen, m.open)}) | ${m.readyBefore} | ${m.readyAfter} | ${m.openAfter} | ${m.askedAgain} |`);
      if (size === 20) per.push(`- ${name}: panel questions per session ${m.sessions.map((s) => s.panel).join(", ")}; open on cards per session ${m.sessions.map((s) => s.open).join(", ")}.`);
      if (size === Infinity) {
        per.push(`- ${name}, one queue: ${m.merged} panel questions are asked by more than one posting (standing for ${m.askedByMerged} questions on cards); ` +
          `left for the cards (never in the panel): ${Object.entries(m.left).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; TEST answers refused: ${m.refused}.`);
      }
    }
  }
  const out = [
    "# Answer once, before the session (WO-054): measured offline",
    "",
    "Generated by `deno run --allow-read --allow-write evals/apply/answer-once.ts --write docs/apply/answer-once.md`. Every captured form of samples A and B through the extension's own path: `planForm` (strict) with the complete synthetic TEST persona (`PERSONA` in `fill-coverage.ts`) and each posting's own location, then `answerOnceQuestions` (what the panel asks), then a TEST answer to every panel question (`answerOnceRows`: the first shown option, or a typed TEST answer), read back as the store hands answers back (`factsWithTextAnswers`), and every posting planned again. In sessions of 20 (one Prepare), a later session starts with the earlier sessions' answers.",
    "",
    "**VERIFIED-S** (synthetic persona, synthetic answers): this measures the mechanism. How many questions a real person answers, and whether their answers fit, is **NOT_RUN**.",
    "",
    "| Sample | Read as | Postings | Open required questions on cards, no Prepare | Questions the panel asks (merged keys) | Open questions that are one posting's (`job:`) | Cards fully ready, no Prepare | Cards fully ready, every panel question answered | Open on cards after | Of those, asked again (the answer fits none of that posting's options) |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    ...per,
    "",
    "## A person who gave only their contact details (first session)",
    "",
    `The same, for a TEST person who stated only ${Object.keys(CONTACT_ONLY).join(", ")}: every other fact is unknown, so the same fact is asked by many postings in their own words.`,
    "",
    "| Sample | Postings | Open required questions on cards, no Prepare | Questions the panel asks | Cards fully ready, no Prepare | Cards fully ready, every panel question answered | Asked again (fits none of that posting's options) |",
    "|---|---|---|---|---|---|---|",
    ...rows2,
    "",
    "In sessions of 20, the open and ready-before counts are each session's at the moment its Prepare starts, with the earlier sessions' answers already saved (so they are lower than the one-queue counts). Asked again is a TEST artefact as much as a measure: every panel answer here is the first option of the shown list, which another employer's list often lacks; it shows the answer is not forced, not how often a real answer fits.",
    "",
    "Open questions are what `planForm` leaves for the person on each card (the panel's source). Fully ready also needs no identity number to type and no two fields under one label. The panel never lists an essay (drafted on the card, WO-049), an EEO or self-identification question, an identity number, a file, or an agreement (an agreement is given to one employer), so a card holding one of those stays open whatever is answered in the panel.",
    "",
  ].join("\n");
  const w = Deno.args.indexOf("--write");
  if (w >= 0) await Deno.writeTextFile(Deno.args[w + 1] || "docs/apply/answer-once.md", out);
  console.log(out);
}
