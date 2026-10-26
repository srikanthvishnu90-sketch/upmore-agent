// FEATURE E2E (2026-10-26): the ways a real person asks Trainee to apply to one posting, each through the production
// agent-chat handler (handler-career.ts handleChat) on a real Postgres (tests/flow/handler.ts), each a new person with a
// confirmed resume. Before: a pasted link went to the router's old batch stack ("BOARD_NOT_WIRED", nothing queued), "can
// you apply to <link>" got an explanation, "apply to Ramp's frontend intern" was not understood, and "apply to the
// frontend intern role at Ramp" was "not in the list I can work from" (career_postings is empty until the ingest runs).
// Now the posting is read from the ATS's public posting API on demand (api.ashbyhq.com answered on 127.0.0.1 here),
// stored, and queued; a link its board does not list, an unreadable board and a question about how to apply queue nothing.
// Nothing reaches a real host: any request that is not the Supabase double or the local Ashby stand-in fails the test.
import assertNode from "node:assert/strict";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { careerHandler, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const ID = "a13ae586-f4cb-4385-8822-c42b9b54ed74", GONE = "0f0e0d0c-0b0a-4908-8706-050403020100";
const LINK = `https://jobs.ashbyhq.com/ramp/${ID}`;
const TITLE = "Frontend Engineer Intern (TEST)";

Deno.test({
  name: "E2E phrasings: a pasted posting link or a named role is read from the ATS, stored and queued from chat; nothing invented, nothing sent",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir()) {
      if (CI) throw Error("the phrasing test needs Postgres 16 binaries in CI");
      console.log("NOT_RUN locally: no Postgres binaries");
      return;
    }
    const pg = await startPg();
    let down = false;
    const reads: string[] = [];
    const ats = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
      const u = new URL(req.url);
      reads.push(u.pathname);
      if (down) return new Response("unavailable", { status: 503 });
      if (u.pathname === "/posting-api/job-board/ramp") {
        return Response.json({ jobs: [
          { id: ID, title: TITLE, location: "New York, NY", jobUrl: LINK, applyUrl: `${LINK}/application`, publishedAt: new Date().toISOString(), descriptionPlain: "TEST synthetic posting." },
          { id: "b2b2b2b2-0000-4000-8000-000000000002", title: "Backend Engineer (TEST)", location: "New York, NY", jobUrl: "https://jobs.ashbyhq.com/ramp/b2b2b2b2-0000-4000-8000-000000000002", publishedAt: new Date().toISOString(), descriptionPlain: "TEST" },
        ] });
      }
      return new Response("not found", { status: 404 });
    });
    const origin = `http://127.0.0.1:${(ats.addr as Deno.NetAddr).port}`;
    let h: Awaited<ReturnType<typeof careerHandler>> | null = null;
    try {
      await supabaseParity(pg);
      const people: Record<string, string> = {};
      for (let i = 1; i <= 9; i++) people[`tok-${i}`] = `7b0f8f8e-6a43-4a49-9d2c-0000000001${String(i).padStart(2, "0")}`;
      for (const id of Object.values(people)) {
        await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
          insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
      }
      h = await careerHandler(pg, people);
      const double = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request && !init ? input : new Request(input as any, init);
        const u = new URL(req.url);
        if (u.origin === new URL(SUPABASE_URL).origin || u.hostname === "127.0.0.1") return double(req);
        if (u.hostname === "api.ashbyhq.com") return double(new Request(`${origin}${u.pathname}${u.search}`, req));
        return Promise.reject(new Error(`no real host: ${u.href}`));
      }) as typeof fetch;
      // A new person with a confirmed resume, then one apply text in a new thread.
      const ask = async (n: number, message: string) => {
        const setup = h!.chat(`tok-${n}`);
        assertEquals((await setup.say(`here is my resume:\n${RESUME}`)).intent, "career_resume_ingest");
        assertEquals((await setup.say("yes, that's my resume")).resultStatus, "completed");
        const r = await h!.chat(`tok-${n}`).say(message);
        assertEquals(r.status, 200, r.reply);
        const wanted = await pg.sql(`select coalesce(string_agg(posting_key, ','), '') from public.career_apply_wanted where user_id = '${people[`tok-${n}`]}'`);
        return { ...r, wanted };
      };
      const queuedOne = (r: { intent: string | null; resultStatus: string | null; reply: string; wanted: string }, m: string) => {
        assertEquals([r.intent, r.resultStatus, r.wanted], ["career_apply_queue", "queued", `ashby:ramp:${ID}`], `${m}: ${r.reply}`);
        assert(r.reply.startsWith("1/1 queued") && r.reply.includes(TITLE) && r.reply.includes("Ramp"), r.reply);
      };

      const phrasings = [
        `apply me to this: ${LINK}`,
        `can you apply to ${LINK}`,
        `${LINK} apply for me`,
        `I want to apply to this job ${LINK}`,
        `apply to ${LINK}/application please`,
      ];
      for (const [i, m] of phrasings.entries()) {
        await t.step(`"${m}": read, stored, queued`, async () => queuedOne(await ask(i + 1, m), m));
      }
      await t.step("the posting is stored once, as the ingest stores it", async () => {
        assertEquals(await pg.sql(`select string_agg(job_id || '|' || company || '|' || title || '|' || url, ',') from public.career_postings`),
          `ashby:ramp:${ID}|Ramp|${TITLE}|${LINK}`);
      });
      await t.step(`"apply to Ramp's frontend intern": Ramp's registered board, one matching posting, queued`, async () => {
        queuedOne(await ask(6, "apply to Ramp's frontend intern"), "possessive");
      });
      await t.step(`"how do I apply to <link>?" is a question: nothing queued`, async () => {
        const r = await ask(7, `how do I apply to ${LINK}?`);
        assert(r.intent !== "career_apply_queue" && r.wanted === "", `${r.intent}: ${r.reply}`);
      });
      await t.step("a link its board does not list: said so, nothing queued, nothing invented", async () => {
        const r = await ask(8, `apply me to https://jobs.ashbyhq.com/ramp/${GONE}`);
        assertEquals([r.intent, r.resultStatus, r.wanted], ["career_apply_queue", "none", ""], r.reply);
        assert(/not among the open postings/.test(r.reply), r.reply);
        assertEquals(await pg.sql(`select count(*) from public.career_postings where job_id like '%${GONE}'`), "0");
      });
      await t.step("the board cannot be read: said so, nothing queued", async () => {
        down = true;
        await pg.sql(`delete from public.career_postings`);
        const r = await ask(9, `apply me to this: ${LINK}`);
        down = false;
        assertEquals([r.intent, r.resultStatus, r.wanted], ["career_apply_queue", "unreadable", ""], r.reply);
        assert(/couldn't read that posting/.test(r.reply), r.reply);
      });
      assert(reads.every((p) => p === "/posting-api/job-board/ramp"), `only Ashby's public posting API was read: ${reads}`);
    } finally {
      h?.restore();
      await ats.shutdown();
      await pg.stop();
    }
  },
});
