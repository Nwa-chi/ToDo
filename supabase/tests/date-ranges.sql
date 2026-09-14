begin;
create temporary table range_fixture as select gen_random_uuid() as owner_id,gen_random_uuid() as plan_id;
grant select on range_fixture to authenticated;
insert into auth.users(id,email,email_confirmed_at) select owner_id,owner_id||'@example.invalid',now() from range_fixture;
select set_config('request.jwt.claim.sub',(select owner_id::text from range_fixture),true);
set local role authenticated;
insert into public.daymark_items(id,title,due_date,end_date) select plan_id,'Date range test','2026-09-14','2026-09-16' from range_fixture;
update public.daymark_items set end_date='2026-09-18' where id=(select plan_id from range_fixture);
do $$ begin
 if not exists(select 1 from public.daymark_items where id=(select plan_id from range_fixture) and end_date='2026-09-18') then raise exception 'Range not saved';end if;
 begin update public.daymark_items set end_date='2026-09-01' where id=(select plan_id from range_fixture);raise exception 'Invalid range accepted';exception when check_violation then null;end;
 begin update public.daymark_items set due_date=null where id=(select plan_id from range_fixture);raise exception 'End without start accepted';exception when check_violation then null;end;
end $$;
reset role;
select 'Verified owner can save and extend a date range; invalid ranges are rejected' as result;
rollback;
