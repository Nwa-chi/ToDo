create schema if not exists daymark_private;
revoke all on schema daymark_private from public, anon;
grant usage on schema daymark_private to authenticated;
create function daymark_private.verified_account() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
 select 1 from auth.users where id=(select auth.uid())
 and email_confirmed_at is not null and deleted_at is null
 and (banned_until is null or banned_until<now()));
$$;
revoke all on function daymark_private.verified_account() from public, anon;
grant execute on function daymark_private.verified_account() to authenticated;
create table public.daymark_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 100),
 description text not null default '' check (char_length(description)<=500),
 kind text not null default 'task' check (kind in ('task','event','occasion')),
 priority text not null default 'medium' check (priority in ('low','medium','high')),
 category text not null default 'Uncategorised' check (char_length(category) between 1 and 30),
 completed boolean not null default false,
 due_date date,
 due_at timestamptz,
 duration_minutes integer check (duration_minutes between 1 and 10080),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 check(due_at is null or due_date is not null),
 check((completed and completed_at is not null) or (not completed and completed_at is null))
);
create index daymark_items_owner_created on public.daymark_items(user_id,created_at desc,id);
create index daymark_items_owner_due on public.daymark_items(user_id,due_date);
create function daymark_private.stamp_plan() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.user_id<>old.user_id then raise exception 'Plan ownership cannot be changed'; end if;
  new.created_at:=old.created_at;
 end if;
 new.updated_at:=now();
 if not new.completed then new.completed_at:=null;
 elsif tg_op='INSERT' then new.completed_at:=now();
 elsif not old.completed then new.completed_at:=now();
 else new.completed_at:=old.completed_at;
 end if;
 return new;
end;
$$;
revoke all on function daymark_private.stamp_plan() from public, anon, authenticated;
create trigger stamp_plan before insert or update on public.daymark_items for each row execute function daymark_private.stamp_plan();
alter table public.daymark_items enable row level security;
revoke all on public.daymark_items from anon, authenticated;
grant select, insert, update, delete on public.daymark_items to authenticated;
create policy read_own_verified on public.daymark_items for select to authenticated using ((select auth.uid())=user_id and (select daymark_private.verified_account()));
create policy insert_own_verified on public.daymark_items for insert to authenticated with check ((select auth.uid())=user_id and (select daymark_private.verified_account()));
create policy update_own_verified on public.daymark_items for update to authenticated using ((select auth.uid())=user_id and (select daymark_private.verified_account())) with check ((select auth.uid())=user_id and (select daymark_private.verified_account()));
create policy delete_own_verified on public.daymark_items for delete to authenticated using ((select auth.uid())=user_id and (select daymark_private.verified_account()));
