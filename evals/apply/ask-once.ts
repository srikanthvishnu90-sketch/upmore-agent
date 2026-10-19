// Ask once (WO-009b-6): of the required questions on real applications, how many can the planner answer from facts a
// person gives once? Read with the product's own classifier (classifyField in career_apply.ts):
//   standard  a required question that maps to one of the standard facts (name, email, phone, resume, sponsorship,
//             work authorization, location, start date, salary, how heard, EEO, links ...)
//   + top N   the planner also reuses a saved answer for the same question wording (normLabel), so a person who answers
//             the N most common remaining questions once covers those everywhere they recur
// A posting is ready when every required question is covered. No answer is invented; this counts questions, nothing else.
//   deno run --allow-read --allow-write evals/apply/ask-once.ts [questions-ci.json] [report.md]
import { classifyField, normLabel } from "../../supabase/functions/_shared/career_apply.ts";

export interface Row { id: string; family: string; required: { label: string; type: string; key: string }[] }

export function rowsOf(set: { postings: any[] }): Row[] {
  return set.postings.filter((p) => !p.reason).map((p) => ({ id: p.id, family: p.family,
    required: p.fields.filter((f: any) => f.required).map((f: any) => ({ label: f.label, type: f.type, key: classifyField(f.label, f.type) })) }));
}

// Coverage with the standard facts plus the `extra` most common unknown wordings answered once.
export function coverage(rows: Row[], extra: number) {
  const freq = new Map<string, { label: string; postings: number }>();
  for (const r of rows) for (const k of new Set(r.required.filter((q) => q.key === "unknown").map((q) => normLabel(q.label)))) {
    const e = freq.get(k) || { label: r.required.find((q) => normLabel(q.label) === k)!.label, postings: 0 };
    e.postings++; freq.set(k, e);
  }
  const ranked = [...freq.entries()].sort((a, b) => b[1].postings - a[1].postings || a[0].localeCompare(b[0]));
  const answered = new Set(ranked.slice(0, extra).map(([k]) => k));
  const covered = (q: Row["required"][number]) => q.key !== "unknown" || answered.has(normLabel(q.label));
  const total = rows.reduce((n, r) => n + r.required.length, 0), hit = rows.reduce((n, r) => n + r.required.filter(covered).length, 0);
  return { postings: rows.length, required: total, covered: hit, question_rate: total ? hit / total : 0,
    ready_postings: rows.filter((r) => r.required.every(covered)).length, ranked };
}

// The report for one question set, exactly as it is committed (tests/edge/career-ask-once.test.ts rebuilds it).
export function report(set: { captured_in: string; postings: any[] }, inFile: string): string {
  const rows = rowsOf(set), pct = (x: number) => `${Math.round(x * 100)}%`;
  const fams = [...new Set(rows.map((r) => r.family))];
  const lines = [`# Ask once: how many real application questions a person answers only once`, "",
    `Source: \`${inFile}\` (${set.captured_in}). ${set.postings.length} postings captured, ${rows.length} with required questions; ` +
    `blocked or empty: ${set.postings.filter((p: any) => p.reason).map((p: any) => `${p.id} (${p.reason})`).join(", ") || "none"}.`, "",
    "| Facts the person has given | Required questions covered | Postings with nothing left to ask |", "|---|---|---|"];
  for (const [name, n] of [["The standard facts only", 0], ["+ the 10 most common other questions, answered once", 10], ["+ the 20 most common", 20], ["+ the 40 most common", 40]] as const) {
    const c = coverage(rows, n);
    lines.push(`| ${name} | ${c.covered}/${c.required} (${pct(c.question_rate)}) | ${c.ready_postings}/${c.postings} (${pct(c.ready_postings / Math.max(1, c.postings))}) |`);
  }
  lines.push("", "| ATS | Postings | Required questions | Covered by standard facts | Ready with standard facts | Ready with + top 20 |", "|---|---|---|---|---|---|");
  for (const f of fams) {
    const rs = rows.filter((r) => r.family === f), a = coverage(rs, 0), b = coverage(rows, 20);
    const readyB = rs.filter((r) => r.required.every((q) => q.key !== "unknown" || new Set(b.ranked.slice(0, 20).map(([k]) => k)).has(normLabel(q.label)))).length;
    lines.push(`| ${f} | ${rs.length} | ${a.required} | ${a.covered} (${pct(a.question_rate)}) | ${a.ready_postings} | ${readyB} |`);
  }
  const left = rows.map((r) => r.required.filter((q) => q.key === "unknown").length).sort((a, b) => a - b);
  const share = (n: number) => `${left.filter((x) => x <= n).length}/${left.length}`;
  lines.push("", `Questions left to ask per posting with the standard facts: median ${left[Math.floor(left.length / 2)] ?? 0}, ` +
    `none ${share(0)}, at most 2 ${share(2)}, at most 5 ${share(5)}, most ${left[left.length - 1] ?? 0}.`);
  const c0 = coverage(rows, 0);
  lines.push("", "## The most common questions the standard facts do not answer", "", "| Question (as first seen) | Postings |", "|---|---|",
    ...c0.ranked.slice(0, 40).map(([, e]) => `| ${e.label.replace(/\|/g, "/").slice(0, 160)} | ${e.postings} |`));
  lines.push("", `Unique unanswered wordings: ${c0.ranked.length}; asked on only one posting: ${c0.ranked.filter(([, e]) => e.postings === 1).length}.`);
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const [inFile = "evals/apply/questions-ci.json", outFile = "docs/apply/ask-once.md"] = Deno.args;
  const text = report(JSON.parse(Deno.readTextFileSync(inFile)), inFile);
  Deno.mkdirSync(outFile.replace(/\/[^/]+$/, ""), { recursive: true });
  Deno.writeTextFileSync(outFile, text);
  console.log(text.split("\n").slice(4, 10).join("\n"));
}
