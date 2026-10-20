// WO-032: how many of the repo's captured postings become ready through apply-by-email, and the fully-ready rate before
// and after. Offline, from files in the repo only:
//   - readiness by form: every captured form of both samples (questions-ci.json, questions-ci-b.json) through the
//     product's planBatch with fill-coverage.ts's synthetic TEST persona (fillCoverage's own rule: ready when nothing
//     required is left);
//   - apply-by-email: the product's own detector (apply_email.ts) over every posting text the repo holds: the captured
//     application pages (tests/fixtures/forms-ci/*.html, matched to the samples by id) and the public job snapshots
//     (packages/career-data/fixtures/gauntlet/jobs/public-snapshots/*.json). A posting that is not ready by its form and
//     asks for an emailed application counts as ready after, since the email card needs nothing the persona lacks (a
//     name, a resume file, two confirmed facts that fit; the model's draft itself is NOT_RUN here).
//   deno run --allow-read evals/apply/email-apply-coverage.ts
import { fileAlternative, planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { applyEmailOf } from "../../supabase/functions/_shared/apply_email.ts";
import { PERSONA, postingLocation } from "./fill-coverage.ts";

const root = new URL("../../", import.meta.url);
const readJson = async (p: string) => JSON.parse(await Deno.readTextFile(new URL(p, root)));
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

function readyByForm(p: any): boolean {
  const fields = p.fields.map((f: any) => ({ name: f.name, label: f.label, required: !!f.required, type: f.type,
    options: (f.options || []).map((o: any) => ({ label: String(o.label), value: String(o.value ?? o.label) })) }));
  const plan = planBatch({ userId: "TEST", postings: [{ job_id: p.id, company: p.company, title: "", fields, location: postingLocation(p) }], answers: PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 19) });
  const asked = new Set(plan.needs.map((n: any) => n.label));
  return !fields.some((f: any) => f.required && !fileAlternative(f, fields) && asked.has(f.label));
}

export async function measure() {
  // Posting text the repo holds, by id.
  const texts = new Map<string, { text: string; url: string }>();
  for await (const e of Deno.readDir(new URL("tests/fixtures/forms-ci/", root))) {
    if (!e.name.endsWith(".html")) continue;
    texts.set(e.name.replace(/\.html$/, ""), { text: text(await Deno.readTextFile(new URL(`tests/fixtures/forms-ci/${e.name}`, root))), url: "" });
  }
  const snapshots: { id: string; text: string; url: string }[] = [];
  for await (const e of Deno.readDir(new URL("packages/career-data/fixtures/gauntlet/jobs/public-snapshots/", root))) {
    if (!e.name.endsWith(".json") || e.name.startsWith("BLOCKED-")) continue;
    const j = await readJson(`packages/career-data/fixtures/gauntlet/jobs/public-snapshots/${e.name}`);
    snapshots.push({ id: e.name.replace(/\.json$/, ""), text: text(strings(j).join("\n")), url: String(j.absolute_url ?? j.hostedUrl ?? j.applyUrl ?? "") });
  }
  const samples = [await readJson("evals/apply/questions-ci.json"), await readJson("evals/apply/questions-ci-b.json")];
  const forms = samples.flatMap((s) => s.postings.filter((p: any) => !p.reason));
  let before = 0, after = 0, withText = 0, viaEmail = 0;
  for (const p of forms) {
    const ready = readyByForm(p);
    const t = texts.get(p.id);
    if (t) withText++;
    const email = t ? applyEmailOf({ description: t.text, url: p.source_url }) : null;
    if (ready) before++;
    if (ready || email) after++;
    if (!ready && email) viaEmail++;
  }
  const pages = [...[...texts.entries()].map(([id, t]) => ({ id, text: t.text, url: "" })), ...snapshots];
  const detected = pages.map((p) => ({ id: p.id, email: applyEmailOf({ description: p.text, url: p.url }) })).filter((x) => x.email);
  return { forms: forms.length, withText, before, after, viaEmail, pages: pages.length, detected };
}

if (import.meta.main) {
  const m = await measure();
  const pct = (x: number, n: number) => `${x}/${n} (${n ? Math.round((x / n) * 1000) / 10 : 0}%)`;
  console.log(`captured forms: ${m.forms} (posting text in the repo for ${m.withText})`);
  console.log(`fully ready before (by form): ${pct(m.before, m.forms)}`);
  console.log(`fully ready after (by form or by email): ${pct(m.after, m.forms)}; ready only via apply-by-email: ${m.viaEmail}`);
  console.log(`posting texts scanned: ${m.pages}; asking for an emailed application: ${m.detected.length}${m.detected.length ? " " + JSON.stringify(m.detected) : ""}`);
}
