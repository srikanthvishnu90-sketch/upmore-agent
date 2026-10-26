// FEATURE 11 (DIAGNOSIS 2.12, fix F7; ARCHITECTURE 3.4): interview prep tied to the actual job, with weak spots drilled,
// through the REAL handler (handleChat) on real Postgres. The posting on file is seeded as the product writes it: an
// application (career_apply_jobs with its ingested posting in career_postings), the last search (the router's own
// discovery over career_kb_postings, kept on the thread as discovery.lastShortlist), and a job description pasted under
// the ask. Then the asks, as a person types them:
//   "mock me for the data analyst role at Acme"   -> questions from that posting's requirements, graded against the
//                                                     bank's answer key and the posting; a weak SQL answer is noted
//   the debrief                                    -> against the posting, the weak spots kept, next steps; one
//                                                     career_events row (kind mock_done) holds the weak spot
//   a new thread: "drill my weak spots"            -> a short mock on just those, SQL first; a strong answer clears it
// Fail-first on the base (origin/arch/diagnosis-1240): the mock ignores the posting (static bank questions), nothing is
// recorded, and "drill my weak spots" is not a mock command.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, supabaseParity } from "../flow/handler.ts";
import { bankItems } from "../../supabase/functions/_shared/career_mock_prep.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const PEOPLE: Record<string, string> = { "tok-m": "7b0f8f8e-6a43-4a49-9d2c-0000000000f1", "tok-n": "7b0f8f8e-6a43-4a49-9d2c-0000000000f2" };
const ACME_JD = "Data Analyst, Growth. Acme Analytics is hiring a Data Analyst for the growth team. You will write SQL against our warehouse, design and read A/B tests with the product team, and apply statistics to product questions. You will build dashboards in Tableau. We want strong communication: you present findings to non-technical stakeholders.";
const GLOBEX_JD = "Data Analyst. Globex is hiring a Data Analyst in Chicago. Requirements: Python for analysis, experimentation with the product team, and clear communication of results.";
const STORY = "At my campus job the dining hall was wasting food. I owned the analysis: I pulled 6 months of sales into SQL, joined it to the menu table, and built a Tableau dashboard. I found Tuesday lunches were over-prepped by 30%. The manager cut prep, and waste fell 22% over the next term, measured by the weekly waste log.";
const WEAK_SQL = "I would just look at the numbers and see.";

// A strong answer to a bank question: every key point of the bank item the question was built from, the requirement named,
// and a result with a number (the person's own words in a real session; written here for the test).
function strongAnswer(question: string): string {
  const it = bankItems("data analyst").find((x) => question.includes(x.q));
  const req = /The posting asks for ([^.]+)\./.exec(question)?.[1] ?? "it";
  if (!it) return STORY;
  return `For ${req}, I would cover ${it.keys.join(", ")}. I owned this on a class project: I wrote the SQL with a window function and checked it against a hand count, and the team used it to cut a 3-day report to 2 hours.`;
}
const lastQ = (reply: string) => /Q(\d+) of (\d+): ([^\n]+)\s*$/.exec(reply);

