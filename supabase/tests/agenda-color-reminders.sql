begin;
create temporary table agenda_fixture(
 user_id uuid default gen_random_uuid(), plan_id uuid default gen_random_uuid(),
 device_id uuid default gen_random_uuid(), old_device_id uuid default gen_random_uuid()
);
insert into agenda_fixture default values;
insert into auth.users(id,email,email_confirmed_at)
 select user_id,user_id||'@example.invalid',now() from agenda_fixture;
insert into public.daymark_items(id,user_id,title,due_date,due_at,reminder_at,created_at)
 select plan_id,user_id,'Test colour reminders',current_date,now()+interval '179 minutes',
  now()+interval '179 minutes',now()-interval '1 minute' from agenda_fixture;
insert into daymark_private.push_devices(id,user_id,endpoint,subscription)
 select device_id,user_id,'https://fcm.googleapis.com/test/'||device_id,'{"daymark_timing":1}'::jsonb from agenda_fixture
 union all
 select old_device_id,user_id,'https://fcm.googleapis.com/test/'||old_device_id,'{}'::jsonb from agenda_fixture;
do $$
declare
 f agenda_fixture%rowtype;
 stage_name text;
 minutes_left integer;
 job_id uuid;
 claimed jsonb;
begin
 select * into f from agenda_fixture;
 foreach minutes_left in array array[179,59,9] loop
  stage_name:=case minutes_left when 179 then 'green' when 59 then 'yellow' else 'red' end;
  update public.daymark_items set due_at=now()+make_interval(mins=>minutes_left),
   reminder_at=now()+make_interval(mins=>minutes_left) where id=f.plan_id;
  claimed:=daymark_private.push_worker('claim');
  select (entry->>'id')::uuid into job_id from jsonb_array_elements(claimed) entry
   where entry->>'plan_id'=f.plan_id::text||':'||stage_name;
  if job_id is null then raise exception 'Missing % notification',stage_name;end if;
  if exists(select 1 from daymark_private.push_jobs where plan_id=f.plan_id and device_id=f.old_device_id) then
   raise exception 'An old service worker was queued for a colour alert';
  end if;
  perform daymark_private.push_worker('finish',job_id,201);
  if exists(select 1 from jsonb_array_elements(daymark_private.push_worker('claim')) entry
   where entry->>'plan_id' like f.plan_id::text||'%') then raise exception 'Colour notification claimed twice';end if;
 end loop;
 update public.daymark_items set due_at=null,reminder_at=now()-interval '1 minute' where id=f.plan_id;
 claimed:=daymark_private.push_worker('claim');
 if (select count(*) from jsonb_array_elements(claimed) entry where entry->>'plan_id'=f.plan_id::text)<>2 then
  raise exception 'Date-only due reminder should reach both devices';
 end if;
end $$;
select 'Green, yellow, red, device compatibility, deduplication and date-only reminders passed' as result;
rollback;
