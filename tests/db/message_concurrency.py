"""Real concurrent PostgreSQL sessions; invoked only inside the disposable DB."""
import json
import subprocess
import sys
import time

PSQL = sys.argv[1:] + ["-t", "-A"]
USER = "99999999-9999-4999-8999-999999999901"
CHANNEL = "99999999-9999-4999-8999-999999999902"
OUTBOX = "99999999-9999-4999-8999-999999999903"


def query(sql):
    return subprocess.run(PSQL + ["-c", sql], capture_output=True, text=True, check=True).stdout.strip()


def race(first_sql, second_sql, first_value, second_value, label):
    # pg_stat_activity proves that worker A has reached the lock-holding sleep;
    # starting B then exercises overlapping transactions rather than assuming
    # startup order from a wall-clock sleep.
    worker = subprocess.Popen(PSQL + ["-c", "begin; set application_name='upmore-message-worker-a'; " + first_sql + "; select pg_sleep(1); commit;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    second = None
    try:
        deadline = time.monotonic() + 5
        while query("select exists(select 1 from pg_stat_activity where application_name='upmore-message-worker-a' and wait_event='PgSleep')") != "t":
            if worker.poll() is not None:
                raise AssertionError("worker A exited before holding its transaction")
            if time.monotonic() >= deadline:
                raise AssertionError("worker A never reached its lock-holding wait")
            time.sleep(0.02)
        second = subprocess.Popen(PSQL + ["-c", second_sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        a, a_error = worker.communicate(timeout=10)
        b, b_error = second.communicate(timeout=10)
        assert worker.returncode == 0, a_error
        assert second.returncode == 0, b_error
        assert a.strip() == first_value, (label, "unexpected first result")
        assert b.strip() == second_value, (label, "unexpected competing result")
        print("  ok   " + label)
    finally:
        if worker.poll() is None:
            worker.kill()
            worker.communicate()
        if second is not None and second.poll() is None:
            second.kill()
            second.communicate()


try:
    query(f"""
        insert into auth.users(id,email) values('{USER}','concurrency@example.com');
        insert into public.profiles(id) values('{USER}');
        insert into public.agent_message_transports(provider,account_key,organization_id,enabled) values('loopmessage','upmore','concurrency-org',true);
        insert into public.agent_message_channels(id,user_id,provider,account_key,contact) values('{CHANNEL}','{USER}','loopmessage','upmore','+13125550000');
    """)
    call = "public.agent_message_ingest('loopmessage','upmore','concurrency-org','+13125550000','concurrent-inbound',repeat('a',64),'What is due?')"
    race(f"select {call}->>'duplicate'", f"select {call}->>'duplicate'", "false", "true", "concurrent webhook deliveries persist one inbox item")
    inbox = json.loads(query(f"select {call}"))["inbox_id"]
    race(f"select public.agent_message_claim('{inbox}') is not null", f"select public.agent_message_claim('{inbox}') is null", "t", "t", "concurrent workers acquire only one processing lease")
    lease = query(f"select lease_token from public.agent_message_inbox where id='{inbox}'")
    race(f"select public.agent_message_turn_begin('{inbox}','{lease}')->>'ready'", f"select public.agent_message_turn_begin('{inbox}','{lease}')->>'ready'", "true", "false", "concurrent brain requests start only one financial turn")
    query(f"""
        insert into public.agent_threads(id,user_id,title) values('{OUTBOX}','{USER}','Concurrent turn');
        select public.agent_message_turn_finish('{inbox}','{lease}',200,'{{"thread_id":"{OUTBOX}","reply":"Your review is ready."}}','["Your review is ready."]');
        update public.agent_message_outbox set id='{OUTBOX}' where inbox_id='{inbox}';
    """)
    race(f"select public.agent_message_begin_delivery('{OUTBOX}') is not null", f"select public.agent_message_begin_delivery('{OUTBOX}') is null", "t", "t", "concurrent send workers create only one submission marker")
    query(f"insert into public.agent_usage(user_id,model) select '{USER}','legacy' from generate_series(1,899)")
    first = f"public.agent_model_call_reserve('{USER}','{OUTBOX}',gen_random_uuid(),0,'model')"
    second = f"public.agent_model_call_reserve('{USER}','{OUTBOX}',gen_random_uuid(),0,'model')"
    race(f"select {first}->>'ok'", f"select {second}->>'state'", "true", "monthly_limit", "concurrent model requests cannot both spend the final monthly slot")
    # Two $60 refunds race against one $100 original expense. The loser must
    # observe the committed first refund and retain no accepted review.
    batch = {"ok": True, "fetched_at": query("select now()"), "errors": [],
             "accounts": [{"provider": "simplefin", "provider_account_id": "race", "account_id": "simplefin:race", "name": "Synthetic checking",
                           "currency": "USD", "account_kind": "checking", "balance_cents": 100000, "available_cents": 100000}],
             "transactions": [{"account_id": "simplefin:race", "provider_transaction_id": name, "currency": "USD", "amount_cents": amount,
                               "posted_on": query("select current_date"), "merchant_raw": "Synthetic merchant", "merchant_key": "synthetic", "is_pending": False, "is_transfer": False}
                              for name, amount in [("original", -10000), ("refund-one", 6000), ("refund-two", 6000)]]}
    query(f"insert into public.simplefin_connections(user_id) values('{USER}'); select public.agent_financial_ingest('{USER}','{json.dumps(batch)}'::jsonb)")
    auth = f"set local role authenticated; set local request.jwt.claim.sub='{USER}'; "
    original = "jsonb_build_object('account_id','simplefin:race','transaction_id','original','fact_hash',(select fact_hash from public.agent_financial_transactions where provider_transaction_id='original'),'kind','expense','category','Shopping')"
    query("begin; " + auth + f"select public.agent_transaction_review(gen_random_uuid(),{original}); commit;")
    query("""
      create schema concurrency_fixture;
      grant usage on schema concurrency_fixture to authenticated;
      create function concurrency_fixture.refund(id text) returns text language plpgsql as $$
      begin
        perform public.agent_transaction_review(gen_random_uuid(),jsonb_build_object(
          'account_id','simplefin:race','transaction_id',id,'kind','refund',
          'fact_hash',(select fact_hash from public.agent_financial_transactions where provider_transaction_id=id),
          'linked_account_id','simplefin:race','linked_transaction_id','original',
          'linked_fact_hash',(select fact_hash from public.agent_financial_transactions where provider_transaction_id='original')));
        return 'accepted';
      exception when others then
        if sqlerrm <> 'refund exceeds original expense' then raise; end if;
        return 'blocked';
      end $$;
      grant execute on function concurrency_fixture.refund(text) to authenticated;
    """)
    race(auth + "select concurrency_fixture.refund('refund-one')", "begin; " + auth + "select concurrency_fixture.refund('refund-two'); commit",
         "accepted", "blocked", "concurrent refund reviews cannot exceed the original expense")
    assert query(f"select count(*) from public.agent_transaction_reviews where user_id='{USER}' and kind='refund'") == "1"
    # Two browser retries with one approved pair ID must commit one pair,
    # not append another review to either leg when the first worker finishes.
    query(f"""
      insert into public.agent_financial_accounts(user_id,account_id,provider,provider_account_id,name,currency,fetched_at)
      values('{USER}','simplefin:savings','simplefin','savings','Synthetic savings','USD',now());
      insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
      values('{USER}','simplefin:race','pair-out','USD',-1000,current_date,'Synthetic transfer','synthetic',false,now()),
            ('{USER}','simplefin:savings','pair-in','USD',1000,current_date,'Synthetic transfer','synthetic',false,now());
    """)
    pair = {"account_id": "simplefin:race", "transaction_id": "pair-out", "kind": "internal_transfer",
            "fact_hash": query(f"select fact_hash from public.agent_financial_transactions where user_id='{USER}' and provider_transaction_id='pair-out'"),
            "linked_account_id": "simplefin:savings", "linked_transaction_id": "pair-in",
            "linked_fact_hash": query(f"select fact_hash from public.agent_financial_transactions where user_id='{USER}' and provider_transaction_id='pair-in'")}
    paired = f"public.agent_transaction_review_pair('{OUTBOX}','{json.dumps(pair)}'::jsonb)"
    race(auth + f"select {paired}->'review'->>'review_revision'", "begin; " + auth + f"select {paired}->'review'->>'review_revision'; commit",
         "1", "1", "concurrent pair retries persist one review on each leg")
    assert query(f"select count(*) from public.agent_transaction_reviews where user_id='{USER}' and kind='internal_transfer'") == "2"
    assert query(f"select count(*) from public.agent_transaction_review_pairs where user_id='{USER}'") == "1"
    # Exact response-loss retries serialize on the owner/obligation locks.
    # A competing tab with another request ID must observe the new revision.
    bill = "99999999-9999-4999-8999-999999999910"
    request_one = "99999999-9999-4999-8999-999999999911"
    request_two = "99999999-9999-4999-8999-999999999912"
    rejected_request = "99999999-9999-4999-8999-999999999913"
    query(f"""
      insert into public.agent_settings(user_id) values('{USER}') on conflict(user_id) do nothing;
      insert into public.agent_obligations(id,user_id,source_key,creditor,kind,status,source_type,amount_due_cents,due_on,autopay)
      values('{bill}','{USER}','concurrency:bill-edit','Synthetic rent','rent','verified','user',2000,current_date+1,'off');
      create function concurrency_fixture.bill_fields(amount bigint) returns jsonb language sql as $$
        select jsonb_build_object('creditor','Synthetic edited rent','kind','rent','direction','payable','currency','USD',
          'amount_due_cents',amount,'due_on',(current_date+2)::text,'autopay','off')
      $$;
      create function concurrency_fixture.try_bill_edit(request_id uuid,expected_revision integer,amount bigint)
      returns text language plpgsql as $$
      begin
        perform public.agent_obligation_edit(request_id,'{bill}',expected_revision,concurrency_fixture.bill_fields(amount));
        return 'edited';
      exception when others then
        if sqlerrm <> 'bill changed; reload the current version' then raise;end if;
        return 'stale';
      end $$;
      grant execute on function concurrency_fixture.bill_fields(bigint),concurrency_fixture.try_bill_edit(uuid,integer,bigint) to authenticated;
    """)
    edit = f"public.agent_obligation_edit('{request_one}','{bill}',1,concurrency_fixture.bill_fields(2500))"
    race(auth + f"select {edit}->>'replay'", "begin; " + auth + f"select {edit}->>'replay'; commit",
         "false", "true", "concurrent exact bill edit retries create one revision and one receipt")
    assert query(f"select revision::text||':'||amount_due_cents::text from public.agent_obligations where id='{bill}'") == "2:2500"
    assert query(f"select count(*) from public.agent_obligation_edits where user_id='{USER}' and obligation_id='{bill}'") == "1"
    race(auth + f"select concurrency_fixture.try_bill_edit('{request_two}',2,3300)",
         "begin; " + auth + f"select concurrency_fixture.try_bill_edit('{rejected_request}',2,4400); commit",
         "edited", "stale", "concurrent different bill edit requests reject the stale tab without overwriting")
    assert query(f"select revision::text||':'||amount_due_cents::text from public.agent_obligations where id='{bill}'") == "3:3300"
    assert query(f"select count(*) from public.agent_obligation_edits where user_id='{USER}' and obligation_id='{bill}'") == "2"
    assert query(f"select count(*) from public.agent_obligation_edits where user_id='{USER}' and request_id='{rejected_request}'") == "0"
    assert query(f"select count(*) from public.agent_workflow_events where user_id='{USER}' and obligation_id='{bill}' and event='user_bill_edited'") == "2"
    # Response-loss retries and overlapping candidate pairs must serialize in
    # real sessions, not merely pass sequential deduplication fixtures.
    query(f"""
      insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
      values('{USER}','simplefin:race','recovery-fee','USD',-3500,current_date,'Overdraft fee','bank-fee',false,now());
      insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
      select '{USER}','simplefin:race','recover-pair-'||n,'USD',-1500,current_date,'Synthetic shop','synthetic-shop',false,now() from generate_series(1,3) n;
      create function concurrency_fixture.recovery_refs(ids text[]) returns jsonb language sql as $$
        select jsonb_agg(jsonb_build_object('account_id',account_id,'transaction_id',provider_transaction_id,'fact_hash',fact_hash) order by provider_transaction_id)
        from public.agent_financial_transactions where user_id=auth.uid() and provider_transaction_id=any(ids)
      $$;
      create function concurrency_fixture.try_recovery_pair(ids text[]) returns text language plpgsql as $$
      begin
        perform public.agent_recovery_case_open(gen_random_uuid(),'duplicate_charge',concurrency_fixture.recovery_refs(ids));
        return 'opened';
      exception when others then
        if sqlerrm <> 'active recovery case already covers source transaction' then raise;end if;
        return 'blocked';
      end $$;
      grant execute on function concurrency_fixture.recovery_refs(text[]),concurrency_fixture.try_recovery_pair(text[]) to authenticated;
    """)
    recovery_request = "99999999-9999-4999-8999-999999999920"
    recovery = f"public.agent_recovery_case_open('{recovery_request}','bank_fee',concurrency_fixture.recovery_refs(array['recovery-fee']))"
    race(auth + f"select {recovery}->>'replay'", "begin; " + auth + f"select {recovery}->>'replay'; commit",
         "false", "true", "concurrent unchanged recovery retries persist one case and receipt")
    assert query(f"select count(*) from public.agent_recovery_cases where user_id='{USER}'") == "1"
    assert query(f"select count(*) from public.agent_recovery_receipts where user_id='{USER}'") == "1"
    race(auth + "select concurrency_fixture.try_recovery_pair(array['recover-pair-1','recover-pair-2'])",
         "begin; " + auth + "select concurrency_fixture.try_recovery_pair(array['recover-pair-2','recover-pair-3']); commit",
         "opened", "blocked", "concurrent overlapping recovery candidates cannot create duplicate active claims")
    assert query(f"select count(*) from public.agent_recovery_cases where user_id='{USER}' and kind='duplicate_charge'") == "1"
finally:
    query(f"delete from auth.users where id='{USER}'; delete from public.agent_message_transports where organization_id='concurrency-org';")
    query("drop schema if exists concurrency_fixture cascade")
