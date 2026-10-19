// What a person would see (WO-017): for 10 realistic job seekers, how many open postings match their search on the
// boards we watch, and how many were posted in the last 7 days, before and after a directory change. It reads every
// live board's public feed with the product's own reader (boardFetchFeed) and searches with the product's own word
// match (searchPostings), so the number is what search_jobs would return, filtered to the person's place. The
// personas are deliberately not all tech: the harvest source is new-grad and internship listings, and a coverage gain
// that only helps software engineers should read as exactly that. Needs the internet; CI runs it (coverage-personas.yml).
//   deno run -A evals/career/coverage-personas.ts [--before <directory.json>] [--after <directory.json>] [--out file.json]
// "before" defaults to the directory without the WO-017 additions (source "wo017-harvest"); "after" to the directory.
import { boardFetchFeed, directoryBoards, type Board, type FeedPosting, type FetchFeed } from "../../supabase/functions/_shared/career_ingest.ts";
import { searchPostings } from "../../supabase/functions/_shared/career_search.ts";

export interface Persona { id: string; who: string; query: string; place: { test(location: string): boolean } }
// Places are matched on the posting's own location text. "The US" is a country name, "remote", or "City, ST" with the
// state in capitals. Rough on purpose: a country code that is also a state (", CA" for Canada) reads as the state.
const US = { test: (l: string) => /\b(united states|usa|u\.s\.a?|remote)\b/i.test(l) ||
  /,\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/.test(l) };
export const PERSONAS: Persona[] = [
  { id: "P01", who: "new-grad software engineer, anywhere in the US or remote", query: "software engineer", place: US },
  { id: "P02", who: "data analyst in New York", query: "data analyst", place: /new york|nyc|brooklyn|\bny\b/i },
  { id: "P03", who: "product manager in the SF Bay Area", query: "product manager", place: /san francisco|bay area|palo alto|mountain view|san jose|oakland|menlo park|sunnyvale|\bsf\b/i },
  { id: "P04", who: "registered nurse in Texas", query: "registered nurse", place: /texas|\btx\b|houston|dallas|austin|san antonio/i },
  { id: "P05", who: "accountant in Chicago", query: "accountant", place: /chicago|\bil\b|illinois/i },
  { id: "P06", who: "mechanical engineer, anywhere in the US", query: "mechanical engineer", place: US },
  { id: "P07", who: "marketing coordinator, remote", query: "marketing coordinator", place: /remote/i },
  { id: "P08", who: "sales development rep in Austin or remote", query: "sales development", place: /austin|remote/i },
  { id: "P09", who: "customer success, remote", query: "customer success", place: /remote/i },
  { id: "P10", who: "machine learning engineer in Seattle", query: "machine learning engineer", place: /seattle|bellevue|redmond|\bwa\b|washington/i },
];

export interface Count { open: number; title_match: number; new_7d: number }
export function countFor(pool: FeedPosting[], p: Persona, now: number): Count {
  const here = pool.filter((x) => p.place.test(x.location || ""));
  const total = searchPostings(here.map((x) => ({ ...x, first_seen_at: x.posted_at })), p.query, null, 50).total;
  const words = p.query.toLowerCase().split(/\s+/);
  const titled = here.filter((x) => words.every((w) => String(x.title || "").toLowerCase().includes(w)));
  const week = now - 7 * 86400_000;
  return { open: total, title_match: titled.length, new_7d: titled.filter((x) => x.posted_at && Date.parse(x.posted_at) >= week).length };
}

export async function readAll(boards: Board[], fetchFeed: FetchFeed, concurrency = 6): Promise<{ postings: Map<string, FeedPosting[]>; failed: string[] }> {
  const postings = new Map<string, FeedPosting[]>(), failed: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < boards.length) {
      const b = boards[next++];
      const key = `${b.provider}:${b.board.toLowerCase()}`;
      try { const r = await fetchFeed(b); postings.set(key, Array.isArray(r) ? r : r.postings); } catch { failed.push(key); }
    }
  }));
  return { postings, failed };
}

export async function measure(o: { before: Board[]; after: Board[]; fetchFeed: FetchFeed; now: number; personas?: Persona[] }) {
  const all = new Map<string, Board>();
  for (const b of [...o.before, ...o.after]) all.set(`${b.provider}:${b.board.toLowerCase()}`, b);
  const { postings, failed } = await readAll([...all.values()], o.fetchFeed);
  const pool = (bs: Board[]) => bs.flatMap((b) => postings.get(`${b.provider}:${b.board.toLowerCase()}`) || []);
  const before = pool(o.before), after = pool(o.after);
  const rows = (o.personas || PERSONAS).map((p) => ({ id: p.id, who: p.who, query: p.query, before: countFor(before, p, o.now), after: countFor(after, p, o.now) }));
  return { boards: { before: o.before.length, after: o.after.length, read: postings.size, failed: failed.length }, postings: { before: before.length, after: after.length }, rows, failed };
}

if (import.meta.main) {
  const opt = (k: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : undefined; };
  const dirPath = new URL("../../packages/career-data/board-directory.json", import.meta.url);
  const after = JSON.parse(await Deno.readTextFile(opt("--after") ?? dirPath));
  const before = opt("--before") ? JSON.parse(await Deno.readTextFile(opt("--before")!)) : { boards: after.boards.filter((b: any) => b.source !== "wo017-harvest") };
  const r = await measure({ before: directoryBoards(before), after: directoryBoards(after), now: Date.now(),
    fetchFeed: boardFetchFeed(fetch, { userAgent: "Trainee coverage check (job alerts; github.com/srikanthvishnu90-sketch/upmore-agent)", timeoutMs: 20000 }) });
  console.log(`BOARDS ${JSON.stringify(r.boards)} POSTINGS ${JSON.stringify(r.postings)}`);
  console.log("persona | before open / title / new 7d | after open / title / new 7d");
  for (const x of r.rows) console.log(`PERSONA ${x.id} ${x.who} | ${x.before.open} / ${x.before.title_match} / ${x.before.new_7d} | ${x.after.open} / ${x.after.title_match} / ${x.after.new_7d}`);
  if (opt("--out")) await Deno.writeTextFile(opt("--out")!, JSON.stringify({ at: new Date().toISOString(), ...r }, null, 1) + "\n");
}
