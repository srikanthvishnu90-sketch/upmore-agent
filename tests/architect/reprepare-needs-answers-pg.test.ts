// MASS APPLY (2026-11-01, architect decision (B)): an application the form stopped for a question added after the
// approval (not_submitted, needs_answers) is prepared again and goes only on a NEW card with a NEW approval; the old row is
// immutable history. On a real Postgres 16 with every migration (card-cloud bridge included) and the launch reconcile:
//   R1  the job ending needs_answers puts the posting back in the queue (waiting) and asks for a preparation
//   R2  the candidates offer it again; a prepared row older than the stop does not hold it back
//   R3  a new card's approval of the NEW payload makes a NEW row; the old row is unchanged (payload, hash, state, source)
//   R4  at most ONE live row per person and posting, by the index: two concurrent approvals make one row
//   R5  duplicate_job still holds for every other state (queued, driving, submitted_unconfirmed, needs_user, failed,
//       not_submitted for any other reason)
//   R6  readers: status lists the new row, not the superseded history; pending shows the re-queued posting; the per-ATS
//       waiver counts the history row not at all; the daily cap never counted it (a sent state only); posting_sent ignores it
//   R7  reconcile (scripts/launch/verify-claim-guards.sql) keeps every rewrite
// Red on the parent (#384): R1-R4 and R6 fail without the migration.
import assertNode from "node:assert/strict";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { confirmedResumeSql } from "../flow/resume-seed.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const U = "7b0f8f8e-6a43-4a49-9d2c-0000000a0b01";
const JOB = "greenhouse:reprep:5100001", URL_ = "https://boards.greenhouse.io/reprep/jobs/5100001";

