alter table daymark_private.invitations add column id uuid not null default gen_random_uuid() unique;
alter table daymark_private.invitations add column recipient_id uuid references auth.users(id) on delete cascade;
alter table daymark_private.invitations add column created_at timestamptz not null default now();
create index invitations_recipient on daymark_private.invitations(recipient_id,expires_at);
create table daymark_private.invite_rate(user_id uuid primary key references auth.users(id) on delete cascade,window_start timestamptz not null default now(),attempts int not null default 0);
alter table daymark_private.invite_rate enable row level security;
revoke all on daymark_private.invite_rate from public,anon,authenticated;
create function daymark_private.addressed_invitation(p_action text,p_plan uuid default null,p_email text default null,p_invitation uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare plan public.daymark_items; recipient uuid; invitation daymark_private.invitations; attempts_now int;
begin
 if not daymark_private.verified_account() then raise exception 'Verify your email first'; end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(row_to_json(q)) from (
   select v.id,i.title,u.email as sender_email,v.expires_at from daymark_private.invitations v join public.daymark_items i on i.id=v.plan_id join auth.users u on u.id=i.user_id
   where v.recipient_id=auth.uid() and v.expires_at>now() and i.collaborator_id is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()) order by v.created_at desc limit 100
  ) q),'[]'::jsonb);
 elsif p_action='send' then
  if p_email is null or length(p_email)>254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address';end if;
  select * into plan from public.daymark_items where id=p_plan and user_id=auth.uid() for update;
  if plan.id is null then raise exception 'Only the owner can invite someone';end if;
  if plan.collaborator_id is not null then raise exception 'This plan already has two people';end if;
  insert into daymark_private.invite_rate(user_id,attempts) values(auth.uid(),1) on conflict(user_id) do update set attempts=case when daymark_private.invite_rate.window_start<now()-interval '1 hour' then 1 else daymark_private.invite_rate.attempts+1 end,window_start=case when daymark_private.invite_rate.window_start<now()-interval '1 hour' then now() else daymark_private.invite_rate.window_start end returning attempts into attempts_now;
  if attempts_now>10 then raise exception 'Please wait before sending more invitations';end if;
  select id into recipient from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<now()) limit 1;
  -- Identical response for missing accounts prevents account-directory enumeration.
  if recipient is null or recipient=auth.uid() then return jsonb_build_object('requested',true);end if;
  delete from daymark_private.invitations where plan_id=plan.id;
  insert into daymark_private.invitations(plan_id,code_hash,expires_at,recipient_id) values(plan.id,encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex'),now()+interval '24 hours',recipient);
  return jsonb_build_object('requested',true);
 elsif p_action in('accept','decline') then
  select * into invitation from daymark_private.invitations where id=p_invitation and recipient_id=auth.uid() and expires_at>now();
  if invitation.id is null then raise exception 'Invitation expired or no longer available';end if;
  select * into plan from public.daymark_items where id=invitation.plan_id for update;
  select * into invitation from daymark_private.invitations where id=p_invitation and recipient_id=auth.uid() and expires_at>now() for update;
  if invitation.id is null or plan.id is null or plan.collaborator_id is not null then raise exception 'Invitation expired or no longer available';end if;
  if p_action='accept' then
   if not exists(select 1 from auth.users where id=plan.user_id and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'Plan unavailable';end if;
   update public.daymark_items set collaborator_id=auth.uid() where id=plan.id;
  end if;
  delete from daymark_private.invitations where id=p_invitation;
  return jsonb_build_object('accepted',p_action='accept');
 end if;
 raise exception 'Invalid invitation action';
end $$;
revoke all on function daymark_private.addressed_invitation(text,uuid,text,uuid) from public,anon;
grant execute on function daymark_private.addressed_invitation(text,uuid,text,uuid) to authenticated;
create function public.daymark_invitation(p_action text,p_plan uuid default null,p_email text default null,p_invitation uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select daymark_private.addressed_invitation(p_action,p_plan,p_email,p_invitation) $$;
revoke all on function public.daymark_invitation(text,uuid,text,uuid) from public,anon;
grant execute on function public.daymark_invitation(text,uuid,text,uuid) to authenticated;
create table daymark_private.invite_push_jobs(id uuid primary key default gen_random_uuid(),invitation_id uuid not null references daymark_private.invitations(id) on delete cascade,device_id uuid not null references daymark_private.push_devices(id) on delete cascade,attempts int not null default 0,next_attempt timestamptz not null default now(),sent boolean not null default false,unique(invitation_id,device_id));
alter table daymark_private.invite_push_jobs enable row level security;
revoke all on daymark_private.invite_push_jobs from public,anon,authenticated;
create index invite_push_pending on daymark_private.invite_push_jobs(next_attempt) where not sent;
create function daymark_private.invitation_worker(p_action text,p_job uuid default null,p_status int default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_action='claim' then
  insert into daymark_private.invite_push_jobs(invitation_id,device_id)
   select v.id,d.id from daymark_private.invitations v join daymark_private.push_devices d on d.user_id=v.recipient_id where v.expires_at>now() on conflict do nothing;
  with candidates as (
   select j.id from daymark_private.invite_push_jobs j join daymark_private.invitations v on v.id=j.invitation_id join public.daymark_items i on i.id=v.plan_id
   join daymark_private.push_devices d on d.id=j.device_id join auth.users u on u.id=d.user_id join auth.users owner on owner.id=i.user_id
   where not j.sent and j.attempts<4 and j.next_attempt<=now() and v.expires_at>now() and i.collaborator_id is null and d.user_id=v.recipient_id
   and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<now()) and owner.deleted_at is null and (owner.banned_until is null or owner.banned_until<now())
   order by j.next_attempt limit 50 for update of j skip locked
  ), claimed as (update daymark_private.invite_push_jobs j set attempts=attempts+1,next_attempt=now()+interval '5 minutes' from candidates c where j.id=c.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind','invitation','invitation_id',c.invitation_id,'subscription',d.subscription)),'[]'::jsonb) into result from claimed c join daymark_private.push_devices d on d.id=c.device_id;
  return result;
 elsif p_action='finish' then
  if p_status in(404,410) then delete from daymark_private.push_devices where id=(select device_id from daymark_private.invite_push_jobs where id=p_job);
  else update daymark_private.invite_push_jobs set sent=(p_status between 200 and 299),attempts=case when p_status between 400 and 499 and p_status<>429 then 4 else attempts end where id=p_job;end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Invalid invitation worker action';
end $$;
revoke all on function daymark_private.invitation_worker(text,uuid,int) from public,anon,authenticated;
grant execute on function daymark_private.invitation_worker(text,uuid,int) to service_role;
create function public.daymark_invitation_worker(p_action text,p_job uuid default null,p_status int default null) returns jsonb language sql security invoker set search_path='' as $$ select daymark_private.invitation_worker(p_action,p_job,p_status) $$;
revoke all on function public.daymark_invitation_worker(text,uuid,int) from public,anon,authenticated;
grant execute on function public.daymark_invitation_worker(text,uuid,int) to service_role;

create or replace function daymark_private.share_plan(p_plan uuid,p_action text,p_code text default '') returns text language plpgsql security definer set search_path='' as $$
declare p public.daymark_items; token text;
begin
 if not daymark_private.verified_account() then raise exception 'Verify your email first'; end if;
 if p_action='join' then
  if p_code !~ '^[a-f0-9]{32}$' then raise exception 'Invalid or expired invitation code'; end if;
  select i.* into p from public.daymark_items i join daymark_private.invitations v on v.plan_id=i.id where v.code_hash=encode(extensions.digest(p_code,'sha256'),'hex') and v.expires_at>now() for update of i;
  if p.id is null then raise exception 'Invalid or expired invitation code'; end if;
  -- Recheck after the row lock, including a simultaneous redemption/revocation.
  if not exists(select 1 from daymark_private.invitations v where v.plan_id=p.id and v.code_hash=encode(extensions.digest(p_code,'sha256'),'hex') and v.expires_at>now()) or p.collaborator_id is not null then raise exception 'Invitation already used or revoked'; end if;
  if exists(select 1 from daymark_private.invitations where plan_id=p.id and recipient_id is not null and recipient_id<>auth.uid()) then raise exception 'This invitation belongs to someone else';end if;
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
  delete from daymark_private.invitations where plan_id=p.id;
  insert into daymark_private.invitations(plan_id,code_hash,expires_at) values(p.id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '24 hours');
  return token;
 end if;
 raise exception 'Invalid sharing action';
end $$;
