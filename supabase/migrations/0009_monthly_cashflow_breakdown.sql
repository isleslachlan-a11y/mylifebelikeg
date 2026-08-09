-- P2.1: a per-user breakdown of recurring cashflow into monthly-normalized
-- income/expense subtotals plus the resulting capacity, all in the user's
-- base currency and computed together in one query so
-- income_monthly_minor - expense_monthly_minor = monthly_capacity_minor by
-- construction — never two separately-maintained aggregates that could
-- quietly drift apart.
--
-- Deliberately additive, NOT a change to the existing v_monthly_capacity:
-- no prior migration files are committed to this repo yet (the live
-- project's schema is ahead of what's checked in — see CLAUDE.md's
-- Database section), so this migration has no way to see that view's
-- actual current definition. Redefining it blind risks silently changing
-- behaviour the rest of the app (and 001_smoke_test.sql) already depends
-- on; a new, independent view carries none of that risk. v_monthly_capacity
-- is left untouched — nothing currently reads it (grep the app: only
-- v_user_capacity, the *goal-count* limit view with a confusingly similar
-- name, is wired up so far), so there is no migration path to reconcile.
--
-- NOT sanity-checked against supabase/local's throwaway-Postgres process
-- (DEPLOYMENT.md's migration step 4) — that process replays
-- supabase/migrations/*.sql starting at 0001, which isn't committed here,
-- so there's no local schema to lay this migration down on top of. Review
-- this by hand against the real schema before applying it, per DEPLOYMENT.md.
--
-- Frequency → monthly multiplier (the actual point of this view — see
-- CLAUDE.md/the P2.1 brief: "weekly is 52/12 months, not 4, and that error
-- compounds"): weekly ×52/12, fortnightly ×26/12, quarterly ×4/12,
-- annually ×1/12, monthly ×1. one_off is excluded (multiplier 0) — a
-- single non-recurring item has no monthly rate to normalise to; it still
-- appears in a plain cashflow_items listing, just not in this aggregate.
--
-- FX: cashflow_items stores amount_minor + currency only, no stamped rate
-- (unlike ledger_entries, which stamps FX at write time per Schema.MD —
-- appropriate there for historical spend, not for an ongoing recurring
-- commitment). So conversion to the user's base_currency happens at read
-- time via app.fx_rate(), using the latest available rate, same as this
-- view's presumed sibling v_monthly_capacity.
--
-- "Currently active" means active_from <= today <= active_to (or
-- active_to is null, i.e. still ongoing), where "today" is the user's own
-- timezone-derived date via app.today_for_user() (CLAUDE.md rule 4), not
-- UTC today.
--
-- SECURITY INVOKER (default from Postgres 15+, explicit here anyway) so
-- the view enforces the querying user's own RLS on cashflow_items and
-- profiles rather than the view owner's — required per CLAUDE.md rule 3.
create or replace view public.v_monthly_cashflow
with (security_invoker = true) as
select
  ci.user_id,
  p.base_currency,
  sum(
    case when ci.kind = 'income' then
      round(
        ci.amount_minor
        * app.fx_rate(ci.currency, p.base_currency)
        * case ci.frequency
            when 'weekly'      then 52.0 / 12
            when 'fortnightly' then 26.0 / 12
            when 'monthly'     then 1.0
            when 'quarterly'   then 4.0 / 12
            when 'annually'    then 1.0 / 12
            else 0.0 -- one_off
          end
      )
    else 0
    end
  )::bigint as income_monthly_minor,
  sum(
    case when ci.kind = 'expense' then
      round(
        ci.amount_minor
        * app.fx_rate(ci.currency, p.base_currency)
        * case ci.frequency
            when 'weekly'      then 52.0 / 12
            when 'fortnightly' then 26.0 / 12
            when 'monthly'     then 1.0
            when 'quarterly'   then 4.0 / 12
            when 'annually'    then 1.0 / 12
            else 0.0
          end
      )
    else 0
    end
  )::bigint as expense_monthly_minor,
  sum(
    (case when ci.kind = 'income' then 1 else -1 end)
    * round(
        ci.amount_minor
        * app.fx_rate(ci.currency, p.base_currency)
        * case ci.frequency
            when 'weekly'      then 52.0 / 12
            when 'fortnightly' then 26.0 / 12
            when 'monthly'     then 1.0
            when 'quarterly'   then 4.0 / 12
            when 'annually'    then 1.0 / 12
            else 0.0
          end
      )
  )::bigint as monthly_capacity_minor
from cashflow_items ci
join profiles p on p.id = ci.user_id
where ci.deleted_at is null
  and ci.active_from <= app.today_for_user(ci.user_id)
  and (ci.active_to is null or ci.active_to >= app.today_for_user(ci.user_id))
group by ci.user_id, p.base_currency;

-- Explicit grant, not inherited: 0008_grants.sql ran before this view
-- existed, and nothing in this migration can see whether it used
-- ALTER DEFAULT PRIVILEGES for future public views. Grant directly rather
-- than assume.
grant select on public.v_monthly_cashflow to authenticated;
