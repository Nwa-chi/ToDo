create schema if not exists daymark_private;
revoke all on schema daymark_private from public, anon;
grant usage on schema daymark_private to authenticated;

-- Only checks the current identity. No user argument and no user data returned.
create function daymark_private.email_confirmed()
returns boolean language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and exists (
   select 1 from auth.users
   where id = (select auth.uid())
     and email_confirmed_at is not null
     and deleted_at is null
     and (banned_until is null or banned_until < now())
 );
$$;
revoke all on function daymark_private.email_confirmed() from public, anon;
grant execute on function daymark_private.email_confirmed() to authenticated;

create table public.daymark_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 100),
 description text not null default '' check (char_length(description) <= 500),
 kind text not null default 'task' check (kind in ('task','event','occasion')),
 completed boolean not null default false,
 priority text not null default 'medium' check (priority in ('low','medium','high')),
 category text not null default 'Uncategorised' check (char_length(category) <= 30),
 due_date date,
 due_time time,
 time_zone text not null default 'Europe/Amsterdam' check (char_length(time_zone) between 1 and 100),
 duration_minutes integer check (duration_minutes between 1 and 10080),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 constraint time_requires_date check (due_time is null or due_date is not null),
 constraint completion_consistent check ((completed and completed_at is not null) or (not completed and completed_at is null))
);
create index daymark_items_owner_due_idx on public.daymark_items(user_id, due_date);
create index daymark_items_owner_updated_idx on public.daymark_items(user_id, updated_at desc);

create function daymark_private.stamp_item()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
 if tg_op = 'UPDATE' then
   new.id := old.id;
   new.user_id := old.user_id;
   new.created_at := old.created_at;
 end if;
 new.updated_at := now();
 if not new.completed then new.completed_at := null;
 elsif tg_op = 'INSERT' or old.completed = false then new.completed_at := now();
 else new.completed_at := old.completed_at;
 end if;
 return new;
end;
$$;
revoke all on function daymark_private.stamp_item() from public, anon, authenticated;
create trigger stamp_daymark_item before insert or update on public.daymark_items
for each row execute function daymark_private.stamp_item();

alter table public.daymark_items enable row level security;
revoke all on public.daymark_items from anon, authenticated;
grant select, insert, update, delete on public.daymark_items to authenticated;
create policy daymark_read_own on public.daymark_items for select to authenticated
 using ((select auth.uid()) = user_id and (select daymark_private.email_confirmed()));
create policy daymark_insert_own on public.daymark_items for insert to authenticated
 with check ((select auth.uid()) = user_id and (select daymark_private.email_confirmed()));
create policy daymark_update_own on public.daymark_items for update to authenticated
 using ((select auth.uid()) = user_id and (select daymark_private.email_confirmed()))
 with check ((select auth.uid()) = user_id and (select daymark_private.email_confirmed()));
create policy daymark_delete_own on public.daymark_items for delete to authenticated
 using ((select auth.uid()) = user_id and (select daymark_private.email_confirmed()));
