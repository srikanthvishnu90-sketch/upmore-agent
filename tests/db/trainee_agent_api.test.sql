-- WO-097 (20261023090700_trainee_agent_api.sql): agents acting for the person. The person mints and revokes; only the
-- token's hash is kept; every agent door resolves the person from the token, checks the scope, the revocation and the
-- rate, writes the call to the audit, and reads only that person's confirmed facts, saved answers, resume and approved
-- applications. Claiming and reporting need the approved payload's exact hash. No door creates an approval or a fact.
begin;
reset role;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000971','agent-a@example.test'),
 ('00000000-0000-4000-8000-000000000972','agent-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000971'),('00000000-0000-4000-8000-000000000972');
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000971','career:account','{"epoch":1,"version":2,"paused":false}'),
 ('00000000-0000-4000-8000-000000000972','career:account','{"epoch":1,"version":2,"paused":false}');

-- A's facts on two threads: f1 confirmed; f2 a draft; f3 confirmed on the older thread, a draft again on the newer one.
-- B has a confirmed fact of their own. Synthetic data only.
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-0000000097a1','00000000-0000-4000-8000-000000000971','old'),
 ('00000000-0000-4000-8000-0000000097a2','00000000-0000-4000-8000-000000000971','new'),
 ('00000000-0000-4000-8000-0000000097b1','00000000-0000-4000-8000-000000000972','b');
insert into agent_flow_state(thread_id,user_id,state,updated_at) values
 ('00000000-0000-4000-8000-0000000097a1','00000000-0000-4000-8000-000000000971',
  '{"career":{"scope":{"userId":"00000000-0000-4000-8000-000000000971"},"stores":{"profile":{"facts":[
    {"id":"f3","kind":"education","text":"TEST School, BSc 2024","needs_confirmation":false,"status":"confirmed"},
    {"id":"f1","kind":"experience","text":"TEST old wording","needs_confirmation":false,"status":"confirmed"}]}}}}', now()-interval '2 days'),
 ('00000000-0000-4000-8000-0000000097a2','00000000-0000-4000-8000-000000000971',
  '{"career":{"scope":{"userId":"00000000-0000-4000-8000-000000000971"},"stores":{"profile":{"facts":[
    {"id":"f1","kind":"experience","text":"TEST Analyst at Example Co","needs_confirmation":false,"status":"confirmed"},
    {"id":"f2","kind":"skill","text":"TEST draft skill","needs_confirmation":true,"status":"draft"},
    {"id":"f3","kind":"education","text":"TEST School, edited","needs_confirmation":true,"status":"draft"}]}}}}', now()-interval '1 day'),
 ('00000000-0000-4000-8000-0000000097b1','00000000-0000-4000-8000-000000000972',
  '{"career":{"scope":{"userId":"00000000-0000-4000-8000-000000000972"},"stores":{"profile":{"facts":[
    {"id":"f1","kind":"experience","text":"TEST B private fact","needs_confirmation":false,"status":"confirmed"}]}}}}', now());

insert into career_apply_questions(user_id,key,kind,label,type,state,answer,answered_at) values
 ('00000000-0000-4000-8000-000000000971','fact:sponsorship','fact','Will you require sponsorship?','input_text','answered','TEST No',now()),
 ('00000000-0000-4000-8000-000000000971','fact:start_date','fact','When can you start?','input_text','open',null,null),
 ('00000000-0000-4000-8000-000000000972','fact:sponsorship','fact','Will you require sponsorship?','input_text','answered','TEST B answer',now());

insert into career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch) values
 ('00000000-0000-4000-8000-000000000971',encode(sha256('TEST resume A'::bytea),'hex'),'a.pdf','TEST resume A'::bytea,1),
 ('00000000-0000-4000-8000-000000000972',encode(sha256('TEST resume B'::bytea),'hex'),'b.pdf','TEST resume B'::bytea,1);
insert into storage.objects(bucket_id,name) values
 ('career-resumes','00000000-0000-4000-8000-000000000971/'||repeat('c',64)||'.pdf'),
 ('career-resumes','00000000-0000-4000-8000-000000000972/'||repeat('d',64)||'.pdf');

