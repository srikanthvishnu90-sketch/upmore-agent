// The live shelf (WO-065): today's postings from ~37 public ATS boards across fields (data and software, product,
// marketing, finance, healthcare operations), fetched where the network is open (GitHub Actions), normalized with the
// product's own normalizers, and cut to a deterministic, seeded sample. The task battery (tasks-live.json) is filled
// from it at run time, so no brain can be taught the answers. Public job data only; the file is fine to commit.
//
//   deno run -A evals/career/live-shelf.ts --run-id <id> [--seed <seed>] [--cap 600]
//
// Writes evals/career/results/shelf-<run_id>.json. A board that fails is recorded with its error and skipped; fewer
// than 10 boards read is a failed shelf (exit 1), never a quiet small one.
import { CareerJobs } from "../../supabase/functions/_shared/router_core.career.js";
import { decodeEntities } from "../../supabase/functions/_shared/career_ingest.ts";

export interface ShelfBoard { provider: "greenhouse" | "lever" | "ashby"; board: string; company: string; field: string }
export interface ShelfPosting {
  id: string; company: string; title: string; location: string; url: string; ats: string; posted_at: string | null;
  text: string; pay: string | null; department: string; board: string;
}
export interface Shelf {
  run_id: string; seed: string; fetched_at: string; cap: number; per_board: number;
  boards: { provider: string; board: string; company: string; field: string; status: "ok" | "failed"; open: number; kept: number; error?: string }[];
  postings: ShelfPosting[];
}

// Taken from packages/career-data/board-directory.json (live, curated sources), chosen for spread across fields.
export const SHELF_BOARDS: ShelfBoard[] = [
  // data, analytics and software
  { provider: "greenhouse", board: "databricks", company: "Databricks", field: "data/software" },
  { provider: "greenhouse", board: "datadog", company: "Datadog", field: "data/software" },
  { provider: "greenhouse", board: "mongodb", company: "MongoDB", field: "data/software" },
  { provider: "greenhouse", board: "fivetran", company: "Fivetran", field: "data/software" },
  { provider: "greenhouse", board: "mixpanel", company: "Mixpanel", field: "data/software" },
  { provider: "greenhouse", board: "gitlab", company: "GitLab", field: "data/software" },
  { provider: "ashby", board: "snowflake", company: "Snowflake", field: "data/software" },
  { provider: "greenhouse", board: "stripe", company: "Stripe", field: "data/software" },
  { provider: "ashby", board: "notion", company: "Notion", field: "product/software" },
  // product and marketing
  { provider: "greenhouse", board: "braze", company: "Braze", field: "marketing" },
  { provider: "greenhouse", board: "klaviyo", company: "Klaviyo", field: "marketing" },
  { provider: "greenhouse", board: "duolingo", company: "Duolingo", field: "product" },
  { provider: "greenhouse", board: "squarespace", company: "Squarespace", field: "product" },
  { provider: "greenhouse", board: "pinterest", company: "Pinterest", field: "product" },
  { provider: "lever", board: "elfbeauty", company: "e.l.f. Beauty", field: "marketing" },
  { provider: "greenhouse", board: "peloton", company: "Peloton", field: "marketing" },
  { provider: "greenhouse", board: "sweetgreen", company: "Sweetgreen", field: "operations" },
  { provider: "greenhouse", board: "gallup", company: "Gallup", field: "analytics" },
  // finance
  { provider: "greenhouse", board: "point72", company: "Point72", field: "finance" },
  { provider: "greenhouse", board: "sofi", company: "SoFi", field: "finance" },
  { provider: "greenhouse", board: "chime", company: "Chime", field: "finance" },
  { provider: "greenhouse", board: "affirm", company: "Affirm", field: "finance" },
  { provider: "ashby", board: "ramp", company: "Ramp", field: "finance" },
  { provider: "ashby", board: "plaid", company: "Plaid", field: "finance" },
  { provider: "greenhouse", board: "williamblair", company: "William Blair", field: "finance" },
  { provider: "greenhouse", board: "forvismazars", company: "Forvis Mazars", field: "finance" },
  { provider: "greenhouse", board: "pathward", company: "Pathward", field: "finance" },
  { provider: "lever", board: "metlife", company: "MetLife", field: "finance" },
  // healthcare operations
  { provider: "greenhouse", board: "oscar", company: "Oscar Health", field: "healthcare" },
  { provider: "greenhouse", board: "onemedical", company: "One Medical", field: "healthcare" },
  { provider: "lever", board: "lyrahealth", company: "Lyra Health", field: "healthcare" },
  { provider: "greenhouse", board: "cloverhealth", company: "Clover Health", field: "healthcare" },
  { provider: "greenhouse", board: "zocdoc", company: "Zocdoc", field: "healthcare" },
  { provider: "ashby", board: "hinge-health", company: "Hinge Health", field: "healthcare" },
  { provider: "lever", board: "includedhealth", company: "Included Health", field: "healthcare" },
  { provider: "greenhouse", board: "omadahealth", company: "Omada Health", field: "healthcare" },
  { provider: "greenhouse", board: "talkspace", company: "Talkspace", field: "healthcare" },
];