Deno.test({ name: "FEATURE 11: posting-bound mock, weak spot recorded, drilled in a new thread, through handleChat", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  try {
    await supabaseParity(pg);
    for (const id of Object.values(PEOPLE)) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    const me = PEOPLE["tok-m"];
    const payload = JSON.stringify({ version: "1", user_id: me, job_id: "greenhouse:acme:1", company: "Acme Analytics", url: "https://acme.example.test/apply", fields: [], title: "Data Analyst, Growth" });
    await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, description, first_seen_at, last_seen_at)
        values ('greenhouse:acme:1', 'greenhouse', 'acme', 'Acme Analytics', 'Data Analyst, Growth', 'Chicago, IL', 'https://acme.example.test/jobs/1', '${ACME_JD}', now(), now());
      insert into public.career_kb_postings (posting_key, source, board, company, title, location, url, posted_at, text_excerpt, content_hash) values
        ('greenhouse:globex:2', 'greenhouse', 'globex', 'Globex', 'Data Analyst', 'Chicago, IL', 'https://globex.example.test/jobs/2', now(), '${GLOBEX_JD}', 'g1');
      set session_replication_role = replica;
      insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, created_at, updated_at)
        values ('${me}', 'greenhouse:acme:1', 'Acme Analytics', 'https://acme.example.test/apply', '${payload}'::jsonb, repeat('b', 64), repeat('b', 64), 'submitted_unconfirmed', now() - interval '3 days', now() - interval '3 days');
      set session_replication_role = origin;`);
    handler = await careerHandler(pg, PEOPLE);
    const say = async (c: Chat, message: string) => { const r = await c.say(message); eq(r.status, 200, r.reply); return r; };
    const events = async () => JSON.parse(await pg.sql(`select coalesce(json_agg(json_build_object('subject', subject, 'detail', detail, 'source', source) order by id), '[]') from public.career_events where user_id = '${me}' and kind = 'mock_done'`));

    await t.step("an application on file: the mock is built from that posting's requirements, a weak SQL answer is noted", async () => {
      const chat = handler!.chat("tok-m");
      const start = await say(chat, "mock me for the data analyst role at Acme");
      eq(start.intent, "career_mock", start.reply);
      assert(/built from the posting on your applications/.test(start.reply), start.reply);
      assert(/The posting names SQL, A\/B testing, statistics, dashboards, Tableau, communication, working with stakeholders/.test(start.reply), start.reply);
      assert(/Q1 of 6: Tell me about yourself and why the Data Analyst, Growth role at Acme Analytics/.test(start.reply), start.reply);
      let reply = start.reply, sawSql = false, sawBehavioral = false;
      for (let i = 0; i < 6; i++) {
        const m = lastQ(reply);
        assert(m, `a question waits: ${reply}`);
        const q = m![3];
        if (/The posting asks for SQL\./.test(q)) {
          sawSql = true;
          const r = await say(chat, WEAK_SQL);
          assert(/Answer key: [^;]+; none of it came up\./.test(r.reply) && /The posting asks for SQL, and the answer never said how you would use it\./.test(r.reply) && /Weak spot noted for a drill\./.test(r.reply), r.reply);
          reply = r.reply;
          continue;
        }
        if (/The posting asks for communication\./.test(q)) sawBehavioral = true;
        const r = await say(chat, /The posting asks for (?:A\/B testing|statistics|dashboards|Tableau)\./.test(q) ? strongAnswer(q) : STORY);
        reply = r.reply;
      }
      assert(sawSql && sawBehavioral, "a SQL question and a communication question from the posting");
      eq(lastQ(reply), null, reply);
      assert(/^Debrief, data analyst mock for Acme Analytics: 6 of 6 answered/m.test(reply), reply);
      assert(/Against the posting \(Data Analyst, Growth\): held up on [^;]+; weak on SQL \(Q2\)/.test(reply), reply);
      assert(/Weak spots kept for a drill: SQL\./.test(reply), reply);
      assert(/Next steps:\n1\. SQL \(Q2\): redo it out loud in 2 minutes and cover /.test(reply) && /Text "drill my weak spots"/.test(reply), reply);
      const ev = await events();
      eq(ev.length, 1, JSON.stringify(ev));
      eq(ev[0].subject, "Mock: data analyst at Acme Analytics");
      eq(ev[0].detail.posting.job_id, "greenhouse:acme:1");
      eq(ev[0].detail.posting.source, "application");
      const weak = ev[0].detail.answers.filter((a: any) => a.weak).map((a: any) => a.skill);
      eq(weak, ["SQL"], JSON.stringify(ev[0].detail.answers));
      assert(!JSON.stringify(ev[0]).includes(WEAK_SQL), "the event keeps no answer text");
    });

    await t.step("a new thread: 'what are my weak spots' lists SQL; 'drill my weak spots' runs a short mock on it", async () => {
      const fresh = handler!.chat("tok-m");
      const list = await say(fresh, "what are my weak spots?");
      assert(/^Weak spots on file \(1\), newest first:\n1\. SQL, from your data analyst at Acme Analytics mock on /.test(list.reply), list.reply);
      const drill = await say(fresh, "drill my weak spots");
      eq(drill.intent, "career_mock", drill.reply);
      assert(/^Weak-spot drill: 1 question, one for each weak spot on file: SQL\./.test(drill.reply), drill.reply);
      const q = lastQ(drill.reply);
      assert(q && q[1] === "1" && q[2] === "1" && /The posting asks for SQL\./.test(q[3]), drill.reply);
      const r = await say(fresh, strongAnswer(q![3]));
      assert(/Answer key: you covered /.test(r.reply) && !/Weak spot noted/.test(r.reply), r.reply);
      assert(/^Debrief, data analyst mock for Acme Analytics: 1 of 1 answered/m.test(r.reply) && /Every drilled spot held up this time/.test(r.reply), r.reply);
      const ev = await events();
      eq(ev.length, 2);
      eq(ev[1].detail.drill, true);
      const after = await say(fresh, "what are my weak spots");
      assert(/^No weak spots on file\./.test(after.reply), after.reply);
    });

    await t.step("other phrasings: the last search, a pasted job description, a practice interview; no posting runs the role mock", async () => {
      const chat = handler!.chat("tok-m");
      const found = await say(chat, "find analyst jobs in Chicago");
      assert(found.reply.includes("Globex"), found.reply);
      const g = await say(chat, "mock interview for data analyst at Globex");
      assert(/built from the posting from your last search/.test(g.reply) && /The posting names Python, A\/B testing, communication/.test(g.reply), g.reply);
      const ended = await say(chat, "end mock");
      assert(/^Debrief/.test(ended.reply), ended.reply);
      const pasted = await say(chat, `mock me for product analyst at Initech\n${"Product Analyst at Initech. You will own the checkout KPIs, write SQL daily, and run experiments. Strong communication with stakeholders across teams is required. Excel is a plus."}`);
      assert(/^Mock interview: product analyst at Initech, built from the posting you pasted/.test(pasted.reply) && /The posting names metrics, SQL, A\/B testing/.test(pasted.reply), pasted.reply);
      await say(chat, "end mock");
      const practice = await say(chat, "can you give me a practice interview for data analyst at Acme");
      assert(/built from the posting on your applications/.test(practice.reply), practice.reply);
      await say(chat, "end mock");
      const none = await say(chat, "mock me for data analyst at Hooli");
      assert(/^Mock interview: data analyst mock for Hooli/.test(none.reply) && !/built from the posting/.test(none.reply), none.reply);
      await say(chat, "end mock");
    });

    await t.step("another person: no weak spots and no posting of someone else's", async () => {
      const other = handler!.chat("tok-n");
      const list = await say(other, "drill my weak spots");
      assert(/^No weak spots on file\./.test(list.reply), list.reply);
      const m = await say(other, "mock me for the data analyst role at Acme");
      assert(!/built from the posting/.test(m.reply), m.reply);
    });
  } finally {
    handler?.restore();
    await pg.stop();
  }
} });
