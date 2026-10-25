// SUBMIT-STEER-1130 / SPLIT-1146 (d): a person as the chat leaves them, from their texts to a submitted application,
// on a real Postgres (CI's migration order) and a real sandboxed browser, with the product's own code at every step. No
// hand-made profile and no seeded answer: everything the employer receives comes from what the person typed in chat.
//
//   chat      the router's turns (the bundle agent-chat runs): they paste their resume and say it is theirs; agent-chat's
//             evidence step (career_router_evidence.ts) stamps the entries shown to them and found in their upload
//   prepare   prepare-ahead.ts on an alerted posting, reading their stored profile (storedProfile): no name or email on
//             file, so it asks for them; then the engine's dry run asks the form's phone, sponsorship and work
//             authorization questions
//   answer    "what do you need from me" (career_apply_questions.ts): each question carries their own chat message, word
//             for word with its date; only "use N" saves it
//   tap       career_apply_card_open_own / career_apply_card_answer_own: one cap, one ledger (G3)
//   drive     career_apply_claim_own -> runApproved -> the employer receives exactly the approved answers, once
//   read back "did my application to ... go through?" (career_apply_status.ts) from career_apply_jobs: submitted, not
//             confirmed (a page's thank-you is never "confirmed")
//
// What the router shows today. Its reply to a pasted resume is a count ("I read it as 15 facts"), not the entries, so a
// yes to it confirms no entry's words and the evidence step stamps none: the first test shows that person's application
// stops at no_resume, honestly. The second test's thread shows the entries (a listing of each entry's own words after
// the router's reply): that is the contract for the router's confirm reply, which is Muse's to change (SPLIT-1146).
//
// The people are synthetic (TEST); the employer is a page on 127.0.0.1 served here; nothing reaches a real site.
import assertNode from "node:assert/strict";
import { createRequire } from "node:module";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { restAdmin } from "../flow/rest.ts";
import { engineRunner, ownQueue, runApproved } from "../../workers/career-browser/approve-first.ts";
import { prepareAhead, storedProfile, tailoredResume } from "../../workers/career-browser/prepare-ahead.ts";
import { edgeRenderer, memoryResumeStore, type ResumeStore } from "../../supabase/functions/_shared/career_tailor.ts";
import { QUESTIONS_INTENT, questionsTurn, supabaseQuestionStore } from "../../supabase/functions/_shared/career_apply_questions.ts";
import { evidenceResumeConfirmation, resumeConfirmationContext } from "../../supabase/functions/_shared/career_router_evidence.ts";
import { applicationsTurn, supabaseApplications } from "../../supabase/functions/_shared/career_apply_status.ts";
import { supabaseEventStore } from "../../supabase/functions/_shared/agent/timeline.ts";
import * as core from "../../supabase/functions/_shared/router_core.career.js";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const require = createRequire(import.meta.url);
const { CareerHost } = require("../../supabase/functions/_shared/career_host.js");
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
function browserEnv(): boolean {
  if (Deno.env.get("UPMORE_PLAYWRIGHT_PATH")) return true;
  try {
    Deno.statSync(`${ROOT}/tools/node_modules/playwright`);
    Deno.env.set("UPMORE_PLAYWRIGHT_PATH", `${ROOT}/tools/node_modules/playwright`);
    return true;
  } catch {
    return false;
  }
}
const c: any = core;
const host = CareerHost.createCareerHost({
  CareerAccess: c.CareerAccess, CareerOnboarding: c.CareerOnboarding, CareerRouter: c.CareerRouter,
  CareerDoorstep: c.CareerDoorstep, CareerReply: c.CareerReply, CareerContainment: c.CareerContainment,
});
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const SPONSOR = "Will you now or in the future require sponsorship for employment visa status?";
const AUTH = "Are you legally authorized to work in the United States?";
const COMPANY = "TEST Real Employer";

