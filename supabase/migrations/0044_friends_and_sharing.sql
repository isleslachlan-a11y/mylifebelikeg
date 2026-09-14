-- Friends and generalised resource sharing (briefed as
-- "0019_friends_and_sharing.sql" extending "0018_goal_sharing.sql" --
-- those numbers belong to 0018_rating_trend_and_divergence_fix.sql and
-- 0019_capacity_suggestions.sql in this repo's real history, from
-- Phase 4's check-in work; renumbered to 0044, the same "check the
-- live schema, not the highest filename in the brief" call 0043 already
-- made for the goal-participants half of this same brief family).
--
-- "Three concepts that deliberately do not collapse into one" (brief,
-- verbatim): friendship (a relationship, grants no access by itself),
-- participants (goal_participants -- joining the work, S1/0043's
-- territory), and grants (share_grants -- letting someone look). This
-- migration builds the first concept from nothing (confirmed live:
-- zero friendship/block tables or functions exist anywhere in this
-- schema) and finishes wiring the third, which -- unlike friendship --
-- already had real infrastructure: `share_grants` itself, its
-- `resource_type` check constraint (goal/someday_item/trip/profile),
-- `app.has_grant`, and `app.can_grant` (0040's resource-specific
-- authority check for writing a share_grants row) all predate this
-- file. What was missing on the grants side was purely the
-- user-facing verbs -- share/unshare/share-with-all-friends -- plus
-- the reason to use them at all (friends to share with).
--
-- ---------------------------------------------------------------------
-- A genuine reopening of 0037's decision, made deliberately rather
-- than by accident: 0037 wired `has_grant('goal', id, 'view')` into
-- `goals_select` only, explicitly *not* into `app.can_view_goal`/
-- `app.can_edit_goal` themselves, reasoning that those two functions
-- are the shared gate for tasks/milestones/ledger_entries/
-- rag_snapshots too, so widening them would hand a bare share grant
-- the goal's actual money and private ratings. This package's own
-- `017 friends test` (the executable spec this migration is built
-- against, same role `016 sharing test` played for 0043) asserts the
-- opposite for *both* directions -- a view grant should make
-- `can_view_goal` true, and an edit grant should make `can_edit_goal`
-- true -- and F2's own brief only defines a "view" meaning for Goal
-- scope at all (no "edit:" bullet, unlike Dream/Trip which spell out
-- both), which reads as silence on the question 0037 had explicitly
-- closed. Asked directly: the call is to reopen it -- an edit-scope
-- goal grant now unlocks real edit access, including to the goal's
-- tasks/milestones/ledger/RAG wherever `can_edit_goal` already gated
-- those (a materially wider surface than 0037 shipped with, taken on
-- deliberately, not as a side effect).
--
-- What stays carved out, because the brief's own "what still isn't
-- shared" section says so in as many words -- "per-goal ratings are
-- visible to that goal's participants" (participants, not grant-
-- holders) -- is `goal_ratings` and the participant list itself
-- (`v_goal_participants_detail`/`goal_participants_select`): both are
-- switched to a new, narrower `app.is_goal_owner_or_participant`
-- (today's pre-0044 `can_view_goal` logic, minus `has_grant`) rather
-- than riding the now-widened `can_view_goal`. `014 isolation test` is
-- updated alongside this file: four of its PART 5 "LEAK" assertions
-- (tasks/milestones/ledger/rag_snapshots) flip to "now allowed, taken
-- deliberately" since a view grant genuinely does unlock those now;
-- goal_ratings and the participant list keep their original
-- assertions, since those two are the ones deliberately still refused.
create or replace function app.is_goal_owner_or_participant(p_goal_id uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from goals g
    where g.id = p_goal_id and g.deleted_at is null
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from goal_participants gp
          where gp.goal_id = g.id and gp.user_id = auth.uid() and gp.removed_at is null
        )
      )
  );
$$;

