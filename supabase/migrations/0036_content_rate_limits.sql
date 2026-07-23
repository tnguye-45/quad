-- quad — per-author insert rate limits on content tables
--
-- Until now the only rate limit anywhere was reports (0030, 20/hr). Every
-- gig/hangout insert fires notify_new_post → a push to EVERY registered
-- device, with the (attacker-controlled) title as the body. With the anon key
-- public by design, one hostile student with a script could blast the whole
-- campus and flood every feed — a week-one trust killer at a school this
-- small. 0032/0033 capped row SIZE; nothing capped row COUNT.
--
-- One BEFORE INSERT trigger, shared across the five content tables, counting
-- the caller's own rows in the last hour. SECURITY DEFINER because the
-- authenticated role can no longer SELECT the author columns on these tables
-- (0027 column lockdown), so an invoker-rights count would itself be denied.
-- Errcode 54000 to match the reports limiter — clients already map it.
--
-- Limits (per author, per rolling hour) — generous multiples of any honest
-- usage at launch scale:
--   gigs 5 · hangouts 5 · voices 10 · comments 60 · messages 120

create or replace function public.enforce_content_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := tg_argv[0]::int;
  v_count int;
begin
  if auth.uid() is null then
    -- Definer functions and service-role writes (seeds, moderation) are not
    -- subject to the limit.
    return new;
  end if;

  if tg_table_name = 'gigs' then
    select count(*) into v_count from public.gigs
      where poster_id = auth.uid() and posted_at > now() - interval '1 hour';
  elsif tg_table_name = 'hangouts' then
    select count(*) into v_count from public.hangouts
      where host_id = auth.uid() and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'voices' then
    select count(*) into v_count from public.voices
      where author_id = auth.uid() and posted_at > now() - interval '1 hour';
  elsif tg_table_name = 'comments' then
    select count(*) into v_count from public.comments
      where author_id = auth.uid() and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'messages' then
    select count(*) into v_count from public.messages
      where sender_id = auth.uid() and sent_at > now() - interval '1 hour';
  else
    return new;
  end if;

  if v_count >= v_limit then
    raise exception 'rate limit: too many % in the last hour', tg_table_name
      using errcode = '54000';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_content_rate_limit() from public;

drop trigger if exists rate_limit_gigs on public.gigs;
create trigger rate_limit_gigs
  before insert on public.gigs
  for each row execute function public.enforce_content_rate_limit('5');

drop trigger if exists rate_limit_hangouts on public.hangouts;
create trigger rate_limit_hangouts
  before insert on public.hangouts
  for each row execute function public.enforce_content_rate_limit('5');

drop trigger if exists rate_limit_voices on public.voices;
create trigger rate_limit_voices
  before insert on public.voices
  for each row execute function public.enforce_content_rate_limit('10');

drop trigger if exists rate_limit_comments on public.comments;
create trigger rate_limit_comments
  before insert on public.comments
  for each row execute function public.enforce_content_rate_limit('60');

drop trigger if exists rate_limit_messages on public.messages;
create trigger rate_limit_messages
  before insert on public.messages
  for each row execute function public.enforce_content_rate_limit('120');