-- Approved applications, enqueued as the card's yes enqueues them.
create function pg_temp.q(u text, job text, company text, extra jsonb default '{}') returns uuid language plpgsql as $$
declare p jsonb; h text;
begin
 p := jsonb_build_object('version',1,'user_id',u,'job_id',job,'company',company,'url','https://jobs.example.test/'||job,
  'fields',jsonb_build_array(jsonb_build_object('name','name','value','TEST Person','factId','f1')),
  'privacy_epoch',1,'account_version',2,'expires_at',now()+interval '1 hour','resume_sha256',encode(sha256('TEST resume A'::bytea),'hex')) || extra;
 h := encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 return (career_apply_enqueue(p,h,h,15)).id;
end $$;
create temp table apps as select
 pg_temp.q('00000000-0000-4000-8000-000000000971','ok:1','Alpha Co') as a_ok,
 pg_temp.q('00000000-0000-4000-8000-000000000971','stale:1','Beta Co') as a_stale,
 pg_temp.q('00000000-0000-4000-8000-000000000972','b:1','Gamma Co') as b_ok;
-- The stale one: its approval was made for an account version that has since moved.
update career_apply_jobs set payload = payload || '{"account_version":1}' where id = (select a_stale from apps);
update career_apply_jobs set payload_hash = encode(sha256(convert_to(career_apply_canonical(payload),'UTF8')),'hex'),
 approval_hash = encode(sha256(convert_to(career_apply_canonical(payload),'UTF8')),'hex') where id = (select a_stale from apps);
create temp table before_counts as select (select count(*) from career_apply_jobs) jobs, (select count(*) from career_apply_prepared) prepared,
 (select count(*) from career_apply_cards) cards;
grant select on apps, before_counts to authenticated, anon, service_role;

-- ------------------------------------------------------------------------------------------------ mint: the person only
set role anon;
select t.must_fail($$select trainee_agent_grant_mint_own('x', array['read_profile'])$$,'permission denied','anon cannot mint');
reset role;
select t.as_user('');set role authenticated;
select t.must_fail($$select trainee_agent_grant_mint_own('x', array['read_profile'])$$,'not signed in','a caller with no session mints nothing');
reset role;
set role service_role;
select t.must_fail($$select trainee_agent_grant_mint_own('x', array['read_profile'])$$,'permission denied','the service role cannot mint for anyone');
reset role;

select t.as_user('00000000-0000-4000-8000-000000000971');set role authenticated;
select t.must_fail($$select trainee_agent_grant_mint_own('Codex', array['read_profile','approve_applications'])$$,'invalid scopes','no scope beyond the five');
select t.must_fail($$select trainee_agent_grant_mint_own('', array['read_profile'])$$,'invalid label','a grant needs a label');
create temp table g1 as select trainee_agent_grant_mint_own('Codex', array['read_profile','read_answers','read_resume','read_approved_applications','report_submission','read_profile']) as r;
create temp table g2 as select trainee_agent_grant_mint_own('Read-only helper', array['read_profile']) as r;
create temp table g3 as select trainee_agent_grant_mint_own('Reader', array['read_approved_applications','read_resume']) as r;
select t.ok((select r->>'token' ~ '^tra_[A-Za-z0-9_-]{64}$' and jsonb_array_length(r->'scopes') = 5 from g1),'the token is shown once, with the scopes (deduplicated)');
select t.must_fail($$select * from trainee_agent_grants$$,'permission denied','the person cannot read the grants table directly');
select t.must_fail($$select * from trainee_agent_calls$$,'permission denied','nor the audit table');
select t.must_fail($$select trainee_agent_get_profile('x')$$,'permission denied','a signed-in session cannot call an agent door');
select t.ok((select count(*) = 3 from trainee_agent_grants_own()),'A lists A''s three grants');
select t.ok((select bool_and(not (to_jsonb(x) ? 'token_hash') and not (to_jsonb(x) ? 'token')) from trainee_agent_grants_own() x),'the list never carries the token or its hash');
reset role;
grant select on g1, g2, g3 to authenticated, service_role;
create temp table tok as select (select r->>'token' from g1) t1, (select r->>'token' from g2) t2, (select r->>'token' from g3) t3,
 encode(sha256(convert_to((select r->>'token' from g1),'UTF8')),'hex') h1, encode(sha256(convert_to((select r->>'token' from g2),'UTF8')),'hex') h2,
 encode(sha256(convert_to((select r->>'token' from g3),'UTF8')),'hex') h3, (select (r->>'id')::uuid from g1) id1, (select (r->>'id')::uuid from g2) id2;
grant select on tok to authenticated, service_role;
select t.ok((select count(*) = 3 from trainee_agent_grants g, tok where g.token_hash in (tok.h1, tok.h2, tok.h3)),'only the SHA-256 of each token is stored');
select t.ok((select not exists (select from trainee_agent_grants g, tok where strpos(to_jsonb(g)::text, tok.t1) > 0 or strpos(to_jsonb(g)::text, tok.t2) > 0)),
 'no stored column holds a raw token');