// The employer: name, email, phone, a resume, sponsorship and work authorization; its thank-you page shows a number.
function employer() {
  const posts: Record<string, string>[] = [];
  let upload = "";
  const select = (name: string, label: string) =>
    `<label for="${name}">${label}</label><select name="${name}" id="${name}" required><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select>`;
  const form = `<!doctype html><title>TEST role</title><h1>TEST Analyst</h1><p>${COMPANY}</p><form method="post" action="/apply/submit" enctype="multipart/form-data">` +
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
        else {
          got[k] = `file:${v.name}`;
          upload = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await v.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join("");
        }
      }
      posts.push(got);
      return new Response(`<h1>Thank you for applying</h1><p>Application received. Confirmation number: REAL-7001.</p>`, { headers: { "content-type": "text/html" } });
    }
    if (new URL(req.url).pathname === "/apply") return new Response(form, { headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  });
  return { url: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/apply`, posts, upload: () => upload, close: () => server.shutdown() };
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
// One person's chat: each text goes through the router as agent-chat runs it, and the thread keeps what agent-chat's
// commit keeps (their message, the reply, the thread's saved career state).
function chatFor(pg: { sql: (s: string) => Promise<string> }, person: string, thread: string, events: ReturnType<typeof supabaseEventStore>) {
  let snap: any = null, now = Date.parse("2026-10-24T15:00:00Z");
  const store = async (role: string, content: string, at: number, meta: Record<string, unknown> = {}) =>
    await pg.sql(`insert into public.agent_messages (thread_id, role, content, meta, created_at) values ('${thread}', '${role}', ${q(content)}, ${q(JSON.stringify(meta))}::jsonb, '${new Date(at).toISOString()}')`);
  return {
    // A text the router answers; `shows` is anything else the reply showed (the listing the router's reply must carry).
    async text(message: string, o: { shows?: (profile: any) => string; at?: string } = {}) {
      now = o.at ? Date.parse(o.at) : now + 60_000;
      const before = snap ? structuredClone(snap.stores.profile ?? null) : null;
      const ctx = host.createTurnCtx({ userId: person, threadId: thread, now, snapshot: snap, postings: [] });
      const out = host.runTurn(message, ctx);
      // agent-chat's evidence step (handler-career.ts), on the thread as it stands before this turn is saved.
      const recent = JSON.parse(await pg.sql(`select coalesce(json_agg(json_build_object('id', id, 'role', role, 'content', content) order by id desc), '[]') from public.agent_messages where thread_id = '${thread}'`));
      const seen = await resumeConfirmationContext(recent, ctx.profile);
      const evidence = await evidenceResumeConfirmation({ userId: person, now, message, before, after: ctx.profile ?? null, out, ...seen, events });
      snap = host.extractSnapshot(ctx);
      await store("user", message, now);
      const reply = o.shows ? `${out.reply}\n${o.shows(ctx.profile)}` : String(out.reply);
      await store("assistant", reply, now + 1, { intent: out.intent });
      const state = q(JSON.stringify({ career: snap }));
      await pg.sql(`insert into public.agent_flow_state (thread_id, user_id, state, updated_at) values ('${thread}', '${person}', ${state}::jsonb, now())
        on conflict (thread_id) do update set state = excluded.state, updated_at = excluded.updated_at`);
      return { out, evidence, reply };
    },
    // A text the chat's own code answers before the router (the questions, the status read-back), recorded with its intent.
    async said(reply: string, intent: string) {
      now += 60_000;
      await store("assistant", reply, now, { intent });
    },
    async user(message: string, at?: string) {
      now = at ? Date.parse(at) : now + 60_000;
      await store("user", message, now);
    },
  };
}
// The contract for the router's resume confirm: each entry, in its own words.
const listing = (p: any) => `Here is what I read:\n${p.facts.map((f: any, i: number) => `${i + 1}. ${f.text}`).join("\n")}`;

async function setup(pg: any, person: string, thread: string, job: string) {
  await pg.sql(`insert into auth.users (id, email) values ('${person}', '${person}@example.test') on conflict do nothing;
    insert into public.profiles (id) values ('${person}') on conflict do nothing;
    insert into public.career_watch_kv (user_id, key, value) values ('${person}', 'career:account', '{"epoch":0,"version":0,"paused":false}') on conflict do nothing;
    insert into public.agent_threads (id, user_id, title) values ('${thread}', '${person}', 'TEST');
    insert into public.career_outbox (user_id, key, kind, text, deliver_at) values ('${person}', 'alert:${job}', 'alert', 'TEST alert', now());`);
}

Deno.test({
  name: "Real person: chat -> evidenced resume -> prepare asks -> their own words, used by them -> card tap -> submitted once -> read back as not confirmed",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir() || !browserEnv()) {
      if (CI) throw Error("the real-person flow needs Postgres 16 binaries and the gate's Playwright browser in CI");
      console.log("NOT_RUN locally: no Postgres binaries or Playwright browser");
      return;
    }
    if (Deno.uid?.() === 0 && !CI) {
      console.log("NOT_RUN locally as root: run it as an unprivileged user (Chromium's sandbox)");
      return;
    }
    const pg = await startPg();
    const site = employer();
    const work = await Deno.makeTempDir({ prefix: "trainee-real-person-" });
    try {
      await pg.sql(`grant select, insert on public.agent_threads, public.agent_messages to service_role`);
      const JOB = "greenhouse:realtest:1", TODAY = "7b0f8f8e-6a43-4a49-9d2c-0000000000d1", PERSON = "7b0f8f8e-6a43-4a49-9d2c-0000000000d2";
      const T_TODAY = "7b0f8f8e-6a43-4a49-9d2c-0000000000e1", THREAD = "7b0f8f8e-6a43-4a49-9d2c-0000000000e2";
      await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, description, first_seen_at, last_seen_at)
        values ('${JOB}', 'greenhouse', 'realtest', '${COMPANY}', 'TEST Analyst', 'Chicago, IL', 'https://boards.greenhouse.io/realtest/jobs/1',
        'TEST Analyst. Requirements: SQL, Python, dashboards for internal teams.', now(), now())`);
      await setup(pg, TODAY, T_TODAY, JOB);
      const svc = pg.asService(), admin = restAdmin(pg), person = pg.asPerson(PERSON);
      const events = supabaseEventStore(admin);
      const memory = memoryResumeStore();
      const resumes: ResumeStore = {
        put: async (path, pdf) => {
          await memory.put(path, pdf);
          await pg.sql(`insert into storage.objects (bucket_id, name) values ('career-resumes', '${path}') on conflict (bucket_id, name) do nothing`);
        },
        signedUrl: (path, seconds) => memory.signedUrl(path, seconds),
        removeAll: (u) => memory.removeAll(u),
      };
      const runEngine = engineRunner({ root: ROOT, extra: ["--state-dir", `${work}/engine-state`] });
      const deps = { db: svc, runEngine, profileFor: storedProfile(svc), urlFor: () => site.url, resumeFor: tailoredResume({ render: edgeRenderer(), resumes }) };
      const outcomeFor = (done: { user_id: string; outcome: string }[], u: string) => done.filter((d) => d.user_id === u).map((d) => d.outcome);

      await t.step("today's router reply (a count, not the entries): a yes evidences nothing, and that person's application stops at no_resume", async () => {
        const chat = chatFor(pg, TODAY, T_TODAY, events);
        const pasted = await chat.text(`here is my resume:\n${RESUME}`);
        assertEquals(pasted.out.intent, "career_resume_ingest");
        const yes = await chat.text("yes, that's my resume");
        assertEquals([yes.out.intent, yes.out.resultStatus], ["career_resume_ingest", "completed"]);
        assertEquals(yes.evidence.stamped, 0, "no entry's words were shown");
        assert(yes.evidence.unshown > 0);
        const done = await prepareAhead(deps);
        assertEquals(outcomeFor(done, TODAY), ["no_resume"], JSON.stringify(done));
        assertEquals(await pg.sql(`select count(*) from public.career_apply_questions where user_id = '${TODAY}'`), "0", "nothing is asked of them that would not help");
      });

      // The second person's account and alert, once the first's prepare has run (it would otherwise try them too, before
      // they said anything, and record that try).
      await setup(pg, PERSON, THREAD, JOB);
      const chat = chatFor(pg, PERSON, THREAD, events);
      await t.step("chat: they paste their resume, are shown its entries, and say it is theirs; each entry gets its event and upload", async () => {
        await chat.text(`here is my resume:\n${RESUME}`, { shows: listing, at: "2026-10-24T15:00:00Z" });
        const yes = await chat.text("yes, that's my resume");
        assert(yes.evidence.stamped >= 10, JSON.stringify(yes.evidence));
        assertEquals([yes.evidence.unshown, yes.evidence.untraced, yes.evidence.refused], [0, 0, 0]);
        assertEquals(await pg.sql(`select count(*) from public.career_events where user_id = '${PERSON}' and kind = 'fact_confirmed'`), String(yes.evidence.stamped),
          "one persisted event per entry");
        const ref = await pg.sql(`select string_agg(distinct detail->'upload'->>'ref', ',') from public.career_events where user_id = '${PERSON}' and kind = 'fact_confirmed'`);
        assert(/^agent_messages:\d+$/.test(ref), `every event names their upload: ${ref}`);
        // What they say about themselves, in their own words, on later days (the router's replies to these are Muse's).
        await chat.user("my name is Jordan Rivera", "2026-10-24T16:00:00Z");
        await chat.user("my email is jordan.rivera@example.test", "2026-10-24T16:01:00Z");
        await chat.user("my phone number is 312-555-0142", "2026-10-25T09:00:00Z");
        await chat.user("I'm a US citizen and I don't need visa sponsorship", "2026-10-25T09:01:00Z");
        await chat.user("I'm authorized to work in the US", "2026-10-25T09:02:00Z");
      });

      const store = supabaseQuestionStore(admin);
      const say = async (message: string) => {
        const r = await questionsTurn({ message, userId: PERSON, threadId: THREAD, now: Date.now(), store });
        assert(r, `the questions answer "${message}"`);
        await chat.user(message);
        await chat.said(r!.reply, ["shown", "partial"].includes(r!.status) || r!.status.startsWith("draft") ? QUESTIONS_INTENT : "career_apply_questions_answer");
        return r!;
      };
      // Each shown question's number, by its label, then "use N" for each.
      const useAll = async (labels: string[]) => {
        const shown = await say("what do you need from me");
        assertEquals(shown.status, "shown", shown.reply);
        const lines = shown.reply.split("\n");
        for (const label of labels) {
          const i = lines.findIndex((l) => /^\d+\./.test(l) && l.includes(label));
          assert(i >= 0, `${label} is asked: ${shown.reply}`);
          const used = await say(`use ${Number(/^(\d+)\./.exec(lines[i])![1])}`);
          assert(/Saved, as drafted/.test(used.reply), `${label}: ${used.reply}`);
        }
        return shown.reply;
      };

      await t.step("prepare: confirmed entries, no name or email on file: it asks for those once; no page is opened", async () => {
        const done = await prepareAhead(deps);
        assertEquals(outcomeFor(done, PERSON), ["asked"], JSON.stringify(done));
        assertEquals(await pg.sql(`select string_agg(key, ',' order by key) from public.career_apply_questions where user_id = '${PERSON}' and state = 'open'`),
          "fact:email,fact:first_name,fact:last_name");
        assertEquals(site.posts.length, 0);
      });

      await t.step("their words: name and email offered back word for word with the date; only 'use N' saves them", async () => {
        const text = await useAll(["First name", "Last name", "Email"]);
        assert(text.includes(`"my name is Jordan Rivera"`) && text.includes(`"my email is jordan.rivera@example.test"`) && /Oct 24/.test(text), text);
        assertEquals(await pg.sql(`select string_agg(key || '=' || answer, ',' order by key) from public.career_apply_questions where user_id = '${PERSON}'`),
          "fact:email=jordan.rivera@example.test,fact:first_name=Jordan,fact:last_name=Rivera");
      });

      await t.step("prepare again: the resume is tailored from their evidenced entries; the dry run asks the form's phone, sponsorship and work authorization", async () => {
        const done = await prepareAhead(deps);
        assertEquals(outcomeFor(done, PERSON), ["asked"], JSON.stringify(done));
        assertEquals(await pg.sql(`select string_agg(key, ',' order by key) from public.career_apply_questions where user_id = '${PERSON}' and state = 'open'`),
          "fact:phone,fact:sponsorship,fact:work_authorization");
        assertEquals(site.posts.length, 0, "a dry run sends nothing");
      });

      await t.step("their words again: phone, sponsorship and work authorization, each from their own message, each used by them", async () => {
        const text = await useAll(["Phone", SPONSOR, AUTH]);
        assert(text.includes(`"my phone number is 312-555-0142"`) && text.includes(`"I'm authorized to work in the US"`) && /Oct 25/.test(text), text);
        assertEquals(await pg.sql(`select string_agg(key || '=' || answer, ',' order by key) from public.career_apply_questions where user_id = '${PERSON}' and key in ('fact:phone','fact:sponsorship','fact:work_authorization')`),
          "fact:phone=312-555-0142,fact:sponsorship=No,fact:work_authorization=Yes");
      });

      let preparedId = "", tailored = "";
      await t.step("prepare: ready, with only their own answers and the resume tailored to the posting; the card shows each answer", async () => {
        const done = await prepareAhead(deps);
        const mine = done.filter((d) => d.user_id === PERSON);
        assertEquals(mine.map((d) => d.outcome), ["ready"], JSON.stringify(done));
        preparedId = mine[0].prepared_id!;
        const row = JSON.parse(await pg.sql(`select row_to_json(p) from public.career_apply_prepared p where id = '${preparedId}'`));
        tailored = row.payload.resume_sha256;
        assertEquals(row.payload.resume_tailored, true);
        const values = Object.fromEntries(row.payload.fields.filter((f: any) => f.name !== "resume").map((f: any) => [f.name, f.value]));
        assertEquals(values, { first_name: "Jordan", last_name: "Rivera", email: "jordan.rivera@example.test", phone: "312-555-0142", sponsorship: "no", work_auth: "yes" });
        const lines = row.card_lines.join("\n");
        for (const v of ["Jordan", "Rivera", "jordan.rivera@example.test", "312-555-0142"]) assert(lines.includes(v), `the card shows ${v}: ${lines}`);
      });

      const ask = (message: string) => applicationsTurn({ message, userId: PERSON, now: Date.now(), read: supabaseApplications(admin) });
      await t.step("their tap: queued exactly as shown, one ledger row; read back as approved, not sent", async () => {
        const card = await person.rpc("career_apply_card_open_own", { p_ids: [preparedId] });
        assertEquals(card.error, null, JSON.stringify(card.error));
        const answer = await person.rpc("career_apply_card_answer_own", { p_card: card.data.id, p_approve: [1] });
        assertEquals(answer.error, null, JSON.stringify(answer.error));
        assertEquals(answer.data?.[0]?.result, "queued");
        assertEquals(await pg.sql(`select count(*) from public.career_apply_ledger('${PERSON}', now() - interval '1 day')`), "1", "one ledger");
        const r = await ask(`did my application to ${COMPANY} go through?`);
        assert(r && /approved, not sent yet/.test(r.reply), JSON.stringify(r));
      });

      await t.step("drive: the employer receives exactly the approved answers and the tailored resume, once; recorded as submitted, not confirmed", async () => {
        const queue = ownQueue(person);
        const done = await runApproved({
          claim: () => queue.claim(1),
          finish: (id, lease, state, evidence) => queue.finish(id, lease, state, evidence),
          resumeFor: async (job) => {
            const path = `${work}/sent-resume.pdf`;
            await Deno.writeFile(path, memory.files.get(`career-resumes/${PERSON}/${job.payload.resume_sha256}.pdf`)!);
            return { path, sha256: job.payload.resume_sha256 };
          },
          writeFacts: async (_job, facts) => {
            const p = `${work}/approved-facts.json`;
            await Deno.writeTextFile(p, JSON.stringify(facts));
            return p;
          },
          runEngine,
        });
        assertEquals(done.length, 1);
        assertEquals(site.posts.length, 1, "exactly one POST");
        const got = site.posts[0];
        assertEquals([got.first_name, got.last_name, got.email, got.phone, got.sponsorship, got.work_auth],
          ["Jordan", "Rivera", "jordan.rivera@example.test", "312-555-0142", "no", "yes"]);
        assertEquals(site.upload(), tailored, "the tailored resume, byte for byte");
        const row = JSON.parse(await pg.sql(`select row_to_json(j) from public.career_apply_jobs j where user_id = '${PERSON}'`));
        assertEquals([row.state, row.confirmation_id], ["submitted_unconfirmed", "REAL-7001"]);
      });

      await t.step("read back: submitted, not confirmed by the employer; never called a success it did not see", async () => {
        const one = await ask(`did my application to ${COMPANY} go through?`);
        assert(one && /submitted/.test(one.reply) && /has not confirmed it yet/.test(one.reply) && /REAL-7001/.test(one.reply), JSON.stringify(one));
        assert(!/confirmed it\b(?! yet)|went through|successful/i.test(one!.reply.replace("has not confirmed it yet", "")), one!.reply);
        const all = await ask("where are my applications");
        assert(all && all.reply.includes(COMPANY), JSON.stringify(all));
        const none = await ask("did my application to Stark Industries go through?");
        assert(none && /no application to Stark Industries on record/.test(none.reply), JSON.stringify(none));
      });
    } finally {
      await site.close();
      await pg.stop();
      await Deno.remove(work, { recursive: true }).catch(() => {});
    }
  },
});
