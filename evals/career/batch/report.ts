// The summary report (markdown) for a batch run. Everything in it is computed from the per-chat records: pass rate by axis, failure
// causes ranked by frequency x severity, the 20 worst transcripts, the cost, and a "what holds it back" section generated from the
// failure-tag counts (each tag's meaning is the fixed text in checks.ts TAGS, not a guess about causes).
import { TAGS, type Finding, type Tag } from "./checks.ts";
import { CRITERIA, type JudgeVerdict } from "./judge.ts";
import type { Axes, Scenario } from "./variants.ts";

export interface ChatRecord {
  i: number; id: string; seedId: string; group: string; user: string; axes: Axes; turns: Scenario["turns"]; replies: string[];
  approvals: { turn: number; text: string; boundDigest: string | null }[]; findings: Finding[]; tags: string[]; sev: number;
  judge: JudgeVerdict | "error" | null; det_pass: boolean; pass: boolean; error?: string;
}
export interface RunMeta { label: string; mode: string; entry: string; brain: string; runSeed: number; planned: number; maxUsd: number; spentUsd: number; stopped: string | null; judgeModel: string; judgeCalls: number; judgePct: number; judgeAll: boolean; modelCalls: number; blocked: number }

const pct = (a: number, b: number) => b ? `${(100 * a / b).toFixed(1)}%` : "n/a";
const rate = (rs: ChatRecord[]) => pct(rs.filter((r) => r.pass).length, rs.length);
export const worstScore = (r: ChatRecord) => r.sev * 10 + (r.judge && r.judge !== "error" ? 20 - r.judge.total : 0);
const clip = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

export function tagCounts(rs: ChatRecord[]): { tag: Tag; chats: number; sev: number; weight: number }[] {
  const m = new Map<string, number>();
  for (const r of rs) for (const t of new Set(r.tags)) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, chats]) => ({ tag: tag as Tag, chats, sev: TAGS[tag as Tag]?.sev ?? 1, weight: chats * (TAGS[tag as Tag]?.sev ?? 1) })).sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag));
}
export function criterionStats(rs: ChatRecord[]): { criterion: string; mean: number; below2: number }[] {
  const js = rs.map((r) => r.judge).filter((j): j is JudgeVerdict => !!j && j !== "error");
  return CRITERIA.map((c) => ({ criterion: c, mean: js.reduce((a, j) => a + j.scores[c], 0) / Math.max(1, js.length), below2: js.filter((j) => j.scores[c] < 2).length })).sort((a, b) => a.mean - b.mean);
}