-- A trip-kind goal can be shared two ways -- a `resource_type = 'goal'`
-- grant (the same path any other goal uses) or a `resource_type =
-- 'trip'` grant made through ShareControl on the trip page itself
-- (F2). Without the second `exists` clause below, a trip-level grant
-- would be a silent no-op exactly like 0037's own header describes:
-- app.can_grant('trip', ...) and app.share_resource both already work
-- for `resource_type = 'trip'` (0040 already had the authority check),
-- but nothing ever read `has_grant('trip', ...)` back -- trips_select,
-- and every other trip-adjacent policy, only ever consulted
-- can_view_goal(goal_id), which had no idea a trip-scoped grant
-- existed. Found by tracing through F3's own "home-list surfacing"
-- requirement (a shared trip needs to actually appear in /trips),
-- not assumed.
create or replace function app.can_view_goal(p_goal_id uuid) returns boolean
language sql stable security definer set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from goals g
    where g.id = p_goal_id and g.deleted_at is null
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from goal_participants gp
          where gp.goal_id = g.id and gp.user_id = auth.uid() and gp.removed_at is null
        )
        or app.has_grant('goal', g.id, 'view')
        or (
          g.kind = 'trip'
          and exists (
            select 1 from trips t
            where t.goal_id = g.id and app.has_grant('trip', t.id, 'view')
          )
        )
      )
  );
$$;

create or replace function app.can_edit_goal(p_goal_id uuid) returns boolean
language sql stable security definer set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from goals g
    where g.id = p_goal_id and g.deleted_at is null
      and (
        g.owner_id = auth.uid()
        or exists (
          select 1 from goal_participants gp
          where gp.goal_id = g.id and gp.user_id = auth.uid() and gp.removed_at is null
            and gp.role in ('owner', 'collaborator')
        )
        or app.has_grant('goal', g.id, 'edit')
        or (
          g.kind = 'trip'
          and exists (
            select 1 from trips t
            where t.goal_id = g.id and app.has_grant('trip', t.id, 'edit')
          )
        )
      )
  );
$$;

-- goals_select now reads straight off can_view_goal (which already
-- includes 0037's has_grant clause, plus owner/participant) -- the
-- exact same condition 0037 spelled out inline, no longer duplicated.
drop policy goals_select on goals;
create policy goals_select on goals
  for select
  using (deleted_at is null and app.can_view_goal(id));

-- The two carve-outs: switched from can_view_goal to the narrower
-- is_goal_owner_or_participant, so a bare share grant still doesn't
-- reach ratings or the participant list.
drop policy goal_ratings_insert on goal_ratings;
create policy goal_ratings_insert on goal_ratings
  for insert
  with check (user_id = auth.uid() and app.is_goal_owner_or_participant(goal_id));

drop policy goal_ratings_select on goal_ratings;
create policy goal_ratings_select on goal_ratings
  for select
  using (user_id = auth.uid() or app.is_goal_owner_or_participant(goal_id));

drop policy goal_participants_select on goal_participants;
create policy goal_participants_select on goal_participants
  for select
  using (user_id = auth.uid() or app.is_goal_owner_or_participant(goal_id));

do $$
begin
  assert (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'goals' and policyname = 'goals_select'
  ) = 1, 'expected exactly one goals_select policy after replace';
end $$;

-- ---------------------------------------------------------------------
-- Friendship: a relationship, on its own table, deliberately separate
-- from share_grants. A single directed row per pair (requester/
-- addressee) covers both the pending and accepted states -- no second
-- "friendships" vs "friend_requests" table -- with an unordered-pair
-- partial-free unique index (least/greatest, uuid has a full ordering
-- operator class) preventing a mirror-direction duplicate regardless
-- of who asks whom. No RLS insert/update policy: every write goes
-- through the SECURITY DEFINER functions below, the same "no
-- user-facing INSERT policy, by design" shape llama_messages already
-- established (CLAUDE.md's llama-wiring section) -- a bare `select`
-- policy is enough for the views below to read through it as the
-- caller, everything else is function-only.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  addressee_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friend check (requester_id <> addressee_id)
);

create unique index friendships_unordered_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

create policy friendships_select on public.friendships
  for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Blocking: one-directional by nature (a block is never mutual by
-- construction -- either party blocking the other is enough), on its
-- own table rather than a status value on friendships, since a block
-- has to survive an unfriend/no-friendship-ever-existed state and
-- needs its own independent lifecycle. select is blocker-only,
-- deliberately: "don't explain why" (F1 brief) extends to the blocked
-- person never being able to discover the block by querying this
-- table directly either, not just via send_friend_request's error text.
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint no_self_block check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

alter table public.user_blocks enable row level security;

create policy user_blocks_select on public.user_blocks
  for select
  using (blocker_id = auth.uid());

-- llama_messages.resource_type's check constraint (0036) has never
-- listed 'friendship' -- friend_request/friend_accepted are the first
-- triggers to reference one. Same extend-not-replace shape 0036 itself
-- used for someday_item/trip_stop.
alter table llama_messages drop constraint llama_messages_resource_type_check;
alter table llama_messages add constraint llama_messages_resource_type_check
  check (resource_type = any (array['goal', 'task', 'trip', 'check_in', 'pot', 'profile', 'someday_item', 'trip_stop', 'friendship']));

-- Two sharing-preference columns on profiles (F4). auto_share_profile
-- defaults true ("friends see your profile automatically" -- brief);
-- auto_share_someday defaults false, explicitly, per the brief's own
-- reasoning: it applies to *all* friends and to dreams added *later*
-- too, not a chosen few or a one-time snapshot, which is exactly the
-- kind of blanket, retroactive default that should require an opt-in.
alter table public.profiles
  add column auto_share_someday boolean not null default false,
  add column auto_share_profile boolean not null default true;

-- ---------------------------------------------------------------------
-- app.is_blocked_between / app.are_friends: the two cheap predicates
-- everything else below checks first.
create or replace function app.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

create or replace function app.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'app'
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester_id = p_a and addressee_id = p_b)
        or (requester_id = p_b and addressee_id = p_a))
  );
