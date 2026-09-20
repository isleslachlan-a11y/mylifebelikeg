-- Social link capture for the Dream Diary (briefed as "P9.11, sequence
-- before P9.10" -- P9.4 through P9.10 were never actually built on this
-- branch's real history, which runs P9.0-P9.3 (isolation/deletion/
-- operational floor/password reset) straight into P10.0-P10.2
-- (navigation parity/Unsplash compliance/goal sharing); slotting a new
-- package retroactively "before P9.10" would misrepresent where this
-- actually lands chronologically. Filed as P10.3, the next real
-- increment, per the brief's own "renumber if you'd rather it sat
-- elsewhere" allowance. Migration numbered 0045 to follow 0044
-- (friends and sharing), the last real migration in this repo -- not
-- any number implied by the brief, per this repo's own established
-- "check the live schema, not the highest filename in the brief" rule.
--
-- Confirmed before writing a line of this file: "Dream Diary" (P8's own
-- rebrand of the P6.1 someday list, per its commit message "the Dream
-- Diary (bucket list rebuild...)") never introduced a new entry table --
-- someday_items is still it, unchanged in name. This migration adds
-- exactly one new table, sized and scoped to this package's own explicit
-- non-goals: no oEmbed, no thumbnail caching, no short-link resolution --
-- thumbnail_path/provider_metadata/resolved_at exist as P10-onward
-- placeholders, left null by every code path this package adds.
create table public.dream_entry_links (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.someday_items(id) on delete cascade,
  -- Denormalised for RLS, matching someday_items' own user_id column --
  -- a plain equality check here is cheaper than a join back to
  -- someday_items on every read, the same reasoning that column
  -- already exists for everywhere else in this schema.
  user_id uuid not null references public.profiles(id),
  provider text not null check (provider in ('instagram', 'tiktok', 'pinterest', 'other')),
  provider_post_id text,
  url text not null check (length(trim(url)) > 0),
  canonical_url text not null check (length(trim(canonical_url)) > 0),
  title text,
  note text,
  -- P10+ placeholder -- oEmbed/thumbnail caching. Left null by every
  -- code path in this package; never read either.
  thumbnail_path text,
  -- P10+ placeholder -- oEmbed metadata enrichment (TikTok/Pinterest
  -- have public keyless endpoints; Instagram stays manual-title
  -- regardless). Left null by every code path in this package.
  provider_metadata jsonb,
  resolve_status text not null default 'unresolved'
    check (resolve_status in ('unresolved', 'ok', 'failed', 'unsupported')),
  -- P10+ placeholder, paired with resolve_status/provider_metadata --
  -- always null while resolve_status is always 'unresolved'.
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Stops a double-paste of the same link under the same entry from
-- creating two rows -- canonical_url, not the raw pasted url, since
-- that's what actually identifies "the same post" across trivially
-- different paste strings (tracking params, trailing slash, www.).
create unique index dream_entry_links_entry_canonical_unique
  on public.dream_entry_links (entry_id, canonical_url);

create index dream_entry_links_entry_idx
  on public.dream_entry_links (entry_id);

-- No `position`/ordering column, deliberately -- "we are not
-- reintroducing the partial-unique-index reorder collision we hit on
-- trip_stops" (brief, verbatim; see 0024's trip_stops_sequence_unique
-- and app.reorder_trip_stop's own park-then-renumber dance, built
-- specifically to work around that exact class of problem). Ordered by
-- created_at in the client instead -- there is nothing here worth
-- reordering.

alter table public.dream_entry_links enable row level security;

-- Strictly owner-only, all four operations -- matching someday_delete/
-- someday_insert's own shape (user_id = auth.uid(), full stop), not
-- someday_select/someday_update's share-grant-aware one. A saved link
-- is the user's own private annotation on a dream, not something a
-- share_grants viewer of the dream itself should inherit access to --
-- confirmed against the brief, which never once mentions grants or
-- friends anywhere in this package, and the adversarial test table it
-- specifies only ever exercises the plain "unrelated user" case.
create policy dream_entry_links_select on public.dream_entry_links
  for select
  using (user_id = auth.uid());

-- "Insert policy must also verify the entry_id belongs to the same
-- user, so a user cannot attach a link to someone else's entry by
-- guessing an id" (brief, verbatim) -- user_id = auth.uid() alone
-- would not catch that: a forged insert could set user_id to the
-- caller's own id while pointing entry_id at someone else's dream,
-- creating a link that dangles off a row the caller doesn't own.
create policy dream_entry_links_insert on public.dream_entry_links
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from someday_items si
      where si.id = entry_id and si.user_id = auth.uid()
    )
  );

-- Same re-parenting concern as insert applies to update: WITH CHECK
-- re-verifies entry_id's ownership too, not just user_id, in case a
-- forged UPDATE tries to move a link onto a different entry_id the
-- caller doesn't own (0040's own share_grants_update fix is exactly
-- this class of gap, found once already in this schema).
create policy dream_entry_links_update on public.dream_entry_links
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from someday_items si
      where si.id = entry_id and si.user_id = auth.uid()
    )
  );

create policy dream_entry_links_delete on public.dream_entry_links
  for delete
  using (user_id = auth.uid());

do $$
begin
  assert (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'dream_entry_links'
  ) = 4, 'expected exactly four dream_entry_links policies (select/insert/update/delete)';
  assert (
    select relrowsecurity from pg_class where relname = 'dream_entry_links'
  ), 'dream_entry_links must have row level security enabled';
end $$;