export const feedUrl = (b: ShelfBoard) =>
  b.provider === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${b.board}/jobs?content=true&pay_transparency=true`
  : b.provider === "lever" ? `https://api.lever.co/v0/postings/${b.board}?mode=json`
  : `https://api.ashbyhq.com/posting-api/job-board/${b.board}?includeCompensation=true`;

// ------------------------------------------------------------------------------------------------ seeded randomness
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(xs: T[], seed: string): T[] {
  const r = rng(seed), out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ------------------------------------------------------------------------------------------------ normalizing
const money = (n: unknown, cur = "USD") => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  const sym = cur === "USD" ? "$" : `${cur} `;
  return `${sym}${Math.round(v).toLocaleString("en-US")}`;
};
// The pay the board's API states in a structured field, as text; null when the API gives none (the posting's own text
// may still mention pay: that is in `text`).
export function payOf(provider: string, raw: any): string | null {
  try {
    if (provider === "greenhouse") {
      const r = Array.isArray(raw?.pay_input_ranges) ? raw.pay_input_ranges : [];
      const parts = r.map((x: any) => {
        const cur = String(x.currency_type || "USD"), lo = money(Number(x.min_cents) / 100, cur), hi = money(Number(x.max_cents) / 100, cur);
        return lo && hi ? `${lo}–${hi}${x.title ? ` (${String(x.title).trim()})` : ""}` : null;
      }).filter(Boolean);
      return parts.length ? parts.join("; ") : null;
    }
    if (provider === "lever") {
      const s = raw?.salaryRange;
      if (s && (s.min || s.max)) {
        const cur = String(s.currency || "USD"), lo = money(s.min, cur), hi = money(s.max, cur);
        const per = String(s.interval || "").replace(/-/g, " ");
        return `${[lo, hi].filter(Boolean).join("–")}${per ? ` ${per}` : ""}`;
      }
      const d = String(raw?.salaryDescriptionPlain || "").trim();
      return d ? d.slice(0, 300) : null;
    }
    if (provider === "ashby") {
      const c = raw?.compensation;
      const s = String(c?.compensationTierSummary || c?.scrapeableCompensationSalarySummary || "").trim();
      return s || null;
    }
  } catch { /* a malformed pay field is no pay field */ }
  return null;
}

function rawJobs(provider: string, json: any): any[] {
  return provider === "lever" ? (Array.isArray(json) ? json : []) : ((json && json.jobs) || []);
}
function rawText(provider: string, raw: any, normalizedJd: string): string {
  let t = normalizedJd || "";
  if (provider === "lever") {
    // Lever keeps requirements in lists[] and the closing section in additional; the person sees them on the page.
    const lists = Array.isArray(raw?.lists) ? raw.lists.map((l: any) => `${l.text || ""}: ${l.content || ""}`).join(" ") : "";
    t = [t, lists, raw?.additionalPlain || raw?.additional || ""].filter(Boolean).join(" ");
  }
  return decodeEntities(t).slice(0, 4000);
}

