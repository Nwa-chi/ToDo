begin;
do $$
declare
 starts timestamptz:=now()+interval '2 days';
 advance timestamptz:=now()-interval '1 minute';
begin
 if not exists(select 1 from daymark_private.plan_notification_times(starts,starts,advance,'{"daymark_timing":2}') where stage='advance' and alert_at=advance) then
  raise exception 'Updated subscribers should get the configured advance reminder';
 end if;
 if exists(select 1 from daymark_private.plan_notification_times(starts,starts,advance,'{"daymark_timing":1}') where stage='advance') then
  raise exception 'Legacy service workers do not support the advance tag';
 end if;
 if (select count(*) from daymark_private.plan_notification_times(starts,starts,starts-interval '1 hour','{"daymark_timing":2}'))<>4 then
  raise exception 'A custom reminder must not duplicate the yellow reminder';
 end if;
 if (select count(*) from daymark_private.plan_notification_times(null,starts,advance,'{"daymark_timing":2}'))<>2 then
  raise exception 'Date-only plans should retain their start and advance alerts';
 end if;
end $$;
create temporary table fixture(owner_id uuid, plan_id uuid);
insert into fixture values(gen_random_uuid(),gen_random_uuid());
grant select on fixture to authenticated;
insert into auth.users(id,email,email_confirmed_at) select owner_id,owner_id||'@example.invalid',now() from fixture;
select set_config('request.jwt.claim.sub',(select owner_id::text from fixture),true);
insert into public.daymark_items(id,user_id,title,due_date,due_at,reminder_at,advance_reminder_at,reminder_lead_days,reminder_tone,created_at)
select plan_id,owner_id,'Advance reminder',current_date+2,now()+interval '2 days',now()+interval '2 days',now()-interval '1 minute',2,'bell',now()-interval '1 day'
from fixture;
insert into daymark_private.push_devices(user_id,endpoint,subscription)
select owner_id,'https://fcm.googleapis.com/test/'||owner_id,'{"daymark_timing":2}' from fixture;
do $$
declare jobs jsonb:=daymark_private.push_worker('claim');
begin
 if not exists(select 1 from jsonb_array_elements(jobs) j where j->>'plan_id'=(select plan_id::text||':advance' from fixture)) then
   raise exception 'Scheduler failed to claim advance reminder';
 end if;
end $$;
set local role authenticated;
update public.daymark_items set reminder_at=reminder_at+interval '1 day' where id=(select plan_id from fixture);
do $$begin
 if not exists(select 1 from public.daymark_items where id=(select plan_id from fixture) and reminder_lead_days=2 and advance_reminder_at=now()+interval '1 day'-interval '1 minute') then
   raise exception 'Legacy edit should retain the lead interval';
 end if;
end $$;
reset role;
select 'Custom, date-only, legacy compatibility, and advance scheduler tests passed' as result;
rollback;
