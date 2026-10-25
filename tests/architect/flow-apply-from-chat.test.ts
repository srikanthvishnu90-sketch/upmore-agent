// STEP 4 F1 (2026-10-25): from a chat ask to a submitted application, on the queue path, with no test-only seam.
//   chat     "apply to the <role> at <Company>" -> handleChat (handler-career.ts, unchanged, real supabase-js over the
//            flow harness's PostgREST double) -> career_apply_wanted, the person's own apply queue
//   prepare  prepare-ahead.ts prepareAhead (the scheduled server run) draws the wanted posting as a candidate: the
//            engine's dry run on the employer's page, their confirmed facts, the resume tailored to it; what the form
//            asks and no fact answers is asked of them once, in chat (career_apply_questions)
//   answers  "what do you need from me" / "use N" through handleChat (their own words, each used by them)
//   card     career_apply_card_open_own / card_answer_own  (their own tap, as the person)
//   drive    runApproved -> scripts/apply.ts on the employer's page, once; recorded submitted_unconfirmed
//   chat     "did my application to <Company> go through?" -> read back from career_apply_jobs, never a success unseen
// Everything but the employer page (127.0.0.1) and the person's tap (an RPC as the person) is the product's own code.
// Fail-first on b7291b6a: the chat ask is the router's named_role_apply explanation (worker not connected), nothing is
// queued, and prepareAhead draws no candidate (career_apply_prepare_candidates reads alerts only).
import assertNode from "node:assert/strict";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { engineRunner, ownQueue, runApproved } from "../../workers/career-browser/approve-first.ts";
import { prepareAhead, storedProfile, tailoredResume } from "../../workers/career-browser/prepare-ahead.ts";
import { edgeRenderer, memoryResumeStore, type ResumeStore } from "../../supabase/functions/_shared/career_tailor.ts";
import { careerHandler, type Chat, supabaseParity } from "../flow/handler.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
function browserEnv(): boolean {
  if (Deno.env.get("UPMORE_PLAYWRIGHT_PATH")) return true;
  try { Deno.statSync(`${ROOT}/tools/node_modules/playwright`); Deno.env.set("UPMORE_PLAYWRIGHT_PATH", `${ROOT}/tools/node_modules/playwright`); return true; } catch { return false; }
}
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const SPONSOR = "Will you now or in the future require sponsorship for employment visa status?";
const AUTH = "Are you legally authorized to work in the United States?";
const COMPANY = "TEST Chat Employer";
const ROLE = "TEST Analyst";

