-- ============================================================
-- Lets a requestor edit Credit Card / Mileage line items while their
-- ticket is in 'fixing' status - same "own row AND parent ticket
-- status = fixing" scoping as the single-record categories got in
-- finance_tickets_resubmit_edit_migration.sql. These two categories
-- were left out of that pass since editing a whole batch of line
-- items (not just one record's fields) needed more UI work first.
--
-- Insert/delete are included (not just update) because editing here
-- means replacing the whole line-item set on resubmit (delete
-- everything under the statement/batch, re-insert from the edited
-- form) rather than diffing individual rows - the app-level
-- implementation choice this scoping needs to support.
-- ============================================================

create policy "finance_credit_card_statements own update while fixing" on finance_credit_card_statements
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.credit_card_statement_id = finance_credit_card_statements.id and t.status = 'fixing')
  );

create policy "finance_credit_card_transactions own write while fixing" on finance_credit_card_transactions
  for all using (
    exists (
      select 1 from finance_credit_card_statements s
      join finance_tickets t on t.credit_card_statement_id = s.id
      where s.id = finance_credit_card_transactions.statement_id
      and s.requestor_id = (select id from employees where auth_user_id = auth.uid())
      and t.status = 'fixing'
    )
  );

create policy "finance_mileage_batches own update while fixing" on finance_mileage_batches
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.mileage_batch_id = finance_mileage_batches.id and t.status = 'fixing')
  );

create policy "finance_mileage_trips own write while fixing" on finance_mileage_trips
  for all using (
    exists (
      select 1 from finance_mileage_batches b
      join finance_tickets t on t.mileage_batch_id = b.id
      where b.id = finance_mileage_trips.batch_id
      and b.requestor_id = (select id from employees where auth_user_id = auth.uid())
      and t.status = 'fixing'
    )
  );

-- Allocations follow the same line items - a requestor needs to be
-- able to replace these too when re-editing a transaction/trip's
-- grant or office split.
create policy "finance_ticket_grant_allocations own write while fixing" on finance_ticket_grant_allocations
  for all using (
    exists (
      select 1 from finance_credit_card_transactions txn
      join finance_credit_card_statements s on s.id = txn.statement_id
      join finance_tickets t on t.credit_card_statement_id = s.id
      where txn.id = finance_ticket_grant_allocations.credit_card_transaction_id
      and s.requestor_id = (select id from employees where auth_user_id = auth.uid())
      and t.status = 'fixing'
    )
    or exists (
      select 1 from finance_mileage_trips trip
      join finance_mileage_batches b on b.id = trip.batch_id
      join finance_tickets t on t.mileage_batch_id = b.id
      where trip.id = finance_ticket_grant_allocations.mileage_trip_id
      and b.requestor_id = (select id from employees where auth_user_id = auth.uid())
      and t.status = 'fixing'
    )
  );

create policy "finance_ticket_office_allocations own write while fixing" on finance_ticket_office_allocations
  for all using (
    exists (
      select 1 from finance_credit_card_transactions txn
      join finance_credit_card_statements s on s.id = txn.statement_id
      join finance_tickets t on t.credit_card_statement_id = s.id
      where txn.id = finance_ticket_office_allocations.credit_card_transaction_id
      and s.requestor_id = (select id from employees where auth_user_id = auth.uid())
      and t.status = 'fixing'
    )
    or exists (
      select 1 from finance_mileage_trips trip
      join finance_mileage_batches b on b.id = trip.batch_id
      join finance_tickets t on t.mileage_batch_id = b.id
      where trip.id = finance_ticket_office_allocations.mileage_trip_id
      and b.requestor_id = (select id from employees where auth_user_id = auth.uid())
      and t.status = 'fixing'
    )
  );
