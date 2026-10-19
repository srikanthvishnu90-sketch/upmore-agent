// The scheduled ingest run (WO-006), as a function of its inputs so it is testable without a network or a database.
// pg_cron calls it every 5 minutes (scripts/launch/schedule-career-ingest.sql, run by the owner) with the shared secret.
// Each run reads the next INGEST_MAX_BOARDS boards of the directory (default 100, so each of ~2,200 boards is read about every
// 2 hours), INGEST_CONCURRENCY at a time (default 8), starts no board after 100 s so the run ends inside the function's
// time limit, rewrites an unchanged posting's last_seen_at at most every 6 hours, and records its stats in
// career_ingest_state so a silent stop is visible.
import { equalSecret } from "../_shared/message_service.ts";
import { ingestBoards, type Board, type FetchFeed, type IngestStats, type PostingsDb } from "../_shared/career_ingest.ts";

export interface IngestDeps {
  env: { get(k: string): string | undefined };
  boards: Board[];
  db: () => PostingsDb & { recordRun(stats: IngestStats, at: string): Promise<void> };
  fetchFeed: (userAgent: string) => FetchFeed;
  now: () => number;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const int = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && v ? Math.max(lo, Math.min(hi, n)) : d; };

export async function handleIngest(req: Request, d: IngestDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = d.env.get("CAREER_INGEST_SECRET") || "";
  if (secret.length < 32) return json({ error: "not configured: CAREER_INGEST_SECRET must be set, 32 characters or more" }, 503);
  if (!equalSecret(req.headers.get("x-trainee-ingest-secret") || "", secret)) return json({ error: "Unauthorized" }, 401);
  const contact = d.env.get("INGEST_CONTACT_EMAIL") || "";
  if (!contact) return json({ error: "not configured: INGEST_CONTACT_EMAIL is not set (boards are told who is reading them)" }, 503);
  const started = d.now();
  const db = d.db();
  try {
    const stats = await ingestBoards({
      boards: d.boards, db, now: started, fetchFeed: d.fetchFeed(`Trainee job alerts (contact: ${contact})`),
      maxBoards: int(d.env.get("INGEST_MAX_BOARDS"), 100, 1, 400), concurrency: int(d.env.get("INGEST_CONCURRENCY"), 8, 1, 16),
      deadline: started + 100000, clock: d.now, touchAfterMs: 6 * 3600000,
    });
    const result = { ...stats, directory: d.boards.length, ms: d.now() - started };
    await db.recordRun(result as IngestStats, new Date(started).toISOString());
    return json(result);
  } catch (e) {
    // A storage failure is reported, never a partial success; the cursor and postings stay as the last good write left them.
    console.error("career-ingest failed:", e instanceof Error ? e.message : e);
    return json({ error: "ingest failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}
