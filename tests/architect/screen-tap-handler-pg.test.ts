// F09 round 5, on the REAL path: the production agent-chat handler (handler-career.ts handleChat) on a real Postgres
// (tests/flow/handler.ts), the real card turn and every other yes/no consumer in their real order. A tap on the screen's Yes / No
// buttons arrives as body.screen_tap = { qid, answer } (what channel_inbound sends for callback data scr:<qid>:yes|no):
//   * a tap on the open sponsorship question records it (and no consumer replies "reply directly to the card");
//   * a tap after that question closed records nothing and approves nothing;
//   * a tap while a card is waiting for approval approves nothing (the card's own typed yes still works afterwards).
// Run: CI=true deno test -A --no-check --import-map=tests/flow/supabase-npm.json tests/architect/screen-tap-handler-pg.test.ts
import assertNode from "node:assert/strict";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { careerHandler, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { confirmedResumeSql } from "../flow/resume-seed.ts";
import { TAP_STALE_REPLY } from "../../supabase/functions/_shared/career_apply_screen_answer.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const RESUME_FILE = "%PDF-1.4\n% TEST screen-tap resume\n%%EOF\n";
const RESUME_SHA = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(RESUME_FILE))), (b) => b.toString(16).padStart(2, "0")).join("");
const ID = "a13ae586-f4cb-4385-8822-c42b9b54ed75", LINK = `https://jobs.ashbyhq.com/ramp/${ID}`;
const PEOPLE: Record<string, string> = { "tok-st-1": "7b0f8f8e-6a43-4a49-9d2c-00000000e001", "tok-st-2": "7b0f8f8e-6a43-4a49-9d2c-00000000e002" };