select t.as_user('00000000-0000-4000-8000-000000000972');set role authenticated;
create temp table gb as select trainee_agent_grant_mint_own('B agent', array['read_profile','read_answers','read_resume','read_approved_applications','report_submission']) as r;
select t.ok((select count(*) = 1 from trainee_agent_grants_own()),'B lists only B''s grant');
select t.must_fail($$select trainee_agent_grant_revoke_own((select id1 from tok))$$,'not your grant','B cannot revoke A''s grant');
reset role;
grant select on gb to service_role;
create temp table tokb as select encode(sha256(convert_to((select r->>'token' from gb),'UTF8')),'hex') hb, (select (r->>'id')::uuid from gb) idb;
grant select on tokb to service_role, authenticated;

-- ------------------------------------------------------------------------------------------------ the agent's doors
set role service_role;
select t.ok((trainee_agent_get_profile(repeat('0',64))->>'refusal') = 'unauthorized','an unknown token reads nothing');
select t.ok((trainee_agent_get_profile('not-a-hash')->>'refusal') = 'unauthorized','a malformed hash reads nothing');
create temp table prof as select trainee_agent_get_profile((select h1 from tok)) as r;
select t.ok((select (r->>'ok')::boolean and (select array_agg(f->>'id' order by f->>'id') from jsonb_array_elements(r->'facts') f) = array['f1'] from prof),
 'get_profile returns confirmed facts only: the draft and the fact edited back to a draft are left out');
select t.ok((select r->'facts'->0->>'text' = 'TEST Analyst at Example Co' from prof),'a fact is read at its newest thread');
select t.ok((select strpos(r::text,'TEST B private fact') = 0 from prof),'never another person''s fact');
select t.ok((trainee_agent_get_profile((select h2 from tok))->>'ok')::boolean,'a read_profile grant reads the profile');
select t.ok((trainee_agent_get_saved_answers((select h2 from tok))->>'refusal') = 'scope','without read_answers, the answers are refused');
create temp table ans as select trainee_agent_get_saved_answers((select h1 from tok)) as r;
select t.ok((select jsonb_array_length(r->'answers') = 1 and r->'answers'->0->>'answer' = 'TEST No' and r->'answers'->0->>'key' = 'fact:sponsorship' from ans),
 'get_saved_answers: A''s answered question only (not the open one, not B''s)');

-- The resume: A's kept file, by hash or the newest; a tailored PDF only in A's own folder.
create temp table res as select trainee_agent_get_resume((select h1 from tok), null) as r;
select t.ok((select r->'resume'->>'source' = 'kept' and r->'resume'->>'sha256' = encode(sha256('TEST resume A'::bytea),'hex') and not (r->'resume' ? 'b64') from res),
 'get_resume names A''s kept resume and its hash, never the bytes');
select t.ok((trainee_agent_get_resume((select h1 from tok), encode(sha256('TEST resume B'::bytea),'hex'))->>'refusal') = 'not_found','B''s resume hash finds nothing for A');
select t.ok((trainee_agent_get_resume((select h1 from tok), repeat('c',64))->'resume'->>'path') = '00000000-0000-4000-8000-000000000971/'||repeat('c',64)||'.pdf',
 'a tailored PDF in A''s own folder');
select t.ok((trainee_agent_get_resume((select h1 from tok), repeat('d',64))->>'refusal') = 'not_found','never one in B''s folder');
select t.ok((trainee_agent_get_resume((select h1 from tok), 'nope')->>'refusal') = 'invalid','a malformed hash is refused');
select t.ok((trainee_agent_get_resume((select h2 from tok), null)->>'refusal') = 'scope','without read_resume, no resume');
select t.ok(decode(trainee_agent_resume_download((select id1 from tok), encode(sha256('TEST resume A'::bytea),'hex'))->>'b64','base64') = 'TEST resume A'::bytea,
 'the signed link''s download returns A''s file');
select t.ok((trainee_agent_resume_download((select id1 from tok), encode(sha256('TEST resume B'::bytea),'hex'))->>'refusal') = 'not_found','and never B''s');
select t.ok((trainee_agent_resume_download((select id2 from tok), encode(sha256('TEST resume A'::bytea),'hex'))->>'refusal') = 'scope','a grant without read_resume downloads nothing');

