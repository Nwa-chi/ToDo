alter table public.daymark_items add column end_date date;
alter table public.daymark_items add constraint plan_date_range check (end_date is null or (due_date is not null and end_date>=due_date));
grant insert(end_date),update(end_date) on public.daymark_items to authenticated;
