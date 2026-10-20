// WO-037: the hidden-market measure, done honestly by a person. Target: 20%+ of alerts are roles not yet on LinkedIn or
// Indeed that day. We never automate either site, so the check is manual: Muse or the owner takes a random sample of
// 50 alerts delivered on one day and, the same day, searches each role by hand on LinkedIn Jobs and on Indeed, and
// records what they saw. This tool only draws the sample and writes the sheet, then scores the filled sheet. It never
// fetches anything; the search is a person's.
//   sample: deno run -A scripts/career/hidden-market.ts sample --alerts alerts.json --day 2026-10-21 [--n 50] [--out sheet.csv]
//           alerts.json: the day's delivered alerts, exported with the query in docs/architect/work-orders/WO-037-discovery-at-scale.md
//   score:  deno run -A scripts/career/hidden-market.ts score --sheet sheet.csv
// Status is NOT_RUN until a person has filled rows.
import { fnv, wilson } from "../../evals/career/alert-labels/label_set.ts";

export interface AlertExport { alert_id: string | number; delivered_at: string; job_id: string; title: string; company: string; location?: string; url: string }
export const COLUMNS = ["alert_id", "delivered_at", "company", "title", "location", "url", "search_phrase",
  "on_linkedin_same_day", "on_indeed_same_day", "checked_at", "checked_by", "notes"] as const;

// One posting counts once however many people it was sent to; the draw is seeded by the day, so it can be re-drawn.
export function sample(alerts: AlertExport[], day: string, n = 50): AlertExport[] {
  const mine = alerts.filter((a) => String(a.delivered_at).slice(0, 10) === day);
  const one = new Map<string, AlertExport>();
  for (const a of mine) if (!one.has(a.job_id)) one.set(a.job_id, a);
  return [...one.values()].sort((a, b) => fnv(day + a.job_id) - fnv(day + b.job_id) || a.job_id.localeCompare(b.job_id)).slice(0, n);
}
const cell = (v: unknown) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function sheet(rows: AlertExport[]): string {
  const lines = [COLUMNS.join(",")];
  for (const a of rows) lines.push([a.alert_id, a.delivered_at, a.company, a.title, a.location ?? "", a.url, `${a.title} ${a.company}`, "", "", "", "", ""].map(cell).join(","));
  return lines.join("\n") + "\n";
}
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// A row counts only when both sites were checked (yes / no) on the day the alert was delivered (within 24 hours).
// Hidden = not on LinkedIn and not on Indeed. "unsure" or blank on either site leaves the row out.
export function score(rows: Record<string, string>[]) {
  const yn = (v: string) => (/^(y|yes)$/i.test(v) ? true : /^(n|no)$/i.test(v) ? false : null);
  let checked = 0, hidden = 0, late = 0, unsure = 0;
  for (const r of rows) {
    const li = yn(r.on_linkedin_same_day ?? ""), ind = yn(r.on_indeed_same_day ?? "");
    if (li === null || ind === null) { if ((r.on_linkedin_same_day || r.on_indeed_same_day)) unsure++; continue; }
    const sent = Date.parse(r.delivered_at), at = Date.parse(r.checked_at);
    if (!Number.isFinite(sent) || !Number.isFinite(at) || at < sent || at - sent > 86400000) { late++; continue; }
    checked++;
    if (!li && !ind) hidden++;
  }
  const share = checked ? hidden / checked : null, ci = wilson(hidden, checked);
  return { status: checked ? (checked >= 50 ? "MEASURED" : "PARTIAL") : "NOT_RUN", rows: rows.length, checked, hidden, excluded_late: late, excluded_unsure: unsure,
    hidden_share: share, ci95: ci, target_20pct: share === null ? "NOT_RUN" : share >= 0.2 ? (ci && ci[0] >= 0.2 ? "met (95% lower bound at or above 20%)" : "met on the point estimate only") : "not met" };
}

if (import.meta.main) {
  const opt = (k: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : undefined; };
  const cmd = Deno.args[0];
  if (cmd === "sample") {
    const day = opt("--day"), file = opt("--alerts");
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !file) { console.error("usage: sample --alerts alerts.json --day YYYY-MM-DD [--n 50] [--out sheet.csv]"); Deno.exit(2); }
    const picked = sample(JSON.parse(await Deno.readTextFile(file)), day, Number(opt("--n") ?? 50));
    await Deno.writeTextFile(opt("--out") ?? `hidden-market-${day}.csv`, sheet(picked));
    console.log(`${picked.length} alerts sampled for ${day}; fill on_linkedin_same_day and on_indeed_same_day with yes / no / unsure, checked_at as an ISO time, checked_by with your name`);
  } else if (cmd === "score") {
    const file = opt("--sheet");
    if (!file) { console.error("usage: score --sheet sheet.csv"); Deno.exit(2); }
    console.log(JSON.stringify(score(parseCsv(await Deno.readTextFile(file)))));
  } else { console.error("sample | score"); Deno.exit(2); }
}
