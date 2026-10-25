-- ============================================================
-- PEX → Grant Management scope, enforced in the database.
--
-- Rule: a PEX transaction belongs in Grant Management only if its card
-- was assigned to a grant (gm_pex_card_grants) on the transaction date.
-- Cards that aren't assigned to a grant - including cards switched on
-- as "Used for grants" with no grant picked yet - never show there.
--
-- gm_pex_transactions.in_grant_scope holds the answer and is kept
-- correct by triggers, so every screen, API, upload and sync agrees:
--   * set on insert / when a transaction's card or date changes
--   * recomputed for a card whenever its grant assignments change
-- ============================================================

alter table gm_pex_transactions add column if not exists in_grant_scope boolean not null default false;
create index if not exists gm_pex_scope on gm_pex_transactions (in_grant_scope, status, transaction_date desc);

create or replace function gm_pex_scope_of(p_card uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select p_card is not null and exists (
    select 1 from gm_pex_card_grants l
    where l.card_id = p_card and p_date >= l.start_date and (l.end_date is null or p_date <= l.end_date)
  );
$$;

create or replace function gm_pex_tx_scope_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.in_grant_scope := gm_pex_scope_of(new.card_id, new.transaction_date);
  return new;
end $$;

drop trigger if exists gm_pex_tx_scope on gm_pex_transactions;
create trigger gm_pex_tx_scope before insert or update of card_id, transaction_date on gm_pex_transactions
  for each row execute function gm_pex_tx_scope_trg();

create or replace function gm_pex_link_scope_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update gm_pex_transactions set in_grant_scope = gm_pex_scope_of(card_id, transaction_date) where card_id = old.card_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update gm_pex_transactions set in_grant_scope = gm_pex_scope_of(card_id, transaction_date) where card_id = new.card_id;
  end if;
  return null;
end $$;

drop trigger if exists gm_pex_link_scope on gm_pex_card_grants;
create trigger gm_pex_link_scope after insert or update or delete on gm_pex_card_grants
  for each row execute function gm_pex_link_scope_trg();

-- Backfill.
update gm_pex_transactions set in_grant_scope = gm_pex_scope_of(card_id, transaction_date);

-- Non-managers reading directly only ever see in-scope rows.
drop policy if exists gm_pex_read on gm_pex_transactions;
create policy gm_pex_read on gm_pex_transactions for select using (
  gm_is_manager()
  or (in_grant_scope and (employee_id = gm_me() or (suggested_grant_id is not null and gm_can_view_grant(suggested_grant_id))))
);
