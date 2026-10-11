begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','delivery@example.com');
insert into public.agent_message_transports(provider,account_key,organization_id,enabled) values('loopmessage','upmore','org',true);
insert into public.agent_message_channels(id,user_id,provider,account_key,contact) values('cccccccc-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','loopmessage','upmore','+13125550123');
insert into public.agent_message_inbox(id,user_id,channel_id,provider,account_key,provider_message_id,source_hash,text,state)
values('aaaaaaaa-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111','loopmessage','upmore','inbound',repeat('a',64),'hello','completed');
insert into public.agent_message_outbox(id,user_id,channel_id,inbox_id,ordinal,text) values
('bbbbbbbb-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111',0,'first'),
('bbbbbbbb-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111',1,'second'),
('bbbbbbbb-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000001','cccccccc-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111',2,'third');
select t.as_user('00000000-0000-0000-0000-000000000001');
set role authenticated;
select t.must_fail($$select public.agent_message_begin_delivery('bbbbbbbb-1111-1111-1111-111111111111')$$,'permission denied','client cannot send queued messages directly');
select t.must_fail($$select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','delivered','receipt')$$,'permission denied','client cannot forge a delivery receipt');
reset role;
select t.must_fail($$select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','accepted','receipt')$$,'not submitted','queued reply cannot become accepted without a submission marker');
select t.ok(public.agent_message_begin_delivery('bbbbbbbb-2222-2222-2222-222222222222') is null,'later bubble waits for an earlier provider acceptance');
select public.agent_message_begin_delivery('bbbbbbbb-1111-1111-1111-111111111111');
select t.ok((select state='submitted' and submitted_at is not null from public.agent_message_outbox where ordinal=0),'submission is recorded before a network send');
select t.ok(public.agent_message_begin_delivery('bbbbbbbb-1111-1111-1111-111111111111') is null,'submission cannot begin twice');
select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','unknown');
select t.ok(public.agent_message_begin_delivery('bbbbbbbb-1111-1111-1111-111111111111') is null,'uncertain no-ID outcome cannot be resent');
select t.must_fail($$select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550999','accepted','receipt')$$,'recipient mismatch','another recipient cannot settle the send');
select t.must_fail($$select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','accepted')$$,'receipt required','provider acceptance requires a stable receipt ID');
select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','accepted','receipt-1');
select t.ok((select state='accepted' and delivered_at is null from public.agent_message_outbox where ordinal=0),'accepted response does not claim delivery');
select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','accepted','receipt-1');
select t.ok((select count(*)=2 from public.agent_message_delivery_events),'repeated provider status does not duplicate events');
select t.must_fail($$select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','delivered','other-receipt')$$,'identity changed','original provider receipt cannot be replaced');
select public.agent_message_begin_delivery('bbbbbbbb-2222-2222-2222-222222222222');
select t.must_fail($$select public.agent_message_delivery_result('bbbbbbbb-2222-2222-2222-222222222222','loopmessage','upmore','+13125550123','accepted','receipt-1')$$,'duplicate key','one provider message cannot prove two different sends');
select public.agent_message_delivery_result('bbbbbbbb-2222-2222-2222-222222222222','loopmessage','upmore','+13125550123','failed');
select t.ok((select state='cancelled' from public.agent_message_outbox where ordinal=2),'failed bubble cancels the unsent remainder');
set role authenticated;
select public.agent_message_revoke('cccccccc-1111-1111-1111-111111111111');
reset role;
select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','delivered','receipt-1');
select t.ok((select state='delivered' and delivered_at is not null from public.agent_message_outbox where ordinal=0),'submitted delivery reconciles even after disconnect');
select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','unknown','receipt-1');
select public.agent_message_delivery_result('bbbbbbbb-1111-1111-1111-111111111111','loopmessage','upmore','+13125550123','failed','receipt-1');
select t.ok((select state='delivered' from public.agent_message_outbox where ordinal=0),'late statuses cannot erase a delivered receipt');
select t.ok((select count(*)=4 from public.agent_message_delivery_events where outbox_id='bbbbbbbb-1111-1111-1111-111111111111'),'late contradictory status is retained in history');
select t.ok(public.agent_message_begin_delivery('bbbbbbbb-3333-3333-3333-333333333333') is null,'disconnected channel cannot receive a new send');
rollback;
