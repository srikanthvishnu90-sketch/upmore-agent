// WO-076 acceptance tests (architect-authored; builders make them pass, never edit them).
// Ready first: the want queue holds up to 4× the person's daily limit as candidates (the owner, 2026-10-20: "WO-076:
// YES. Queue at 4× the daily limit as candidates, sends capped at 25"); sends stay at the daily limit where they are
// enforced now (career_apply_enqueue raises daily_cap). The extension plans each Greenhouse posting from the board's
// public API before it opens a tab, and orders the queue: fit first, then ready, one open question, more, not known yet.
// Nothing new for the person to tap: the same Prepare, the same cards, ready ones first.
// Contract: docs/architect/work-orders/WO-076-ready-first.md. Fixtures: tests/fixtures/apply/greenhouse-api (the board
// API's shape, rebuilt from the CI capture of that API, samples A-H; greenhouseQuestions reads them back exactly).
import { CANDIDATES_PER_SEND, candidateLimit, memoryWantStore, supabaseWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { admitApplication, DEFAULT_DAILY, MAX_DAILY } from "../../supabase/functions/_shared/career_apply.ts";
import { daySummary, formTier, greenhouseApiUrl, preplanGreenhouse, readyFirst } from "../../extension/src/apply_core.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const T0 = Date.UTC(2026, 9, 20, 15);
const ctx = (now = T0) => ({ userId: "u1", threadId: "t1", now, state: {}, turn: { message: "apply me", added: [] as string[] } });
const GH = (n: number) => ({ url: `https://job-boards.greenhouse.io/acme${n}/jobs/${4000000 + n}`, company: `Acme ${n}`, title: `Data Analyst ${n}` });
const tool = (wants: any, limits?: any) => careerTools({ postings: async () => [], alerts: null, wants, limits } as any).find((t) => t.name === "queue_applications")!;
const fixture = (id: string) => JSON.parse(Deno.readTextFileSync(`tests/fixtures/apply/greenhouse-api/${id}.json`));
// The complete TEST persona, living in the posting's own city (as the WO-076 measure places it).
const t = (value: string) => ({ value, factId: "TEST-persona" });
const livingIn = (city: string, st: string) => ({ ...PERSONA, city: t(city), state: t(st), location: t(`${city}, ${st}`) });
const pre = (id: string, answers: any) => {
  const job = fixture(id);
  return preplanGreenhouse({ job, url: job.absolute_url, userId: "TEST", answers, saved: {}, now: T0 });
};

Deno.test("WO-076/1 the want queue holds 4× the daily limit as candidates; what is over is refused with both numbers named", async () => {
  eq(CANDIDATES_PER_SEND, 4);
  eq([candidateLimit(), candidateLimit({ daily: 50 }), candidateLimit({ daily: 500 })], [100, 200, 200], "100 at the default, 200 at most");
  const wants = memoryWantStore();
  const out: any = await tool(wants).run({ postings: Array.from({ length: 4 * DEFAULT_DAILY + 5 }, (_, i) => GH(i + 1)) }, ctx() as any);
  eq(out.queued, 4 * DEFAULT_DAILY);
  eq(out.refused.length, 5);
  assert(out.refused.every((r: any) => /100/.test(r.why) && /25/.test(r.why)), `the candidates and the daily limit are named: ${out.refused[0]?.why}`);
  eq(out.limit, DEFAULT_DAILY, "the send limit is reported unchanged");
  assert(/nothing (is|has been) sent/i.test(out.note), "the result tells the model nothing was sent");
  assert(/25/.test(out.note) && /approv/i.test(out.note), `the result says sends stay at the daily limit, each on approval: ${out.note}`);
  const same: any = await tool(wants).run({ postings: [GH(500)] }, ctx(T0 + 3600_000) as any);
  eq(same.queued, 0, "the same day has no room left");
  const next: any = await tool(wants).run({ postings: [GH(501)] }, ctx(T0 + 26 * 3600_000) as any);
  eq(next.queued, 1, "a new day has room again");
});

Deno.test("WO-076/1b at the highest limit the tool takes 200 in one call, saved 100 per call to the database, in the order given", async () => {
  const calls: any[] = [];
  const admin = { rpc: async (_: string, a: any) => { calls.push(a.p_items); return { data: { added: a.p_items.map((w: any) => w.posting_key) }, error: null }; },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), gte: async () => ({ count: 0, error: null }) }) }) }) };
  const out: any = await tool(supabaseWantStore(admin), { daily: MAX_DAILY }).run({ postings: Array.from({ length: 4 * MAX_DAILY }, (_, i) => GH(i + 1)) }, ctx() as any);
  eq(out.queued, 4 * MAX_DAILY);
  assert(calls.length === 2 && calls.every((c) => c.length <= 100), `put in calls of at most 100 (the SQL's own bound): ${calls.map((c) => c.length)}`);
  const at = calls.flat().map((w: any) => Date.parse(w.queued_at));
  assert(at.every((x, i) => i === 0 || x > at[i - 1]), "queued_at keeps the order the brain gave (the fit proxy when no fit is carried)");
});

