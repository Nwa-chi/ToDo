create function public.daymark_clear_completed(p_plan_ids uuid[], p_confirmation text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed_plans jsonb;
begin
  if p_confirmation is distinct from 'CLEAR' then
    raise exception 'Type CLEAR to confirm.' using errcode = '22023';
  end if;

  with removed as (
    delete from public.daymark_items as plan
    where plan.id = any(p_plan_ids)
      and plan.user_id = (select auth.uid())
      and plan.completed
    returning plan.*
  )
  select coalesce(jsonb_agg(to_jsonb(removed)), '[]'::jsonb)
  into removed_plans
  from removed;

  return removed_plans;
end
$$;

revoke all on function public.daymark_clear_completed(uuid[], text) from public, anon;
grant execute on function public.daymark_clear_completed(uuid[], text) to authenticated;
