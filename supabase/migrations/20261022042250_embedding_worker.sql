-- Runs the embed-notes edge function every minute while any note needs embedding.
--
-- Requires two Vault secrets (set once in the SQL editor, never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<sb_secret_... key>', 'embed_worker_key');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function public.trigger_embedding_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  worker_key text;
begin
  -- Skip the HTTP call entirely when there's nothing to do.
  if not exists (select 1 from public.notes_pending_embedding(1)) then
    return;
  end if;

  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into worker_key from vault.decrypted_secrets where name = 'embed_worker_key';

  if project_url is null or worker_key is null then
    raise warning 'embedding worker: Vault secrets project_url and embed_worker_key must be set';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/embed-notes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', worker_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.trigger_embedding_worker from public, anon, authenticated;

select cron.schedule('embed-notes', '* * * * *', 'select public.trigger_embedding_worker()');
