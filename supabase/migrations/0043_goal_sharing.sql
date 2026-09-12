-- Goal sharing (originally briefed as "0018_goal_sharing.sql" -- that
-- number belongs to 0018_rating_trend_and_divergence_fix.sql in this
-- repo's real history, from Phase 4's check-in work; renumbered to
-- 0043 to actually follow the last real migration, per CLAUDE.md's own
-- "check the live schema, not the highest filename in the brief" rule).
--
-- "The database could already share goals -- goal_participants plus
-- RLS meant an owner could add someone and that person could see the
-- goal. What didn't exist: nothing used the invitations table... no
-- 'shared with me' view... no way to leave a goal, or to transfer
-- ownership" (brief, verbatim) -- confirmed directly against the live
-- schema before writing a line of this file, not assumed: `goals`
-- already has `visibility` (private/shared), `goal_participants`
-- already has a `viewer` role and full RLS
-- (`goal_participants_select/insert/update/delete`), `invitations`
-- already has `token_hash`/`resource_type`/`resource_id`/`scope`/
-- `expires_at`/`accepted_at`/`revoked_at`, and `app.can_view_goal`/
-- `app.can_edit_goal`/`app.is_goal_owner` already exist and are
-- already wired into `goals_select`/`goals_update`. Every table and
-- policy this migration needs was already there, "written ahead of
-- the code" the same way Schema.MD's own pattern goes -- this file is
-- purely the functions and views that actually use them.

