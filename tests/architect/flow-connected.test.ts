// Backend gap map G1 (docs/architect/BACKEND-GAP-MAP-2026-10-23.md): one application through the D-014 stack as one
// connected flow, on a real Postgres (the career schema, CI's migration order) and a real browser, with the product's own
// code at every step:
//   prepare  approve-first.ts prepare() -> scripts/apply.ts dry run on the employer's page -> career_apply_prepare_own
//   card     career_apply_card_open_own                       (the person's app shows the card)
//   approve  career_apply_card_answer_own                     (the person's own tap; it enqueues under the card's hash)
//   claim    career_apply_claim_own                           (the person's own computer)
//   drive    runApproved() -> scripts/apply.ts --submit --approved <hash> on the employer's page
//   record   career_apply_finish_own                          (a page's confirmation is recorded as submitted_unconfirmed)
// Every call that is the person acting runs as the person (role authenticated, their JWT subject), never as a superuser:
// nothing approves on their behalf. The only service-role writes create the person's account rows (setup, named below).
// The employer is a page on 127.0.0.1 served by this test; nothing reaches a real site.
//
// The attestation gate: a posting whose form asks the person to certify their application has no answer on file (the
// attestation carrier is parked, the owner's question), so it must stop at preparation: asked of the person, never
// prepared, never on a card, never sent. The test checks that stop; it does not answer the attestation.
//
// The facts are a synthetic test person's own statements (name and email only), each with its source. No work
// authorization, sponsorship or other fact is written or inferred: the employer's form does not ask for one.
//
// Not covered yet (later gaps): facts written by chat (G2), preparing before the person asks (G4), the receipt text (G6).
import assertNode from "node:assert/strict";
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assertMatch = (s: string, re: RegExp) => assertNode.match(s, re);
import { pgBinDir, startPg } from "../flow/pg.ts";
import { engineRunner, ownQueue, prepare, questionsToStore, runApproved } from "../../workers/career-browser/approve-first.ts";

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

const PERSON = "7b0f8f8e-6a43-4a49-9d2c-000000000001";
const SOURCE = { confirmed: true, provenance: "owner stated (TEST person, synthetic)", confirmation_event_id: "evt-flow-test" };
const FACTS = {
  user_id: PERSON,
  answers: {
    first_name: { value: "Flow", factId: "FLOW-TEST-FACT-1", ...SOURCE },
    last_name: { value: "Tester", factId: "FLOW-TEST-FACT-2", ...SOURCE },
    email: { value: "flow.tester@example.test", factId: "FLOW-TEST-FACT-3", ...SOURCE },
  },
};

