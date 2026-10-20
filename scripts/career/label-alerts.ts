// WO-037: label the 200-role set, one row at a time, from a terminal. For each row it shows the person (who they are
// and what they asked alerts for) and the real posting, and takes one key: m = match (I would want this alert), n = no
// match, s = skip for now, b = back one, q = quit. It never shows what the alert gate decided or why the row was picked,
// so the label is the person's own. Every answer is saved at once (resume any time); labels are only ever written by
// this tool or by hand, never by code that knows the gate.
//   deno run -A scripts/career/label-alerts.ts --by <your name> [--persona P03] [--labels file] [--status]
// Reads answers line by line from stdin, so it also takes a file: deno run -A scripts/career/label-alerts.ts --by x < answers.txt
import type { LabelFile, Persona, Row } from "../../evals/career/alert-labels/label_set.ts";

const opt = (k: string, d?: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : d; };
const dir = new URL("../../evals/career/alert-labels/", import.meta.url);
const candidatesPath = opt("--candidates", new URL("candidates.json", dir).pathname)!;
const labelsPath = opt("--labels", new URL("labels.human.json", dir).pathname)!;
const rows: Row[] = JSON.parse(await Deno.readTextFile(candidatesPath)).rows_data;
const personas: Persona[] = JSON.parse(await Deno.readTextFile(opt("--personas", new URL("personas.json", dir).pathname)!)).personas;
const byId = new Map(personas.map((p) => [p.id, p]));
let file: LabelFile;
try { file = JSON.parse(await Deno.readTextFile(labelsPath)); }
catch { file = { kind: "human", note: "WO-037 human labels: match = this person would want this alert. Written only by scripts/career/label-alerts.ts or by hand.", labels: {} }; }
if (file.kind !== "human") { console.error(`${labelsPath} is not a human label file`); Deno.exit(2); }

const done = () => rows.filter((r) => file.labels[r.id]).length;
if (Deno.args.includes("--status")) { console.log(`${done()} of ${rows.length} labeled in ${labelsPath}`); Deno.exit(0); }
const by = opt("--by");
if (!by || !/^[A-Za-z][A-Za-z0-9 ._-]{0,40}$/.test(by)) { console.error("say who is labeling: --by <your name>"); Deno.exit(2); }
const todo = rows.filter((r) => !opt("--persona") || r.persona === opt("--persona"));

async function save() {
  const tmp = `${labelsPath}.tmp`;
  await Deno.writeTextFile(tmp, JSON.stringify(file, null, 1) + "\n");
  await Deno.rename(tmp, labelsPath);
}
function show(r: Row, n: number) {
  const p = byId.get(r.persona)!, x = r.posting, pr = p.prefs as any;
  const floor = pr.floor ? Object.entries(pr.floor).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : JSON.stringify(v)}`).join("; ") : "none";
  console.log(`\n[${n + 1}/${todo.length}] ${r.id}   (${done()} of ${rows.length} labeled)`);
  console.log(`PERSON  ${p.who}`);
  console.log(`        alerts for: ${pr.keywords.join(", ")} | places: ${(pr.locations || []).join(", ") || "any"}${pr.remote_ok ? " | remote ok" : ""} | limits: ${floor}`);
  console.log(`POSTING ${x.title}`);
  console.log(`        ${x.company} | ${x.location || "no location given"}${x.posted_at ? ` | posted ${x.posted_at.slice(0, 10)}` : ""}`);
  console.log(`        ${x.url}`);
  console.log(`        ${String(x.description || "").replace(/\s+/g, " ").slice(0, 600)}${x.description.length > 600 ? " ..." : ""}`);
  if (file.labels[r.id]) console.log(`        (labeled before: ${file.labels[r.id].label})`);
  console.log("Would this person want this alert?  m = match, n = no match, s = skip, b = back, q = quit");
}

const lines = Deno.stdin.readable.pipeThrough(new TextDecoderStream()).getReader();
let buf = "";
async function nextLine(): Promise<string | null> {
  while (true) {
    const i = buf.indexOf("\n");
    if (i >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); return l.trim().toLowerCase(); }
    const { value, done } = await lines.read();
    if (done) { if (buf) { const l = buf; buf = ""; return l.trim().toLowerCase(); } return null; }
    buf += value;
  }
}
let i = Math.max(0, todo.findIndex((r) => !file.labels[r.id]));
if (todo.every((r) => file.labels[r.id])) { console.log("every row here is labeled; use b to revisit, q to quit"); i = todo.length - 1; }
while (i >= 0 && i < todo.length) {
  show(todo[i], i);
  const a = await nextLine();
  if (a === null || a === "q") break;
  if (a === "b") { i = Math.max(0, i - 1); continue; }
  if (a === "s") { i++; continue; }
  if (a !== "m" && a !== "n") { console.log("one of m, n, s, b, q"); continue; }
  file.labels[todo[i].id] = { label: a === "m" ? "match" : "no_match", by, at: new Date().toISOString() };
  await save();
  i++;
}
console.log(`\nsaved: ${done()} of ${rows.length} labeled in ${labelsPath}`);