-- Approved applications: current ones only, A's only, with the exact payload and its hash.
create temp table lst as select trainee_agent_list_approved((select h1 from tok)) as r;
select t.ok((select jsonb_array_length(r->'applications') = 1 and (r->'applications'->0->>'id')::uuid = (select a_ok from apps) from lst),
 'list: A''s current approval only (not the stale one, not B''s)');
select t.ok((select r->'applications'->0->>'payload_hash' = encode(sha256(convert_to(career_apply_canonical(r->'applications'->0->'payload'),'UTF8')),'hex') from lst),
 'the payload listed is exactly the one its hash approves');
select t.ok((trainee_agent_list_approved((select h2 from tok))->>'refusal') = 'scope','without read_approved_applications, nothing is listed');

-- Claim and report: the approved hash, the claiming grant, its lease.
create temp table okh as select payload_hash h from career_apply_jobs where id = (select a_ok from apps);
grant select on okh to service_role;
select t.ok((trainee_agent_begin_submission((select h3 from tok), (select a_ok from apps), (select h from okh))->>'refusal') = 'scope','a read-only grant cannot claim');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select b_ok from apps), (select payload_hash from career_apply_jobs where id = (select b_ok from apps)))->>'refusal') = 'not_found',
 'A''s agent cannot claim B''s application, even with its hash');
select t.ok((trainee_agent_begin_submission((select hb from tokb), (select a_ok from apps), (select h from okh))->>'refusal') = 'not_found','nor B''s agent A''s');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select a_ok from apps), repeat('a',64))->>'refusal') = 'hash_mismatch','a payload hash that is not the approved one is refused');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select a_stale from apps), (select payload_hash from career_apply_jobs where id = (select a_stale from apps)))->>'refusal') = 'stale',
 'an approval that is no longer current is refused');
create temp table claim as select trainee_agent_begin_submission((select h1 from tok), (select a_ok from apps), (select h from okh)) as r;
select t.ok((select (r->>'ok')::boolean and r->>'lease' is not null from claim),'the approved hash claims it');
grant select on claim to service_role;
select t.ok((select state = 'driving' and source = 'agent' and attempts = 1 from career_apply_jobs where id = (select a_ok from apps)),'the row is the agent''s drive, one attempt');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select a_ok from apps), (select h from okh))->>'refusal') = 'not_ready','it cannot be claimed twice');
select t.ok((select jsonb_array_length(trainee_agent_list_approved((select h1 from tok))->'applications') = 0),'a claimed application leaves the list');
select t.ok((trainee_agent_report_submission((select h1 from tok), (select a_ok from apps), (select (r->>'lease')::uuid from claim), repeat('a',64), 'submitted', '{}')->>'refusal') = 'hash_mismatch',
 'a report with another payload''s hash is refused');
select t.ok((trainee_agent_report_submission((select h1 from tok), (select a_ok from apps), gen_random_uuid(), (select h from okh), 'submitted', '{}')->>'refusal') = 'not_ready',
 'a report without the claim''s lease is refused');
select t.ok((trainee_agent_report_submission((select hb from tokb), (select a_ok from apps), (select (r->>'lease')::uuid from claim), (select h from okh), 'submitted', '{}')->>'refusal') = 'not_found',
 'another person''s agent cannot report it');
select t.ok((trainee_agent_report_submission((select h1 from tok), (select a_ok from apps), (select (r->>'lease')::uuid from claim), (select h from okh), 'blocked', '{}')->>'refusal') = 'invalid',
 'blocked needs a reason');
select t.ok((trainee_agent_report_submission((select h1 from tok), (select a_ok from apps), (select (r->>'lease')::uuid from claim), (select h from okh), 'approved', '{}')->>'refusal') = 'invalid',
 'only submitted or blocked');
select t.ok((trainee_agent_report_submission((select h1 from tok), (select a_ok from apps), (select (r->>'lease')::uuid from claim), (select h from okh), 'submitted',
 '{"page_confirmation":true,"confirmation_id":"TEST-97"}')->>'state') = 'submitted_unconfirmed','submitted is recorded, unconfirmed until the employer''s email');
select t.ok((select evidence->>'source' = 'agent' and (evidence->>'page_confirmation')::boolean and confirmation_id = 'TEST-97' and evidence->>'agent_grant_id' = (select id1::text from tok)
 from career_apply_jobs where id = (select a_ok from apps)),'the evidence names the agent''s grant, as the extension''s does');