-- ---------------------------------------------------------------------
-- app.find_profile_by_handle: case-insensitive, returns zero or one
-- row rather than raising -- a caller doing `select ... into` gets a
-- clean null-fields record for an unknown handle (confirmed: a
-- zero-row SELECT INTO in plpgsql nulls the target, it doesn't raise),
-- which is exactly the shape S1's live-lookup-while-typing needs: "no
-- match yet" is not an error state.
create or replace function app.find_profile_by_handle(p_handle text)
returns table (id uuid, handle text, display_name text, avatar jsonb)
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select p.id, p.handle, p.display_name, p.avatar
  from profiles p
  where lower(p.handle) = lower(p_handle)
    and p.deleted_at is null
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- app.invite_by_handle: the core of S1. Ownership is checked first,
-- before the handle lookup even runs -- a non-owner shouldn't learn
-- anything about whether a handle exists via this path, on general
-- principle, even though nothing here currently exploits the
-- ordering.
--
-- Reactivate-not-duplicate: `goal_participants_unique` is a partial
-- unique index on `(goal_id, user_id) WHERE removed_at IS NULL`, so a
-- *soft-removed* row for the same pair doesn't block a fresh insert at
-- the database level -- but re-inviting someone who left (or was
-- removed) should pick their old row back up, not create a second one
-- that would leave two rows for the same pair once the old one's
-- `removed_at` gets cleared some other way. Checked explicitly here
-- rather than relying on the partial index to prevent it, since the
-- index's job is uniqueness among *active* rows, not history.
--
-- Notification: inserted directly, not through
-- `src/lib/llamas/emit.ts`'s `emitLlamaMessage` -- that path needs the
-- service-role client from Next.js, which a plain SQL test (or a
-- future direct RPC caller) never goes through. SECURITY DEFINER is
-- what makes the insert possible at all here (`llama_messages` has no
-- user-facing INSERT policy, by design), the same mechanism
-- `app.suggest_goal_limit_change`'s own reason text already uses to
-- author copy directly in SQL rather than through `copy.ts` (P4.5).
-- Three variants, still, even authored here -- "repetition is what
-- makes a character feel like a robot" (P6.6 brief) applies regardless
-- of which layer writes the row, and sharing a goal is something that
-- can genuinely happen more than once to the same person.
create or replace function app.invite_by_handle(
  p_goal_id uuid,
  p_handle text,
  p_role text default 'collaborator'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_target record;
  v_owner_id uuid;
  v_existing_id uuid;
  v_participant_id uuid;
  v_body text;
  v_bodies text[] := array[
    'Someone just shared a goal with you.',
    'You''ve been added to a goal -- take a look.',
    'A goal just landed in your account. Go see what it is.'
  ];
begin
  select owner_id into v_owner_id from goals where id = p_goal_id and deleted_at is null;
  if v_owner_id is null then
    raise exception 'Goal not found.' using errcode = 'no_data_found';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Only the goal owner can invite people.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_target from app.find_profile_by_handle(p_handle);
  if v_target.id is null then
    raise exception 'No one''s using that handle.' using errcode = 'no_data_found';
  end if;
  if v_target.id = v_owner_id then
    raise exception 'That''s you -- you already own this goal.' using errcode = 'check_violation';
  end if;

  select id into v_existing_id
    from goal_participants
   where goal_id = p_goal_id and user_id = v_target.id and removed_at is null;
  if v_existing_id is not null then
    raise exception 'They''re already on this goal.' using errcode = 'unique_violation';
  end if;

  -- Reactivate a soft-removed row for this pair rather than inserting
  -- a second one.
  update goal_participants
     set removed_at = null, role = p_role::participant_role, invited_by = auth.uid(), joined_at = now()
   where goal_id = p_goal_id and user_id = v_target.id and removed_at is not null
  returning id into v_participant_id;

  if v_participant_id is null then
    insert into goal_participants (goal_id, user_id, role, invited_by)
    values (p_goal_id, v_target.id, p_role::participant_role, auth.uid())
    returning id into v_participant_id;
  end if;

  update goals set visibility = 'shared' where id = p_goal_id;

  v_body := v_bodies[1 + floor(random() * array_length(v_bodies, 1))::int];
  insert into llama_messages (user_id, speaker, trigger_code, body, resource_type, resource_id, priority)
  values (v_target.id, 'fluffy', 'goal_shared_with_you', v_body, 'goal', p_goal_id, 1);

  return v_participant_id;
end;
$$;

-- ---------------------------------------------------------------------
-- app.leave_goal: one-arg self-leave, two-arg owner-removes-someone
-- (which also covers "owner targets themselves," refused the same way
-- as any other self-leave attempt by an owner). `target` defaults to
-- the caller; authority is checked explicitly since this function has
-- to run as SECURITY DEFINER to let an owner modify *another* user's
-- participant row (RLS's own `goal_participants_delete`/`_update`
-- already permit exactly this for the owner, but this function does a
-- soft-remove plus the open-tasks/owner checks the plain RLS-scoped
-- UPDATE path doesn't know how to do).
create or replace function app.leave_goal(p_goal_id uuid, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_owner_id uuid;
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_open_task_count int;
  v_remaining_participants int;
begin
  select owner_id into v_owner_id from goals where id = p_goal_id and deleted_at is null;
  if v_owner_id is null then
    raise exception 'Goal not found.' using errcode = 'no_data_found';
  end if;

  -- Authority: removing someone else is the owner's act only; leaving
  -- yourself needs no further check beyond being the target.
  if v_target <> auth.uid() and v_owner_id <> auth.uid() then
    raise exception 'Only the goal owner can remove someone else.' using errcode = 'insufficient_privilege';
  end if;

  if v_target = v_owner_id then
    raise exception 'The owner can''t leave their own goal -- transfer it or archive it instead.' using errcode = 'check_violation';
  end if;

  select count(*) into v_open_task_count
    from tasks
   where goal_id = p_goal_id and owner_id = v_target and status not in ('done', 'cancelled');
  if v_open_task_count > 0 then
    raise exception 'They still own % open task(s) on this goal -- reassign those first.', v_open_task_count
      using errcode = 'check_violation';
  end if;

  update goal_participants
     set removed_at = now()
   where goal_id = p_goal_id and user_id = v_target and removed_at is null;

  select count(*) into v_remaining_participants
    from goal_participants
   where goal_id = p_goal_id and removed_at is null;
  if v_remaining_participants = 0 then
    update goals set visibility = 'private' where id = p_goal_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- app.transfer_goal_ownership: the new owner must already be an active
-- participant (brief, verbatim) -- checked, not assumed from the fact
-- that they're being named. The old owner is guaranteed a seat
-- afterward ("stays on as a collaborator so nothing is lost"): they
-- never had a goal_participants row of their own (ownership is tracked
-- solely via goals.owner_id in this schema, confirmed directly --
-- nothing seeds a participant row on goal creation), so one is
-- inserted or reactivated here, the same reactivate-not-duplicate
-- logic invite_by_handle already uses. The new owner's own prior
-- participant row (if any -- they had to have one to be eligible) is
-- soft-removed, so they don't end up double-listed as both the owner
-- (via goals.owner_id) and an active collaborator/viewer row for the
-- same goal.
create or replace function app.transfer_goal_ownership(p_goal_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_owner_id uuid;
  v_is_active_participant boolean;
  v_reactivated_id uuid;
begin
  select owner_id into v_owner_id from goals where id = p_goal_id and deleted_at is null;
  if v_owner_id is null then
    raise exception 'Goal not found.' using errcode = 'no_data_found';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Only the goal owner can transfer ownership.' using errcode = 'insufficient_privilege';
  end if;

  select exists (
    select 1 from goal_participants
     where goal_id = p_goal_id and user_id = p_new_owner_id and removed_at is null
  ) into v_is_active_participant;
  if not v_is_active_participant then
    raise exception 'The new owner has to already be a participant on this goal.' using errcode = 'check_violation';
  end if;

  update goals set owner_id = p_new_owner_id where id = p_goal_id;

  -- The new owner is now captured via goals.owner_id -- their old
  -- participant row would otherwise double-list them.
  update goal_participants
     set removed_at = now()
   where goal_id = p_goal_id and user_id = p_new_owner_id and removed_at is null;

  -- The old owner gets a seat, reactivating a prior soft-removed row
  -- (e.g. if they'd left and come back some other way) rather than
  -- risking a duplicate.
  update goal_participants
     set removed_at = null, role = 'collaborator', joined_at = now()
   where goal_id = p_goal_id and user_id = v_owner_id and removed_at is not null
  returning id into v_reactivated_id;

  if v_reactivated_id is null then
    insert into goal_participants (goal_id, user_id, role, invited_by)
    values (p_goal_id, v_owner_id, 'collaborator', p_new_owner_id)
    on conflict (goal_id, user_id) where removed_at is null do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- app.create_goal_invitation: S4, the raw-token-once shape. 32 random
-- bytes -> 64 hex chars via pgcrypto's `gen_random_bytes`/`digest` --
-- confirmed live on the real project (`pg_extension` shows `pgcrypto`
-- already enabled, in the `extensions` schema, Supabase's own default
-- placement for it) rather than assumed from `gen_random_uuid()`'s
-- presence, which is a red herring: that one is a core Postgres
-- built-in since v13 and proves nothing about pgcrypto specifically --
-- found the hard way, when a first pass at this function failed
-- locally with "function gen_random_bytes does not exist" against a
-- scratch database that had never had the extension enabled at all
-- (`000 auth shim` fixed alongside this migration). `extensions` is
-- added to this function's own `search_path` explicitly, alongside
-- `accept_invitation`'s -- a SECURITY DEFINER function's `set
-- search_path` is a deliberate hardening measure (never trust the
-- caller's own path), which cuts both ways: it also means Supabase's
-- own database-wide default `search_path` (which already includes
-- `extensions`) never applies here either, so this has to name it.
-- Only the SHA-256 digest is ever stored, matching the test's own
-- direct check that the raw token has zero matches in
-- `invitations.token_hash`.
create or replace function app.create_goal_invitation(
  p_goal_id uuid,
  p_email text,
  p_role text default 'collaborator'
)
returns text
language plpgsql
security definer
set search_path to 'public', 'app', 'extensions'
as $$
declare
  v_owner_id uuid;
  v_token text;
  v_existing_user_id uuid;
begin
  select owner_id into v_owner_id from goals where id = p_goal_id and deleted_at is null;
  if v_owner_id is null then
    raise exception 'Goal not found.' using errcode = 'no_data_found';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Only the goal owner can invite people.' using errcode = 'insufficient_privilege';
  end if;

  if p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That doesn''t look like a valid email address.' using errcode = 'check_violation';
  end if;

  -- An existing user should be invited by handle, not email -- one
  -- path to the same person, not two.
  select p.id into v_existing_user_id
    from auth.users u
    join profiles p on p.id = u.id
   where lower(u.email) = lower(p_email) and p.deleted_at is null;
  if v_existing_user_id is not null then
    raise exception 'That email already has an account -- invite them by handle instead.' using errcode = 'check_violation';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into invitations (inviter_id, email, token_hash, resource_type, resource_id, scope)
  values (
    auth.uid(),
    p_email,
    encode(digest(v_token, 'sha256'), 'hex'),
    'goal',
    p_goal_id,
    (case when p_role = 'viewer' then 'view' else 'edit' end)::share_scope
  );

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- app.accept_invitation: looks up by digest (never stores or accepts
-- the raw token itself beyond this one hash-and-compare), and the
-- three refusal cases -- reused, revoked, expired -- all collapse to
-- the same `no_data_found` the test expects, since the WHERE clause
-- itself is what "still valid" means here, not a separate status flag
-- to keep in sync.
create or replace function app.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app', 'extensions'
as $$
declare
  v_invitation record;
  v_role participant_role;
  v_existing_id uuid;
begin
  select * into v_invitation
    from invitations
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   limit 1;

  if v_invitation.id is null then
    raise exception 'This invitation is invalid or has expired.' using errcode = 'no_data_found';
  end if;

  if v_invitation.resource_type <> 'goal' then
    -- 0019's own future territory (dreams/trips/profiles) -- this
    -- function is goal-invitation-specific, per this package's own
    -- scope ("What this doesn't do: sharing anything other than
    -- goals").
    raise exception 'This invitation type isn''t supported yet.' using errcode = 'no_data_found';
  end if;

  v_role := case v_invitation.scope when 'edit' then 'collaborator' else 'viewer' end;

  select id into v_existing_id
    from goal_participants
   where goal_id = v_invitation.resource_id and user_id = auth.uid() and removed_at is not null;
  if v_existing_id is not null then
    update goal_participants
       set removed_at = null, role = v_role, joined_at = now()
     where id = v_existing_id;
  else
    insert into goal_participants (goal_id, user_id, role, invited_by)
    values (v_invitation.resource_id, auth.uid(), v_role, v_invitation.inviter_id)
    on conflict (goal_id, user_id) where removed_at is null do nothing;
  end if;

  update goals set visibility = 'shared' where id = v_invitation.resource_id;

  update invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_invitation.id;

  return v_invitation.resource_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Views. security_invoker=true on every one -- P9.0's own hard-won
-- lesson (0038) applied from the start here rather than found later.

-- Goals shared *with* the caller -- explicitly excludes goals the
-- caller owns, even though ownership and participation are already
-- mutually exclusive in how this schema populates goal_participants
-- (confirmed: nothing ever gives an owner their own participant row),
-- so this exclusion is defense in depth against that assumption ever
-- changing, not dead code.
create or replace view v_shared_with_me
with (security_invoker = true) as
select
  gp.goal_id,
  g.owner_id,
  owner.handle as owner_handle,
  owner.display_name as owner_display_name,
  gp.role as my_role,
  gp.joined_at
from goal_participants gp
join goals g on g.id = gp.goal_id and g.deleted_at is null
join profiles owner on owner.id = g.owner_id
where gp.user_id = auth.uid()
  and gp.removed_at is null
  and g.owner_id <> auth.uid();

-- Every participant on a goal, with profile info -- the owner isn't a
-- row here (they're not in goal_participants); the UI is expected to
-- render `goals.owner_id` as its own "Owner" row alongside this list,
-- same shape v_pot_balances-style views elsewhere leave to the caller.
create or replace view v_goal_participants_detail
with (security_invoker = true) as
select
  gp.id,
  gp.goal_id,
  gp.user_id,
  p.handle,
  p.display_name,
  p.avatar,
  gp.role,
  gp.joined_at
from goal_participants gp
join profiles p on p.id = gp.user_id
where gp.removed_at is null
  and app.can_view_goal(gp.goal_id);

-- Outstanding email invites the caller sent -- accepted/revoked/
-- expired ones fall out of this view's own WHERE clause rather than a
-- separate status column, the same "the query is the state" shape
-- accept_invitation's own lookup already uses.
create or replace view v_pending_invitations
with (security_invoker = true) as
select
  i.id,
  i.resource_type,
  i.resource_id,
  i.email,
  i.scope,
  i.created_at,
  i.expires_at
from invitations i
where i.inviter_id = auth.uid()
  and i.accepted_at is null
  and i.revoked_at is null
  and i.expires_at > now();

-- ---------------------------------------------------------------------
-- public.* wrappers -- app schema isn't PostgREST-reachable directly
-- (CLAUDE.md's own established convention, e.g. 0019/0028's own
-- wrappers for exactly this reason). Every one of these already checks
-- its own authority internally (owner-only, self-or-owner, etc.), so
-- none of these wrappers need their own additional gate the way
-- 0041's service-role-only ones do -- these are meant to be called by
-- an ordinary signed-in user, acting on their own behalf, right now.
create or replace function public.find_profile_by_handle(p_handle text)
returns table (id uuid, handle text, display_name text, avatar jsonb)
language sql stable security definer set search_path to 'public', 'app'
as $$ select * from app.find_profile_by_handle(p_handle); $$;

create or replace function public.invite_by_handle(p_goal_id uuid, p_handle text, p_role text default 'collaborator')
returns uuid
language sql security definer set search_path to 'public', 'app'
as $$ select app.invite_by_handle(p_goal_id, p_handle, p_role); $$;

create or replace function public.leave_goal(p_goal_id uuid, p_user_id uuid default null)
returns void
language sql security definer set search_path to 'public', 'app'
as $$ select app.leave_goal(p_goal_id, p_user_id); $$;

create or replace function public.transfer_goal_ownership(p_goal_id uuid, p_new_owner_id uuid)
returns void
language sql security definer set search_path to 'public', 'app'
as $$ select app.transfer_goal_ownership(p_goal_id, p_new_owner_id); $$;

create or replace function public.create_goal_invitation(p_goal_id uuid, p_email text, p_role text default 'collaborator')
returns text
language sql security definer set search_path to 'public', 'app'
as $$ select app.create_goal_invitation(p_goal_id, p_email, p_role); $$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language sql security definer set search_path to 'public', 'app'
as $$ select app.accept_invitation(p_token); $$;

do $$
begin
  assert (
    select count(*) from pg_proc where proname = 'invite_by_handle' and pronamespace = 'public'::regnamespace
  ) = 1, 'expected public.invite_by_handle to exist';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_shared_with_me'
  ), 'v_shared_with_me must be security_invoker';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_goal_participants_detail'
  ), 'v_goal_participants_detail must be security_invoker';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_pending_invitations'
  ), 'v_pending_invitations must be security_invoker';
end $$;