export function buildReport(rs: ChatRecord[], meta: RunMeta): string {
  const L: string[] = [];
  const judged = rs.filter((r) => r.judge && r.judge !== "error"), jerr = rs.filter((r) => r.judge === "error").length;
  L.push(`# Batch scenario run: ${meta.label}`, "",
    `mode ${meta.mode} · entry ${meta.entry} · brain ${meta.brain} · run seed ${meta.runSeed} · ${rs.length} of ${meta.planned} scenarios graded${meta.stopped ? ` · STOPPED: ${meta.stopped} (not a full score)` : ""}`, "",
    `Pass = zero deterministic failures AND, where the rubric judge scored the chat, a judge total at or above the pass mark. Seed situations are descriptions used verbatim as the person's context.`, "",
    "## Overall", "",
    `- pass rate: **${rate(rs)}** (${rs.filter((r) => r.pass).length}/${rs.length})`,
    `- deterministic checks clean: ${pct(rs.filter((r) => r.det_pass).length, rs.length)}`,
    `- rubric judge: ${judged.length} chats scored (${meta.judgeAll ? "all" : `${meta.judgePct}% sample`}), ${pct(judged.filter((r) => (r.judge as JudgeVerdict).pass).length, judged.length)} at the pass mark${jerr ? `, ${jerr} judge errors (not counted)` : ""}`, "");
  L.push("## Pass rate by axis", "");
  const dims: [string, (r: ChatRecord) => string][] = [["stage", (r) => r.axes.stage], ["field", (r) => r.axes.field], ["geography", (r) => r.axes.geo], ["tone", (r) => r.axes.tone], ["shape", (r) => r.axes.shape], ["adversarial", (r) => r.axes.adversarial], ["seed group", (r) => r.group]];
  for (const [name, f] of dims) {
    const by = new Map<string, ChatRecord[]>();
    for (const r of rs) by.set(f(r), [...(by.get(f(r)) ?? []), r]);
    L.push(`### ${name}`, "", "| value | chats | pass | det-fail |", "|---|---:|---:|---:|", ...[...by].sort((a, b) => a[0].localeCompare(b[0])).map(([v, x]) => `| ${v} | ${x.length} | ${rate(x)} | ${pct(x.filter((r) => !r.det_pass).length, x.length)} |`), "");
  }
  const tags = tagCounts(rs);
  L.push("## Top failure causes (frequency x severity)", "", "| rank | tag | chats | share | severity | weight | meaning |", "|---:|---|---:|---:|---:|---:|---|",
    ...tags.slice(0, 15).map((t, k) => `| ${k + 1} | ${t.tag} | ${t.chats} | ${pct(t.chats, rs.length)} | ${t.sev} | ${t.weight} | ${TAGS[t.tag]?.why ?? ""} |`), "");
  const crit = criterionStats(rs);
  if (judged.length) L.push("### Rubric criteria, weakest first", "", "| criterion | mean (0-2) | chats below 2 |", "|---|---:|---:|", ...crit.map((c) => `| ${c.criterion} | ${c.mean.toFixed(2)} | ${c.below2} |`), "");
  L.push("## The 20 worst transcripts", "");
  for (const r of [...rs].sort((a, b) => worstScore(b) - worstScore(a) || a.i - b.i).slice(0, 20)) {
    let k = 0;
    L.push(`### ${r.id} (${[r.axes.tone, r.axes.shape, r.axes.adversarial].join(", ")}) tags: ${r.tags.join(", ") || "none"}${r.judge && r.judge !== "error" ? ` · judge ${r.judge.total}/20` : ""}`, "");
    for (const t of r.turns) L.push(t.kind === "approve" ? `> [approve recorded, not executed: ${t.text}]` : `> PERSON: ${clip(t.text.replace(/\n+/g, " "), 300)}\n> TRAINEE: ${clip((r.replies[k++] ?? "").replace(/\n+/g, " "), 400)}`);
    L.push("", ...r.findings.slice(0, 6).map((f) => `- ${f.tag} (turn ${f.turn}): ${f.detail}`), "");
  }
  L.push("## Cost", "", `- spent $${meta.spentUsd.toFixed(4)} of the $${meta.maxUsd.toFixed(2)} cap (worst-case price for any call whose usage was not proven)`, `- model calls through the guard: ${meta.modelCalls} · judge calls: ${meta.judgeCalls} (${meta.judgeModel}) · blocked outbound attempts: ${meta.blocked}`, "");
  L.push("## What holds it back", "", `Generated from failure-tag counts over ${rs.length} chats; each line is a tag's fixed meaning plus where its rate is highest.`, "");
  if (!tags.length) L.push("- no deterministic failure tag fired.");
  for (const t of tags.slice(0, 5)) {
    const withTag = rs.filter((r) => r.tags.includes(t.tag));
    let best: { dim: string; v: string; share: number; n: number } | null = null;
    for (const [name, f] of dims) {
      const groups = new Map<string, ChatRecord[]>();
      for (const r of rs) groups.set(f(r), [...(groups.get(f(r)) ?? []), r]);
      for (const [v, x] of groups) { const n = x.length; if (n < 5) continue; const share = x.filter((r) => r.tags.includes(t.tag)).length / n; if (!best || share > best.share) best = { dim: name, v, share, n }; }
    }
    L.push(`- **${t.tag}** in ${t.chats} chats (${pct(t.chats, rs.length)}, severity ${t.sev}): ${TAGS[t.tag]?.why}.${best && withTag.length ? ` Highest in ${best.dim} = ${best.v}: ${(100 * best.share).toFixed(0)}% of ${best.n}.` : ""}`);
  }
  if (judged.length) for (const c of crit.filter((x) => x.below2 > 0).slice(0, 3)) L.push(`- rubric: **${c.criterion}** is the weakest criterion, mean ${c.mean.toFixed(2)} of 2, below 2 in ${c.below2} of ${judged.length} judged chats.`);
  return L.join("\n") + "\n";
}
