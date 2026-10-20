#!/usr/bin/env python3
"""WRITTEN / NOT_RUN. Pinned014-only retained local PostgreSQL bootstrap.

Never executes run.sh, a launcher, its test loop, a filesystem migration glob, or
--single-transaction. The fixed lists below reproduce pinned014 early SQL order,
pinned launcher pending order and final runner replays. Each reviewed bridge up
is a separate standalone psql -X -v ON_ERROR_STOP=1 -f FILE process.
Require explicit executables, clean source checkout(s), new cluster/socket paths,
QA database name, marker and authorizations. Baseline-only mode supports the
separate rollback driver; bridge mode additionally applies exactly the reviewed up.
Source/seed/tests are NEVER selected or invoked here: call their explicit drivers
against the retained connection under their own authorization. No automatic stop,
remove, test, enrollment, opt-in or switch change occurs. Inspect/destroy the new
cluster after success OR failure. Import and --help perform no subprocess work.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

PIN="01401cb456bc2982d67316165e183bbd275581c9"
BASELINE="20261011030000_brokerage_accounts_per_user.sql"
EARLY="""
20260923_000001_agent_rate_limits.sql 20260923_000006_rate_limiter_hardening.sql 20260927_000003_agent_usage.sql
20260926_000001_agent_exec.sql 20260926_000002_agent_exec_otp.sql 20260928_000001_chat_reminders.sql
20260928_000002_exec_runs_revoked.sql 20260928_000004_exec_trust.sql 20260928_000006_agent_lessons.sql
20260928_000007_lesson_upsert_rpc.sql 20260928_000011_oauth_connections.sql 20261008_000002_agent_rl_bump_as.sql
20261010010000_agent_permissions_ledger.sql 20261010020000_execution_integrity.sql 20261010030000_obligation_workflows.sql
20261010040000_financial_evidence.sql 20261010050000_biller_lifecycle.sql 20261010060000_payment_execution.sql
20261010070000_message_inbox.sql 20261010080000_message_delivery.sql 20261010090000_chat_bridge_rate.sql
20261010100000_message_turns.sql 20261010110000_model_call_budget.sql 20261010120000_chat_lesson_ownership.sql
20261010130000_transaction_reviews.sql 20261010140000_linked_transaction_review.sql 20261010150000_obligation_edits.sql
20261010160000_applied_payment_reconciliation.sql 20261010170000_payment_queue_fairness.sql 20261010180000_recovery_snapshot.sql
20261010190000_recovery_cases.sql 20261011010000_flow_state.sql 20261011020000_saved_recipients.sql
20261011030000_brokerage_accounts_per_user.sql 20261011040000_model_health_and_turn_costs.sql 20261011050000_broker_vault_cascade.sql
20261010120000_chat_lesson_ownership.sql 20261010010000_agent_permissions_ledger.sql 20261010020000_execution_integrity.sql
20261010030000_obligation_workflows.sql 20261010040000_financial_evidence.sql 20261010050000_biller_lifecycle.sql
20261010060000_payment_execution.sql 20261010070000_message_inbox.sql 20261010080000_message_delivery.sql
20261010090000_chat_bridge_rate.sql 20261010100000_message_turns.sql 20261010110000_model_call_budget.sql
20261010130000_transaction_reviews.sql 20261010140000_linked_transaction_review.sql 20261010150000_obligation_edits.sql
20261010160000_applied_payment_reconciliation.sql 20261010170000_payment_queue_fairness.sql 20261010180000_recovery_snapshot.sql
20261010190000_recovery_cases.sql 20261011010000_flow_state.sql 20261011020000_saved_recipients.sql
20261011030000_brokerage_accounts_per_user.sql 20261011040000_model_health_and_turn_costs.sql 20261011050000_broker_vault_cascade.sql
20261011060000_proactive.sql 20261012010000_manual_connections.sql 20261012020000_standing_payments.sql
20261012020000_standing_payments.sql 20261012030000_saved_recipient_nicknames.sql 20261012030000_saved_recipient_nicknames.sql
20261012040000_category_rules.sql 20261012040000_category_rules.sql 20261012050000_ious.sql
20261012050000_ious.sql 20261012060000_oauth_vault_cascade.sql 20261012060000_oauth_vault_cascade.sql
20261019000001_career_postings.sql 20261019000001_career_postings.sql 20261019010001_career_alerts.sql
20261019010001_career_alerts.sql 20261019020001_channel_delivery.sql 20261020000001_career_apply_jobs.sql
20261020000001_career_apply_jobs.sql 20261020010000_career_apply_own_worker.sql 20261020010000_career_apply_own_worker.sql
20261019020001_channel_delivery.sql 20261019030000_channel_inbound.sql 20261019030000_channel_inbound.sql
20261020020000_career_apply_receipts.sql 20261020020000_career_apply_receipts.sql 20261020030000_career_apply_cards.sql
20261020030000_career_apply_cards.sql 20261020040000_career_apply_card_push.sql 20261020040000_career_apply_card_push.sql
20261020050000_career_apply_daily_limit.sql 20261020050000_career_apply_daily_limit.sql 20261020060000_career_apply_questions.sql
20261020060000_career_apply_questions.sql 20261020070000_career_apply_questions_ai_policy.sql 20261020070000_career_apply_questions_ai_policy.sql
20261020100000_career_mail_tracking.sql 20261020100000_career_mail_tracking.sql 20261020110000_career_connector.sql
20261020110000_career_connector.sql 20261020120000_career_events.sql 20261020120000_career_events.sql
20261020130000_career_resume_tailoring.sql 20261020130000_career_resume_tailoring.sql 20261021070000_channel_parity.sql
20261021070000_channel_parity.sql 20261021030000_career_hired_backgrounds.sql 20261021030000_career_hired_backgrounds.sql
20261021075000_career_apply_ops.sql 20261021075000_career_apply_ops.sql 20261021110000_career_board_state.sql
20261021110000_career_board_state.sql 20261021000000_career_apply_extension.sql 20261021000000_career_apply_extension.sql
20261021120000_career_apply_form_answers.sql 20261021120000_career_apply_form_answers.sql 20261022100000_career_apply_wanted.sql
20261022100000_career_apply_wanted.sql 20261022110000_career_postings_pay.sql 20261022110000_career_postings_pay.sql
20261022120500_career_deploy_ledger.sql 20261022120500_career_deploy_ledger.sql
""".split()
PENDING="""
20261011040000_model_health_and_turn_costs.sql 20261011050000_broker_vault_cascade.sql 20261011060000_proactive.sql
20261012010000_manual_connections.sql 20261012020000_standing_payments.sql 20261012030000_saved_recipient_nicknames.sql
20261012040000_category_rules.sql 20261012050000_ious.sql 20261012060000_oauth_vault_cascade.sql
20261015010000_career_knowledge_base.sql 20261015020000_career_watch_kv.sql 20261015234000_career_task_intents_v1.sql
20261016010000_career_batch_intents_v1.sql 20261016120000_career_account_stated_facts.sql 20261019000000_channel_threads.sql
20261019000001_career_postings.sql 20261019010000_channel_pending_approvals.sql 20261019010001_career_alerts.sql
20261019020001_channel_delivery.sql 20261019030000_channel_inbound.sql 20261020000000_channel_artifacts.sql
20261020000001_career_apply_jobs.sql 20261020010000_career_apply_own_worker.sql 20261020020000_career_apply_receipts.sql
20261020030000_career_apply_cards.sql 20261020040000_career_apply_card_push.sql 20261020050000_career_apply_daily_limit.sql
20261020060000_career_apply_questions.sql 20261020070000_career_apply_questions_ai_policy.sql 20261020100000_career_mail_tracking.sql
20261020110000_career_connector.sql 20261020120000_career_events.sql 20261020120100_career_events_erase.sql
20261020130000_career_resume_tailoring.sql 20261021000000_career_apply_extension.sql 20261021010000_career_outreach.sql
20261021020000_career_voice_mock.sql 20261021030000_career_hired_backgrounds.sql 20261021050000_career_brief_digest.sql
20261021070000_channel_parity.sql 20261021075000_career_apply_ops.sql 20261021080000_career_apply_cloud.sql
20261021090000_career_mail_erase.sql 20261021100000_career_proactive_last_word.sql 20261021110000_career_board_state.sql
20261021120000_career_apply_form_answers.sql 20261021130000_career_mail_model_calls.sql 20261021220430_career_apply_message_cards.sql
20261022100000_career_apply_wanted.sql 20261022110000_career_postings_pay.sql 20261022120000_career_control_state.sql
20261022120500_career_deploy_ledger.sql 20261022150000_career_apply_authority.sql 20261023100000_career_events_apply_queued.sql
20261024090000_career_apply_agent_submit.sql 20261024100000_career_apply_agent_contract.sql 20261024110000_career_apply_cloud_ask.sql
20261024120000_career_apply_cloud_gate_waiver.sql
""".split()
LATE="""
20261021050000_career_brief_digest.sql 20261021050000_career_brief_digest.sql 20261022150000_career_apply_authority.sql
20261022150000_career_apply_authority.sql 20261021020000_career_voice_mock.sql 20261021020000_career_voice_mock.sql
20261021010000_career_outreach.sql 20261021050000_career_brief_digest.sql 20261021070000_channel_parity.sql
20261021075000_career_apply_ops.sql 20261021075000_career_apply_ops.sql 20261021080000_career_apply_cloud.sql
20261021080000_career_apply_cloud.sql 20261021090000_career_mail_erase.sql 20261021100000_career_proactive_last_word.sql
20261022120000_career_control_state.sql 20261022120000_career_control_state.sql 20261023100000_career_events_apply_queued.sql
20261023100000_career_events_apply_queued.sql 20261024090000_career_apply_agent_submit.sql 20261024090000_career_apply_agent_submit.sql
20261024100000_career_apply_agent_contract.sql 20261024100000_career_apply_agent_contract.sql 20261024110000_career_apply_cloud_ask.sql
20261024110000_career_apply_cloud_ask.sql 20261024120000_career_apply_cloud_gate_waiver.sql 20261024120000_career_apply_cloud_gate_waiver.sql
""".split()
PLAN_SHA256="2c2cff0a1a6f32185a85969ddff6ce3a7d2fc85e368ed32700e32aadc2f7187d"

def digest(data):
    return hashlib.sha256(data).hexdigest()


def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"


def reviewed_database_name(value):
    return re.fullmatch(r'(?:qa_card_cloud|cc_qa)_[a-z0-9_]{1,40}',value) is not None


def output_inside_source(targets,roots):
    return any(root==target or root in target.parents for root in roots for target in targets)


class Setup:
    def __init__(self, args):
        self.args, self.nonce = args, uuid.uuid4().hex
        self.env = {k:v for k,v in os.environ.items() if not k.startswith(("PG","GIT"))}
        self.env.update(LC_ALL="C", LANG="C", GIT_NO_REPLACE_OBJECTS="1")
        self.records, self.inputs = [], {}
        self.data, self.logs = args.cluster_dir / "data", args.cluster_dir / "logs"

    def git(self, root, *args):
        return subprocess.check_output([str(self.args.git), "-C", str(root), *args], env=self.env)

    def checkout(self, root, pin):
        if self.git(root, "rev-parse", "HEAD").decode().strip() != pin:
            raise ValueError("BLOCKED: source checkout HEAD differs from exact pin")
        if Path(self.git(root,"rev-parse","--show-toplevel").decode().strip()).resolve() != root:
            raise ValueError("BLOCKED: source-root must be the exact checkout top level")
        if self.git(root,"status","--porcelain","--untracked-files=all").strip():
            raise ValueError("BLOCKED: source checkout is not clean")

    def source(self, relative):
        expected = self.git(self.args.baseline_root, "show", PIN + ":" + relative)
        if (self.args.baseline_root / relative).read_bytes() != expected:
            raise ValueError("BLOCKED: pinned source bytes changed: " + relative)
        self.inputs[relative] = {"sha256":digest(expected), "source_pin":PIN}
        return expected

    def prepare(self):
        self.checkout(self.args.baseline_root, PIN)
        if digest(json.dumps(EARLY+PENDING+LATE,separators=(',',':')).encode()) != PLAN_SHA256:
            raise ValueError("BLOCKED: fixed baseline plan changed")
        names = self.git(self.args.baseline_root,"ls-tree","--name-only",PIN+":supabase/migrations").decode().splitlines()
        names = [n for n in names if n.endswith('.sql')]
        if PENDING != [n for n in names if n > BASELINE]:
            raise ValueError("BLOCKED: pinned pending list differs from reviewed fixed manifest")
        blobs = {"tests/db/stubs.sql":self.source("tests/db/stubs.sql")}
        self.source("tests/db/run.sh"); self.source("scripts/launch/apply-rails-and-seed.sh")
        helper = self.source("tests/db/agent_foundation.test.sql").decode()
        for n in names:
            raw = self.source("supabase/migrations/"+n)
            if n in set(EARLY+PENDING+LATE): blobs["supabase/migrations/"+n] = raw
        self.checkout(self.args.up_source_root,self.args.up_source_pin)
        for kind in ('up','down'):
            path=getattr(self.args,kind+'_sql');relative=path.relative_to(self.args.up_source_root).as_posix()
            raw=self.git(self.args.up_source_root,'show',self.args.up_source_pin+':'+relative)
            if path.read_bytes()!=raw or digest(raw)!=getattr(self.args,kind+'_sha256'):
                raise ValueError('BLOCKED: reviewed '+kind+' pin/digest mismatch')
            if re.search(r'^\s*\\',raw.decode(),re.M):raise ValueError('migration contains psql meta-command')
            setattr(self,kind+'_raw',raw)
            self.inputs['reviewed-'+kind]={'path':str(path),'source_pin':self.args.up_source_pin,'sha256':digest(raw)}
        self.bridge=self.up_raw if self.args.mode=='bridge' else None
        self.checkout(self.args.acceptance_root,self.args.acceptance_pin)
        self.artifacts={}
        for rel in ('tests/db/pending/career_apply_card_cloud_rollback_driver.py',
            'tests/db/pending/career_apply_card_cloud_rollback.test.sql',
            'tests/db/pending/career_apply_card_cloud.test.sql',
            'tests/db/pending/career_apply_card_cloud_lifecycle.test.sql',
            'tests/db/pending/career_apply_card_cloud_daily_cap.test.sql',
            'tests/fixtures/card-cloud-db-20261021/live014-source.sql',
            'tests/fixtures/card-cloud-db-20261021/rollback-seed.sql',
            'tests/fixtures/card-cloud-db-20261021/fixture.sql'):
            raw=self.git(self.args.acceptance_root,'show',self.args.acceptance_pin+':'+rel)
            path=self.args.acceptance_root/rel
            if path.read_bytes()!=raw:raise ValueError('BLOCKED: acceptance artifact changed: '+rel)
            self.artifacts[Path(rel).name]=path
            self.inputs['acceptance:'+rel]={'source_pin':self.args.acceptance_pin,'sha256':digest(raw)}
        # All source guards precede initdb, server start, database mutation, and output-directory creation.
        self.args.cluster_dir.mkdir(mode=0o700)
        self.args.socket_dir.mkdir(mode=0o700)
        self.logs.mkdir(mode=0o700)
        self.snapshot = self.args.cluster_dir / "verified-sql";self.snapshot.mkdir(mode=0o700)
        self.files = {}
        for rel,raw in blobs.items():
            dest=self.snapshot/Path(rel).name;dest.write_bytes(raw);self.files[rel]=dest
        self.expected = {str(p):digest(p.read_bytes()) for p in self.files.values()}
        self.helpers=self.write("baseline-helpers.sql","create schema t;\n"+"\n".join(
            self.function(helper,n) for n in ("t.as_user","t.must_fail","t.ok"))+
            "\ngrant usage on schema t to anon,authenticated,service_role;\n"
            "grant execute on all functions in schema t to anon,authenticated,service_role;\n"
            "grant create on schema t to authenticated;\n")
        self.guard=self.write("guard.sql",self.guard_sql())
        self.control=self.write("create-owned-db.sql", "\\set ON_ERROR_STOP on\nselect current_database()='postgres' and inet_server_addr() is null as owned \\gset\n"
            "\\if :owned\n\\else\n \\quit 3\n\\endif\ncreate database \""+self.args.dbname+"\";\n"
            "alter database \""+self.args.dbname+"\" set upmore.test.disposable="+quoted(self.args.marker)+";\n"
            "alter database \""+self.args.dbname+"\" set upmore.qa.run_nonce="+quoted(self.nonce)+";\n")
        ddl="create table if not exists public.upmore_migration_ledger(filename text primary key, sha256 text not null, applied_at timestamptz not null default now()); alter table public.upmore_migration_ledger enable row level security; revoke all on public.upmore_migration_ledger from anon, authenticated;\n"
        rows=lambda subset:",".join("("+quoted(n)+","+quoted(self.inputs['supabase/migrations/'+n]['sha256'])+")" for n in subset)
        self.ledger=self.write("baseline-ledger.sql",ddl+"insert into public.upmore_migration_ledger(filename,sha256) values "+rows([n for n in names if n<=BASELINE])+" on conflict do nothing;\n")
        self.ledger_steps={n:self.write("ledger-"+n,"insert into public.upmore_migration_ledger(filename,sha256) values "+rows([n])+" on conflict do nothing;\n") for n in PENDING}
        self.final=self.write("final-off-check.sql","do $$ begin if public.career_apply_cloud_enabled() or public.career_apply_agent_submit_enabled() then raise exception 'switches not OFF'; end if; if exists(select 1 from public.career_apply_jobs where state='driving') then raise exception 'active drive'; end if; end $$;\n")
        self.up=self.write("reviewed-bridge-up.sql",self.up_raw.decode())
        self.down=self.write("reviewed-bridge-down.sql",self.down_raw.decode())
        self.save("prepared; no PostgreSQL command yet")

    @staticmethod
    def function(source,name):
        found=re.findall(r'^create or replace function\s+'+re.escape(name)+r'\(.*?\$\$.*?\$\$;',source,re.M|re.S|re.I)
        if len(found)!=1:raise ValueError("BLOCKED: exact baseline test helper unavailable: "+name)
        return found[0]

    def write(self,name,body):
        p=self.snapshot/name;p.write_text(body);self.expected[str(p)]=digest(p.read_bytes());return p

    def guard_sql(self):
        return ("\\set ON_ERROR_STOP on\nselect coalesce(current_database()="+quoted(self.args.dbname)+
            " and inet_server_addr() is null and current_setting('upmore.test.disposable',true)="+quoted(self.args.marker)+
            " and current_setting('upmore.qa.run_nonce',true)="+quoted(self.nonce)+",false) as allowed \\gset\n"
            "\\if :allowed\n\\else\n \\echo 'BLOCKED: exact newly owned local DB/marker/nonce mismatch'\n \\quit 3\n\\endif\n")

    def save(self,status):
        (self.args.cluster_dir/"setup-manifest.json").write_text(json.dumps({"status":status,"baseline_pin":PIN,
            "fixed_plan_sha256":PLAN_SHA256,"migration_invocations":len(EARLY+PENDING+LATE),"inputs":self.inputs,
            "snapshot_sha256":self.expected,"next_commands":self.next_commands(),"nonce":self.nonce,"database":self.args.dbname,"marker":self.args.marker,
            "data_dir":str(self.data),"socket":str(self.args.socket_dir),"port":self.args.port,"encoding":self.args.encoding,
            "processes":self.records,"cleanup":"retained cluster; stop explicitly then destroy after inspection"},indent=2)+"\n")

    def next_commands(self):
        if self.args.mode=='baseline' and self.args.marker=='card-cloud-rollback':
            return [['python3',str(self.artifacts['career_apply_card_cloud_rollback_driver.py']),
                '--authorize-disposable-db-tests','--authorize-migration-lifecycle','--authorize-synthetic-fixture',
                '--host',str(self.args.socket_dir),'--port',str(self.args.port),'--dbname',self.args.dbname,
                '--username',self.args.username,'--psql',str(self.args.psql),'--up-sql',str(self.up),
                '--down-sql',str(self.down),'--live-source-sql',str(self.artifacts['live014-source.sql']),
                '--seed-sql',str(self.artifacts['rollback-seed.sql']),
                '--checkpoints-sql',str(self.artifacts['career_apply_card_cloud_rollback.test.sql']),
                '--scratch-schema','qa_card_cloud_rollback_'+self.nonce[:12],
                '--log-dir',str(self.args.cluster_dir/'rollback-driver-logs')]]
        if self.args.mode=='bridge':
            names=['career_apply_card_cloud_daily_cap.test.sql'] if self.args.marker=='card-cloud-daily-cap' else [
                'career_apply_card_cloud.test.sql','career_apply_card_cloud_lifecycle.test.sql']
            return [self.psql(self.artifacts[n])[:-2]+['-v','card_cloud_tests_authorized=true',
                '-v','card_cloud_disposable_database='+self.args.dbname,'-f',str(self.artifacts[n])] for n in names]
        return []

    def call(self,label,command):
        if any(x in command for x in ('-1','--single-transaction')):raise ValueError("transaction wrapper forbidden")
        for file,sha in self.expected.items():
            if digest(Path(file).read_bytes())!=sha:raise ValueError("BLOCKED: verified snapshot changed: "+file)
        log=self.logs/(f"{len(self.records):03d}-"+label+".log")
        record={"label":label,"command":command,"log":str(log)};self.records.append(record);self.save("running")
        with log.open('w') as out:
            r=subprocess.run(command,env=self.env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,timeout=self.args.timeout)
        record['exit_code']=r.returncode;self.save("running" if r.returncode==0 else "failed; cluster retained")
        if r.returncode:raise RuntimeError(label+" failed; inspect "+str(log))

    def psql(self,file,db=None):
        return [str(self.args.psql),'-X','-w','-v','ON_ERROR_STOP=1','-h',str(self.args.socket_dir),
            '-p',str(self.args.port),'-U',self.args.username,'-d',db or self.args.dbname,'-f',str(file)]

    def sql(self,label,file):
        self.call('guard-'+label,self.psql(self.guard))
        self.call(label,self.psql(file))  # exactly one -f; reviewed up is never appended to another process

    def run(self):
        self.prepare()
        self.call('initdb',[str(self.args.initdb),'-D',str(self.data),'-U',self.args.username,
            '--auth=trust','--encoding='+self.args.encoding,'--locale=C'])
        self.call('start',[str(self.args.pg_ctl),'-D',str(self.data),'-o',
            "-p "+str(self.args.port)+" -k "+str(self.args.socket_dir)+" -c listen_addresses='' -c unix_socket_permissions=0700",
            '-l',str(self.args.cluster_dir/'postgres.log'),'-w','-t',str(self.args.timeout),'start'])
        self.call('create-owned-db',self.psql(self.control,'postgres'))
        self.sql('stubs',self.files['tests/db/stubs.sql'])
        for i,n in enumerate(EARLY):self.sql('early-'+str(i),self.files['supabase/migrations/'+n])
        self.sql('pinned-ledger-backfill',self.ledger)
        for i,n in enumerate(PENDING):
            self.sql('pending-'+str(i),self.files['supabase/migrations/'+n]);self.sql('ledger-'+str(i),self.ledger_steps[n])
        for i,n in enumerate(LATE):self.sql('late-'+str(i),self.files['supabase/migrations/'+n])
        self.sql('baseline-test-helpers',self.helpers)
        self.sql('baseline-off-check',self.final)
        if self.bridge is not None:self.sql('reviewed-up',self.up);self.sql('bridge-off-check',self.final)
        self.save('bootstrap completed; SQL acceptance tests NOT_RUN; cluster retained')


def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    for flag in ('new-disposable-cluster','baseline-bootstrap'):
        p.add_argument('--authorize-'+flag,action='store_true',required=True)
    for name in ('baseline-root','cluster-dir','socket-dir','dbname','username','git','initdb','pg-ctl','psql',
                 'acceptance-root','acceptance-pin','up-source-root','up-source-pin','up-sql','up-sha256','down-sql','down-sha256'):
        p.add_argument('--'+name,required=True)
    p.add_argument('--mode',choices=('baseline','bridge'),required=True)
    p.add_argument('--marker',choices=('card-cloud-rollback','card-cloud-daily-cap','card-cloud-tests'),required=True)
    p.add_argument('--encoding',choices=('UTF8','SQL_ASCII'),required=True)
    p.add_argument('--port',type=int,required=True);p.add_argument('--timeout',type=int,default=60)
    p.add_argument('--authorize-reviewed-up',action='store_true')
    a=p.parse_args()
    if not reviewed_database_name(a.dbname):p.error('explicit reviewed QA database name required')
    if not re.fullmatch(r'[a-z_][a-z0-9_]*',a.username) or a.username in ('anon','authenticated','service_role'):p.error('invalid bootstrap owner')
    if not 0<a.port<65536 or not 0<a.timeout<=60:p.error('invalid port/timeout')
    for name in ('baseline_root','cluster_dir','socket_dir','git','initdb','pg_ctl','psql'):
        v=Path(getattr(a,name))
        if not v.is_absolute() or not re.fullmatch(r'[A-Za-z0-9_./-]+',str(v)):p.error(name+' needs an explicit absolute simple path')
        setattr(a,name,v.resolve())
    if len(str(a.socket_dir))>80:p.error('socket path too long')
    if a.cluster_dir.exists() or a.socket_dir.exists() or a.cluster_dir==a.socket_dir:p.error('cluster/socket paths must be new and distinct')
    for name in ('git','initdb','pg_ctl','psql'):
        if not getattr(a,name).is_file() or not os.access(getattr(a,name),os.X_OK):p.error(name+' executable unavailable')
    if a.mode=='bridge' and not a.authorize_reviewed_up:p.error('bridge mode needs separate reviewed-up authorization')
    if a.mode=='baseline' and a.authorize_reviewed_up:p.error('baseline mode never applies the reviewed bridge')
    if not all(re.fullmatch(r'[0-9a-f]{40}',getattr(a,n)) for n in ('up_source_pin','acceptance_pin')):p.error('exact source pins required')
    if not all(re.fullmatch(r'[0-9a-f]{64}',getattr(a,n)) for n in ('up_sha256','down_sha256')):p.error('reviewed migration digests required')
    for n in ('up_source_root','up_sql','down_sql','acceptance_root'):
        if not Path(getattr(a,n)).is_absolute():p.error(n+' must be explicit absolute path')
        setattr(a,n,Path(getattr(a,n)).resolve())
    if output_inside_source((a.cluster_dir,a.socket_dir),(a.baseline_root,a.up_source_root,a.acceptance_root)):
        p.error('cluster/socket cannot be inside any baseline/up/acceptance source checkout')
    setup=Setup(a)
    try:setup.run()
    except (ValueError,OSError,RuntimeError,subprocess.SubprocessError) as e:
        if a.cluster_dir.exists() and hasattr(setup,'expected'):setup.save('failed/uncertain; inspect retained logs/cluster')
        p.exit(1,str(e)+'\nNo automatic stop/removal. Inspect retained cluster before explicit cleanup.\n')
    print('Bootstrap complete; cluster retained. Connection and hashes: '+str(a.cluster_dir/'setup-manifest.json'))
    print('Stop explicitly when finished: '+str(a.pg_ctl)+' -D '+str(setup.data)+' -m immediate stop')

if __name__=='__main__':main()
