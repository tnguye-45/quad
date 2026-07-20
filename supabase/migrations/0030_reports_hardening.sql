-- quad — reports: server-resolved target, dedupe, rate limit (fixes M6)
--
-- 0014 let the CLIENT fill target_user_id, so a report could be pointed at
-- anyone regardless of who actually authored the reported content — poisoning
-- the moderation queue against an innocent user. There was also no uniqueness
-- or rate limit, so one student could file unlimited duplicate reports and
-- manufacture "10 reports against X" out of thin air.
--
--   1) A BEFORE INSERT trigger resolves target_user_id from
--      (target_kind, target_id) server-side and OVERWRITES whatever the
--      client sent. Unresolvable target → the insert is rejected.
--   2) unique(reporter_id, target_kind, target_id) — one report per person
--      per thing. Client contract: a duplicate insert now fails with 23505;
--      treat it as "already reported" (the read-own policy already lets the
--      client check first).
--   3) Rate limit: max 20 reports per reporter per hour, enforced in the same
--      trigger (definer, so it sees all the reporter's rows).

create or replace function public.reports_resolve_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if (select count(*) from public.reports
       where reporter_id = new.reporter_id
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many reports; please try again later'
      using errcode = '54000';
  end if;

  if new.target_kind = 'gig' then
    select poster_id into v_author from public.gigs     where id = new.target_id;
  elsif new.target_kind = 'hangout' then
    select host_id   into v_author from public.hangouts where id = new.target_id;
  elsif new.target_kind = 'voice' then
    select author_id into v_author from public.voices   where id = new.target_id;
  elsif new.target_kind = 'message' then
    select sender_id into v_author from public.messages where id = new.target_id;
  elsif new.target_kind = 'profile' then
    select id        into v_author from public.profiles where id = new.target_id;
  end if;

  if v_author is null then
    raise exception 'report target not found' using errcode = 'P0002';
  end if;

  -- Never trust the client's value.
  new.target_user_id := v_author;
  return new;
end;
$$;

revoke all on function public.reports_resolve_target() from public;

drop trigger if exists reports_resolve_target on public.reports;
create trigger reports_resolve_target
  before insert on public.reports
  for each row execute function public.reports_resolve_target();

-- Dedupe any existing duplicates (keep the earliest), then enforce uniqueness.
delete from public.reports a
using public.reports b
where a.reporter_id = b.reporter_id
  and a.target_kind = b.target_kind
  and a.target_id   = b.target_id
  and (a.created_at > b.created_at
       or (a.created_at = b.created_at and a.id > b.id));

create unique index if not exists reports_reporter_target_uniq
  on public.reports (reporter_id, target_kind, target_id);
