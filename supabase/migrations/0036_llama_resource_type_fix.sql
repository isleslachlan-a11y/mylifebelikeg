-- P8.6 fallout, not P8.6 itself: verifying the share-card route against a
-- real "mark achieved" click surfaced a live bug -- `llama_messages`'s
-- `resource_type` check constraint has never allowed `'someday_item'` or
-- `'trip_stop'`, so every dream/trip-stop-scoped llama trigger has been
-- silently failing to insert since the phase that introduced it:
-- `bucket_list_milestone` (P6.1), `stop_unbooked_soon` (P6.5),
-- `dream_achieved` and `dream_let_go` (P8.4). `emitLlamaMessage`'s own
-- "log, don't throw" design (src/lib/llamas/emit.ts) is exactly why this
-- went unnoticed -- the achieve/promote/let-go actions themselves always
-- succeeded, only the console ever saw the failure. Confirmed live: the
-- constraint (`pg_get_constraintdef`) only ever listed
-- ARRAY['goal','task','trip','check_in','pot','profile'], and both
-- 'someday_item' and 'trip_stop' are real, valid ids on real tables --
-- the constraint was just never extended when those triggers were built,
-- not evidence the values themselves are wrong.
alter table llama_messages drop constraint llama_messages_resource_type_check;
alter table llama_messages add constraint llama_messages_resource_type_check
  check (resource_type = any (array['goal', 'task', 'trip', 'check_in', 'pot', 'profile', 'someday_item', 'trip_stop']));
