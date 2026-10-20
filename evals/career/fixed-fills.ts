// The fixed task set (owner, 2026-10-20: "the same fixed set of tasks seeds every run"). Before this, each run filled
// {company}, {title} and {location} from a seed equal to the CI run id, so every run asked different questions and two
// scores could not be compared (agent 12, 10, 9, 7, 10 of 15 across runs 4-8).
//
// tasks-fixed.json freezes one fill per task: the companies, role words and places a person types, and the shelf
// postings they name. It was chosen once, by a rule written down here, from the shelf of run 39489840065:
//   - a posting the task's own pick rule accepts (a findable role phrase, a US place, English text, enough text when the
//     task reads the posting);
//   - the longest-open first (posted 30+ days before the shelf was read): a posting open that long is the least likely to
//     close before the next run;
//   - no posting is used by two tasks, and the second company differs from the first.
// Every run resolves the frozen fill against today's live shelf: the frozen posting if it is still open; otherwise a
// posting on the same board with the same role phrase and place (the person's words do not change); otherwise the same
// board and role phrase in another US place; otherwise the task's pick rule with the fixed seed. Every substitution is
// recorded, and the result carries the hash of the fills it actually used, so comparability is checkable:
// two runs are comparable when their fill hashes are equal.
//
//   deno run -A evals/career/fixed-fills.ts --freeze <shelf run id>     (writes tasks-fixed.json; the architect runs it)
import { english, findable, fillTask, isRemote, productPool, titlePhrase, usPlace, cityOf, type Fills, type TaskDef } from "./run-tasks.ts";
import type { Shelf, ShelfPosting } from "./live-shelf.ts";

export interface FixedFill extends Fills { boards: string[] }
export interface FixedSet { version: number; seed: string; frozen_from: string; frozen_at: string; rule: string; fills: Record<string, FixedFill> }
export interface Resolved { fills: Fills; substitution: string | null }

const DAY = 86400000;
const eligible = (task: TaskDef, pool: any[]) => (p: ShelfPosting) => {
  const ph = titlePhrase(p.title);
  return !!ph && !isRemote(p.location) && !!usPlace(p.location) && english(p.text) && (task.pick !== "with_text" || p.text.length >= 400) && findable(pool, p, ph);
};
const boardOf = (id: string) => id.split(":").slice(0, 2).join(":");
const fillOf = (a: ShelfPosting, b: ShelfPosting): FixedFill => ({
  company: a.company, title: titlePhrase(a.title)!, location: usPlace(a.location)!, company2: b.company, title2: titlePhrase(b.title)!, location2: usPlace(b.location)!,
  posting_ids: [a.id, b.id], boards: [boardOf(a.id), boardOf(b.id)],
});

// Longest-open first; a posting with no date is treated as new. Ties by id, so the choice is the same on every machine.
export function byAge(shelf: Shelf) {
  const t0 = Date.parse(shelf.fetched_at);
  const age = (p: ShelfPosting) => p.posted_at ? t0 - Date.parse(p.posted_at) : -1;
  return (a: ShelfPosting, b: ShelfPosting) => (age(b) >= 30 * DAY ? 1 : 0) - (age(a) >= 30 * DAY ? 1 : 0) || age(b) - age(a) || a.id.localeCompare(b.id);
}

export function freeze(tasks: TaskDef[], shelf: Shelf): Record<string, FixedFill> {
  const pool = productPool(shelf), used = new Set<string>(), out: Record<string, FixedFill> = {};
  const sorted = shelf.postings.slice().sort(byAge(shelf));
  for (const task of tasks) {
    const ok = eligible(task, pool);
    if (task.pick === "two_places") {
      const groups = new Map<string, ShelfPosting[]>();
      for (const p of sorted) if (ok(p) && !used.has(p.id)) { const k = titlePhrase(p.title)!.toLowerCase(); groups.set(k, [...(groups.get(k) || []), p]); }
      const keys = [...groups.keys()].sort((x, y) => groups.get(y)!.length - groups.get(x)!.length || x.localeCompare(y));
      for (const k of keys) {
        const ps = groups.get(k)!, a = ps[0], ca = cityOf(usPlace(a.location)!);
        const b = ps.find((x) => { const cb = cityOf(usPlace(x.location)!); return cb && ca && !cb.includes(ca) && !ca.includes(cb); });
        if (b) { out[task.id] = fillOf(a, b); used.add(a.id); used.add(b.id); break; }
      }
      if (!out[task.id]) throw new Error(`${task.id}: no role phrase on the shelf in two places`);
      continue;
    }
    const a = sorted.find((p) => ok(p) && !used.has(p.id));
    if (!a) throw new Error(`${task.id}: no posting fits pick ${task.pick}`);
    const b = sorted.find((p) => p !== a && p.company !== a.company && ok(p) && !used.has(p.id)) ?? a;
    out[task.id] = fillOf(a, b); used.add(a.id); used.add(b.id);
  }
  return out;
}