$$;

-- ---------------------------------------------------------------------
-- app._upsert_share_grant: the one place a share_grants row is ever
-- written to as "active", used by every sharing path below (explicit
-- share, share-with-all-friends, and the auto-share trigger) so the
-- reactivate-not-duplicate logic exists exactly once. share_grants
-- has a partial unique index on (resource_type, resource_id,
-- grantee_id) WHERE revoked_at IS NULL -- at most one active row can
-- ever exist for a given triple, which is what makes the first UPDATE
-- below safe to run unconditionally (it can only ever touch that one
-- row, if it exists). The second UPDATE reactivates the most recent
-- *revoked* row for the same triple instead of inserting a second
-- historical row on every unshare/reshare cycle -- ORDER BY revoked_at
-- DESC LIMIT 1 keeps it to exactly one row even if several exist from
-- past cycles.
create or replace function app._upsert_share_grant(
  p_resource_type text,
  p_resource_id uuid,
  p_grantor uuid,
  p_grantee uuid,
  p_scope public.share_scope
)
returns uuid
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_id uuid;
begin
  update share_grants
     set scope = p_scope
   where resource_type = p_resource_type and resource_id = p_resource_id
     and grantee_id = p_grantee and revoked_at is null
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  update share_grants
     set revoked_at = null, revoked_by = null, scope = p_scope
   where id = (
     select id from share_grants
      where resource_type = p_resource_type and resource_id = p_resource_id
        and grantee_id = p_grantee and revoked_at is not null
      order by revoked_at desc
      limit 1
   )
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into share_grants (resource_type, resource_id, grantor_id, grantee_id, scope)
  values (p_resource_type, p_resource_id, p_grantor, p_grantee, p_scope)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- app._apply_auto_share_preferences: applied once per direction from
-- app._apply_friendship_accepted below (once for the requester's own
-- preferences toward the new friend, once for the addressee's) --
-- symmetric, since both preferences apply equally to whichever side
-- accepted or sent the request. auto_share_someday shares every one
-- of p_owner's *current* dreams (not just future ones -- the trigger
-- below covers those) via the same reactivate-not-duplicate upsert,
-- looped rather than bulk-inserted so a previously-revoked share for
-- one specific dream reactivates instead of leaving a stray extra row.
create or replace function app._apply_auto_share_preferences(p_owner uuid, p_friend uuid)
returns void
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_prefs record;
  v_item record;
