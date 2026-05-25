-- quad — Phase 2.5: trigger that fans out push notifications on new messages
--
-- Mechanism choice: pg_net + an AFTER INSERT row trigger (not
-- supabase.functions.invoke, not the dashboard "Database Webhooks" UI).
-- Reasoning:
--   * pg_net is enabled by default on every Supabase project and exposes
--     net.http_post, which is exactly the async fire-and-forget primitive we
--     need: the message INSERT commits immediately and the push send happens
--     in the background worker.
--   * supabase.functions.invoke() from SQL needs the supabase_functions
--     extension and Vault-managed secrets — extra moving parts for a feature
--     that's just "POST JSON to a URL".
--   * Dashboard webhooks would work too, but pinning the wiring in a
--     migration keeps config in source control (no dashboard drift).
--
-- Required one-time setup before this migration is useful (run from the SQL
-- editor as the postgres role):
--
--   alter database postgres
--     set app.settings.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1/send-message-push';
--   alter database postgres
--     set app.settings.service_role_key = '<service-role-jwt>';
--
-- Both values come from the Supabase dashboard (Settings → API). The
-- service role key never leaves the database — pg_net forwards it in the
-- Authorization header so the Edge Function can authenticate the call.
--
-- The trigger swallows errors (`exception when others then ...`) because a
-- failed push must never block a chat message from being sent.

-- Make sure pg_net is available. It's enabled by default on Supabase, but
-- safe to ask for it explicitly so this migration is portable.
create extension if not exists pg_net with schema extensions;

-- ─────────────────────── notify_new_message ───────────────────────
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text := current_setting('app.settings.edge_function_url', true);
  v_key   text := current_setting('app.settings.service_role_key', true);
  v_body  jsonb;
begin
  if v_url is null or v_url = '' then
    -- Not configured yet — silently no-op so chat still works in dev/local.
    return new;
  end if;

  -- Mirror the Supabase Database Webhook payload shape so the same Edge
  -- Function can be triggered from the dashboard too (handy for re-tests).
  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  'messages',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', null
  );

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'content-type',   'application/json',
        'authorization',  'Bearer ' || coalesce(v_key, '')
      ),
      body    := v_body
    );
  exception when others then
    raise warning 'notify_new_message: net.http_post failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_message() from public;

-- ─────────────────────── trigger wiring ───────────────────────
drop trigger if exists trg_messages_push on public.messages;
create trigger trg_messages_push
  after insert on public.messages
  for each row execute function public.notify_new_message();