// The frozen fill against today's shelf. The person's words (company, role phrase, place) change only when no posting on
// the same board carries them; the posting a task reads may be swapped for another with the same words.
export function resolveFixed(task: TaskDef, f: FixedFill, shelf: Shelf, pool: any[], seed: string): Resolved {
  const byId = new Map(shelf.postings.map((p) => [p.id, p]));
  const ok = eligible(task, pool);
  const slot = (k: 0 | 1): { p: ShelfPosting | null; how: string | null } => {
    const id = f.posting_ids[k], title = k ? f.title2 : f.title, place = k ? f.location2 : f.location;
    const same = byId.get(id);
    if (same) return { p: same, how: null };
    const board = boardOf(id);
    const twins = shelf.postings.filter((p) => boardOf(p.id) === board && titlePhrase(p.title)?.toLowerCase() === title.toLowerCase() && ok(p)).sort((a, b) => a.id.localeCompare(b.id));
    const exact = twins.find((p) => usPlace(p.location) === place);
    if (exact) return { p: exact, how: `posting ${id} closed; same words on ${exact.id}` };
    if (twins.length) return { p: twins[0], how: `posting ${id} closed; ${title} at ${f.boards[k]} moved from ${place} to ${usPlace(twins[0].location)}` };
    return { p: null, how: `posting ${id} closed and ${title} is gone from ${board}` };
  };
  const a = slot(0), b = slot(1);
  if (a.p && b.p) {
    const changed = !!(a.how || b.how);
    const fills: Fills = changed ? { company: a.p.company, title: titlePhrase(a.p.title)!, location: usPlace(a.p.location)!, company2: b.p.company, title2: titlePhrase(b.p.title)!, location2: usPlace(b.p.location)!, posting_ids: [a.p.id, b.p.id] }
      : { company: f.company, title: f.title, location: f.location, company2: f.company2, title2: f.title2, location2: f.location2, posting_ids: [...f.posting_ids] };
    return { fills, substitution: [a.how, b.how].filter(Boolean).join("; ") || null };
  }
  const fb = fillTask(task, shelf, pool, seed);
  if ("error" in fb) throw new Error(`${task.id}: frozen fill unavailable (${[a.how, b.how].filter(Boolean).join("; ")}) and the pick rule found none: ${fb.error}`);
  return { fills: fb, substitution: `${[a.how, b.how].filter(Boolean).join("; ")}; refilled by the pick rule with the fixed seed` };
}

export async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// The hash of the fills a run used: the words each task was typed with and the postings it named. Equal hashes, same
// questions about the same postings.
export const fillHash = (fills: Record<string, Fills>) =>
  sha256(JSON.stringify(Object.keys(fills).sort().map((k) => [k, fills[k].company, fills[k].title, fills[k].location, fills[k].company2, fills[k].title2, fills[k].location2, fills[k].posting_ids])));
export const shelfHash = (shelf: Shelf) => sha256(shelf.postings.map((p) => p.id).sort().join("\n"));

if (import.meta.main) {
  const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const from = opt("--freeze");
  if (!from) { console.log("usage: --freeze <shelf run id>"); Deno.exit(2); }
  const here = new URL("./", import.meta.url);
  const shelf: Shelf = JSON.parse(await Deno.readTextFile(new URL(`results/shelf-${from}.json`, here)));
  const tasks: TaskDef[] = JSON.parse(await Deno.readTextFile(new URL("tasks-live.json", here))).tasks;
  const fills = freeze(tasks, shelf);
  const set: FixedSet = {
    version: 1, seed: "trainee-fixed-v1", frozen_from: `shelf-${from}.json`, frozen_at: shelf.fetched_at,
    rule: "Per task, the posting its pick rule accepts that has been open longest (30+ days first, then by age, then id); no posting used twice; the second company differs from the first. two_places: the role phrase with the most such postings, its two longest-open in different cities.",
    fills,
  };
  await Deno.writeTextFile(new URL("tasks-fixed.json", here), JSON.stringify(set, null, 1) + "\n");
  for (const [k, f] of Object.entries(fills)) console.log(`${k} ${f.company} | ${f.title} | ${f.location} || ${f.company2} | ${f.title2} | ${f.location2}`);
  console.log(`fill hash ${(await fillHash(fills)).slice(0, 16)}`);
}
