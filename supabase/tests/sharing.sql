begin;
create temporary table fixtures(label text primary key,id uuid default gen_random_uuid(),code text);
insert into fixtures(label) values('owner'),('guest'),('third'),('unverified'),('plan');
grant select,update on fixtures to authenticated;
insert into auth.users(id,email,email_confirmed_at) select id,id||'@example.invalid',case when label='unverified' then null else now() end from fixtures where label<>'plan';
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='owner'),true);
set local role authenticated;
insert into public.daymark_items(id,title,reminder_at,due_date) select id,'Sharing security test',now()-interval '1 minute',current_date from fixtures where label='plan';
update fixtures set code=public.daymark_share(id,'invite') where label='plan';
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='unverified'),true);
set local role authenticated;
do $$ begin
 begin perform public.daymark_share(null,'join',(select code from fixtures where label='plan')); raise exception 'TEST: unverified joined'; exception when others then if sqlerrm='TEST: unverified joined' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='guest'),true);
set local role authenticated;
select public.daymark_share(null,'join',(select code from fixtures where label='plan'));
update public.daymark_items set title='Edited by guest',completed=true where id=(select id from fixtures where label='plan');
do $$ declare n int; begin
 if not exists(select 1 from public.daymark_items where title='Edited by guest' and completed) then raise exception 'TEST: guest edit failed'; end if;
 delete from public.daymark_items where id=(select id from fixtures where label='plan');get diagnostics n=row_count;
 if n<>0 then raise exception 'TEST: guest deleted plan'; end if;
 begin update public.daymark_items set collaborator_id=(select id from fixtures where label='third') where id=(select id from fixtures where label='plan');raise exception 'TEST: changed membership directly';exception when insufficient_privilege then null;end;
 begin perform public.daymark_push_worker('config');raise exception 'TEST: exposed worker secret';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='third'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.daymark_items where id=(select id from fixtures where label='plan')) then raise exception 'TEST: third user read plan';end if;
 begin perform public.daymark_share(null,'join',(select code from fixtures where label='plan'));raise exception 'TEST: reused code';exception when others then if sqlerrm='TEST: reused code' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='owner'),true);
set local role authenticated;
select public.daymark_share((select id from fixtures where label='plan'),'revoke');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where label='guest'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.daymark_items where id=(select id from fixtures where label='plan')) then raise exception 'TEST: revoked guest can read';end if;
end $$;
reset role;
select 'Sharing isolation, edit permissions, single-use invitation, revocation and worker isolation passed' as result;
rollback;
