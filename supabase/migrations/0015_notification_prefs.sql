-- quad — Phase 3: per-user notification preferences
--
-- The push fan-out functions (`send-message-push`, `send-new-post-push`) read
-- this table to decide whether to skip a recipient. Missing-row semantics:
-- defaults are opt-in for messages/gigs/hangouts and opt-out for voices.
-- Voices is opt-out because the feed is high-volume — pushing on every new
-- anonymous opinion would melt the device.
--
-- A row is upserted from the client whenever the user toggles a preference;
-- new users get the defaults applied implicitly by the COALESCE in the
-- function's lookup.

create table public.notification_prefs (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  messages      boolean not null default true,
  new_gigs      boolean not null default true,
  new_hangouts  boolean not null default true,
  new_voices    boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs: read own" on public.notification_prefs;
create policy "notification_prefs: read own"
  on public.notification_prefs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_prefs: insert own" on public.notification_prefs;
create policy "notification_prefs: insert own"
  on public.notification_prefs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_prefs: update own" on public.notification_prefs;
create policy "notification_prefs: update own"
  on public.notification_prefs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notification_prefs: delete own" on public.notification_prefs;
create policy "notification_prefs: delete own"
  on public.notification_prefs for delete
  to authenticated
  using (user_id = auth.uid());
