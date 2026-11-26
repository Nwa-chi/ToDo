alter table daymark_private.push_jobs
  add column stage text not null default 'due'
    check (stage in ('green','yellow','red','due')),
  drop constraint push_jobs_plan_id_device_id_reminder_at_key,
  add unique (plan_id,device_id,reminder_at,stage);

create function daymark_private.agenda_reminder_times(due_at timestamptz, reminder_at timestamptz, timed boolean)
returns table (stage text, alert_at timestamptz, expires_at timestamptz)
language sql immutable set search_path='' as $$
  select v.stage,v.alert_at,v.expires_at
  from (values
    ('green',due_at-interval '3 hours',due_at-interval '1 hour'),
    ('yellow',due_at-interval '1 hour',due_at-interval '10 minutes'),
    ('red',due_at-interval '10 minutes',due_at),
    ('due',reminder_at,reminder_at+interval '24 hours')
  ) as v(stage,alert_at,expires_at)
  where v.stage='due' or coalesce(timed,false)
$$;
revoke all on function daymark_private.agenda_reminder_times(timestamptz,timestamptz,boolean) from public,anon,authenticated;

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
   join daymark_private.push_devices d on d.user_id in(i.user_id,i.collaborator_id)
   join auth.users u on u.id=d.user_id
   cross join lateral daymark_private.agenda_reminder_times(
    i.due_at,i.reminder_at,d.subscription @> '{"daymark_timing":1}'::jsonb
   ) a
   where not i.completed
   and (i.reminder_at between now()-interval '24 hours' and now()
        or i.due_at between now() and now()+interval '3 hours')
   and a.alert_at<=now() and a.expires_at>now()
   and (a.stage='due' or (a.alert_at>now()-interval '5 minutes' and a.alert_at>=i.created_at))
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
   on conflict do nothing;
  with candidates as (
   select j.id from daymark_private.push_jobs j
   join public.daymark_items i on i.id=j.plan_id
   join daymark_private.push_devices d on d.id=j.device_id
   join auth.users u on u.id=d.user_id
   join lateral daymark_private.agenda_reminder_times(
    i.due_at,i.reminder_at,d.subscription @> '{"daymark_timing":1}'::jsonb
   ) a on a.stage=j.stage and a.alert_at=j.reminder_at
   where not j.sent and j.attempts<4 and j.next_attempt<=now() and not i.completed
   and d.user_id in(i.user_id,i.collaborator_id)
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
