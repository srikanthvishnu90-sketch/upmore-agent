-- E2E skeleton, stage 5b — read back what the drain did to its row
-- (run after the drain driver exits; assertions live in the test).
\set ON_ERROR_STOP on
select 'DRAIN_JOB_STATE', state || '/' || coalesce(source,'null')
  from career_apply_jobs where job_id='lever:veeva:synthetic-atomic-last';
select 'DRAIN_CONFIRMATION', coalesce(evidence->>'confirmation_id','')
  from career_apply_jobs where job_id='lever:veeva:synthetic-atomic-last';
select 'DRAIN_EVENT', e.outcome || '/' || coalesce(e.error_kind,'')
  from career_apply_cloud_events e
  join career_apply_jobs j on j.id=e.job_id
  where j.job_id='lever:veeva:synthetic-atomic-last'
  order by e.id desc limit 1;