begin
  select auto_share_profile, auto_share_someday into v_prefs
    from profiles where id = p_owner;

  if v_prefs.auto_share_profile then
    perform app._upsert_share_grant('profile', p_owner, p_owner, p_friend, 'view');
  end if;

  if v_prefs.auto_share_someday then
    for v_item in select id from someday_items where user_id = p_owner and deleted_at is null loop
      perform app._upsert_share_grant('someday_item', v_item.id, p_owner, p_friend, 'view');
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- app._apply_friendship_accepted: the shared tail of both accept
-- paths below (a fresh accept via respond_to_friend_request, and the
-- auto-accept branch inside send_friend_request when the caller had
-- already been asked). Three variants for the requester's
-- notification, same "repetition is what makes a character feel like
-- a robot" reasoning 0043 already applied to goal_shared_with_you.
create or replace function app._apply_friendship_accepted(p_friendship_id uuid)
returns void
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_row record;
  v_requester_name text;
  v_bodies text[] := array[
    '%s accepted your friend request!',
    'You and %s are friends now.',
    '%s said yes -- you''re friends.'
  ];
  v_body text;
begin
  select * into v_row from friendships where id = p_friendship_id;

  perform app._apply_auto_share_preferences(v_row.requester_id, v_row.addressee_id);
  perform app._apply_auto_share_preferences(v_row.addressee_id, v_row.requester_id);

  select display_name into v_requester_name from profiles where id = v_row.addressee_id;
  v_body := format(
    v_bodies[1 + floor(random() * array_length(v_bodies, 1))::int],
    v_requester_name
  );
  insert into llama_messages (user_id, speaker, trigger_code, body, resource_type, resource_id, priority)
  values (v_row.requester_id, 'fluffy', 'friend_accepted', v_body, 'friendship', p_friendship_id, 2);
end;
$$;

-- ---------------------------------------------------------------------
-- app.send_friend_request: "handles the case where they already sent
-- you one -- it accepts rather than creating a mirror request, so the
-- UI doesn't need to check first" (brief, verbatim). Authority order,
-- deliberate: handle lookup first (a nonexistent handle should read
-- the same regardless of block state -- the block check only ever
-- matters once a real target is known), then self, then block, then
-- the existing-relationship check.
create or replace function app.send_friend_request(p_handle text)
returns uuid
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_target record;
  v_existing record;
  v_id uuid;
  v_bodies text[] := array[
    'Someone wants to be friends -- take a look.',
    'A friend request just came in.',
    'You''ve got a new friend request waiting.'
  ];
  v_body text;
begin
  select * into v_target from app.find_profile_by_handle(p_handle);
  if v_target.id is null then
    raise exception 'No one''s using that handle.' using errcode = 'no_data_found';
  end if;
  if v_target.id = auth.uid() then
    raise exception 'That''s you.' using errcode = 'check_violation';
  end if;
  if app.is_blocked_between(auth.uid(), v_target.id) then
    raise exception 'Friend request can''t be sent.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from friendships
   where (requester_id = auth.uid() and addressee_id = v_target.id)
      or (requester_id = v_target.id and addressee_id = auth.uid())
   limit 1;

  if v_existing.id is not null then
    if v_existing.status = 'pending' and v_existing.requester_id = v_target.id then
      update friendships set status = 'accepted', responded_at = now() where id = v_existing.id;
      perform app._apply_friendship_accepted(v_existing.id);
      return v_existing.id;
    end if;
    raise exception 'Already friends, or a request is pending.' using errcode = 'unique_violation';
  end if;

  insert into friendships (requester_id, addressee_id, status)
  values (auth.uid(), v_target.id, 'pending')
  returning id into v_id;

  v_body := v_bodies[1 + floor(random() * array_length(v_bodies, 1))::int];
  insert into llama_messages (user_id, speaker, trigger_code, body, resource_type, resource_id, priority)
  values (v_target.id, 'fluffy', 'friend_request', v_body, 'friendship', v_id, 1);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- app.respond_to_friend_request: accept or decline. Declining deletes
