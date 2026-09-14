alter table public.daymark_items add column collaborator_id uuid references auth.users(id) on delete set null;
alter table public.daymark_items add constraint distinct_collaborator check (collaborator_id is distinct from user_id);
alter table public.daymark_items add column reminder_at timestamptz;
-- Old date-only plans have no stored timezone. Use UTC until next edited.
update public.daymark_items set reminder_at=coalesce(due_at,(due_date+time '09:00') at time zone 'UTC');
create index daymark_items_collaborator on public.daymark_items(collaborator_id) where collaborator_id is not null;
create index daymark_items_reminder on public.daymark_items(reminder_at) where not completed;
revoke insert,update on public.daymark_items from authenticated;
grant insert(id,title,description,kind,priority,category,completed,due_date,due_at,duration_minutes,reminder_at) on public.daymark_items to authenticated;
grant update(title,description,kind,priority,category,completed,due_date,due_at,duration_minutes,reminder_at) on public.daymark_items to authenticated;
drop policy read_own_verified on public.daymark_items;
drop policy update_own_verified on public.daymark_items;
create policy read_shared_verified on public.daymark_items for select to authenticated using (((select auth.uid())=user_id or (select auth.uid())=collaborator_id) and (select daymark_private.verified_account()));
create policy update_shared_verified on public.daymark_items for update to authenticated using (((select auth.uid())=user_id or (select auth.uid())=collaborator_id) and (select daymark_private.verified_account())) with check (((select auth.uid())=user_id or (select auth.uid())=collaborator_id) and (select daymark_private.verified_account()));
create table daymark_private.invitations(plan_id uuid primary key references public.daymark_items on delete cascade, code_hash text unique not null, expires_at timestamptz not null);
alter table daymark_private.invitations enable row level security;
revoke all on daymark_private.invitations from public,anon,authenticated;
create function daymark_private.share_plan(p_plan uuid,p_action text,p_code text default '') returns text language plpgsql security definer set search_path='' as $$
declare p public.daymark_items; token text;
begin
 if not daymark_private.verified_account() then raise exception 'Verify your email first'; end if;
 if p_action='join' then
  if p_code !~ '^[a-f0-9]{32}$' then raise exception 'Invalid or expired invitation code'; end if;
  select i.* into p from public.daymark_items i join daymark_private.invitations v on v.plan_id=i.id where v.code_hash=encode(extensions.digest(p_code,'sha256'),'hex') and v.expires_at>now() for update of i;
  if p.id is null then raise exception 'Invalid or expired invitation code'; end if;
  -- Recheck after the row lock, including a simultaneous redemption/revocation.
  if not exists(select 1 from daymark_private.invitations v where v.plan_id=p.id and v.code_hash=encode(extensions.digest(p_code,'sha256'),'hex') and v.expires_at>now()) or p.collaborator_id is not null then raise exception 'Invitation already used or revoked'; end if;
  if p.user_id=auth.uid() then raise exception 'Send this code to the other person'; end if;
  update public.daymark_items set collaborator_id=auth.uid() where id=p.id;
  delete from daymark_private.invitations where plan_id=p.id;
  return p.id::text;
 end if;
 select * into p from public.daymark_items where id=p_plan for update;
 if p.id is null or (p.user_id<>auth.uid() and p.collaborator_id is distinct from auth.uid()) then raise exception 'Plan unavailable'; end if;
 if p_action='leave' and p.collaborator_id=auth.uid() then
  update public.daymark_items set collaborator_id=null where id=p.id; return 'Left plan';
 end if;
 if p.user_id<>auth.uid() then raise exception 'Only the owner can manage sharing'; end if;
 if p_action='revoke' then
  update public.daymark_items set collaborator_id=null where id=p.id;
  delete from daymark_private.invitations where plan_id=p.id; return 'Access removed';
 elsif p_action='invite' then
  if p.collaborator_id is not null then raise exception 'This plan already has two people'; end if;
  token:=encode(extensions.gen_random_bytes(16),'hex');
  insert into daymark_private.invitations values(p.id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '24 hours') on conflict(plan_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
  return token;
 end if;
 raise exception 'Invalid sharing action';
end $$;
revoke all on function daymark_private.share_plan(uuid,text,text) from public,anon;
grant execute on function daymark_private.share_plan(uuid,text,text) to authenticated;
create function public.daymark_share(p_plan uuid,p_action text,p_code text default '') returns text language sql security invoker set search_path='' as $$ select daymark_private.share_plan(p_plan,p_action,p_code) $$;
revoke all on function public.daymark_share(uuid,text,text) from public,anon;
grant execute on function public.daymark_share(uuid,text,text) to authenticated;
create table daymark_private.push_devices(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, endpoint text unique not null, subscription jsonb not null, created_at timestamptz not null default now());
alter table daymark_private.push_devices enable row level security;
create table daymark_private.push_jobs(id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.daymark_items on delete cascade, device_id uuid not null references daymark_private.push_devices on delete cascade, reminder_at timestamptz not null, attempts int not null default 0, next_attempt timestamptz not null default now(), sent boolean not null default false, unique(plan_id,device_id,reminder_at));
alter table daymark_private.push_jobs enable row level security;
revoke all on daymark_private.push_devices,daymark_private.push_jobs from public,anon,authenticated;
create index push_devices_owner on daymark_private.push_devices(user_id);
create index push_jobs_pending on daymark_private.push_jobs(next_attempt) where not sent;
create function daymark_private.push_settings(p_subscription jsonb default null,p_remove text default null) returns text language plpgsql security definer set search_path='' as $$
declare ep text; existing uuid; public_key text;
begin
 if not daymark_private.verified_account() then raise exception 'Verify your email first'; end if;
 if p_remove is not null then delete from daymark_private.push_devices where endpoint=p_remove and user_id=auth.uid(); return 'removed'; end if;
 select decrypted_secret into public_key from vault.decrypted_secrets where name='daymark_vapid_public';
 if public_key is null then raise exception 'Background alerts are not configured yet'; end if;
 if p_subscription is null then return public_key; end if;
 ep:=p_subscription->>'endpoint';
 if ep is null or length(ep)>2048 or ep !~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-z0-9.-]+\.push.apple.com|[a-z0-9.-]+\.notify.windows.com)/[^?#]+$' then raise exception 'Unsupported push service'; end if;
 if coalesce(p_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}=?$' or coalesce(p_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'Invalid notification keys'; end if;
 select user_id into existing from daymark_private.push_devices where endpoint=ep;
 if existing is not null and existing<>auth.uid() then raise exception 'Disable alerts for the previous account on this device first'; end if;
 if existing is null and (select count(*) from daymark_private.push_devices where user_id=auth.uid())>=10 then raise exception 'Maximum ten notification devices per account'; end if;
 insert into daymark_private.push_devices(user_id,endpoint,subscription) values(auth.uid(),ep,p_subscription) on conflict(endpoint) do update set subscription=excluded.subscription where daymark_private.push_devices.user_id=auth.uid();
 return 'enabled';
end $$;
revoke all on function daymark_private.push_settings(jsonb,text) from public,anon;
grant execute on function daymark_private.push_settings(jsonb,text) to authenticated;
create function public.daymark_push_settings(p_subscription jsonb default null,p_remove text default null) returns text language sql security invoker set search_path='' as $$ select daymark_private.push_settings(p_subscription,p_remove) $$;
revoke all on function public.daymark_push_settings(jsonb,text) from public,anon;
grant execute on function public.daymark_push_settings(jsonb,text) to authenticated;
-- These two RPCs are available only to the reminder worker's service role.
create function daymark_private.push_worker(p_action text,p_job uuid default null,p_status int default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
 if p_action='config' then
  select jsonb_object_agg(name,decrypted_secret) into answer from vault.decrypted_secrets where name in ('daymark_vapid_public','daymark_vapid_private','daymark_push_cron'); return answer;
 elsif p_action='claim' then
  delete from daymark_private.push_jobs where reminder_at<now()-interval '7 days';
  delete from daymark_private.invitations where expires_at<now();
  insert into daymark_private.push_jobs(plan_id,device_id,reminder_at)
   select i.id,d.id,i.reminder_at from public.daymark_items i join daymark_private.push_devices d on d.user_id in(i.user_id,i.collaborator_id)
   join auth.users u on u.id=d.user_id
   where not i.completed and i.reminder_at<=now() and i.reminder_at>now()-interval '24 hours'
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()) on conflict do nothing;
  with candidates as (
   select j.id from daymark_private.push_jobs j join public.daymark_items i on i.id=j.plan_id join daymark_private.push_devices d on d.id=j.device_id
   join auth.users u on u.id=d.user_id
   where not j.sent and j.attempts<4 and j.next_attempt<=now() and not i.completed and i.reminder_at=j.reminder_at and d.user_id in(i.user_id,i.collaborator_id)
   and j.reminder_at>now()-interval '24 hours' and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())
   order by j.next_attempt limit 50 for update of j skip locked
  ), claimed as (
   update daymark_private.push_jobs j set attempts=attempts+1,next_attempt=now()+interval '5 minutes' from candidates c where j.id=c.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'plan_id',c.plan_id,'subscription',d.subscription)), '[]'::jsonb) into answer from claimed c join daymark_private.push_devices d on d.id=c.device_id;
  return answer;
 elsif p_action='finish' then
  if p_status in(404,410) then delete from daymark_private.push_devices where id=(select device_id from daymark_private.push_jobs where id=p_job);
  else update daymark_private.push_jobs set sent=(p_status between 200 and 299),attempts=case when p_status between 400 and 499 and p_status<>429 then 4 else attempts end where id=p_job; end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Invalid worker action';
end $$;
revoke all on function daymark_private.push_worker(text,uuid,int) from public,anon,authenticated;
grant usage on schema daymark_private to service_role;
grant execute on function daymark_private.push_worker(text,uuid,int) to service_role;
create function public.daymark_push_worker(p_action text,p_job uuid default null,p_status int default null) returns jsonb language sql security invoker set search_path='' as $$ select daymark_private.push_worker(p_action,p_job,p_status) $$;
revoke all on function public.daymark_push_worker(text,uuid,int) from public,anon,authenticated;
grant execute on function public.daymark_push_worker(text,uuid,int) to service_role;
