-- quad — server-side @nd.edu signup gate (fixes H1; this IS founder-queue item #3)
--
-- The "students only" restriction lived only in client JS (lib/auth-context.tsx).
-- Anyone with the public anon key (shipped in the web bundle) could call
-- POST /auth/v1/signup with any email and get a full account that RLS treats
-- like any student. This enforces the domain gate in the database.
--
-- A small allowlist table + a BEFORE INSERT trigger on auth.users rejects any
-- signup whose email domain isn't approved. Seeded with nd.edu. To allow a test
-- domain in a non-prod project (mirroring EXPO_PUBLIC_TEST_EMAIL_DOMAINS on the
-- client), insert another row, e.g.:
--   insert into public.allowed_email_domains values ('gmail.com');
--
-- NOTE: This complements — does not replace — the Supabase dashboard
-- "Authentication → Allowed email domains" setting. Set that too; belt and
-- suspenders. This trigger also gates admin/dashboard-created users, which is
-- intended (only approved domains). All quad signups are email/password, so
-- there's no OAuth path to special-case.
create table if not exists public.allowed_email_domains (
  domain text primary key
);

insert into public.allowed_email_domains (domain) values ('nd.edu')
  on conflict (domain) do nothing;

-- Lock the list down: RLS on, no policies → no anon/authenticated access at all.
-- The trigger below reads it as SECURITY DEFINER; service_role manages it.
alter table public.allowed_email_domains enable row level security;

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if v_domain = '' then
    raise exception 'a valid email address is required' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.allowed_email_domains where domain = v_domain
  ) then
    raise exception 'signups are restricted to approved campus email domains'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_domain_check on auth.users;
create trigger on_auth_user_domain_check
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- Gate email CHANGES too, or the insert check is trivially bypassed: sign up
-- with a valid nd.edu address, then updateUser({ email: 'me@gmail.com' }) and
-- keep the account. GoTrue applies a confirmed email change as an UPDATE on
-- auth.users, so a BEFORE UPDATE OF email trigger catches it regardless of
-- which confirmation flow (single or double confirm) is configured.
drop trigger if exists on_auth_user_domain_check_update on auth.users;
create trigger on_auth_user_domain_check_update
  before update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.enforce_email_domain();
