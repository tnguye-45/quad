-- quad — Phase 3: comments + voice push fan-out + realtime
--
-- Adds a single `comments` table that attaches to gigs / hangouts / voices
-- via a (target_type, target_id) discriminator, instead of three separate
-- tables. Trades a little type-system rigor for one query path, one realtime
-- channel pattern, and one push trigger.
--
-- Also wires the voices table into the existing notify_new_post() trigger
-- (0012 only covered gigs and hangouts) and adds a notify_new_comment()
-- trigger that pings the target's owner.
--
-- One-time setup the trigger needs (same DB GUC mechanism as 0011 / 0012):
--
--   alter database postgres
--     set app.settings.new_comment_push_url
--       = 'https://<project-ref>.supabase.co/functions/v1/send-new-comment-push';
--
-- (service_role_key is already set from 0011.)

create extension if not exists pg_net with schema extensions;

-- ─────────────────────── comments table ───────────────────────
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('gig', 'hangout', 'voice')),
  target_id    uuid not null,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  anonymous    boolean not null default false,
  body         text not null check (length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);

-- Hot path: load all comments for one target in chronological order.
create index comments_target_idx on public.comments (target_type, target_id, created_at);
-- Author history (for "my posts" expansion + soft-moderation lookups).
create index comments_author_idx on public.comments (author_id);

-- ─────────────────────── comment_count caches ───────────────────────
-- Mirror the vote_score pattern from 0005 — denormalized counter on the
-- parent row so feeds don't have to aggregate on every fetch.
alter table public.gigs     add column if not exists comment_count integer not null default 0;
alter table public.hangouts add column if not exists comment_count integer not null default 0;
alter table public.voices   add column if not exists comment_count integer not null default 0;

create or replace function public.recompute_comment_count(
  p_target_type text,
  p_target_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*)::int into v_count
    from public.comments
   where target_type = p_target_type and target_id = p_target_id;
  if p_target_type = 'gig' then
    update public.gigs     set comment_count = v_count where id = p_target_id;
  elsif p_target_type = 'hangout' then
    update public.hangouts set comment_count = v_count where id = p_target_id;
  elsif p_target_type = 'voice' then
    update public.voices   set comment_count = v_count where id = p_target_id;
  end if;
end;
$$;

create or replace function public.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_comment_count(old.target_type, old.target_id);
    return old;
  end if;
  perform public.recompute_comment_count(new.target_type, new.target_id);
  return new;
end;
$$;

drop trigger if exists comments_sync on public.comments;
create trigger comments_sync
  after insert or delete on public.comments
  for each row execute function public.comments_after_change();

-- ─────────────────────── RLS ───────────────────────
alter table public.comments enable row level security;

-- Anyone authenticated can read the thread. Client is responsible for hiding
-- author_id when anonymous = true — column is exposed so authors see history.
create policy "comments: read for authenticated"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments: insert own"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

-- Authors can delete their own comments. No updates — immutable like voices.
create policy "comments: delete own"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid());

-- ─────────────────────── voice push fan-out ───────────────────────
-- 0012 already defined notify_new_post() and wired it to gigs + hangouts.
-- Add voices to the same fan-out so a new anonymous voice pings the campus.
drop trigger if exists trg_voices_push on public.voices;
create trigger trg_voices_push
  after insert on public.voices
  for each row execute function public.notify_new_post();

-- ─────────────────────── comment push fan-out ───────────────────────
-- Ping the owner of the parent post (and not the commenter themselves) when
-- a new comment lands. The Edge Function resolves the owner; this trigger
-- just forwards the row payload.
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text := current_setting('app.settings.new_comment_push_url', true);
  v_key   text := current_setting('app.settings.service_role_key', true);
  v_body  jsonb;
begin
  if v_url is null or v_url = '' then
    return new;
  end if;

  v_body := jsonb_build_object(
    'type',   'INSERT',
    'table',  'comments',
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
    raise warning 'notify_new_comment: net.http_post failed: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_comment() from public;

drop trigger if exists trg_comments_push on public.comments;
create trigger trg_comments_push
  after insert on public.comments
  for each row execute function public.notify_new_comment();

-- ─────────────────────── realtime publication ───────────────────────
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;
