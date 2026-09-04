-- TEMPORARY, for P9.0 acceptance-criteria verification only -- reverted
-- immediately after confirming CI fails. Not a real migration.
create table public.p9_deliberate_uncovered_table (id uuid primary key default gen_random_uuid());

create or replace view public.v_pot_balances as
select po.id as pot_id, po.user_id, po.name, po.currency,
  (po.opening_balance_minor::numeric - coalesce(sum(round(le.amount_minor::numeric * app.fx_rate(le.currency, po.currency, le.occurred_on))), 0::numeric))::bigint as balance_minor
from pots po
left join ledger_entries le on le.pot_id = po.id and le.deleted_at is null
where po.deleted_at is null
group by po.id, po.user_id, po.name, po.currency;
