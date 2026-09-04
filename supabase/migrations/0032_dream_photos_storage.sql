-- P8.1: Photo uploads. The Dream Diary's first user-uploaded binary
-- content, and the first storage security surface in this app. Storage
-- RLS is a genuinely separate system from table RLS -- `storage.objects`
-- has its own policies, checked against its own `bucket_id`/`name`
-- columns, and nothing about a passing `011 dreams test` (table RLS)
-- says anything about whether this is right. Verified live: no bucket,
-- no `storage.objects` policy, and RLS already enabled on
-- `storage.objects` (Supabase's own default) existed before this
-- migration -- a clean slate, not something to build carefully around.
--
-- Bucket: dream-photos, private (public = false). A public bucket means
-- every object is a permanently guessable URL, including after the row
-- referencing it is gone -- this is content (a photo of someone's own
-- car, jacket, street) nobody uploading it would expect to be
-- world-readable forever. Every read instead goes through a short-lived
-- signed URL, minted server-side (src/lib/storage/dream-photos.ts) --
-- and minting one only succeeds if the caller's own auth.uid() already
-- passes the SELECT policy below, so "private" is enforced twice: once
-- at signing time, once implicitly by the bucket never serving a bare
-- object URL to begin with.
--
-- Path convention: {user_id}/{dream_id}/{uuid}.webp (thumbnails share
-- the same {uuid} with a `_thumb` suffix inserted before the extension
-- -- see deriveThumbPath in src/lib/storage/dream-photos.ts -- a fixed,
-- pure derivation rather than a second stored path, so the two objects
-- can never drift apart in the database the way a second column could).
-- Owner as the first path segment is what makes the policies below
-- expressible as a single, uniform "first segment = auth.uid()" check
-- rather than a per-row lookup the way table RLS's app.has_grant() is --
-- storage has no foreign key to someday_items and no business knowing
-- about dreams at all, only paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dream-photos',
  'dream-photos',
  false,
  5242880,  -- 5MB. Genuine uploads here are always the client's own
            -- re-encoded WebP (brief: "typically... under 400KB"), so
            -- this is defense in depth, not the real size control -- the
            -- real control is the 15MB pre-processing check client-side,
            -- against the *original* file, before it's ever resized (see
            -- src/lib/image-processing.ts).
  array['image/webp']  -- Everything that reaches this bucket has already
                        -- been decoded and re-encoded to WebP client-side
                        -- -- nothing else should ever land here. The
                        -- bucket refusing anything else too is a second
                        -- line of defense in case client-side validation
                        -- is ever bypassed, buggy, or skipped by a future
                        -- caller that doesn't go through <ImageUpload>.
)
on conflict (id) do nothing;

-- Four policies, one per operation, all keyed on the identical predicate.
-- No `to authenticated` role clause -- matching this schema's existing
-- style throughout (see e.g. someday_select), which relies on auth.uid()
-- being null for an anonymous caller rather than a separate role
-- restriction: `(storage.foldername(name))[1] = auth.uid()::text` can
-- never be true when auth.uid() is null (NULL = anything is never true
-- in SQL), so anon is refused by the same predicate, not a second one.
--
-- Deliberately does not consult someday_items or its own share-grant
-- surface at all. A share-grant viewer of someone else's dream never
-- gets their own storage access to the owner's objects -- they see the
-- photo through a signed URL the *owner's* row-level access already
-- justified server-side (src/lib/storage/dream-photos.ts), never through
-- a storage policy of their own. Storage has no concept of "has a share
-- grant on someday_item X" to check, and shouldn't grow one just for
-- this -- that authorization question belongs to the table layer, which
-- already answers it.
create policy dream_photos_insert on storage.objects
  for insert
  with check (
    bucket_id = 'dream-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy dream_photos_select on storage.objects
  for select
  using (
    bucket_id = 'dream-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy dream_photos_update on storage.objects
  for update
  using (
    bucket_id = 'dream-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'dream-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy dream_photos_delete on storage.objects
  for delete
  using (
    bucket_id = 'dream-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

do $$
begin
  assert (
    select count(*) from storage.buckets
    where id = 'dream-photos' and public = false
  ) = 1, 'dream-photos bucket should exist and be private';

  assert (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'dream_photos_%'
  ) = 4, 'expected exactly 4 dream_photos storage policies';
end $$;