-- the row outright rather than a 'declined' status -- there's nothing
-- to keep a history of (unlike goal_participants' soft-remove, which
-- exists specifically so re-inviting reactivates a real history), and
-- deleting means a declined request never blocks a future one via the
-- unordered-pair unique index.
create or replace function app.respond_to_friend_request(p_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_row record;
begin
  select * into v_row from friendships where id = p_id;
  if v_row.id is null then
    raise exception 'Request not found.' using errcode = 'no_data_found';
  end if;
  if v_row.addressee_id <> auth.uid() then
    raise exception 'Only the addressee may respond to this request.' using errcode = 'insufficient_privilege';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request has already been resolved.' using errcode = 'check_violation';
  end if;

  if p_accept then
    update friendships set status = 'accepted', responded_at = now() where id = p_id;
    perform app._apply_friendship_accepted(p_id);
  else
    delete from friendships where id = p_id;
  end if;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- app.unfriend: "unfriend and revoke all shares both ways" (brief,
-- verbatim) -- a hard delete of the friendship row (unlike declining,
-- there's precedent to consider here: "people reasonably expect
-- unfriending to be reversible, and this part isn't" is the brief's
-- own justification for why the UI needs a firm confirmation, which
-- only makes sense if the underlying action really is permanent).
create or replace function app.unfriend(p_user uuid)
returns void
language plpgsql security definer set search_path to 'public', 'app'
as $$
begin
  delete from friendships
   where status = 'accepted'
     and ((requester_id = auth.uid() and addressee_id = p_user)
       or (requester_id = p_user and addressee_id = auth.uid()));

  update share_grants
     set revoked_at = now(), revoked_by = auth.uid()
   where revoked_at is null
     and ((grantor_id = auth.uid() and grantee_id = p_user)
       or (grantor_id = p_user and grantee_id = auth.uid()));
end;
$$;

-- app.block_user: unfriends (which already revokes shares both ways),
-- clears any outstanding pending request in either direction too
-- (unfriend only targets 'accepted' rows), then records the block.
-- on conflict do nothing -- blocking an already-blocked user is a
-- no-op, not an error.
create or replace function app.block_user(p_user uuid)
returns void
language plpgsql security definer set search_path to 'public', 'app'
as $$
begin
  perform app.unfriend(p_user);

  delete from friendships
   where status = 'pending'
     and ((requester_id = auth.uid() and addressee_id = p_user)
       or (requester_id = p_user and addressee_id = auth.uid()));

  insert into user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_user)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

create or replace function app.unblock_user(p_user uuid)
returns void
language sql security definer set search_path to 'public', 'app'
as $$
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

-- ---------------------------------------------------------------------
-- app.share_resource: the one entry point F2's <ShareControl> calls
-- for every resource type. Authority is app.can_grant (0040,
-- pre-existing) -- reused rather than reimplemented, since it already
-- encodes each resource type's real ownership model (goal: can_edit_goal,
-- someday_item/profile: literal ownership, trip: the parent goal's
-- can_edit_goal). "Visible to the resource owner only" (F2 brief) is
-- very slightly broader in practice for goals specifically -- can_grant's
-- existing 'goal' branch is can_edit_goal, which a goal_participants
-- collaborator also satisfies, not owner-only in the strictest sense --
-- left as-is rather than narrowed, since that's pre-existing 0040
-- behaviour this package didn't set out to revisit, and letting a
-- collaborator share view-only access to an outsider is strictly
-- narrower than what a collaborator can already do (invite a real
-- co-owner is owner-only via invite_by_handle; this is neither that
-- nor anything write-capable for the recipient).
create or replace function app.share_resource(
  p_resource_type text,
  p_resource_id uuid,
  p_grantee uuid,
  p_scope public.share_scope default 'view'
)
returns uuid
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_id uuid;
  v_bodies text[] := array[
    'Something just got shared with you -- take a look.',
    'You''ve got a new share waiting.',
    'A friend just shared something with you.'
  ];
  v_body text;
