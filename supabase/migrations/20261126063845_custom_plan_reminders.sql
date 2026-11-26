alter table public.daymark_items
  add column advance_reminder_at timestamptz,
  add column reminder_lead_days smallint,
  add column reminder_tone text,
  add constraint daymark_advance_before_start check (
    advance_reminder_at is null or (reminder_at is not null and advance_reminder_at < reminder_at)
  ),
  add constraint daymark_reminder_lead_days check (
    reminder_lead_days is null or (reminder_lead_days in (1,2,3,7) and advance_reminder_at is not null)
  ),
  add constraint daymark_reminder_tone check (reminder_tone in ('rise','bell','pulse','steps','fall','signal'));
grant insert(advance_reminder_at,reminder_lead_days,reminder_tone),
  update(advance_reminder_at,reminder_lead_days,reminder_tone) on public.daymark_items to authenticated;
create index daymark_items_advance_reminder on public.daymark_items(advance_reminder_at)
  where not completed and advance_reminder_at is not null;

-- Older installs can reschedule the start without sending the new reminder fields.
create function daymark_private.keep_plan_reminder_valid() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.reminder_at is distinct from old.reminder_at
    and new.advance_reminder_at is not null
    and new.advance_reminder_at is not distinct from old.advance_reminder_at
    and new.reminder_lead_days is not distinct from old.reminder_lead_days
  then
    if new.reminder_lead_days is not null then
      new.advance_reminder_at:=old.advance_reminder_at+(new.reminder_at-old.reminder_at);
    end if;
    if new.reminder_at is null or new.advance_reminder_at>=new.reminder_at then
      new.advance_reminder_at:=null;
      new.reminder_lead_days:=null;
    end if;
  end if;
  return new;
end
$$;
revoke all on function daymark_private.keep_plan_reminder_valid() from public,anon,authenticated;
create trigger keep_plan_reminder_valid before update of reminder_at on public.daymark_items
  for each row execute function daymark_private.keep_plan_reminder_valid();

alter table daymark_private.push_jobs drop constraint push_jobs_stage_check,
  add constraint push_jobs_stage_check check (stage in ('green','yellow','red','due','advance'));

create function daymark_private.plan_notification_times(due_at timestamptz, reminder_at timestamptz, advance_at timestamptz, subscription jsonb)
returns table(stage text,alert_at timestamptz,expires_at timestamptz)
language sql immutable set search_path='' as $$
  with regular as (
    select * from daymark_private.agenda_reminder_times(due_at,reminder_at,due_at is not null and subscription->'daymark_timing' in ('1'::jsonb,'2'::jsonb))
  )
  select * from regular
  union all
  select 'advance',advance_at,least(reminder_at,advance_at+interval '24 hours')
  where subscription @> '{"daymark_timing":2}'::jsonb and advance_at is not null
    and not exists (select 1 from regular where alert_at=advance_at)
$$;
revoke all on function daymark_private.plan_notification_times(timestamptz,timestamptz,timestamptz,jsonb) from public,anon,authenticated;

create or replace function daymark_private.push_worker(p_action text,p_job uuid default null,p_status int default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
 if p_action='config' then
  select jsonb_object_agg(name,decrypted_secret) into answer from vault.decrypted_secrets
  where name in ('daymark_vapid_public','daymark_vapid_private','daymark_push_cron');
  return answer;
 elsif p_action='claim' then
  delete from daymark_private.push_jobs where reminder_at<now()-interval '7 days';
  delete from daymark_private.invitations where expires_at<now();
  insert into daymark_private.push_jobs(plan_id,device_id,reminder_at,stage)
   select i.id,d.id,a.alert_at,a.stage
   from public.daymark_items i
   join lateral (
     select i.user_id
     union select i.collaborator_id
     union select m.user_id from daymark_private.plan_members m where m.plan_id=i.id
   ) members on true
   join daymark_private.push_devices d on d.user_id=members.user_id
   join auth.users u on u.id=d.user_id
   cross join lateral daymark_private.plan_notification_times(
    i.due_at,i.reminder_at,i.advance_reminder_at,d.subscription
   ) a
   where not i.completed
   and (i.reminder_at between now()-interval '24 hours' and now()
        or i.due_at between now() and now()+interval '3 hours'
        or i.advance_reminder_at between now()-interval '24 hours' and now())
   and a.alert_at<=now() and a.expires_at>now()
   and (a.stage='due' or (a.alert_at>=i.created_at
        and (a.stage='advance' or a.alert_at>now()-interval '5 minutes')))
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
   on conflict do nothing;
  with candidates as (
   select j.id from daymark_private.push_jobs j
   join public.daymark_items i on i.id=j.plan_id
   join daymark_private.push_devices d on d.id=j.device_id
   join auth.users u on u.id=d.user_id
   join lateral daymark_private.plan_notification_times(
    i.due_at,i.reminder_at,i.advance_reminder_at,d.subscription
   ) a on a.stage=j.stage and a.alert_at=j.reminder_at
   where not j.sent and j.attempts<4 and j.next_attempt<=now() and not i.completed
   and (d.user_id in(i.user_id,i.collaborator_id) or exists (
     select 1 from daymark_private.plan_members m where m.plan_id=i.id and m.user_id=d.user_id
   ))
   and a.alert_at<=now() and a.expires_at>now()
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
   order by j.next_attempt limit 50 for update of j skip locked
  ), claimed as (
   update daymark_private.push_jobs j set attempts=attempts+1,next_attempt=now()+interval '5 minutes'
   from candidates c where j.id=c.id returning j.*
  )
  -- Reuse the worker's opaque notification tag. The upgraded browser extracts
  -- the plan ID and stage. Unversioned browser subscriptions only get due alerts.
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,
   'plan_id',case when c.stage='due' then c.plan_id::text else c.plan_id::text||':'||c.stage end,
   'subscription',d.subscription
  )),'[]'::jsonb) into answer
  from claimed c join daymark_private.push_devices d on d.id=c.device_id;
  return answer;
 elsif p_action='finish' then
  if p_status in(404,410) then
   delete from daymark_private.push_devices where id=(select device_id from daymark_private.push_jobs where id=p_job);
  else
   update daymark_private.push_jobs
   set sent=(p_status between 200 and 299),
       attempts=case when p_status between 400 and 499 and p_status<>429 then 4 else attempts end
   where id=p_job;
  end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Invalid worker action';
end $$;
