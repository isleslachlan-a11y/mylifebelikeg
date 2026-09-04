-- P9.2: the operational floor. Rate limiting first, since it's the one
-- piece that's pure schema + one function, no external service.
--
-- Postgres-backed, not Redis/Upstash -- same instinct as
-- `profiles.last_export_at` (0041) and every debounce column before it
-- (`llama_evaluated_at` 0020, `achievements_evaluated_at` 0028): one
-- more table this app already has a connection to, not a new paid
-- dependency, for an app whose own brief still frames scale as "beyond
-- two users," not "needs a distributed cache." `app` schema, not
-- `public` -- this table holds nothing a client should ever read or
-- write directly (see the function's own comment for why it's
-- service-role-only, not RLS-gated).
create table app.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hit_count integer not null default 1
);

-- Fixed-window counter, atomic via the unique `bucket` constraint's own
-- row lock under `ON CONFLICT` -- two concurrent requests hitting the
-- same bucket can't both read-then-write past each other, which a
-- read-then-conditionally-insert-or-update pair of separate statements
-- could. A window that has expired resets to a fresh count of 1 rather
-- than accumulating forever; `hit_count <= p_max` is what the caller
-- reads back to decide "allowed" vs. "refused" -- refused calls still
-- increment the counter (so a script hammering an endpoint after being
-- blocked doesn't get a free reset by retrying), matching how every
-- rate limiter worth using behaves.
create or replace function app.check_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_count integer;
begin
  insert into app.rate_limits (bucket, window_start, hit_count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hit_count = case
          when app.rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
            then 1
          else app.rate_limits.hit_count + 1
        end,
        window_start = case
          when app.rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
            then now()
          else app.rate_limits.window_start
        end
  returning hit_count into v_count;

  return v_count <= p_max;
end;
$$;

-- Service-role only, deliberately -- not the ordinary "pinned to
-- auth.uid()" public.* wrapper shape (CLAUDE.md's own convention).
-- Rate limiting has to work *before* there's any session to pin to
-- (signup, login attempts) as much as after one exists (export), so
-- every call site in this app goes through the service client
-- regardless of auth state -- see src/lib/rate-limit.ts. The other
-- reason this can't be opened to `anon`/`authenticated` the way most
-- public.* wrappers are: `p_bucket` is caller-supplied, and a function
-- reachable by anyone that increments an arbitrary bucket would let an
-- attacker pre-exhaust *someone else's* bucket (e.g. flood
-- `login:account:victim@example.com` to lock a real user out) --
-- exactly the kind of griefing this feature exists to prevent, not
-- enable. Same `current_setting('request.jwt.claim.role', true)` check
-- 0041's `prepare_user_deletion` wrapper uses, for the same reason
-- (verified there, not `current_user`, to survive the SECURITY DEFINER
-- boundary correctly).
create or replace function public.check_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  return app.check_rate_limit(p_bucket, p_max, p_window_seconds);
end;
$$;

do $$
begin
  assert (
    select count(*) from information_schema.tables
    where table_schema = 'app' and table_name = 'rate_limits'
  ) = 1, 'expected app.rate_limits to exist';
end $$;
