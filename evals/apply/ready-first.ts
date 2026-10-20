// WO-076 measure: of each 100 candidates, how many of the day's first 25 sends are ready (nothing for the person to
// answer), in queue order (what the queue did before: the day was the first 25 queued) and ready first (the extension's
// order: Greenhouse planned from the board's API before any tab; Lever and Ashby not known until Prepare reads them). And
// what the person does for those 25 sends: the same buttons, one tap per approval, and one answer per question left.
// Samples A-H, the complete TEST persona placed in each posting's own city for the US postings whose location starts with
// "City, ST" (as the WO-076 order measured readiness). The Greenhouse questions are the board API's (the samples were
// captured from it); readiness is the product's planForm, the same the card runs. Deterministic; no network.
//   deno run --allow-read evals/apply/ready-first.ts [--json]
import { answerOnceQuestions, formTier, planForm, type Preplan, readyFirst } from "../../extension/src/apply_core.ts";
import { normLabel } from "../../supabase/functions/_shared/career_apply.ts";
import { PERSONA, postingLocation } from "./fill-coverage.ts";

const SAMPLES = ["questions-ci.json", "questions-ci-b.json", "questions-ci-c.json", "questions-ci-d.json", "questions-ci-e.json", "questions-ci-f.json", "questions-ci-g.json", "questions-ci-h.json"];
const STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const DAY = 25, CANDIDATES = 100, PREPARE_MAX = 20;
const fact = (value: string) => ({ value, factId: "TEST-persona" });

interface Item { id: string; family: string; company: string; truth: Preplan; plan: Preplan | null; seq: number }
export function postings(): Item[] {
  const out: Item[] = [];
  for (const f of SAMPLES) {
    for (const p of JSON.parse(Deno.readTextFileSync(new URL(f, import.meta.url))).postings) {
      if (p.reason) continue;
      const loc = postingLocation(p);
      const m = loc ? /^([^,;:]+),\s*([A-Z]{2})\b/.exec(loc) : null;
      if (!m || !STATES.has(m[2])) continue;
      const city = m[1].trim();
      const answers = { ...PERSONA, city: fact(city), state: fact(m[2]), location: fact(`${city}, ${m[2]}`) };
      const schema = p.fields.map((x: any) => ({ name: x.name, label: x.label, required: !!x.required, type: x.type, options: (x.options || []).map((o: any) => ({ label: String(o.label), value: String(o.value ?? o.label) })) }));
      const r = planForm({ userId: "TEST", jobId: p.id, company: p.company, family: p.family, schema, answers, saved: {}, now: Date.UTC(2026, 9, 20), location: loc });
      const open = r.needs.length + r.identity.filter((x) => x.required).length + new Set(r.ambiguous.filter((x) => x.required).map((x) => normLabel(x.label))).size;
      const truth: Preplan = { known: true, open, needs: r.needs, jobId: p.id, company: p.company, location: loc };
      // Before Prepare only Greenhouse is known (its board API); Lever and Ashby wait for their page.
      out.push({ id: p.id, family: p.family, company: p.company, truth, plan: p.family === "greenhouse" ? truth : null, seq: out.length });
    }
  }
  return out;
}

// What the person does for the day's sends: Add Trainee's picks, Prepare and Start (3), Save in the panel when it asks
// anything (1), one approval per send, and one answer per question: each panel question once (grouped across postings,
// WO-054), and each question left for its card (an identity number, a self-identification, a written answer, a file, an
// agreement) on that card.
function personTaps(day: Item[]) {
  const asked = day.filter((x) => x.truth.open > 0);
  const merged = answerOnceQuestions({ postings: asked.map((x) => ({ jobId: x.id, company: x.company, needs: x.truth.needs })), answers: {}, answered: new Set() });
  const typedOnCard = asked.reduce((n, x) => n + (x.truth.open - x.truth.needs.length), 0);
  const answers = merged.questions.length + merged.left.length + typedOnCard;
  return { buttons: 3 + (merged.questions.length ? 1 : 0), approvals: day.length, answers, total: 3 + (merged.questions.length ? 1 : 0) + day.length + answers };
}