Deno.test("WO-076/2 sends are unchanged: the daily limit still stops the day's applications, in code and in the queue's SQL", async () => {
  const log = Array.from({ length: DEFAULT_DAILY }, (_, i) => ({ user_id: "u1", job_id: `j${i}`, company: `c${i}`, at: T0 - 1000, state: "confirmed" }));
  eq(admitApplication(log, { user_id: "u1", job_id: "new", company: "new" }, T0).reason, "daily_cap");
  // The newest definition of each send-side function still enforces the limit (no migration of this order touches them).
  const files = [...Deno.readDirSync("supabase/migrations")].map((e) => e.name).filter((n) => n.endsWith(".sql")).sort();
  const last = (fn: string) => files.filter((f) => new RegExp(`function public\\.${fn}\\(`).test(Deno.readTextFileSync(`supabase/migrations/${f}`))).at(-1)!;
  const limitSql = Deno.readTextFileSync(`supabase/migrations/${last("career_apply_daily_limit")}`);
  assert(/least\(50/.test(limitSql) && /,\s*25\)/.test(limitSql), "career_apply_daily_limit: 25 by default, 50 at most");
  const enq = Deno.readTextFileSync(`supabase/migrations/${last("career_apply_enqueue")}`);
  assert(/daily_cap/.test(enq), "career_apply_enqueue still raises daily_cap");
  const put = Deno.readTextFileSync(`supabase/migrations/${last("career_apply_want_put_for")}`);
  assert(/at most 100 postings at once/.test(put) && !/daily_limit|daily_cap/.test(put), "the want queue's SQL bounds one call, not the day");
});

Deno.test("WO-076/3 Greenhouse is planned from the board's public API; Lever and Ashby are not known until Prepare reads them", () => {
  eq(greenhouseApiUrl("https://job-boards.greenhouse.io/motive/jobs/8008500003"), "https://boards-api.greenhouse.io/v1/boards/motive/jobs/8008500003?questions=true");
  eq(greenhouseApiUrl("https://boards.greenhouse.io/motive/jobs/8008500003?gh_src=x"), "https://boards-api.greenhouse.io/v1/boards/motive/jobs/8008500003?questions=true");
  eq(greenhouseApiUrl("https://boards.greenhouse.io/embed/job_app?for=motive&token=8008500003"), "https://boards-api.greenhouse.io/v1/boards/motive/jobs/8008500003?questions=true");
  eq(greenhouseApiUrl("https://jobs.lever.co/acme/0b5c3a1e-1111-2222-3333-444455556666/apply"), null);
  eq(greenhouseApiUrl("https://jobs.ashbyhq.com/acme/9f0e6c2a-aaaa-bbbb-cccc-ddddeeeeffff/application"), null);
  eq(greenhouseApiUrl("https://www.linkedin.com/jobs/view/123"), null, "never LinkedIn or Indeed");
  eq(greenhouseApiUrl("https://example.com/boards-api.greenhouse.io/v1/boards/x/jobs/1"), null);
  eq(formTier(null), 3, "no plan: not known yet");
  eq([formTier({ known: true, open: 0 }), formTier({ known: true, open: 1 }), formTier({ known: true, open: 4 })], [0, 1, 2]);
});

Deno.test("WO-076/4 a ready form plans ready (the resume pair is one question, WO-075); one open question plans as one; more as more", () => {
  const motive = pre("greenhouse-motive-8008500003", livingIn("Charlotte", "NC"));
  eq([motive.known, motive.open, motive.needs], [true, 0, []], "ready: nothing for the person to answer");
  eq(motive.jobId, "greenhouse:motive:8008500003", "keyed as the extension keys the posting");
  eq(motive.location, "Charlotte, NC", "the posting's own location, from the API");
  eq(pre("greenhouse-doordashusa-8139265", livingIn("Seattle", "WA")).open, 0);
  const lucid = pre("greenhouse-lucidmotors-5200488007", livingIn("Costa Mesa", "CA"));
  eq(lucid.open, 1, JSON.stringify(lucid.needs));
  const truveta = pre("greenhouse-truveta-6223732004", livingIn("Seattle", "WA"));
  assert(truveta.open >= 2, JSON.stringify(truveta.needs));
  // Without a resume on file, the pair is still one question: the upload, asked once.
  const { resume: _, ...noResume } = livingIn("Charlotte", "NC") as any;
  const r = pre("greenhouse-motive-8008500003", noResume);
  eq(r.needs.map((n: any) => [n.label, n.type]), [["Resume/CV", "input_file"]]);
  // Nothing is invented: a person who has told Trainee less has more open, never a guessed answer.
  const thin = pre("greenhouse-motive-8008500003", { first_name: t("Test"), last_name: t("Person"), resume: t("TEST-resume-sha256") });
  assert(thin.open >= 2 && thin.needs.some((n: any) => /email/i.test(n.label)), JSON.stringify(thin.needs));
  // A board that lists no questions (closed, or not the API's shape) is not known: Prepare reads its page.
  const none = preplanGreenhouse({ job: { id: 1 }, url: "https://job-boards.greenhouse.io/x/jobs/1", userId: "TEST", answers: PERSONA, saved: {}, now: T0 });
  eq(none.known, false);
});

