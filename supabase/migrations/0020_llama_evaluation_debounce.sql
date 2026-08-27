-- P4.6: wiring the llamas. The only schema this phase needs — every
-- data source the evaluator reads already exists (v_goal_rag/0016,
-- rag_snapshots/P4.4, v_checkin_streak/0015, the
-- public.current_checkin_period wrapper/0019, v_user_capacity), and
-- llama_messages already has real SELECT/UPDATE policies plus the
-- app.filter_llama_message BEFORE INSERT trigger that enforces
-- llama_frequency — this migration doesn't touch any of that.
--
-- One column: when this user's triggers were last evaluated, so the
-- route handler can debounce to at most once an hour (brief, verbatim)
-- without a separate tracking table. Nullable — a user who's never been
-- evaluated has no timestamp to compare against, which the evaluator
-- reads as "run now", not an error.
alter table public.profiles
  add column llama_evaluated_at timestamptz;