Deno.test({
  name: "screen Yes / No tap through the production handler: records on the open question; stale or card-pending approves nothing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir()) {
      if (CI) throw Error("the screen tap handler test needs Postgres 16 binaries in CI");
      console.log("NOT_RUN locally: no Postgres binaries");
      return;
    }
    const pg = await startPg();
    const ats = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (req) => {
      const u = new URL(req.url);
      if (u.pathname === "/posting-api/job-board/ramp") {
        return Response.json({ jobs: [{ id: ID, title: "Analyst (TEST)", location: "New York, NY", jobUrl: LINK, applyUrl: `${LINK}/application`, publishedAt: new Date().toISOString(),
          descriptionPlain: "TEST synthetic posting. SQL and Python. We are unable to sponsor visas for this role." }] });
      }
      return new Response("not found", { status: 404 });
    });
    const origin = `http://127.0.0.1:${(ats.addr as Deno.NetAddr).port}`;
    let h: Awaited<ReturnType<typeof careerHandler>> | null = null;
    try {
      await supabaseParity(pg);
      for (const id of Object.values(PEOPLE)) {
        await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
          insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');
          ${confirmedResumeSql(id, RESUME_FILE)}`);
      }
      h = await careerHandler(pg, PEOPLE);
      const double = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request && !init ? input : new Request(input as any, init);
        const u = new URL(req.url);
        if (u.origin === new URL(SUPABASE_URL).origin || u.hostname === "127.0.0.1") return double(req);
        if (u.hostname === "api.ashbyhq.com") return double(new Request(`${origin}${u.pathname}${u.search}`, req));
        return Promise.reject(new Error(`no real host: ${u.href}`));
      }) as typeof fetch;
      const P1 = PEOPLE["tok-st-1"], P2 = PEOPLE["tok-st-2"];
      const wanted = async (p: string) => await pg.sql(`select count(*) from public.career_apply_wanted where user_id = '${p}'`);

      let lastQid = "";
      const tapped: string[] = [];
      const chat1 = h.chat("tok-st-1");
      await t.step("apply to a posting that says it cannot sponsor: the screen asks ONE question at a time; a Yes tap on each open yes/no question records it", async () => {
        let r = await chat1.say(`apply me to this: ${LINK}`);
        let guard = 0;
        while (r.body?.meta?.screen_ask && guard++ < 6 && !tapped.includes("sponsorship")) {
          const ask = r.body.meta.screen_ask as { fact: string }[];
          eq(ask.length, 1, `one question at a time: ${r.reply}`);
          if (ask[0].fact === "location") { r = await chat1.say("Austin, TX"); continue; }
          const qid = String(r.body.meta.screen_qid);
          assert(/^[0-9a-f]{8}$/.test(qid), JSON.stringify(r.body.meta));
          eq(r.body.meta.screen_buttons, ["Yes", "No"]);
          r = await chat1.say("yes", { screen_tap: { qid, answer: "yes" } });
          assert(!/reply directly to the card/i.test(r.reply), r.reply);
          assert(/^Saved \(/.test(r.reply), r.reply);
          tapped.push(ask[0].fact);
          lastQid = qid;
        }
        assert(tapped.includes("sponsorship"), `the sponsorship question was asked and tapped: ${tapped}`);
        // the answers are in the person's profile: the same posting is now screened out by the sponsorship knock-out, with no new question
        const again = await chat1.say(`apply me to this: ${LINK}`);
        assert(!again.body?.meta?.screen_ask && /screened out \(knock-out\)/.test(again.reply) && /you need sponsorship/.test(again.reply), again.reply);
        eq(await wanted(P1), "0");
      });

      await t.step("the same tap after the question closed: nothing recorded, nothing queued, nothing approved", async () => {
        const r = await chat1.say("no", { screen_tap: { qid: lastQid, answer: "no" } });
        eq(r.reply, TAP_STALE_REPLY);
        eq(await wanted(P1), "0");
        // had the stale "no" been recorded, the posting would now pass the sponsorship knock-out and be queued; it is still screened out
        const again = await chat1.say(`apply me to this: ${LINK}`);
        assert(!again.body?.meta?.screen_ask && /screened out \(knock-out\)/.test(again.reply) && /you need sponsorship/.test(again.reply), again.reply);
        eq(await wanted(P1), "0", "the earlier answer stands: nothing queued");
        eq(await pg.sql(`select count(*) from public.career_apply_jobs where user_id = '${P1}'`), "0");
      });

      await t.step("a tap with a card waiting for approval approves nothing; the card's own typed yes still works", async () => {
        const chat = h!.chat("tok-st-2");
        for (let i = 1; i <= 2; i++) {
          const payload = { version: 1, user_id: P2, job_id: `TEST-ST-${i}`, company: `Tap Employer ${i}`, url: `https://jobs.lever.co/tap${i}/${i}`,
            fields: [{ name: "email", label: "Email", value: "t@example.test", factId: "TEST-1" }], privacy_epoch: 0, account_version: 0, expires_at: new Date(Date.now() + 3600_000).toISOString(), resume_sha256: RESUME_SHA };
          const r = await pg.asPerson(P2).rpc("career_apply_prepare_own", { p_payload: payload, p_card_lines: [`Tap Employer ${i}: TEST Analyst`, "Email: t@example.test", `Sends to https://jobs.lever.co/tap${i}/${i}`] });
          eq(r.error, null, JSON.stringify(r.error));
        }
        const shown = await chat.say("show my applications");
        eq([shown.intent, shown.resultStatus], ["career_apply_card", "shown"], shown.reply);
        for (const answer of ["yes", "no"]) {
          const tap = await chat.say(answer, { screen_tap: { qid: "deadbeef", answer } });
          eq(tap.reply, TAP_STALE_REPLY);
          assert(tap.intent !== "career_apply_card_answer", `${tap.intent}: ${tap.reply}`);
        }
        eq(await pg.sql(`select count(*) from public.career_apply_jobs where user_id = '${P2}'`), "0", "nothing approved by a tap");
        eq(await pg.sql(`select string_agg(state, ',') from public.career_apply_cards where user_id = '${P2}'`), "open", "the card is still waiting");
        // (the stale notice is now the thread's last word, so the card is shown again before its own typed yes)
        await chat.say("show my applications");
        const typed = await chat.say("yes");
        eq([typed.intent, typed.resultStatus], ["career_apply_card_answer", "answered"], typed.reply);
        eq(await pg.sql(`select count(*) from public.career_apply_jobs where user_id = '${P2}'`), "2", "the typed yes is the approval, as before");
      });
    } finally {
      h?.restore();
      await ats.shutdown();
      await pg.stop();
    }
  },
});