export function normalizeBoard(b: ShelfBoard, json: any): ShelfPosting[] {
  const J: any = CareerJobs;
  const normalize = b.provider === "greenhouse" ? J.normalizeGreenhouse : b.provider === "lever" ? J.normalizeLever : J.normalizeAshby;
  const raw = rawJobs(b.provider, json);
  const norm: any[] = normalize(json, b.board, b.company);
  const out: ShelfPosting[] = [];
  norm.forEach((p, i) => {
    const r = raw[i] || {};
    const id = String(r.id ?? "");
    const title = String(p.title || "").replace(/\s+/g, " ").trim();
    const url = String(p.url || "");
    if (!id || !title || !/^https:\/\//.test(url)) return;
    out.push({
      id: `${b.provider}:${b.board}:${id}`, company: b.company, title, location: String(p.location || "").replace(/\s+/g, " ").trim(),
      url, ats: b.provider, posted_at: p.posted_at || null, text: rawText(b.provider, r, String(p.jd_text || "")), pay: payOf(b.provider, r),
      department: String(p.department || ""), board: b.board,
    });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ the run
export async function fetchShelf(o: { runId: string; seed: string; cap?: number; boards?: ShelfBoard[]; fetchFn?: typeof fetch; now?: number }): Promise<Shelf> {
  const boards = o.boards ?? SHELF_BOARDS, cap = o.cap ?? 600, fetchFn = o.fetchFn ?? fetch;
  const read: { b: ShelfBoard; postings: ShelfPosting[]; error?: string }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < boards.length) {
      const b = boards[next++];
      try {
        const res = await fetchFn(feedUrl(b), { headers: { accept: "application/json", "user-agent": "trainee-eval/1 (public job board read)" }, signal: AbortSignal.timeout(30000) });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
        read.push({ b, postings: normalizeBoard(b, await res.json()) });
      } catch (e) {
        read.push({ b, postings: [], error: e instanceof Error ? e.message : String(e) });
      }
    }
  }));
  read.sort((x, y) => boards.indexOf(x.b) - boards.indexOf(y.b));
  const ok = read.filter((r) => !r.error && r.postings.length);
  const perBoard = Math.max(1, Math.ceil(cap / Math.max(1, ok.length)));
  const postings: ShelfPosting[] = [];
  const kept = new Map<string, number>();
  for (const r of ok) {
    const sorted = r.postings.slice().sort((a, b) => a.id.localeCompare(b.id));
    const pick = shuffled(sorted, `${o.seed}:${r.b.provider}:${r.b.board}`).slice(0, perBoard);
    kept.set(r.b.board, pick.length);
    postings.push(...pick);
  }
  const final = postings.slice(0, cap);
  const keptFinal = new Map<string, number>();
  for (const p of final) keptFinal.set(p.board, (keptFinal.get(p.board) ?? 0) + 1);
  return {
    run_id: o.runId, seed: o.seed, fetched_at: new Date(o.now ?? Date.now()).toISOString(), cap, per_board: perBoard,
    boards: read.map((r) => ({ provider: r.b.provider, board: r.b.board, company: r.b.company, field: r.b.field, status: r.error ? "failed" as const : "ok" as const,
      open: r.postings.length, kept: keptFinal.get(r.b.board) ?? 0, ...(r.error ? { error: r.error } : {}) })),
    postings: final,
  };
}

if (import.meta.main) {
  const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const runId = opt("--run-id") || Deno.env.get("GITHUB_RUN_ID") || `local-${new Date().toISOString().slice(0, 10)}`;
  const seed = opt("--seed") || runId;
  const shelf = await fetchShelf({ runId, seed, cap: Number(opt("--cap") || 600) });
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(new URL(`./results/shelf-${runId}.json`, import.meta.url), JSON.stringify(shelf, null, 1));
  const okBoards = shelf.boards.filter((b) => b.status === "ok" && b.open > 0);
  console.log(`shelf ${runId}: ${shelf.postings.length} postings from ${okBoards.length}/${shelf.boards.length} boards (seed ${seed}, ${shelf.per_board} per board) · with pay ${shelf.postings.filter((p) => p.pay).length}`);
  for (const b of shelf.boards) console.log(`  ${b.status === "ok" ? "ok    " : "FAILED"} ${b.provider}/${b.board} (${b.company}, ${b.field}): ${b.open} open, ${b.kept} kept${b.error ? ` · ${b.error}` : ""}`);
  if (okBoards.length < 10) { console.log("SHELF FAILED: fewer than 10 boards read"); Deno.exit(1); }
}
