-- WO-036: hired-candidate backgrounds (20261021030000_career_hired_backgrounds.sql). The cache holds aggregates only and
-- refuses any person field; every PDL call is logged with its credits; the month's credits are summed per UTC month;
-- nobody but the service role reads or writes either table.
begin;
reset role;
set role service_role;
insert into career_hired_cache(firm_id,role_family,since_year,aggregates) values
 ('palantir','software engineer',2023,'{"n":12,"schools":[{"value":"stanford university","count":5}],"source":"pdl"}');
select t.ok((select count(*)=1 from career_hired_cache),'an aggregate is cached');
select t.must_fail($$insert into career_hired_cache(firm_id,role_family,since_year,aggregates) values('palantir','x',2023,'{"n":1,"rows":[{"full_name":"Planted Person"}]}')$$,'career_hired_cache_no_person_fields','a name anywhere in an aggregate is refused');
select t.must_fail($$insert into career_hired_cache(firm_id,role_family,since_year,aggregates) values('palantir','y',2023,'{"linkedin_url":"linkedin.com/in/planted"}')$$,'career_hired_cache_no_person_fields','a profile URL is refused');
select t.must_fail($$insert into career_hired_cache(firm_id,role_family,since_year,aggregates) values('palantir','z',2023,'{"x":{"emails":["a@b.c"]}}')$$,'career_hired_cache_no_person_fields','a contact field is refused');
select t.must_fail($$insert into career_hired_cache(firm_id,role_family,since_year,aggregates) values('Palantir!','',2023,'{}')$$,'career_hired_cache_firm_id_check','a firm id is a slug');
select t.must_fail($$insert into career_hired_cache(firm_id,role_family,since_year,aggregates) values('palantir','',2023,'[]')$$,'career_hired_cache_aggregates_check','aggregates are an object');
insert into career_pdl_calls(at,firm_id,role_family,since_year,size_requested,records_returned,records_kept,credits,status,http_status) values
 ('2026-10-02T10:00:00Z','palantir','software engineer',2023,25,25,19,25,'ok',200),
 ('2026-10-30T23:00:00Z','google','software engineer',2023,25,10,10,10,'ok',200),
 ('2026-09-30T23:59:00Z','google','',2023,25,25,25,25,'ok',200),
 ('2026-10-05T10:00:00Z','jpmorgan','analyst',2023,0,0,0,0,'budget_refused',null);
select t.ok(career_pdl_credits_month('2026-10-20T00:00:00Z')=35,'October''s credits: 25 + 10, not September''s');
select t.must_fail($$insert into career_pdl_calls(firm_id,since_year,size_requested,records_returned,records_kept,credits,status) values('google',2023,25,5,6,5,'ok')$$,'career_pdl_calls_kept_check','kept is never more than returned');
select t.must_fail($$insert into career_pdl_calls(firm_id,since_year,size_requested,status) values('google',2023,101,'ok')$$,'career_pdl_calls_size_requested_check','at most 100 per call');
select t.must_fail($$insert into career_pdl_calls(firm_id,since_year,size_requested,status) values('google',2023,10,'sent')$$,'career_pdl_calls_status_check','a known status');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000971');set role authenticated;
select t.must_fail($$select * from career_hired_cache$$,'permission denied','a person cannot read the cache directly');
select t.must_fail($$select * from career_pdl_calls$$,'permission denied','or the call log');
select t.must_fail($$select career_pdl_credits_month(now())$$,'permission denied','or the credit sum');
reset role;set role anon;
select t.must_fail($$select * from career_hired_cache$$,'permission denied','anon reads nothing');
reset role;
rollback;
