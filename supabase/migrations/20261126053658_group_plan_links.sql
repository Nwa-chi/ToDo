create table daymark_private.plan_links (
  plan_id uuid primary key references public.daymark_items(id) on delete cascade,
  token text not null unique check (token ~ '^[a-f0-9]{64}$')
);
create table daymark_private.plan_members (
  plan_id uuid not null references public.daymark_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (plan_id, user_id)
);
create index plan_members_user on daymark_private.plan_members(user_id, plan_id);
alter table daymark_private.plan_links enable row level security;
alter table daymark_private.plan_members enable row level security;
revoke all on daymark_private.plan_links, daymark_private.plan_members from public, anon, authenticated;

create function daymark_private.is_plan_member(p_plan uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from daymark_private.plan_members
    where plan_id=p_plan and user_id=(select auth.uid())
  )
$$;
revoke all on function daymark_private.is_plan_member(uuid) from public, anon;
grant execute on function daymark_private.is_plan_member(uuid) to authenticated;

alter policy read_shared_verified on public.daymark_items using (
  (select daymark_private.verified_account()) and
  ((select auth.uid()) in (user_id, collaborator_id) or daymark_private.is_plan_member(id))
);

create function daymark_private.group_share(p_action text, p_plan uuid, p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  plan public.daymark_items;
  link_token text;
begin
  if not daymark_private.verified_account() then
    raise exception 'Verify your email first';
  end if;

  if p_action='join' then
    if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
      raise exception 'This plan link is invalid or has been disabled';
    end if;
    select i.* into plan
      from daymark_private.plan_links l
      join public.daymark_items i on i.id=l.plan_id
      where l.token=p_token for update of i;
    -- Recheck after locking the plan so a disabled link cannot be redeemed.
    if plan.id is null or not exists (
      select 1 from daymark_private.plan_links where plan_id=plan.id and token=p_token
    ) or not exists (
      select 1 from auth.users where id=plan.user_id and deleted_at is null
        and (banned_until is null or banned_until<now())
    ) then
      raise exception 'This plan link is invalid or has been disabled';
    end if;
    if actor<>plan.user_id then
      insert into daymark_private.plan_members(plan_id,user_id)
        values(plan.id,actor) on conflict do nothing;
    end if;
    return jsonb_build_object('plan_id',plan.id);
  end if;

  if p_action='leave' then
    select * into plan from public.daymark_items
      where id=p_plan and (collaborator_id=actor or daymark_private.is_plan_member(id))
      for update;
    if plan.id is null or plan.user_id=actor then raise exception 'Plan unavailable'; end if;
    delete from daymark_private.plan_members where plan_id=p_plan and user_id=actor;
    update public.daymark_items set collaborator_id=null where id=p_plan and collaborator_id=actor;
    return '{}'::jsonb;
  end if;

  select * into plan from public.daymark_items where id=p_plan and user_id=actor for update;
  if plan.id is null then raise exception 'Only the owner can manage sharing'; end if;

  case p_action
    when 'status' then null;
    when 'create' then
      insert into daymark_private.plan_links(plan_id,token)
        values(p_plan,encode(extensions.gen_random_bytes(32),'hex'))
        on conflict (plan_id) do nothing;
    when 'disable' then
      delete from daymark_private.plan_links where plan_id=p_plan;
    when 'remove_members' then
      delete from daymark_private.plan_links where plan_id=p_plan;
      delete from daymark_private.plan_members where plan_id=p_plan;
    else raise exception 'Invalid sharing action';
  end case;
  select token into link_token from daymark_private.plan_links where plan_id=p_plan;
  return jsonb_build_object('token',link_token,'member_count',(
    select count(*) from daymark_private.plan_members where plan_id=p_plan
  ));
end
$$;
revoke all on function daymark_private.group_share(text,uuid,text) from public, anon;
grant execute on function daymark_private.group_share(text,uuid,text) to authenticated;

create function public.daymark_group_share(p_action text, p_plan uuid default null, p_token text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select daymark_private.group_share(p_action,p_plan,p_token)
$$;
revoke all on function public.daymark_group_share(text,uuid,text) from public, anon;
grant execute on function public.daymark_group_share(text,uuid,text) to authenticated;

-- Apply the same reminder rules to each signed-up member's subscribed devices.
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