select t.ok((trainee_agent_report_submission((select h1 from tok), (select a_ok from apps), (select (r->>'lease')::uuid from claim), (select h from okh), 'blocked', '{"reason":"captcha"}')->>'refusal') = 'not_ready',
 'a recorded outcome is never rewritten');
select t.ok((select (select count(*) from career_apply_jobs) = jobs and (select count(*) from career_apply_prepared) = prepared and (select count(*) from career_apply_cards) = cards from before_counts),
 'no agent door created an application, a prepared card or a card: approving stays the person''s act');

-- The audit: ids only, and every call of A's grants is A's.
select t.ok((select count(*) > 0 and bool_and(user_id = '00000000-0000-4000-8000-000000000971') from trainee_agent_calls c, tok where c.grant_id in (tok.id1, tok.id2)),
 'every call of A''s grants is recorded under A');
select t.ok((select array_agg(distinct outcome order by outcome) from trainee_agent_calls) @> array['hash_mismatch','not_found','not_ready','ok','scope','stale'],
 'refusals are recorded with their reason');
select t.ok((select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'trainee_agent_calls'
 and column_name not in ('id','grant_id','user_id','op','outcome','application_id','at')),'the audit holds ids, the operation and the outcome; nothing else');
select t.ok((select last_used_at is not null from trainee_agent_grants g, tok where g.id = tok.id1),'last used is kept');
reset role;

-- ------------------------------------------------------------------------------------------------ never LinkedIn or Indeed
-- The owner's rule: Trainee never automates LinkedIn or Indeed. Matched on the parsed host, never a substring.
select t.ok(trainee_agent_host_forbidden('https://www.linkedin.com/jobs/view/1'),'www.linkedin.com is forbidden');
select t.ok(trainee_agent_host_forbidden('https://uk.indeed.com/viewjob?jk=1'),'uk.indeed.com is forbidden');
select t.ok(trainee_agent_host_forbidden('https://www.indeed.co.uk/viewjob?jk=1') and trainee_agent_host_forbidden('https://ca.indeed.com/x')
 and trainee_agent_host_forbidden('https://indeed.ca/x') and trainee_agent_host_forbidden('https://de.indeed.com/x'),'Indeed''s country domains are forbidden');
select t.ok(trainee_agent_host_forbidden('https://lnkd.in/abc') and trainee_agent_host_forbidden('https://LinkedIn.COM:443/jobs'),'lnkd.in and a capitalised host with a port are forbidden');
select t.ok(trainee_agent_host_forbidden('https://www.linkedin.com.evil.com/x'),'www.linkedin.com.evil.com is forbidden (a LinkedIn label in the host)');
select t.ok(trainee_agent_host_forbidden('https://user@www.linkedin.com/x') and trainee_agent_host_forbidden('https://www.linkedin.com\@evil.com/x'),
 'a user part or a backslash does not hide the host');
select t.ok(not trainee_agent_host_forbidden('https://notlinkedin.com/x') and not trainee_agent_host_forbidden('https://myindeedjobs.com/x'),
 'a host that only contains the word is not forbidden');
select t.ok(not trainee_agent_host_forbidden('https://boards.greenhouse.io/acme/jobs/1?gh_src=linkedin&utm=indeed.com'),'a query string naming them is not forbidden');
select t.ok(trainee_agent_host_forbidden(null) and trainee_agent_host_forbidden('not a url'),'a missing or unreadable host fails closed');
create temp table fb as select
 pg_temp.q('00000000-0000-4000-8000-000000000971','li:1','Li Co','{"url":"https://www.linkedin.com/jobs/view/1"}') as li,
 pg_temp.q('00000000-0000-4000-8000-000000000971','in:1','In Co','{"url":"https://uk.indeed.com/viewjob?jk=1"}') as ind,
 pg_temp.q('00000000-0000-4000-8000-000000000971','gh:1','Gh Co','{"url":"https://boards.greenhouse.io/acme/jobs/1?gh_src=linkedin"}') as gh,
 pg_temp.q('00000000-0000-4000-8000-000000000971','dest:1','Dest Co','{"destination":"https://www.linkedin.com/jobs/view/2"}') as dest;
