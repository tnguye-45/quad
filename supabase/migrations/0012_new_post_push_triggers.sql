-- quad — Phase 2.6: fan-out push notifications on new gigs and hangouts
--
-- Mirrors the mechanism choice from 0011 (pg_net + AFTER INSERT row trigger).
-- One shared trigger function `notify_new_post()` is reused across the two
-- tables; it forwards a Supabase-Database-Webhook-shaped payload to the
-- send-new-post-push Edge Function, which dispatches on payload.table.
--
-- One-time setup (already required by 0011 — listed again so this migration
-- is self-documenting):
--
--   alter database postgres
--     set app.settings.new_post_push_url = 'https://<project-ref>.supabase.co/functions/v1/send-new-post-push';
--   alter database postgres
--     set app.settings.service_role_key  = '<service-role-jwt>';
--
-- Note the URL setting is distinct from app.settings.edge_function_url (which
-- 0011 uses for send-message-push) so each function can be re-pointed
-- independently — useful if one is ever moved or paused without touching the
-- other.
--
-- As with 0011 the trigger swallows errors so a failed push cannot block the
-- underlying INSERT into gigs/hangouts.

create extension if not exists pg_net with schema extensions;

-- ─────────────────────── notify_new_post ───────────────────────
create or replace function public.notify_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text := current_setting('app.settings.new_post_push_url', true);
  v_key   text := current_setting('app.settings.service_role_key', true);
  v_body  jsonb;
begin
  if v_url is null or v_url = '' then
    -- Not configured yet — silently no-op so post creation still works in dev.
    return new;
  end if;

  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  tg_table_name,
    'schema', tg_table_schema,
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
    raise warning 'notify_new_post(%): net.http_post failed: %', tg_table_name, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_post() from public;

-- ─────────────────────── trigger wiring ───────────────────────
drop trigger if exists trg_gigs_push on public.gigs;
create trigger trg_gigs_push
  after insert on public.gigs
  for each row execute function public.notify_new_post();

drop trigger if exists trg_hangouts_push on public.hangouts;
create trigger trg_hangouts_push
  after insert on public.hangouts
  for each row execute function public.notify_new_post();
