// WO-073: a search for a role finds that role. Found by the live task battery (CI run 39476278743, T03): "apply me to 25
// Product Manager jobs" queued a Risk Analyst Program Manager, a Lead Technical Recruiter and a Software Engineer II,
// because every query word was matched anywhere in a posting, its description included, and ranked newest first.
// A posting whose title carries every word ranks first; one whose title carries some of them next; one that only
// mentions them in its description is dropped while any title matches; the count of title matches is reported.
import { memoryPostingsDb, searchWords } from "../../supabase/functions/_shared/career_ingest.ts";
import { searchPostings } from "../../supabase/functions/_shared/career_search.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const P = (id: string, title: string, description: string, first_seen_at: string) =>
  ({ job_id: id, provider: "greenhouse", board: "x", ats_id: id, company: `Co ${id}`, title, location: "Remote", url: `https://boards.greenhouse.io/x/jobs/${id}`,
    description, department: "", posted_at: null, remote: "remote", role_family: null, seniority_band: null, apply_email: null,
    first_seen_at, last_seen_at: first_seen_at, closed_at: null });
const SHELF = [
  P("1", "Software Engineer II, Backend", "You will partner with the product manager on our roadmap.", "2026-10-20T10:00:00Z"),
  P("2", "Lead Technical Recruiter", "Hire for product, manager and engineering roles.", "2026-10-20T09:00:00Z"),
  P("3", "Senior Product Manager, Payments", "Own the payments roadmap.", "2026-10-10T00:00:00Z"),
  P("4", "Product Manager", "Ship features.", "2026-10-01T00:00:00Z"),
  P("5", "Product Designer", "Work with the product manager.", "2026-10-19T00:00:00Z"),
  P("6", "Program Manager, Risk", "Product risk and manager duties.", "2026-10-18T00:00:00Z"),
];

Deno.test("WO-073/1 the ranking: every query word in the title first; a description-only match is dropped while any title matches", () => {
  const r = searchPostings(SHELF, "Product Manager jobs", null, 10);
  eq(r.postings.map((p) => p.job_id), ["3", "4", "5", "6"], "full title matches newest first, then partial title matches");
  eq((r as any).title_matches, 2, "how many postings carry every word in their title");
  assert(!r.postings.some((p) => ["1", "2"].includes(p.job_id)), "a description-only match is never offered while a title matches");
});

Deno.test("WO-073/2 with no title match at all, description matches are still offered, and said to be such", () => {
  const r = searchPostings(SHELF, "roadmap", null, 10);
  eq(r.postings.map((p) => p.job_id).sort(), ["1", "3"]);
  eq((r as any).title_matches, 0);
});

Deno.test("WO-073/3 the store gives title matches first, before its limit cuts the newest description matches", async () => {
  const db = memoryPostingsDb();
  // 200 newer postings that only mention the words; two older ones that are the role.
  const noise = Array.from({ length: 200 }, (_, i) => P(`n${i}`, "Account Executive", "Work with the product manager daily.", `2026-10-20T${String(i % 24).padStart(2, "0")}:00:00Z`));
  await db.putMany([...noise, P("pm1", "Product Manager", "x", "2026-09-01T00:00:00Z"), P("pm2", "Senior Product Manager", "x", "2026-08-01T00:00:00Z")] as any);
  const got = await db.search(searchWords("product manager"), 150);
  assert(got.slice(0, 2).every((p) => p.job_id.startsWith("pm")), `title matches first: ${got.slice(0, 3).map((p) => p.job_id)}`);
  const r = searchPostings(got, "product manager", null, 25);
  eq(r.postings.map((p) => p.job_id), ["pm1", "pm2"]);
});

Deno.test("WO-073/4 the database search asks for title matches first (title-weighted lexemes), then fills to the limit", async () => {
  const calls: string[] = [];
  const builder = (rows: any[]) => {
    const b: any = { _rows: rows };
    for (const m of ["select", "is", "order"]) b[m] = () => b;
    b.textSearch = (_c: string, q: string, o?: any) => { calls.push(`${q}|${o?.type ?? "raw"}`); b._q = q; return b; };
    b.limit = async () => ({ data: b._q.includes(":A") ? rows.slice(0, 1) : rows, error: null });
    return b;
  };
  const rows = [{ job_id: "t", title: "Product Manager" }, { job_id: "d", title: "Engineer" }];
  const { supabasePostingsDb } = await import("../../supabase/functions/_shared/career_ingest.ts");
  const db = supabasePostingsDb({ from: () => builder(rows) });
  const got = await db.search(["product", "manager"], 150);
  eq(got.map((p: any) => p.job_id), ["t", "d"], "title matches first, the rest after, each once");
  assert(calls[0].startsWith("product:A & manager:A"), `the first query restricts every word to the title: ${calls[0]}`);
});