grant select on fb to service_role;
set role service_role;
create temp table fbl as select trainee_agent_list_approved((select h1 from tok)) as r;
select t.ok((select array_agg((a->>'id')::uuid) from fbl, jsonb_array_elements(r->'applications') a) = array[(select gh from fb)],
 'the list leaves out applications on LinkedIn or Indeed (by its url or the payload''s destination); the Greenhouse one is listed');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select li from fb), (select payload_hash from career_apply_jobs where id = (select li from fb)))->>'refusal') = 'forbidden_host',
 'begin_submission refuses an approved application on LinkedIn');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select ind from fb), (select payload_hash from career_apply_jobs where id = (select ind from fb)))->>'refusal') = 'forbidden_host',
 'and one on Indeed');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select dest from fb), (select payload_hash from career_apply_jobs where id = (select dest from fb)))->>'refusal') = 'forbidden_host',
 'and one whose payload submits to LinkedIn');
select t.ok((select state = 'queued' and source is null from career_apply_jobs where id = (select li from fb)),'a refused one stays the person''s, untouched');
select t.ok((trainee_agent_begin_submission((select h1 from tok), (select gh from fb), (select payload_hash from career_apply_jobs where id = (select gh from fb)))->>'ok')::boolean,
 'the Greenhouse one whose query string names LinkedIn can be begun');
select t.ok((select count(*) = 3 from trainee_agent_calls where outcome = 'forbidden_host'),'each refusal is audited as forbidden_host');
reset role;

-- ------------------------------------------------------------------------------------------------ the rate limit
set role service_role;
do $$ declare i int; r jsonb; n int := 0; begin
  for i in 1..70 loop
    r := trainee_agent_get_profile((select h2 from tok));
    if r->>'refusal' = 'rate_limited' then n := n + 1; end if;
  end loop;
  if n = 0 then raise exception 'FAIL the 61st call in a minute was not refused'; end if;
  raise notice 'ok   the 61st call in a minute is refused (rate_limited)';
end $$;
select t.ok((select count(*) = 60 from trainee_agent_calls c, tok where c.grant_id = tok.id2 and c.outcome <> 'rate_limited'),'exactly 60 calls a minute go through');
do $$ declare i int; begin for i in 1..80 loop perform trainee_agent_get_profile((select h2 from tok)); end loop; end $$;
select t.ok((select count(*) <= 120 from trainee_agent_calls c, tok where c.grant_id = tok.id2),'a flood never grows the audit past twice the limit');
select t.ok((select unlogged_refusals > 0 from trainee_agent_grants g, tok where g.id = tok.id2),'the rest are counted on the grant');
select t.ok((trainee_agent_get_profile((select h1 from tok))->>'ok')::boolean,'one agent''s flood does not limit another grant');
reset role;

-- ------------------------------------------------------------------------------------------------ revoke and erase
select t.as_user('00000000-0000-4000-8000-000000000971');set role authenticated;
select t.ok(trainee_agent_grant_revoke_own((select id1 from tok)),'A revokes the Codex grant');
select t.ok(not trainee_agent_grant_revoke_own((select id1 from tok)),'revoking twice is a no-op');
reset role;
set role service_role;
select t.ok((trainee_agent_get_profile((select h1 from tok))->>'refusal') = 'revoked','a revoked token reads nothing');
select t.ok((trainee_agent_resume_download((select id1 from tok), encode(sha256('TEST resume A'::bytea),'hex'))->>'refusal') = 'revoked',
 'a link made before the revocation downloads nothing');
select t.ok((select outcome = 'revoked' from trainee_agent_calls c, tok where c.grant_id = tok.id1 order by c.id desc limit 1),'the refused call is audited');
reset role;
update career_watch_kv set value = value || '{"epoch":2}' where user_id = '00000000-0000-4000-8000-000000000971' and key = 'career:account';
select t.ok((select bool_and(revoked_at is not null) from trainee_agent_grants where user_id = '00000000-0000-4000-8000-000000000971'),'an erase revokes every grant A made');
select t.ok((select revoked_at is null from trainee_agent_grants where user_id = '00000000-0000-4000-8000-000000000972'),'and none of B''s');

select t.as_user('00000000-0000-4000-8000-000000000972');set role authenticated;
select t.ok((select count(*) > 0 and bool_and(grant_id = (select idb from tokb)) from trainee_agent_calls_own()),'B''s audit shows B''s agent''s calls only, none of A''s');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000971');set role authenticated;
select t.ok((select count(*) > 0 from trainee_agent_calls_own(500)),'A reads what A''s agents did');
reset role;

-- Deleting the account deletes the grants and the audit.
delete from auth.users where id = '00000000-0000-4000-8000-000000000972';
select t.ok((select count(*) = 0 from trainee_agent_grants where user_id = '00000000-0000-4000-8000-000000000972'),'a deleted account leaves no grant');
rollback;