export function measure(all: Item[]) {
  const windows: { start: number; queue: number; readyFirst: number; afterPrepare: number; tapsQueue: number; tapsReadyFirst: number; answersQueue: number; answersReadyFirst: number }[] = [];
  for (let start = 0; start + CANDIDATES <= all.length; start++) {
    const c = all.slice(start, start + CANDIDATES);
    const ready = (xs: Item[]) => xs.filter((x) => x.truth.open === 0).length;
    const queueDay = c.slice(0, DAY);
    const before = readyFirst(c);
    // Prepare: when the known-ready do not fill the day, the next postings not known yet are read (at most 20).
    const knownReady = c.filter((x) => formTier(x.plan) === 0).length;
    const read = new Set((knownReady >= DAY ? [] : before.filter((x) => !x.plan).slice(0, PREPARE_MAX)).map((x) => x.id));
    const after = readyFirst(c.map((x) => (read.has(x.id) ? { ...x, plan: x.truth } : x)));
    const day = after.slice(0, DAY);
    const tq = personTaps(queueDay), tr = personTaps(day);
    windows.push({ start, queue: ready(queueDay), readyFirst: ready(before.slice(0, DAY)), afterPrepare: ready(day), tapsQueue: tq.total, tapsReadyFirst: tr.total, answersQueue: tq.answers, answersReadyFirst: tr.answers });
  }
  const mean = (k: keyof typeof windows[number]) => windows.reduce((n, w) => n + (w[k] as number), 0) / windows.length;
  const blocks = windows.filter((w) => w.start % CANDIDATES === 0);
  return {
    postings: all.length, by_family: Object.fromEntries(["greenhouse", "lever", "ashby"].map((f) => [f, all.filter((x) => x.family === f).length])),
    ready_all: all.filter((x) => x.truth.open === 0).length, ready_greenhouse: all.filter((x) => x.family === "greenhouse" && x.truth.open === 0).length,
    windows: windows.length, blocks,
    mean: { queue: mean("queue"), readyFirst: mean("readyFirst"), afterPrepare: mean("afterPrepare"), tapsQueue: mean("tapsQueue"), tapsReadyFirst: mean("tapsReadyFirst"), answersQueue: mean("answersQueue"), answersReadyFirst: mean("answersReadyFirst") },
  };
}

if (import.meta.main) {
  const r = measure(postings());
  if (Deno.args.includes("--json")) console.log(JSON.stringify(r, null, 1));
  else {
    const pct = (x: number) => `${Math.round((x / DAY) * 1000) / 10}%`;
    console.log(`VERIFIED-S WO-076 ready first: ${r.postings} US postings (${JSON.stringify(r.by_family)}), ${r.ready_all} ready (${r.ready_greenhouse} on Greenhouse)`);
    for (const b of r.blocks) console.log(`  candidates ${b.start + 1}-${b.start + CANDIDATES}: of the first ${DAY} sends ready: queue order ${b.queue} (${pct(b.queue)}), ready first ${b.readyFirst} (${pct(b.readyFirst)}), after Prepare ${b.afterPrepare} (${pct(b.afterPrepare)}); person's taps ${b.tapsQueue} -> ${b.tapsReadyFirst} (answers ${b.answersQueue} -> ${b.answersReadyFirst})`);
    const m = r.mean;
    console.log(`  every window of ${CANDIDATES} (${r.windows}): ready of the first ${DAY}: queue order ${m.queue.toFixed(1)} (${pct(m.queue)}), ready first ${m.readyFirst.toFixed(1)} (${pct(m.readyFirst)}), after Prepare ${m.afterPrepare.toFixed(1)} (${pct(m.afterPrepare)}); person's taps per ${DAY} sends ${m.tapsQueue.toFixed(1)} -> ${m.tapsReadyFirst.toFixed(1)} (answers ${m.answersQueue.toFixed(1)} -> ${m.answersReadyFirst.toFixed(1)})`);
  }
}
