-- quad — Phase 2.5: push notification tokens
--
-- Stores each user's Expo push token in a separate table so it can be
-- protected by stricter RLS than the rest of the profile.
--
-- Tokens look like `ExponentPushToken[xxxxxxx]` and can be used by anyone
-- holding them to send pushes via Expo's API. Keeping them out of the
-- public `profiles` SELECT policy avoids leaking them to other authenticated
-- users in the campus directory.
--
-- The server-side sender (Edge Function / DB trigger) will read tokens using
-- the service role key, bypassing RLS — only the device owner can read or
-- write their own token via the anon/auth role.

create table if not exists public.user_push_tokens (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  expo_push_token text not null,
  updated_at  timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;

drop policy if exists "push_tokens: read own" on public.user_push_tokens;
create policy "push_tokens: read own"
  on public.user_push_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens: insert own" on public.user_push_tokens;
create policy "push_tokens: insert own"
  on public.user_push_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: update own" on public.user_push_tokens;
create policy "push_tokens: update own"
  on public.user_push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: delete own" on public.user_push_tokens;
create policy "push_tokens: delete own"
  on public.user_push_tokens for delete
  to authenticated
  using (user_id = auth.uid());
