-- P9.1: account deletion. Two new columns on profiles for the
-- request/grace-window state machine, plus the function that prepares
-- an account for deletion once the grace window has passed.
--
-- "Request, confirm by typing the account email, then a 7-day grace
-- window" (brief) needs exactly one timestamp, not a separate boolean
-- and a separate scheduled-for date: `deletion_requested_at` is the
-- single source of truth, and "scheduled for" is always
-- `deletion_requested_at + interval '7 days'`, computed wherever it's
-- needed rather than stored a second way that could drift from it.
-- Cancelling is just setting this back to null.
alter table profiles
  add column deletion_requested_at timestamptz;

-- Rate-limiting the export (brief: "rate-limit it") needs a timestamp
-- of the last export somewhere -- profiles, not a separate table, for
-- the same reason the llama/achievement evaluation debounces (0020,
-- 0028) already live directly on profiles: one row per user, one
-- cheap column, no join needed to check it.
alter table profiles
  add column last_export_at timestamptz;

-- ---------------------------------------------------------------------
-- Preparing an account for deletion. `profiles.id` references
-- `auth.users.id` `on delete cascade` (confirmed directly against the
-- live schema's `pg_constraint`, not assumed), and every table this
-- schema hangs off `profiles` is *itself* `on delete cascade` from
-- there too, transitively, all the way down through goals -> tasks/
-- milestones/trips -> task_dependencies/trip_stops/trip_legs and
-- everything else -- checked exhaustively via `pg_constraint`, not
-- eyeballed. Which means the real deletion doesn't need to be written
-- in SQL at all: deleting the `auth.users` row (via the Admin API,
-- service-role only, from src/app/api/account/process-deletions/route.ts)
-- already cascades every application row away for free.
--
-- Two exceptions, both confirmed live (the *only* two RESTRICT/NO
-- ACTION foreign keys anywhere in the schema -- checked exhaustively
-- via `pg_constraint`, not just the ones onto `profiles`): `tasks.owner_id`
-- (RESTRICT) and `rag_override_history.set_by` (NO ACTION), both NOT
-- NULL. (Every other non-cascade FK onto profiles --
-- `goal_participants.invited_by`, `goals.rag_override_by`,
-- `invitations.accepted_by`, `share_grants.revoked_by` -- is `SET
-- NULL` on a nullable column, so those need no help.)
--
-- Both behave the same under cascade in practice, confirmed by actually
-- deleting fixture rows locally rather than trusting the RESTRICT-vs-
-- NO-ACTION distinction from memory: a first pass here assumed NO
-- ACTION's textbook "checked at end of statement" meant a user's own
-- override on their own goal would be fine for free, since the goal's
-- own `ON DELETE CASCADE` (0017) removes that same row via `goal_id`
-- moments later anyway -- that assumption was wrong, caught by an actual
-- self-owned-override fixture failing with exactly the FK violation the
-- comment claimed couldn't happen. Neither `tasks_owner_id_fkey`
-- (RESTRICT) nor `rag_override_history_set_by_fkey` (NO ACTION) is
-- declared DEFERRABLE, and an NOT DEFERRABLE NO ACTION constraint is
-- checked immediately after the row-level cascade event that touches
-- it, same as RESTRICT would be, not deferred to wait for a sibling
-- cascade path (the `goal_id` one) to run first -- the "deferred to end
-- of statement" behaviour genuinely associated with NO ACTION only
-- actually applies once a constraint is explicitly marked DEFERRABLE,
-- which this one isn't. So both columns need the same two-case
-- treatment: a row owned by this user on *someone else's* goal
-- survives (the goal isn't going anywhere) and gets reassigned to that
-- goal's real owner; a row owned by this user on *their own* goal is
-- about to vanish regardless (the goal cascade removes it seconds
-- later), so it's simplest and correct to delete it here directly
-- rather than reassign it to no one in particular.
--
-- This function's only job is clearing those obstacles out of the
-- cascade's way *before* the processor deletes `auth.users` -- it
-- does NOT delete `profiles` itself (a previous version of this
-- migration did; changed because that ordering has a real failure
-- mode). Idempotent: re-running it after the reassignment/delete has
-- already happened matches zero rows the second time, which is exactly
-- what makes it safe for the processor to retry on any account it
-- finds still due, no matter how many times a previous run got
-- interrupted.
--
-- Why prepare-then-let-auth-cascade, rather than this function
-- deleting `profiles` directly: "an orphaned auth record means the
-- email cannot be reused and the account is neither present nor
-- absent" (brief, verbatim) is the one failure mode that must never
-- happen, in either direction. If this function deleted `profiles`
-- itself and *that* succeeded but the processor's later
-- `auth.admin.deleteUser()` call failed, `auth.users` would be the
-- orphan -- exactly the forbidden case, and worse, silently
-- unrecoverable: `deletion_requested_at` (the processor's own "who's
-- due" query) lives on `profiles`, which would already be gone, so a
-- retry would never find this account again. Doing only the
-- reassignment here and leaving the actual delete to
-- `auth.admin.deleteUser()`'s own cascade means the failure mode
-- flips to the safe direction instead: if that call fails, `profiles`
-- (and `deletion_requested_at`) still exists, so the next processor
-- run finds the same account and retries the whole thing from
-- scratch, no special resume logic needed.
--
-- share_grants needs no special handling here despite the brief's own
-- "Share grants they issued, revoked. Share grants issued to them,
-- revoked" framing (verbatim) -- both grantor_id and grantee_id are
-- already ON DELETE CASCADE, so the row itself disappears in either
-- direction the moment the profile does, which is a *stronger*
-- outcome than a soft revoke (has_grant() can never match a row that
-- no longer exists) and touches nothing on the other party's own data,
-- satisfying "without touching the granting user's data" by
-- construction -- deleting a grant row never touches the resource it
-- pointed at.
--
-- Shared goals: a goal this user owns is *their* data -- "every
-- application row owned by the user" (brief) includes it, no carve-out.
-- It cascades away with everything hanging off it (milestones, tasks,
-- ledger entries, trips...) the same as every other owned row. A
-- collaborator or grantee who could see it loses that access the
-- moment the row is gone -- it does not transfer, and the confirmation
-- copy (src/app/(app)/settings/account/) states this plainly before the
-- user confirms, which is what "not a surprise" (brief) actually asks
-- for: warning the person taking the action, not notifying the people
-- affected by it after the fact.
create or replace function app.prepare_user_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
begin
  -- A task this user owns on someone *else's* goal -- the goal
  -- survives, so the task does too, just under new ownership.
  update tasks t
     set owner_id = g.owner_id
    from goals g
   where t.goal_id = g.id
     and t.owner_id = p_user_id
     and g.owner_id <> p_user_id;

  -- A task this user owns on their *own* goal -- the goal (and this
  -- task along with it) is about to cascade-delete the moment
  -- `profiles` goes, but RESTRICT is checked immediately, before that
  -- cascade runs, so it has to be gone from here already.
  delete from tasks t
    using goals g
   where t.goal_id = g.id
     and t.owner_id = p_user_id
     and g.owner_id = p_user_id;

  -- An override this user set on someone *else's* goal -- the goal
  -- survives, so the override does too, just attributed to the goal's
  -- real owner instead.
  update rag_override_history h
     set set_by = g.owner_id
    from goals g
   where h.goal_id = g.id
     and h.set_by = p_user_id
     and g.owner_id <> p_user_id;

  -- An override this user set on their *own* goal -- same reasoning as
  -- the self-owned task delete above: NO ACTION, un-deferred, is
  -- checked immediately, before the goal's own cascade removal of this
  -- same row (via goal_id) gets a chance to run, so it has to already
  -- be gone from here.
  delete from rag_override_history h
    using goals g
   where h.goal_id = g.id
     and h.set_by = p_user_id
     and g.owner_id = p_user_id;
end;
$$;

-- Deliberately gated to the service role, not pinned to auth.uid() the
-- way every other public.* wrapper in this codebase is (CLAUDE.md's own
-- documented convention). Every other wrapper's shape assumes "a normal
-- user, acting on their own behalf, right now" -- this one is the
-- opposite: it only ever runs from the scheduled deletion processor,
-- days after the person who requested it signed out, and it must never
-- be reachable by an ordinary authenticated session even if it somehow
-- guessed another user's id as an argument.
--
-- Checked via the `request.jwt.claim.role` GUC, not `current_user` --
-- tried `current_user` first and it's wrong in a way only caught by
-- actually calling this locally under `set role service_role`: a
-- SECURITY DEFINER function's `current_user` is always the function's
-- *owner* (whoever created it) while its body is executing, regardless
-- of which role the caller had -- so a same-session check would
-- silently compare the owner against itself for literally every
-- caller, either always passing (a useless check) or, as measured here,
-- always failing (`postgres` the owner is never `'service_role'`),
-- either way not checking the actual caller at all. GUCs are different
-- -- they're session configuration, not part of the privilege/role
-- context SECURITY DEFINER swaps -- so `current_setting`, unlike
-- `current_user`, survives the boundary intact; confirmed directly
-- (`set_config('request.jwt.claim.role', ...)` before the call, then
-- read back correctly from inside a SECURITY DEFINER function body),
-- not assumed. This is the same GUC family `auth.uid()`'s own shim
-- already leans on for `request.jwt.claim.sub` -- PostgREST sets one
-- per top-level JWT claim, service-role requests included, and nothing
-- resets them mid-call.
create or replace function public.prepare_user_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  perform app.prepare_user_deletion(p_user_id);
end;
$$;

do $$
begin
  assert (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('deletion_requested_at', 'last_export_at')
  ) = 2, 'expected both new profiles columns to exist';
end $$;
