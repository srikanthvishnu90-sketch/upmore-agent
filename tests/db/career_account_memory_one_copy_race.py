"""Root cause 3 (20261031050000_career_account_memory_one_copy.sql): two threads of one person save at the same moment.

Session A holds its own thread X (as its save does) and sleeps. Session B holds its own thread Y and saves it: the trigger
wants X. Then A saves X: the trigger wants Y. Without a deterministic, skip-locked pick of the other rows, B waits for A
and A waits for B, and Postgres kills one with a deadlock. With it, B skips X and commits, then A clears Y. Both saves
commit; one copy is left (X, the last save). Invoked only inside the disposable DB by tests/db/run.sh."""
import subprocess
import sys
import time

PSQL = sys.argv[1:] + ["-t", "-A"]
USER = "00000000-0000-4000-8000-00000000a3e1"
X, Y = "00000000-0000-4000-8000-00000000a3e2", "00000000-0000-4000-8000-00000000a3e3"
STATE = """'{"career":{"account_memory":1,"stores":{"profile":{"facts":[{"id":"f1","status":"confirmed"}]}}}}'::jsonb"""


def query(sql):
    return subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True, check=True).stdout.strip()


def save(thread):
    return f"update public.agent_flow_state set state = {STATE} || jsonb_build_object('n', '{thread}') where thread_id = '{thread}'"


# Setup with triggers off: both threads start holding a stamped copy, as two account-backed threads would mid-change.
query(f"""set session_replication_role = replica;
insert into auth.users(id,email) values('{USER}','one-copy-race@example.test') on conflict do nothing;
insert into public.agent_threads(id,user_id,title) values('{X}','{USER}','x'),('{Y}','{USER}','y');
insert into public.agent_flow_state(thread_id,user_id,state) values('{X}','{USER}',{STATE}),('{Y}','{USER}',{STATE});
set session_replication_role = origin;""")
assert query(f"select count(*) from public.agent_flow_state where user_id='{USER}' and jsonb_typeof(state#>'{{career,stores,profile,facts}}')='array'") == "2", "setup: both threads hold a copy"
a = b = None
try:
    a = subprocess.Popen(PSQL + ["-c", f"begin; set application_name='upmore-one-copy-a'; select 1 from public.agent_flow_state where thread_id='{X}' for update; select pg_sleep(1.5); {save(X)}; commit;"],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + 5
    while query("select exists(select 1 from pg_stat_activity where application_name='upmore-one-copy-a' and wait_event='PgSleep')") != "t":
        if a.poll() is not None or time.monotonic() >= deadline:
            raise AssertionError("session A never held its own row")
        time.sleep(0.02)
    b = subprocess.Popen(PSQL + ["-c", f"begin; select 1 from public.agent_flow_state where thread_id='{Y}' for update; {save(Y)}; select pg_sleep(0.5); commit;"],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    _, a_err = a.communicate(timeout=20)
    _, b_err = b.communicate(timeout=20)
    assert a.returncode == 0 and "deadlock" not in a_err, ("session A failed", a_err)
    assert b.returncode == 0 and "deadlock" not in b_err, ("session B failed", b_err)
    print("  ok   two threads of one person saving at once: both commit, no deadlock")
    held = query(f"select string_agg(thread_id::text, ',' order by thread_id) from public.agent_flow_state where user_id='{USER}' and jsonb_typeof(state#>'{{career,stores,profile,facts}}')='array'")
    assert held == X, ("one copy is left, the last save's", held)
    print("  ok   one copy is left: the thread that saved last")
finally:
    for p in (a, b):
        if p is not None and p.poll() is None:
            p.kill()
            p.communicate()
    query(f"delete from public.agent_flow_state where user_id='{USER}'; delete from public.agent_threads where user_id='{USER}'; delete from auth.users where id='{USER}'")