// The employer: two postings on 127.0.0.1. /plain asks name, email and a resume; /attest also asks the person to certify
// the application, a legal statement only they can make. Every POST is counted per posting.
function employer() {
  const posts: Record<string, number> = { plain: 0, attest: 0, second: 0 };
  const form = (route: string, extra: string) =>
    `<!doctype html><title>TEST role</title><h1>TEST Analyst</h1><p>TEST ${route === "second" ? "Second" : "First"} Employer</p><form method="post" action="/${route}/submit" enctype="multipart/form-data">` +
    `<label for="first">First name</label><input name="first_name" id="first" required>` +
    `<label for="last">Last name</label><input name="last_name" id="last" required>` +
    `<label for="email">Email</label><input name="email" id="email" type="email" required>` +
    `<label for="resume">Resume</label><input type="file" name="resume" id="resume" required>` +
    extra + `<button type="submit">Submit application</button></form>`;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const path = new URL(req.url).pathname;
    if (req.method === "POST") {
      const route = path.split("/")[1];
      await req.arrayBuffer();
      posts[route] = (posts[route] ?? 0) + 1;
      return new Response(`<h1>Thank you for applying</h1><p>Application received. Confirmation number: FLOW-${route.toUpperCase()}-1.</p>`, { headers: { "content-type": "text/html" } });
    }
    // /second is /plain again, for the negative control.
    if (path === "/plain" || path === "/second") return new Response(form(path.slice(1), ""), { headers: { "content-type": "text/html" } });
    if (path === "/attest") {
      return new Response(form("attest", `<label><input type="checkbox" name="certify" id="certify" required> I certify that the information in this application is true and complete.</label>`), { headers: { "content-type": "text/html" } });
    }
    return new Response("not found", { status: 404 });
  });
  return { base: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`, posts, close: () => server.shutdown() };
}

Deno.test({
  name: "G1: one application, prepare to card to the person's tap to claim to the employer's page to the recorded outcome, on a real database; a certification stops at the gate",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir() || !browserEnv()) {
      if (CI) throw Error("G1 needs Postgres 16 binaries and the gate's Playwright browser in CI");
      console.log("NOT_RUN locally: no Postgres binaries or Playwright browser");
      return;
    }
    // The engine refuses an unsandboxed browser, and Chromium cannot sandbox as root (containers); CI runs unprivileged.
    if (Deno.uid?.() === 0 && !CI) {
      console.log("NOT_RUN locally as root: run it as an unprivileged user (Chromium's sandbox)");
      return;
    }
    const pg = await startPg();
    const site = employer();
    const work = await Deno.makeTempDir({ prefix: "trainee-flow-" });
    try {
      // Setup (not the person acting): their account, as the chat host writes it on their first text.
      await pg.sql(`insert into auth.users (id, email) values ('${PERSON}', 'flow.tester@example.test');
        insert into public.profiles (id) values ('${PERSON}');
        insert into public.career_watch_kv (user_id, key, value) values ('${PERSON}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
      const factsPath = `${work}/facts.json`, resumePath = `${work}/resume.pdf`;
      await Deno.writeTextFile(factsPath, JSON.stringify(FACTS));
      await Deno.writeFile(resumePath, new TextEncoder().encode("%PDF-1.4\n% synthetic flow-test resume\n%%EOF\n"));
      const person = pg.asPerson(PERSON);
      const runEngine = engineRunner({ root: ROOT });
      const account = (await person.rpc("career_apply_account_own")).data;
      assertEquals(account, { epoch: 0, version: 0, paused: false });

      let preparedId = "";
      await t.step("prepare: the engine's dry run on the employer's page becomes a stored prepared application", async () => {
        const r = await prepare({ url: `${site.base}/plain`, factsPath, resumePath, account, now: Date.now(), runEngine });
        assert(r.ready, `not ready: ${JSON.stringify((r as any).result)}`);
        const saved = await person.rpc("career_apply_prepare_own", { p_payload: r.payload, p_card_lines: r.card });
        assertEquals(saved.error, null);
        preparedId = saved.data.id;
        assertEquals(saved.data.state, "ready");
        assertEquals(site.posts.plain, 0, "a dry run sends nothing");
      });

      await t.step("the attestation gate: a certification with no answer on file is asked of the person, never prepared or sent", async () => {
        const r = await prepare({ url: `${site.base}/attest`, factsPath, resumePath, account, now: Date.now(), runEngine });
        assertEquals(r.ready, false);
        assertEquals((r.result as any).reason, "needs_answers");
        const ask = questionsToStore(r.result as any, { facts: {}, answered: new Set() });
        assert(ask?.questions.length, "the certification is asked of the person");
        const put = await person.rpc("career_apply_questions_put_own", { p_job_id: ask!.posting, p_questions: ask!.questions });
        assertEquals(put.error, null);
        assertEquals(await pg.sql(`select count(*) from public.career_apply_prepared where user_id = '${PERSON}' and url like '%/attest'`), "0");
        assertEquals(site.posts.attest, 0);
      });

      let jobHash = "";
      await t.step("approve: the card shows the prepared application and the person's own tap enqueues exactly it", async () => {
        const card = await person.rpc("career_apply_card_open_own", { p_ids: [preparedId] });
        assertEquals(card.error, null);
        assertEquals(card.data.items.length, 1);
        const answer = await person.rpc("career_apply_card_answer_own", { p_card: card.data.id, p_approve: [1] });
        assertEquals(answer.error, null, JSON.stringify(answer));
        const row = JSON.parse(await pg.sql(`select row_to_json(j) from public.career_apply_jobs j where user_id = '${PERSON}' and url like '%/plain'`));
        assertEquals(row.state, "queued");
        assertEquals(row.approval_hash, row.payload_hash, "the job carries the hash the card showed");
        jobHash = row.payload_hash;
        assertEquals(await pg.sql(`select payload_hash from public.career_apply_prepared where id = '${preparedId}'`), jobHash);
        assertEquals(await pg.sql(`select count(*) from public.career_apply_jobs where user_id = '${PERSON}' and url like '%/attest'`), "0");
      });

      await t.step("drive: the person's computer claims it, the engine sends exactly the approved application once, the outcome is recorded", async () => {
        const queue = ownQueue(person);
        const done = await runApproved({
          claim: () => queue.claim(1),
          finish: (id, lease, state, evidence) => queue.finish(id, lease, state, evidence),
          resumeFor: async (job) => ({ path: resumePath, sha256: job.payload.resume_sha256 }),
          writeFacts: async (_job, facts) => {
            const p = `${work}/approved-facts.json`;
            await Deno.writeTextFile(p, JSON.stringify(facts));
            return p;
          },
          runEngine,
        });
        assertEquals(done.length, 1);
        assertEquals(site.posts.plain, 1, "exactly one POST reached the employer's page");
        assertEquals(site.posts.attest, 0);
        const row = JSON.parse(await pg.sql(`select row_to_json(j) from public.career_apply_jobs j where user_id = '${PERSON}' and url like '%/plain'`));
        assertEquals(row.state, "submitted_unconfirmed", "a page's thank-you is never 'confirmed' (only the employer's email is)");
        assertMatch(JSON.stringify(row), /FLOW-PLAIN-1/);
        assertEquals((await queue.claim(1)).length, 0, "nothing is left to claim: an application is driven once");
      });

      await t.step("negative control: an application changed after the person approved it is never sent", async () => {
        // Another employer (the company is the posting's host), so the once-per-company rule does not hold it back.
        const other = employer();
        try {
        const r = await prepare({ url: `${other.base}/second`, factsPath, resumePath, account, now: Date.now(), runEngine });
        assert(r.ready);
        const saved = await person.rpc("career_apply_prepare_own", { p_payload: r.payload, p_card_lines: r.card });
        const card = await person.rpc("career_apply_card_open_own", { p_ids: [saved.data.id] });
        const tap = await person.rpc("career_apply_card_answer_own", { p_card: card.data.id, p_approve: [1] });
        assertEquals(tap.data?.[0]?.result, "queued", JSON.stringify(tap));
        // Not the person: the stored payload is altered underneath the approval (a corrupted or tampered row).
        await pg.sql(`update public.career_apply_jobs set payload = jsonb_set(payload, '{fields,0,value}', '"Someone Else"') where user_id = '${PERSON}' and url like '%/second'`);
        const queue = ownQueue(person);
        await runApproved({
          claim: () => queue.claim(1),
          finish: (id, lease, state, evidence) => queue.finish(id, lease, state, evidence),
          resumeFor: async (job) => ({ path: resumePath, sha256: job.payload.resume_sha256 }),
          writeFacts: async (_job, facts) => {
            const p = `${work}/approved-facts-2.json`;
            await Deno.writeTextFile(p, JSON.stringify(facts));
            return p;
          },
          runEngine,
        });
        assertEquals(other.posts.second, 0, "nothing reached the employer");
        const state = await pg.sql(`select state from public.career_apply_jobs where user_id = '${PERSON}' and url like '%/second'`);
        assert(state === "not_submitted" || state === "queued", `state ${state}`);
        } finally {
          await other.close();
        }
      });
    } finally {
      await site.close();
      await pg.stop();
      await Deno.remove(work, { recursive: true }).catch(() => {});
    }
  },
});
