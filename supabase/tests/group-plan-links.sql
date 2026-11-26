begin;
create temporary table fixtures(label text primary key, id uuid default gen_random_uuid(), token text);
insert into fixtures(label) values ('owner'),('first'),('second'),('outsider'),('unverified'),('plan');
grant select,update on fixtures to authenticated;
insert into auth.users(id,email,email_confirmed_at)
select id,id||'@example.invalid',case when label='unverified' then null else now() end
from fixtures where label<>'plan';

select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='owner'),true);
set local role authenticated;
insert into public.daymark_items(id,title,description,due_date,due_at,reminder_at)
select id,'Group agenda','Same current agenda',current_date,now()-interval '1 minute',now()-interval '1 minute'
from fixtures where label='plan';
update fixtures set token=public.daymark_group_share('create',id)->>'token' where label='plan';
do $$
declare plan fixtures := (select f from fixtures f where label='plan');
begin
  if public.daymark_group_share('create',plan.id)->>'token' is distinct from plan.token then
    raise exception 'Creating the same link should be idempotent';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='first'),true);
set local role authenticated;
select public.daymark_group_share('join',null,(select token from fixtures where label='plan'));
select public.daymark_group_share('join',null,(select token from fixtures where label='plan'));
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='second'),true);
set local role authenticated;
select public.daymark_group_share('join',null,(select token from fixtures where label='plan'));

do $$
declare plan_id uuid := (select id from fixtures where label='plan');
declare action text;
begin
  if not exists(select 1 from public.daymark_items where id=plan_id and description='Same current agenda') then
    raise exception 'The second member cannot see the plan';
  end if;
  update public.daymark_items set title='Changed',completed=true where id=plan_id;
  if found then raise exception 'Members can update the plan'; end if;
  delete from public.daymark_items where id=plan_id;
  if found then raise exception 'Members can delete the plan'; end if;
  foreach action in array array['status','create','disable','remove_members'] loop
    begin
      perform public.daymark_group_share(action,plan_id);
      raise exception 'Member was allowed to perform %',action;
    exception when raise_exception then
      if sqlerrm<>'Only the owner can manage sharing' then raise; end if;
    end;
  end loop;
end $$;

reset role;
insert into daymark_private.push_devices(user_id,endpoint,subscription)
select id,'https://fcm.googleapis.com/test/'||id,jsonb_build_object('daymark_timing',1)
from fixtures where label in ('first','second','outsider');
do $$
declare jobs jsonb := daymark_private.push_worker('claim');
begin
  if jsonb_array_length(jobs)<>2 then raise exception 'Expected reminders for both group members only'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='unverified'),true);
set local role authenticated;
do $$ begin
  begin
    perform public.daymark_group_share('join',null,(select token from fixtures where label='plan'));
    raise exception 'Unverified user joined';
  exception when raise_exception then if sqlerrm<>'Verify your email first' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='owner'),true);
set local role authenticated;
do $$
declare plan_id uuid := (select id from fixtures where label='plan');
begin
  if (public.daymark_group_share('status',plan_id)->>'member_count')::int<>2 then
    raise exception 'A repeated join created a duplicate membership';
  end if;
  update public.daymark_items set title='Updated agenda' where id=plan_id;
  if not found then raise exception 'Owner cannot edit'; end if;
  perform public.daymark_group_share('disable',plan_id);
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='outsider'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.daymark_items where id=(select id from fixtures where label='plan')) then
    raise exception 'An unrelated account can read the plan';
  end if;
  begin
    perform public.daymark_group_share('join',null,(select token from fixtures where label='plan'));
    raise exception 'Disabled link still works';
  exception when raise_exception then
    if sqlerrm<>'This plan link is invalid or has been disabled' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='first'),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.daymark_items where id=(select id from fixtures where label='plan') and title='Updated agenda') then
    raise exception 'Existing member did not see the updated plan after the link was disabled';
  end if;
  perform public.daymark_group_share('leave',(select id from fixtures where label='plan'));
  if exists(select 1 from public.daymark_items where id=(select id from fixtures where label='plan')) then
    raise exception 'Member who left can still view the plan';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='owner'),true);
set local role authenticated;
select public.daymark_group_share('remove_members',(select id from fixtures where label='plan'));
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='second'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.daymark_items where id=(select id from fixtures where label='plan')) then
    raise exception 'Removed member can still view the plan';
  end if;
end $$;
reset role;
select 'Reusable links, multiple members, owner-only actions, reminders, leaving and revocation passed' as result;
rollback;