begin
  if p_grantee = auth.uid() then
    raise exception 'You can''t share something with yourself.' using errcode = 'check_violation';
  end if;
  if not app.can_grant(p_resource_type, p_resource_id) then
    raise exception 'Only the owner can share this.' using errcode = 'insufficient_privilege';
  end if;
  if app.is_blocked_between(auth.uid(), p_grantee) then
    raise exception 'This can''t be shared with them.' using errcode = 'insufficient_privilege';
  end if;

  v_id := app._upsert_share_grant(p_resource_type, p_resource_id, auth.uid(), p_grantee, p_scope);

  v_body := v_bodies[1 + floor(random() * array_length(v_bodies, 1))::int];
  insert into llama_messages (user_id, speaker, trigger_code, body, resource_type, resource_id, priority)
  values (p_grantee, 'fluffy', 'resource_shared_with_you', v_body, p_resource_type, p_resource_id, 2);

  return v_id;
end;
$$;

-- app.unshare_resource: "either side may call it" (brief, verbatim) --
-- the owner withdrawing and the recipient opting out are the same
-- function, distinguished only by which of grantor_id/p_grantee
-- auth.uid() matches. Takes p_grantee (not a grant id) since that's
-- what both call sites naturally have on hand -- ShareControl's own
-- revoke button, and the recipient removing their own access from
-- wherever they're viewing the shared resource.
create or replace function app.unshare_resource(
  p_resource_type text,
  p_resource_id uuid,
  p_grantee uuid
)
returns void
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_grantor uuid;
begin
  select grantor_id into v_grantor
    from share_grants
   where resource_type = p_resource_type and resource_id = p_resource_id
     and grantee_id = p_grantee and revoked_at is null;

  if v_grantor is null then
    raise exception 'No active share to revoke.' using errcode = 'no_data_found';
  end if;

  if auth.uid() <> v_grantor and auth.uid() <> p_grantee then
    raise exception 'Only the person who shared this, or the person it was shared with, can revoke it.'
      using errcode = 'insufficient_privilege';
  end if;

  update share_grants
     set revoked_at = now(), revoked_by = auth.uid()
   where resource_type = p_resource_type and resource_id = p_resource_id
     and grantee_id = p_grantee and revoked_at is null;
end;
$$;

-- app.share_with_all_friends: "one call, every friend" (brief,
-- verbatim) -- loops the caller's own accepted friendships, reusing
-- the same upsert and the same notification every explicit share
-- fires. Returns the count shared with, purely so the UI can say
-- "shared with 4 friends" without a second query.
create or replace function app.share_with_all_friends(
  p_resource_type text,
  p_resource_id uuid,
  p_scope public.share_scope default 'view'
)
returns int
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_friend record;
  v_count int := 0;
