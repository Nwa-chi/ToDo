-- Collaborators retain the shared SELECT policy. Only verified owners can
-- change plan fields or completion through the Data API.
alter policy update_shared_verified on public.daymark_items
  using ((select auth.uid()) = user_id and (select daymark_private.verified_account()))
  with check ((select auth.uid()) = user_id and (select daymark_private.verified_account()));

alter policy update_shared_verified on public.daymark_items rename to update_own_verified;
