begin;
create temporary table clear_fixture(label text primary key, id uuid default gen_random_uuid());
insert into clear_fixture(label) values ('owner'),('guest'),('single'),('bulk'),('reopened'),('shared');
grant select on clear_fixture to authenticated;

insert into auth.users(id,email,email_confirmed_at)
select id,id||'@example.invalid',now() from clear_fixture where label in ('owner','guest');

insert into public.daymark_items(id,user_id,collaborator_id,title,completed)
select plan.id,owner.id,case when plan.label='shared' then guest.id end,plan.label,plan.label<>'reopened'
from clear_fixture plan,clear_fixture owner,clear_fixture guest
where owner.label='owner' and guest.label='guest'
  and plan.label in ('single','bulk','reopened','shared');

select set_config('request.jwt.claim.sub',(select id::text from clear_fixture where label='guest'),true);
set local role authenticated;
do $$
begin
  if jsonb_array_length(public.daymark_clear_completed(
       array(select id from clear_fixture where label='shared'),'CLEAR'))<>0 then
    raise exception 'Collaborator could clear the shared plan.';
  end if;
end
$$;
reset role;

select set_config('request.jwt.claim.sub',(select id::text from clear_fixture where label='owner'),true);
set local role authenticated;
do $$
declare
  selected uuid[];
  removed jsonb;
  phrase text;
begin
  selected:=array(select id from clear_fixture where label='single');
  foreach phrase in array array['','clear','CLEAR ',null]::text[] loop
    begin
      perform public.daymark_clear_completed(selected,phrase);
      raise exception 'Incorrect phrase allowed.';
    exception when invalid_parameter_value then
      null;
    end;
  end loop;

  removed:=public.daymark_clear_completed(selected,'CLEAR');
  if jsonb_array_length(removed)<>1 or removed->0->>'title'<>'single' then
    raise exception 'Single clear returned unexpected rows.';
  end if;
  if not exists (select 1 from public.daymark_items where id=(select id from clear_fixture where label='bulk')) then
    raise exception 'Single clear removed an unselected plan.';
  end if;

  removed:=public.daymark_clear_completed(array(select id from clear_fixture),'CLEAR');
  if jsonb_array_length(removed)<>2 then
    raise exception 'Bulk clear returned unexpected rows.';
  end if;
  if not exists (select 1 from public.daymark_items where id=(select id from clear_fixture where label='reopened')) then
    raise exception 'Bulk clear removed an open plan.';
  end if;
end
$$;
reset role;

select 'Exact phrase, single and bulk clears, open-plan protection and ownership passed' as result;
rollback;