// The employer: one posting on 127.0.0.1 asking name, email, phone, a resume, sponsorship and work authorization.
function employer() {
  const posts: Record<string, string>[] = [];
  let upload = "";
  const select = (name: string, label: string) =>
    `<label for="${name}">${label}</label><select name="${name}" id="${name}" required><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select>`;
  const form = `<!doctype html><title>TEST role</title><h1>${ROLE}</h1><p>${COMPANY}</p><form method="post" action="/apply/submit" enctype="multipart/form-data">` +
    `<label for="first">First name</label><input name="first_name" id="first" required>` +
    `<label for="last">Last name</label><input name="last_name" id="last" required>` +
    `<label for="email">Email</label><input name="email" id="email" type="email" required>` +
    `<label for="phone">Phone</label><input name="phone" id="phone" type="tel" required>` +
    `<label for="resume">Resume</label><input type="file" name="resume" id="resume" required>` +
    select("sponsorship", SPONSOR) + select("work_auth", AUTH) + `<button type="submit">Submit application</button></form>`;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    if (req.method === "POST") {
      const data = await req.formData(), got: Record<string, string> = {};
      for (const [k, v] of data.entries()) {
        if (typeof v === "string") got[k] = v;
        else { got[k] = `file:${v.name}`; upload = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await v.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
      }
      posts.push(got);
      return new Response(`<h1>Thank you for applying</h1><p>Application received. Confirmation number: CHAT-4401.</p>`, { headers: { "content-type": "text/html" } });
    }
    if (new URL(req.url).pathname === "/apply") return new Response(form, { headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  });
  return { url: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/apply`, posts, upload: () => upload, close: () => server.shutdown() };
}
const day = (d = new Date()) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

Deno.test({
  name: "From chat to the queue: 'apply to the role at X' queues it; the server prepares it, asks in chat what the form needs, the person answers and taps; sent once; read back as not confirmed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir() || !browserEnv()) {
      if (CI) throw Error("the chat-to-queue flow needs Postgres 16 binaries and the gate's Playwright browser in CI");
      console.log("NOT_RUN locally: no Postgres binaries or Playwright browser");
      return;
    }
    if (Deno.uid?.() === 0 && !CI) { console.log("NOT_RUN locally as root: run it as an unprivileged user (Chromium's sandbox)"); return; }
    const pg = await startPg();
    const site = employer();
    const work = await Deno.makeTempDir({ prefix: "trainee-chat-queue-" });
    let agentChat: Awaited<ReturnType<typeof careerHandler>> | null = null;
    try {
      await supabaseParity(pg);
      const JOB = "greenhouse:chattest:7", PERSON = "7b0f8f8e-6a43-4a49-9d2c-0000000000e1";
      await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, description, first_seen_at, last_seen_at)
        values ('${JOB}', 'greenhouse', 'chattest', '${COMPANY}', '${ROLE}', 'Chicago, IL', 'https://boards.greenhouse.io/chattest/jobs/7',
        '${ROLE}. Requirements: SQL, Python, dashboards for internal teams.', now(), now());
        insert into auth.users (id, email) values ('${PERSON}', '${PERSON}@example.test');
        insert into public.profiles (id) values ('${PERSON}');
        insert into public.career_watch_kv (user_id, key, value) values ('${PERSON}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
      const svc = pg.asService(), person = pg.asPerson(PERSON);
      agentChat = await careerHandler(pg, { "tok-person": PERSON });
      const chat: Chat = agentChat.chat("tok-person");
      const memory = memoryResumeStore();
      const resumes: ResumeStore = {
        put: async (path, pdf) => { await memory.put(path, pdf); await pg.sql(`insert into storage.objects (bucket_id, name) values ('career-resumes', '${path}') on conflict (bucket_id, name) do nothing`); },
        signedUrl: (path, seconds) => memory.signedUrl(path, seconds),
        removeAll: (u) => memory.removeAll(u),
      };
      const runEngine = engineRunner({ root: ROOT, extra: ["--state-dir", `${work}/engine-state`] });
      const deps = { db: svc, runEngine, profileFor: storedProfile(svc), urlFor: () => site.url, resumeFor: tailoredResume({ render: edgeRenderer(), resumes }) };
      const say = async (message: string) => { const r = await chat.say(message); assertEquals(r.status, 200, r.reply); return r; };
      const wanted = async () => JSON.parse(await pg.sql(`select coalesce(json_agg(json_build_object('key', posting_key, 'state', state, 'company', company)), '[]') from public.career_apply_wanted where user_id = '${PERSON}'`));

      await t.step("chat: resume pasted and confirmed; name, email, phone and work rights said", async () => {
        const pasted = await say(`here is my resume:\n${RESUME}`);
        assertEquals(pasted.intent, "career_resume_ingest", pasted.reply);
        const yes = await say("yes, that's my resume");
        assertEquals([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], yes.reply);
        assert(Number(await pg.sql(`select count(*) from public.career_events where user_id = '${PERSON}' and kind = 'fact_confirmed'`)) >= 10, "the entries are evidenced");
        for (const m of ["my name is Jordan Rivera", "my email is jordan.rivera@example.test", "my phone number is 312-555-0142", "I'm a US citizen and I don't need visa sponsorship", "I'm authorized to work in the US"]) await say(m);
      });

      await t.step("chat: 'apply to the TEST Analyst role at TEST Chat Employer' puts that posting in their queue; nothing is prepared or sent yet, and the reply says so", async () => {
        assertEquals(await wanted(), [], "nothing queued before they ask");
        const r = await say(`apply to the ${ROLE} role at ${COMPANY}`);
        assertEquals(r.intent, "career_apply_queue", `the chat queues it: intent=${r.intent} ${r.reply}`);
        assert(/queued|on your apply list|in your queue/i.test(r.reply), r.reply);
        assert(/nothing (is|was|has been) (sent|submitted)/i.test(r.reply), `the reply says nothing was sent: ${r.reply}`);
        assert(!/submitted\b(?! yet)|applied for you|application (is|was) in/i.test(r.reply.replace(/nothing (is|was|has been) (sent|submitted)/i, "")), `never a submission claimed: ${r.reply}`);
        assert(r.reply.includes(COMPANY) && r.reply.includes(ROLE), `names the posting: ${r.reply}`);
        assertEquals(await wanted(), [{ key: JOB, state: "waiting", company: COMPANY }], "the queue holds exactly that posting");
        assertEquals(await pg.sql(`select count(*) from public.career_apply_jobs where user_id = '${PERSON}'`), "0", "nothing enqueued without their tap");
        assertEquals(site.posts.length, 0);
      });

      await t.step("chat: an employer with no open posting on file is not this turn's; the router's honest stop answers and nothing is queued", async () => {
        const r = await say("apply to the Staff Engineer role at Stark Industries");
        assert(r.intent !== "career_apply_queue", `not claimed: ${r.intent}`);
        assert(/can'?t apply|not in the list|not on file|no open posting/i.test(r.reply), r.reply);
        assertEquals((await wanted()).length, 1, "nothing invented");
      });
      await t.step("chat: a role the employer has no open posting for is said so, naming what it does have; nothing is queued", async () => {
        const r = await say(`apply to the Staff Engineer role at ${COMPANY}`);
        assertEquals([r.intent, r.resultStatus], ["career_apply_queue", "none"], r.reply);
        assert(r.reply.includes(ROLE) && /nothing was queued/.test(r.reply), r.reply);
        assertEquals((await wanted()).length, 1);
      });

      await t.step("chat: asking again does not queue it twice", async () => {
        const r = await say(`apply to the ${ROLE} role at ${COMPANY}`);
        assertEquals(r.intent, "career_apply_queue", r.reply);
        assert(/already (in|on) your (queue|apply list)/i.test(r.reply), r.reply);
        assertEquals((await wanted()).length, 1);
      });

      const useAll = async (labels: string[]) => {
        const shown = await say("what do you need from me");
        assertEquals(shown.resultStatus, "shown", shown.reply);
        const lines = shown.reply.split("\n");
        for (const label of labels) {
          const i = lines.findIndex((l) => /^\d+\./.test(l) && l.includes(label));
          assert(i >= 0, `${label} is asked: ${shown.reply}`);
          const used = await say(`use ${Number(/^(\d+)\./.exec(lines[i])![1])}`);
          assert(/Saved, as drafted/.test(used.reply), `${label}: ${used.reply}`);
        }
        return shown.reply;
      };
      const outcomes = (done: { user_id: string; job_id: string; outcome: string }[]) => done.filter((d) => d.user_id === PERSON).map((d) => [d.job_id, d.outcome]);

      await t.step("prepare: the server run draws the queued posting (no alert ever sent it); with no name or email on file it asks for those once", async () => {
        const done = await prepareAhead(deps);
        assertEquals(outcomes(done), [[JOB, "asked"]], JSON.stringify(done));
        assertEquals(await pg.sql(`select string_agg(key, ',' order by key) from public.career_apply_questions where user_id = '${PERSON}' and state = 'open'`), "fact:email,fact:first_name,fact:last_name");
        assertEquals(site.posts.length, 0);
      });

      await t.step("their words: name and email offered back word for word; only 'use N' saves them", async () => {
        const text = await useAll(["First name", "Last name", "Email"]);
        assert(text.includes(`"my name is Jordan Rivera"`) && text.includes(day()), text);
      });

      await t.step("prepare again: the resume is tailored from their evidenced entries; the dry run asks phone, sponsorship and work authorization", async () => {
        assertEquals(outcomes(await prepareAhead(deps)), [[JOB, "asked"]]);
        assertEquals(await pg.sql(`select string_agg(key, ',' order by key) from public.career_apply_questions where user_id = '${PERSON}' and state = 'open'`), "fact:phone,fact:sponsorship,fact:work_authorization");
        assertEquals(site.posts.length, 0, "a dry run sends nothing");
      });

      await t.step("their words again: phone, sponsorship and work authorization, each from their own message", async () => {
        await useAll(["Phone", SPONSOR, AUTH]);
      });

      let preparedId = "", tailored = "";
      await t.step("prepare: ready, with only their own answers and the tailored resume; the card shows each answer", async () => {
        const done = await prepareAhead(deps);
        assertEquals(outcomes(done), [[JOB, "ready"]], JSON.stringify(done));
        preparedId = done.find((d) => d.user_id === PERSON)!.prepared_id!;
        const row = JSON.parse(await pg.sql(`select row_to_json(p) from public.career_apply_prepared p where id = '${preparedId}'`));
        tailored = row.payload.resume_sha256;
        assertEquals(row.payload.resume_tailored, true);
        const values = Object.fromEntries(row.payload.fields.filter((f: any) => f.name !== "resume").map((f: any) => [f.name, f.value]));
        assertEquals(values, { first_name: "Jordan", last_name: "Rivera", email: "jordan.rivera@example.test", phone: "312-555-0142", sponsorship: "no", work_auth: "yes" });
      });

      await t.step("their tap: queued exactly as shown; read back as approved, not sent", async () => {
        const card = await person.rpc("career_apply_card_open_own", { p_ids: [preparedId] });
        assertEquals(card.error, null, JSON.stringify(card.error));
        const answer = await person.rpc("career_apply_card_answer_own", { p_card: card.data.id, p_approve: [1] });
        assertEquals(answer.error, null, JSON.stringify(answer.error));
        assertEquals(answer.data?.[0]?.result, "queued");
        const r = await say(`did my application to ${COMPANY} go through?`);
        assert(/approved, not sent yet/.test(r.reply), r.reply);
      });

      await t.step("drive: the employer receives exactly the approved answers and the tailored resume, once; recorded as submitted, not confirmed", async () => {
        const queue = ownQueue(person);
        const done = await runApproved({
          claim: () => queue.claim(1),
          finish: (id, lease, state, evidence) => queue.finish(id, lease, state, evidence),
          resumeFor: async (job) => { const path = `${work}/sent-resume.pdf`; await Deno.writeFile(path, memory.files.get(`career-resumes/${PERSON}/${job.payload.resume_sha256}.pdf`)!); return { path, sha256: job.payload.resume_sha256 }; },
          writeFacts: async (_job, facts) => { const p = `${work}/approved-facts.json`; await Deno.writeTextFile(p, JSON.stringify(facts)); return p; },
          runEngine,
        });
        assertEquals(done.length, 1);
        assertEquals(site.posts.length, 1, "exactly one POST");
        const got = site.posts[0];
        assertEquals([got.first_name, got.last_name, got.email, got.phone, got.sponsorship, got.work_auth], ["Jordan", "Rivera", "jordan.rivera@example.test", "312-555-0142", "no", "yes"]);
        assertEquals(site.upload(), tailored, "the tailored resume, byte for byte");
        const row = JSON.parse(await pg.sql(`select row_to_json(j) from public.career_apply_jobs j where user_id = '${PERSON}'`));
        assertEquals([row.state, row.confirmation_id], ["submitted_unconfirmed", "CHAT-4401"]);
      });

      await t.step("read back in chat: submitted, not confirmed by the employer; never a success it did not see", async () => {
        const one = await say(`did my application to ${COMPANY} go through?`);
        assert(/submitted/.test(one.reply) && /has not confirmed it yet/.test(one.reply) && /CHAT-4401/.test(one.reply), one.reply);
        const all = await say("where are my applications");
        assert(all.reply.includes(COMPANY), all.reply);
      });
    } finally {
      agentChat?.restore();
      await site.close();
      await pg.stop();
      await Deno.remove(work, { recursive: true }).catch(() => {});
    }
  },
});
