create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Keep all scheduling secrets in Vault; no credentials in migrations or cron text.
select cron.schedule('daymark-reminders','* * * * *',$job$
 select net.http_post(
  url:='https://uolwbaappjrggtaydvsq.supabase.co/functions/v1/daymark-reminders',
  headers:=jsonb_build_object('Content-Type','application/json','x-daymark-cron',(select decrypted_secret from vault.decrypted_secrets where name='daymark_push_cron')),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 ) where exists(select 1 from vault.secrets where name='daymark_push_cron');
$job$);