Deno.test("WO-076/5 order: within a fit band ready, one open, more, not known; a weaker fit never rises above a stronger one", () => {
  const P = (id: string, open: number | null, fit?: number) => ({ id, ...(fit === undefined ? {} : { fit }), plan: open === null ? null : { known: true, open } });
  // No fit carried (today's want rows): one band, queue order kept inside each tier.
  eq(readyFirst([P("a", 2), P("b", null), P("c", 0), P("d", 1), P("e", 0), P("f", null), P("g", 1)]).map((x) => x.id), ["c", "e", "d", "g", "a", "b", "f"]);
  // With fit bands: the stronger band first whatever its form costs.
  const r = readyFirst([P("weak-ready", 0, 1), P("strong-one", 1, 3), P("strong-unknown", null, 3), P("mid-ready", 0, 2), P("strong-ready", 0, 3)]).map((x) => x.id);
  eq(r, ["strong-ready", "strong-one", "strong-unknown", "mid-ready", "weak-ready"]);
  // A fit band is never mixed with no fit: an item without one goes after every item with one.
  eq(readyFirst([P("nofit-ready", 0), P("fit-more", 3, 1)]).map((x) => x.id), ["fit-more", "nofit-ready"]);
  const input = [P("x", 0), P("y", 1)];
  readyFirst(input);
  eq(input.map((x) => x.id), ["x", "y"], "the caller's list is not changed in place");
});

Deno.test("WO-076/6 the day: the first sends (at most the daily limit) are counted by readiness; the rest wait as candidates", () => {
  const items = readyFirst([
    ...Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, plan: { known: true, open: 0 } })),
    ...Array.from({ length: 50 }, (_, i) => ({ id: `o${i}`, plan: { known: true, open: 1 + (i % 3) } })),
    ...Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, plan: null })),
  ]);
  eq(daySummary(items, DEFAULT_DAILY), { sends: 25, ready: 25, one: 0, more: 0, unknown: 0, waiting: 75 });
  const few = readyFirst([{ id: "a", plan: { known: true, open: 1 } }, { id: "b", plan: null }, { id: "c", plan: { known: true, open: 0 } }]);
  eq(daySummary(few, DEFAULT_DAILY), { sends: 3, ready: 1, one: 1, more: 0, unknown: 1, waiting: 0 });
});

Deno.test("WO-076/7 the extension pre-plans picks from the board's public API only, before any tab, and adds no tap", async () => {
  const bg = await Deno.readTextFile("extension/background.js");
  const at = bg.indexOf('case "queue-from-trainee"');
  const body = bg.slice(at, at + 1500);
  assert(/limit=200/.test(body), "up to 4× the highest limit is taken from the want queue");
  assert(/preplan\(/.test(body), "the picks are planned when they are pulled");
  const fetches = [...bg.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
  assert(fetches.every((f) => /cfg\.supabaseUrl|greenhouseApiUrl|^api\b|^url\b/.test(f)), `only Upmore and the board API are fetched: ${fetches}`);
  assert(/C\.greenhouseApiUrl\(/.test(bg), "the API address comes from greenhouseApiUrl alone");
  assert(/C\.readyFirst\(/.test(bg), "the queue is ordered by readyFirst");
  const manifest = JSON.parse(await Deno.readTextFile("extension/manifest.json"));
  assert(manifest.host_permissions.includes("<all_urls>") || manifest.host_permissions.some((h: string) => /boards-api\.greenhouse\.io/.test(h)), "the board API is a host the extension may read");
  const panel = await Deno.readTextFile("extension/panel.html");
  eq((panel.match(/<button\b/g) || []).length, 20, "no new button in the panel (20 on trunk before WO-076): the same Prepare, the same cards");
});

