# WO-006: Real jobs — cloud ingestion into a postings table

Status: ready · Depends on: WO-001 · Assignee: Muse · Size cap: ~600 lines excluding the architect tests and the board data

## Why
The live chat has zero jobs: polling ran only on the owner's VM, for the test account, and died silently three
times. Jobs must come from a scheduled cloud job into a table every person's agent reads, with an honest
"first seen" time (the basis of "posted 4 minutes ago" alerts), and must survive failures without lying.

## Files
- `supabase/functions/_shared/career_ingest.ts` (new): `ingestBoards`, `memoryPostingsDb`, `supabasePostingsDb`, `boardFetchFeed`
- `supabase/functions/career-ingest/index.ts` (new): the scheduled function (service role; secret-header auth like `agent-message-worker`)
- `supabase/migrations/20261019000000_career_postings.sql` (new): tables below, RLS
- `scripts/launch/schedule-career-ingest.sql` (new): the pg_cron + pg_net schedule (every 10 minutes); NOT applied by you, the owner runs it
- `packages/career-data/board-directory.json` + `tests/career-board-directory.test.cjs`: bring in the board growth from
  `origin/work/mi034-board-tranche2` @ `9b2832d1` and `origin/work/mi034-egress-2` @ `a670326c` (107 → 309 live boards),
  data and its test only (`git checkout <sha> -- <path>`); drop `leverdemo` and the ATS vendors' own boards (`greenhouse`,
  `ashby`) and the duplicate Palantir; say the final count in the PR
- `supabase/functions/_shared/agent/career_tools.ts`: `search_jobs` ranks by fit (below); the WO-002 tests stay green
- `tests/db/career_postings.test.sql` (new, yours): RLS and constraints
- `tests/architect/pending/wo-006-ingest.test.ts` → `tests/architect/` (do not edit)

## Interfaces (exact)
```ts
export interface Board { company: string; provider: string; board: string }
export type FetchFeed = (b: Board) => Promise<{ job_id: string; company: string; title: string; location?: string; url: string; description?: string }[]>;
export interface PostingsDb {
  all(): Promise<Posting[]>; open(): Promise<Posting[]>; get(job_id: string): Promise<Posting | null>; put(p: Posting): Promise<void>;
  openForBoard(b: Board): Promise<Posting[]>; newSince(isoTime: string): Promise<Posting[]>; // open, first_seen_at > t, newest first
  getCursor(): Promise<number>; setCursor(n: number): Promise<void>;
}
// Posting = the feed fields + provider, board, first_seen_at, last_seen_at, closed_at (ISO strings or null)
export function memoryPostingsDb(): PostingsDb;
export function supabasePostingsDb(admin: SupabaseClient): PostingsDb;       // the same semantics over the tables below (batch writes)
export function boardFetchFeed(fetchFn?: typeof fetch): FetchFeed;           // CareerJobs (121) fetchers + normalizers; 15 s timeout per board
export function ingestBoards(o: { boards: Board[]; fetchFeed: FetchFeed; db: PostingsDb; now: number; maxBoards?: number }): Promise<{
  boards_ok: number; boards_failed: number; new: number; seen: number; closed: number; failures: { board: string; provider: string; error: string }[];
}>;
```
Semantics pinned by the tests: first_seen_at never moves; a posting missing from a SUCCESSFUL read is closed; a failed
read closes nothing; a reappearing posting reopens with its original first_seen_at and is not "new"; the cursor rotates
through the directory `maxBoards` at a time.

## Tables (migration)
- `career_postings(job_id text primary key, provider text, board text, company text, title text, location text, url text,
  description text, first_seen_at timestamptz not null, last_seen_at timestamptz not null, closed_at timestamptz)`, indexes on
  `(closed_at, first_seen_at desc)` and `(provider, board)`. RLS: `select` for `authenticated`; writes service role only.
- `career_ingest_state(id int primary key default 1 check (id = 1), cursor int not null default 0, last_run_at timestamptz, last_stats jsonb)`.
  Service role only. The function writes `last_stats` every run so a silent stop is visible (`last_run_at` older than 30 min = down).

## The function
`career-ingest`: loads `board-directory.json` (`boards[]` with `status: "live"` only; map each entry to
`{ company, provider, board: board_token }`; take the file from `a670326c`, which already contains the `9b2832d1` growth), runs `ingestBoards` with `maxBoards = 60` and boards fetched
6 at a time, writes stats, returns them. Requests identify themselves: `User-Agent: Trainee job alerts (contact: <env INGEST_CONTACT_EMAIL>)`.
Honors `429`/`5xx` as a failed board (closes nothing) and moves on.

## search_jobs on real data
`careerTools({ postings })`: in production `postings = () => db.open()` (most recent 3,000 open). `search_jobs` filters by query
words over title + description, then ranks by `CareerJobs.scoreFit(posting, profile)` (121) when the person has a profile, then by
`first_seen_at` (newest first). Each result carries `job_id, company, title, location, url, first_seen_at, fit` (the score and its
reasons as the module returns them).

## Acceptance
- The 7 WO-006 tests and all earlier architect tests pass; `tests/db/career_postings.test.sql` passes in `bash tests/db/run.sh`; gate green.
- A local run against the real boards: `deno run -A supabase/functions/career-ingest/local.ts --max 60` (a small runner using
  `memoryPostingsDb`) prints the stats; paste them in the PR (expect a few failures; list them).

## Demo
Run the local ingest twice 10 minutes apart; the second run shows `new` > 0 only for genuinely new postings. Then in the simulator
(`--brain agent`, postings from that local db): "any remote data analyst jobs?" → real postings with links, newest first.

## Out of scope
Alerts and reports (WO-007), Workday (later order), paid job-data APIs (D-003), deploying or scheduling (the owner).