begin
  if not app.can_grant(p_resource_type, p_resource_id) then
    raise exception 'Only the owner can share this.' using errcode = 'insufficient_privilege';
  end if;

  for v_friend in
    select case when requester_id = auth.uid() then addressee_id else requester_id end as friend_id
      from friendships
     where status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid())
  loop
    perform app._upsert_share_grant(p_resource_type, p_resource_id, auth.uid(), v_friend.friend_id, p_scope);
    insert into llama_messages (user_id, speaker, trigger_code, body, resource_type, resource_id, priority)
    values (
      v_friend.friend_id, 'fluffy', 'resource_shared_with_you',
      'Something just got shared with you -- take a look.', p_resource_type, p_resource_id, 2
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Auto-share on new dream (F4: "a trigger auto-shares new dreams when
-- the preference is on", brief verbatim). Fires per-row on insert,
-- checking the *new row's own owner's* auto_share_someday (not
-- auth.uid() directly, though they're the same value at insert time
-- under someday_items' own RLS -- new.user_id is the more literal,
-- trigger-correct reference regardless of who ends up calling this).
create or replace function app._auto_share_new_dream()
returns trigger
language plpgsql security definer set search_path to 'public', 'app'
as $$
declare
  v_auto_share boolean;
  v_friend record;
begin
  select auto_share_someday into v_auto_share from profiles where id = new.user_id;
  if not coalesce(v_auto_share, false) then
    return new;
  end if;

  for v_friend in
    select case when requester_id = new.user_id then addressee_id else requester_id end as friend_id
      from friendships
     where status = 'accepted' and (requester_id = new.user_id or addressee_id = new.user_id)
  loop
    perform app._upsert_share_grant('someday_item', new.id, new.user_id, v_friend.friend_id, 'view');
  end loop;

  return new;
end;
$$;

drop trigger if exists someday_items_auto_share on someday_items;
create trigger someday_items_auto_share
  after insert on someday_items
  for each row execute function app._auto_share_new_dream();

-- ---------------------------------------------------------------------
-- Views. security_invoker=true on every one, per P9.0's own hard-won
-- lesson (0038), applied from the start here same as 0043's views.

-- Every accepted friend of the caller, with the *other* party's
-- profile resolved via a CASE join (friendships doesn't distinguish
-- "me" from "them" structurally -- requester/addressee is who asked,
-- not who's viewing).
create or replace view v_friends
with (security_invoker = true) as
select
  f.id as friendship_id,
  case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as user_id,
  p.handle,
  p.display_name,
  p.avatar,
  f.responded_at as since
from friendships f
join profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
where f.status = 'accepted'
  and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());

-- Pending requests either direction, split by is_incoming (F1: "both
-- from v_friend_requests, split on is_incoming").
create or replace view v_friend_requests
with (security_invoker = true) as
select
  f.id,
  f.requester_id,
  f.addressee_id,
  (f.addressee_id = auth.uid()) as is_incoming,
  p.handle,
  p.display_name,
  p.avatar,
  f.created_at
from friendships f
join profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
where f.status = 'pending'
  and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());

-- Everything shared *with* the caller, across all four resource
-- types, "with a resolved title and owner" (F3 brief, verbatim) -- a
-- trip has no title of its own (it lives on the parent goal, per
-- CLAUDE.md's existing "a trip's title lives on its parent goal" note
-- from P6.1), so the trip branch joins through to goals for it; a
-- profile has no title at all, so its own display_name stands in.
create or replace view v_shared_with_me_all
with (security_invoker = true) as
select sg.id as grant_id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at as shared_at,
       g.title, g.owner_id, owner.display_name as owner_name, owner.handle as owner_handle, owner.avatar as owner_avatar
  from share_grants sg
  join goals g on g.id = sg.resource_id and g.deleted_at is null
  join profiles owner on owner.id = g.owner_id
 where sg.resource_type = 'goal' and sg.grantee_id = auth.uid() and sg.revoked_at is null
union all
select sg.id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at,
       si.title, si.user_id, owner.display_name, owner.handle, owner.avatar
  from share_grants sg
  join someday_items si on si.id = sg.resource_id and si.deleted_at is null
  join profiles owner on owner.id = si.user_id
 where sg.resource_type = 'someday_item' and sg.grantee_id = auth.uid() and sg.revoked_at is null
union all
select sg.id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at,
       g.title, g.owner_id, owner.display_name, owner.handle, owner.avatar
  from share_grants sg
  join trips t on t.id = sg.resource_id
  join goals g on g.id = t.goal_id and g.deleted_at is null
  join profiles owner on owner.id = g.owner_id
 where sg.resource_type = 'trip' and sg.grantee_id = auth.uid() and sg.revoked_at is null
union all
select sg.id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at,
       owner.display_name as title, owner.id as owner_id, owner.display_name, owner.handle, owner.avatar
  from share_grants sg
  join profiles owner on owner.id = sg.resource_id
 where sg.resource_type = 'profile' and sg.grantee_id = auth.uid() and sg.revoked_at is null;

-- Everything the caller has shared *out*, grouped by person at the UI
-- layer (F4: "grouped by person, with bulk revoke per person") --
-- this view stays flat, one row per grant, since grouping is a render
-- concern the UI already handles the same way elsewhere.
create or replace view v_my_shares
with (security_invoker = true) as
select sg.id as grant_id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at as shared_at,
       sg.grantee_id, grantee.display_name as grantee_name, grantee.handle as grantee_handle,
       grantee.avatar as grantee_avatar, g.title
  from share_grants sg
  join profiles grantee on grantee.id = sg.grantee_id
  join goals g on g.id = sg.resource_id and g.deleted_at is null
 where sg.resource_type = 'goal' and sg.grantor_id = auth.uid() and sg.revoked_at is null
union all
select sg.id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at,
       sg.grantee_id, grantee.display_name, grantee.handle, grantee.avatar, si.title
  from share_grants sg
  join profiles grantee on grantee.id = sg.grantee_id
  join someday_items si on si.id = sg.resource_id and si.deleted_at is null
 where sg.resource_type = 'someday_item' and sg.grantor_id = auth.uid() and sg.revoked_at is null
union all
select sg.id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at,
       sg.grantee_id, grantee.display_name, grantee.handle, grantee.avatar, g.title
  from share_grants sg
  join profiles grantee on grantee.id = sg.grantee_id
  join trips t on t.id = sg.resource_id
  join goals g on g.id = t.goal_id and g.deleted_at is null
 where sg.resource_type = 'trip' and sg.grantor_id = auth.uid() and sg.revoked_at is null
union all
select sg.id, sg.resource_type, sg.resource_id, sg.scope, sg.created_at,
       sg.grantee_id, grantee.display_name, grantee.handle, grantee.avatar, owner.display_name as title
  from share_grants sg
  join profiles grantee on grantee.id = sg.grantee_id
  join profiles owner on owner.id = sg.resource_id
 where sg.resource_type = 'profile' and sg.grantor_id = auth.uid() and sg.revoked_at is null;

-- ---------------------------------------------------------------------
-- public.* wrappers -- app schema isn't PostgREST-reachable directly,
-- same convention 0043 already followed. is_blocked_between/
-- are_friends/can_grant/_upsert_share_grant/_apply_* stay app-schema-
-- only: are_friends is exposed (F1's friend cards / any future "are we
-- friends" check), is_blocked_between is not (nothing in the UI needs
-- to ask this directly -- send_friend_request's own error already
-- covers the one place blocking surfaces).
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path to 'public', 'app'
as $$ select app.are_friends(p_a, p_b); $$;

create or replace function public.send_friend_request(p_handle text)
returns uuid
language sql security definer set search_path to 'public', 'app'
as $$ select app.send_friend_request(p_handle); $$;

create or replace function public.respond_to_friend_request(p_id uuid, p_accept boolean)
returns uuid
language sql security definer set search_path to 'public', 'app'
as $$ select app.respond_to_friend_request(p_id, p_accept); $$;

create or replace function public.unfriend(p_user uuid)
returns void
language sql security definer set search_path to 'public', 'app'
as $$ select app.unfriend(p_user); $$;

create or replace function public.block_user(p_user uuid)
returns void
language sql security definer set search_path to 'public', 'app'
as $$ select app.block_user(p_user); $$;

create or replace function public.unblock_user(p_user uuid)
returns void
language sql security definer set search_path to 'public', 'app'
as $$ select app.unblock_user(p_user); $$;

create or replace function public.share_resource(
  p_resource_type text, p_resource_id uuid, p_grantee uuid, p_scope public.share_scope default 'view'
)
returns uuid
language sql security definer set search_path to 'public', 'app'
as $$ select app.share_resource(p_resource_type, p_resource_id, p_grantee, p_scope); $$;

create or replace function public.unshare_resource(p_resource_type text, p_resource_id uuid, p_grantee uuid)
returns void
language sql security definer set search_path to 'public', 'app'
as $$ select app.unshare_resource(p_resource_type, p_resource_id, p_grantee); $$;

create or replace function public.share_with_all_friends(
  p_resource_type text, p_resource_id uuid, p_scope public.share_scope default 'view'
)
returns int
language sql security definer set search_path to 'public', 'app'
as $$ select app.share_with_all_friends(p_resource_type, p_resource_id, p_scope); $$;

do $$
begin
  assert (
    select count(*) from pg_proc where proname = 'send_friend_request' and pronamespace = 'public'::regnamespace
  ) = 1, 'expected public.send_friend_request to exist';
  assert (
    select count(*) from pg_proc where proname = 'share_resource' and pronamespace = 'public'::regnamespace
  ) = 1, 'expected public.share_resource to exist';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_friends'
  ), 'v_friends must be security_invoker';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_friend_requests'
  ), 'v_friend_requests must be security_invoker';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_shared_with_me_all'
  ), 'v_shared_with_me_all must be security_invoker';
  assert (
    select reloptions is not null and 'security_invoker=true' = any(reloptions)
    from pg_class where relname = 'v_my_shares'
  ), 'v_my_shares must be security_invoker';
end $$;