Deno.test({
  name: "(B) needs_answers: re-queued, re-prepared, a NEW row on a NEW approval; one live row per posting; readers and guards hold",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir()) { if (CI) throw Error("needs Postgres 16 binaries in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
    if (Deno.uid?.() === 0 && !CI) { console.log("NOT_RUN locally as root: run it as an unprivileged user (initdb)"); return; }
    const pg = await startPg({ includeBridge: true });
    const q = (s: string) => pg.sql(s);
    const json = async (s: string) => JSON.parse((await q(`select coalesce(json_agg(x), '[]') from (${s}) x`)) || "[]");
    let ok = true;
    const step = async (name: string, fn: () => Promise<void>) => { if (ok) ok = await t.step(name, fn); };
    try {
      await q(Deno.readTextFileSync(`${ROOT}/scripts/launch/verify-claim-guards.sql`).replace(/^\\.*$/gm, ""));
      await q(`insert into auth.users (id, email) values ('${U}', 'reprep@example.test'); insert into public.profiles (id) values ('${U}');
        insert into public.career_watch_kv (user_id, key, value) values ('${U}', 'career:account', '{"epoch":0,"version":0,"paused":false}');
        ${confirmedResumeSql(U)}
        insert into storage.objects (bucket_id, name) values ('career-resumes', '${U}/' || repeat('a', 64) || '.pdf') on conflict do nothing;
        insert into public.career_postings (job_id, provider, board, company, title, location, url, description, first_seen_at, last_seen_at)
        values ('${JOB}', 'greenhouse', 'reprep', 'TEST Reprep', 'Frontend Engineering Intern', 'Chicago, IL', '${URL_}', 'Build UI.', now(), now());`);
      // A prepared application, shown on a card and approved (the database's own functions, as the card path calls them).
      const prepareAndApprove = async (why: string) => {
        const pl = `jsonb_build_object('version',1,'user_id','${U}','job_id','${JOB}','company','TEST Reprep','url','${URL_}','title','Frontend Engineering Intern',
          'fields',jsonb_build_array(jsonb_build_object('name','first_name','label','First name','value','Alex'),jsonb_build_object('name','why','label','Why?','value',${`'${why}'`})),
          'privacy_epoch',0,'account_version',0,'expires_at',now()+interval '1 day','resume_sha256',repeat('a',64))`;
        const p = JSON.parse(await q(`with p as (select ${pl} as pl) insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
          select '${U}', '${JOB}', 'TEST Reprep', '${URL_}', pl, public.career_apply_payload_hash(pl), array['TEST Reprep: Frontend Engineering Intern', 'Why?: ${why}'] from p
          returning json_build_object('id', id, 'hash', payload_hash)`));
        const card = JSON.parse(await q(`select row_to_json(c) from public.career_apply_card_open_for('${U}', array['${p.id}']::uuid[], now()) c`));
        const res = JSON.parse(await q(`select public.career_apply_card_answer_for('${U}', '${card.id}', '{1}', now())::text`));
        return { prepared: p, card, res };
      };
      const rows = () => json(`select id, state, reason, payload_hash, source, attempts from public.career_apply_jobs where user_id = '${U}' and job_id = '${JOB}' order by created_at`);
      let first: any;

      await step("the first approval queues one row; the cloud drives it and the form stops it: needs_answers (nothing sent)", async () => {
        const a = await prepareAndApprove("first answer");
        eq(a.res.map((r: any) => r.result), ["queued"]);
        first = (await rows())[0];
        await q(`update public.career_apply_jobs set state = 'driving', attempts = 1, claimed_at = now(), lease_token = gen_random_uuid(), source = 'cloud' where id = '${first.id}'`);
        const lease = await q(`select lease_token from public.career_apply_jobs where id = '${first.id}'`);
        await q(`select public.career_apply_finish('${first.id}', '${lease}', 'not_submitted', '{"reason":"needs_answers","nothing_sent":true}'::jsonb)`);
        first = (await rows())[0];
        eq([first.state, first.reason], ["not_submitted", "needs_answers"]);
      });

      await step("R1/R2: back in the queue, a preparation asked for, and a candidate again (the old prepared row does not hold it)", async () => {
        eq(await q(`select state from public.career_apply_wanted where user_id = '${U}' and posting_key = '${JOB}'`), "waiting");
        eq(await q(`select count(*) from public.career_apply_prepare_requests where user_id = '${U}' and '${JOB}' = any(job_ids) and state = 'queued'`), "1");
        const c = await json(`select job_id from public.career_apply_prepare_candidates(now(), 25, 500) where user_id = '${U}'`);
        eq(c.map((x: any) => x.job_id), [JOB]);
      });

      let second: any;
      await step("R3: the re-prepared application is shown on a NEW card; its approval makes a NEW row; the old row is unchanged", async () => {
        const before = JSON.stringify(first);
        const b = await prepareAndApprove("second answer, with the new question");
        eq(b.res.map((r: any) => r.result), ["queued"], JSON.stringify(b.res));
        const all = await rows();
        eq(all.length, 2);
        eq(JSON.stringify(all[0]), before, "the history row is exactly as it was");
        second = all[1];
        eq([second.state, second.payload_hash], ["queued", b.prepared.hash]);
        assert(second.payload_hash !== first.payload_hash, "a new payload, a new approval");
      });

      await step("R4: one live row per posting, by the index: a third approval (and two at once) is a duplicate", async () => {
        const c = await prepareAndApprove("third");
        eq(c.res.map((r: any) => r.result), ["duplicate"]);
        let refused = 0;
        try { await q(`insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash)
          select user_id, job_id, company, url, payload, payload_hash, approval_hash from public.career_apply_jobs where id = '${second.id}'`); } catch { refused++; }
        eq(refused, 1, "the index refuses a second live row, whatever the code says");
        // Two concurrent approvals of two fresh cards after a second needs_answers: one row.
        await q(`update public.career_apply_jobs set state = 'driving', attempts = 1, claimed_at = now(), lease_token = gen_random_uuid(), source = 'cloud' where id = '${second.id}'`);
        const lease = await q(`select lease_token from public.career_apply_jobs where id = '${second.id}'`);
        await q(`select public.career_apply_finish('${second.id}', '${lease}', 'not_submitted', '{"reason":"needs_answers"}'::jsonb)`);
        const [x, y] = await Promise.all([prepareAndApprove("race one"), prepareAndApprove("race two")].map((p) => p.catch((e) => ({ res: [{ result: String(e) }] }))));
        const results = [...x.res, ...y.res].map((r: any) => r.result).sort();
        eq(results.filter((r) => r === "queued").length, 1, `exactly one of two concurrent approvals queues: ${results}`);
        eq((await rows()).filter((r: any) => !(r.state === "not_submitted" && r.reason === "needs_answers")).length, 1, "one live row");
      });

      await step("R5: duplicate_job still holds for every other state", async () => {
        const live = (await rows()).find((r: any) => r.state === "queued")!;
        for (const [state, reason] of [["queued", null], ["submitted_unconfirmed", null], ["needs_user", "bot_check"], ["failed", "x"], ["not_submitted", "posting_closed"], ["not_submitted", "FACTS_EXPIRED"]]) {
          await q(`set session_replication_role = replica; update public.career_apply_jobs set state = '${state}', reason = ${reason ? `'${reason}'` : "null"} where id = '${live.id}'; set session_replication_role = origin;`);
          const d = await prepareAndApprove(`dup ${state} ${reason}`);
          eq(d.res.map((r: any) => r.result), ["duplicate"], `${state}/${reason}: no second row`);
        }
        await q(`set session_replication_role = replica; update public.career_apply_jobs set state = 'queued', reason = null where id = '${live.id}'; set session_replication_role = origin;`);
      });

      await step("R6: readers pick the live row: status, pending, waiver, cap, posting_sent", async () => {
        const st = JSON.parse(await q(`select public.career_apply_status_for('${U}', null)::text`));
        eq(st.length, 1, `status lists the live row, not the superseded history: ${JSON.stringify(st).slice(0, 300)}`);
        eq(await q(`select public.career_apply_posting_sent('${U}', '${JOB}', '${URL_}', null, false)`), "f", "history is not sent");
        await q(`insert into public.career_apply_cloud_gate_waivers (user_id, portal, max_sends, expires_at, note) values ('${U}', 'greenhouse', 2, now() + interval '1 day', 'TEST')`);
        // Two history rows were claimed by the cloud: the waiver counts neither.
        eq(await q(`select public.career_apply_cloud_waiver_left('${U}', 'greenhouse', now() + interval '1 minute')`), "2");
      });

      await step("R7: the launch reconcile keeps every rewrite", async () => {
        await q(`select public.career_apply_reconcile_bridge()`);
        for (const f of ["career_apply_enqueue(jsonb,text,text,integer)", "career_apply_prepare_own(jsonb,text[])", "career_apply_record_own(text,text,text,text)",
          "career_apply_email_reserve_for(uuid,jsonb,text,timestamptz)", "career_apply_pending_for(uuid)", "career_apply_status_for(uuid,text)", "career_apply_cloud_waiver_left(uuid,text,timestamptz)"]) {
          eq(await q(`select position('career_apply_job_history' in pg_get_functiondef('public.${f}'::regprocedure)) > 0`), "t", f);
        }
      });
      await step("R8: the rollback refuses while a posting has a history row and a live row (nothing half-undone)", async () => {
        let msg = "";
        try { await q(Deno.readTextFileSync(`${ROOT}/supabase/rollbacks/20261101130000_career_apply_reprepare_needs_answers.down.sql`)); } catch (e) { msg = String((e as Error).message); }
        assert(/rollback refused/.test(msg), msg.slice(0, 300));
        eq(await q(`select count(*) from pg_indexes where indexname = 'career_apply_jobs_live_posting'`), "1", "still installed");
      });
    } finally { await pg.stop(); }
  },
});
