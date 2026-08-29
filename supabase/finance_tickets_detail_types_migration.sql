-- ============================================================
-- Finance Tickets Phase 2 - type-specific detail tables
-- ============================================================
-- Ported from the uploaded TicketManager schema. Two of the seven
-- categories are "batch" records containing individual line items
-- that can each be split across grants/offices (Credit Card and
-- Mileage); the other five are single-record submissions the ticket
-- points to directly. This mirrors the source schema's own shape
-- rather than flattening everything to one level, since allocation
-- splitting genuinely happens at the transaction/trip level, not the
-- whole-ticket level, in the original (ir_FinanceTicketGrantAllocation
-- points to ir_creditcardtransaction OR ir_mileagetrips OR the ticket
-- itself, never a whole credit card statement).
--
-- Grant allocation references the existing `grants` table (built
-- earlier this session for revenue reporting) rather than a new
-- GrantProfile system - the uploaded schema's ir_GrantProfile is a
-- richer budget-tracking concept Travis hasn't asked to be rebuilt,
-- and reusing `grants` avoids two competing "what is a grant" tables.

-- ---------- PEX Card registry ----------
-- The actual assigned cards, needed before PEX Recharge Requests can
-- reference "which card". New card requests (below) don't reference
-- this table - they're the request that eventually leads to one being
-- created, tracked separately by finance once fulfilled.
create table finance_pex_cards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  office_id uuid references b2s_offices(id),
  last4 text,
  job_title text,
  grant_id uuid references grants(id),
  grant_eligible boolean not null default false,
  assigned_date date,
  created_at timestamptz not null default now()
);

-- ---------- Credit Card (batch statement) ----------
create table finance_credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid not null references employees(id),
  expense_name text not null,
  has_pex_card boolean not null default false,
  location_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  start_date date,
  end_date date,
  total_amount numeric(10, 2),
  transaction_count int,
  created_at timestamptz not null default now()
);

-- Individual transactions within a statement - THIS is what
-- grant/office allocation splitting actually attaches to.
create table finance_credit_card_transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references finance_credit_card_statements(id) on delete cascade,
  expense_name text not null,
  category text check (
    category in (
      'advertising', 'convention_conference', 'donation_processing_fees', 'equipment_it_supplies',
      'meals_hospitality', 'miscellaneous', 'office_supplies', 'postage_courier', 'printing_publications',
      'social_media_marketing', 'software_subscriptions', 'training_professional_development',
      'travel', 'utilities', 'vehicle_repair_maintenance'
    )
  ),
  billing_office_id uuid references b2s_offices(id),
  billing_program text,
  grant_id uuid references grants(id),
  grant_eligible boolean not null default false,
  program_percentage numeric(5, 2),
  expense_details text,
  receipt_total numeric(10, 2),
  receipt_url text,
  transaction_date date,
  created_at timestamptz not null default now()
);

create index idx_cc_transactions_statement on finance_credit_card_transactions(statement_id);

-- ---------- Honorarium ----------
create table finance_honorariums (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid not null references employees(id),
  speaker_or_agency_name text not null,
  is_icna_speaker_list boolean not null default false,
  event_date date,
  billing_office_id uuid references b2s_offices(id),
  billing_programs text[],
  multiple_billing_offices boolean not null default false,
  grant_eligible boolean not null default false,
  poc_is_icna_member boolean not null default false,
  poc_user_id uuid references employees(id),
  poc_name text,
  payee_name text,
  payee_address_line1 text,
  payee_address_line2 text,
  payee_city text,
  payee_state text,
  payee_zip_code text,
  service_provided text,
  service_is_office_location boolean not null default false,
  service_office_id uuid references b2s_offices(id),
  service_address_line1 text,
  service_address_line2 text,
  service_city text,
  service_state text,
  service_zip_code text,
  service_cost numeric(10, 2),
  travel_amount numeric(10, 2),
  lodging_cost numeric(10, 2),
  miscellaneous_cost numeric(10, 2),
  miscellaneous_name text,
  total_amount numeric(10, 2),
  invoice_url text,
  w9_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Mileage (batch) ----------
create table finance_mileage_batches (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid not null references employees(id),
  mileage_title text not null,
  has_pex_card boolean not null default false,
  location_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  start_date date,
  end_date date,
  rate_per_mile numeric(6, 3),
  total_amount numeric(10, 2),
  total_miles numeric(10, 2),
  trip_count int,
  trip_purpose text,
  grant_eligible boolean not null default false,
  created_at timestamptz not null default now()
);

-- Individual trips within a mileage batch - also an allocation
-- attachment point, same reasoning as credit card transactions.
create table finance_mileage_trips (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references finance_mileage_batches(id) on delete cascade,
  travel_date date,
  trip_purpose text,
  billing_office_id uuid references b2s_offices(id),
  billing_program text,
  grant_id uuid references grants(id),
  grant_eligible boolean not null default false,
  program_percentage numeric(5, 2),
  starting_address_line1 text,
  starting_address_line2 text,
  starting_city text,
  starting_state text,
  starting_zip_code text,
  starting_odometer int,
  destination_address_line1 text,
  destination_address_line2 text,
  destination_city text,
  destination_state text,
  destination_zip_code text,
  ending_odometer int,
  mileage_traveled int,
  mileage_reimbursement numeric(10, 2),
  created_at timestamptz not null default now()
);

create index idx_mileage_trips_batch on finance_mileage_trips(batch_id);

-- ---------- Utility ----------
create table finance_utilities (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid references employees(id),
  vendor_name text not null,
  utility_type text check (utility_type in ('electricity', 'water_sewer', 'gas_heating', 'internet_phone', 'security_alarm', 'trash_recycling', 'other')),
  billing_office_id uuid references b2s_offices(id),
  billing_programs text[],
  expense_date date,
  grant_eligible boolean not null default false,
  poc_is_icna_member boolean not null default false,
  poc_user_id uuid references employees(id),
  poc_name text,
  service_is_billing_office boolean not null default false,
  service_location_name text,
  service_address_line1 text,
  service_address_line2 text,
  service_city text,
  service_state text,
  service_zip_code text,
  pin_number text,
  total_amount numeric(10, 2),
  invoice_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Vendor ----------
create table finance_vendors (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid references employees(id),
  vendor_name text not null,
  vendor_type text check (vendor_type in ('sponsors', 'convention', 'banquet', 'ramadan', 'vehicle', 'food_bank', 'other')),
  billing_office_id uuid references b2s_offices(id),
  billing_programs text[],
  expense_date date,
  grant_eligible boolean not null default false,
  poc_is_icna_member boolean not null default false,
  poc_user_id uuid references employees(id),
  poc_name text,
  service_is_billing_office boolean not null default false,
  service_location_name text,
  service_address_line1 text,
  service_address_line2 text,
  service_city text,
  service_state text,
  service_zip_code text,
  total_amount numeric(10, 2),
  invoice_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- PEX New Card Request ----------
create table finance_pex_new_requests (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid not null references employees(id),
  office_id uuid references b2s_offices(id),
  cellphone_number text,
  email_address text,
  requestor_dob date,
  send_to text check (send_to in ('home', 'office')),
  created_at timestamptz not null default now()
);

-- ---------- PEX Recharge Request ----------
create table finance_pex_recharge_requests (
  id uuid primary key default gen_random_uuid(),
  requestor_id uuid not null references employees(id),
  pex_card_id uuid references finance_pex_cards(id),
  billing_office_id uuid references b2s_offices(id),
  amount_to_add numeric(10, 2),
  current_balance numeric(10, 2),
  funds_purpose text,
  submitted_receipts boolean not null default false,
  validated_by_am_or_rd boolean not null default false,
  no_invoice_reason text,
  grant_eligible boolean not null default false,
  grant_total_eligible int,
  grant_total_requested_amount numeric(10, 2),
  statement_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Allocation splitting - grant and office, per line-item
-- ============================================================
-- References exactly one of: a credit card transaction, a mileage
-- trip, or the ticket itself directly (for the single-record
-- categories that have no line items to split individually) -
-- matching the source's own nullable multi-FK pattern rather than
-- forcing every category through the same shape.
create table finance_ticket_grant_allocations (
  id uuid primary key default gen_random_uuid(),
  finance_ticket_id uuid references finance_tickets(id) on delete cascade,
  credit_card_transaction_id uuid references finance_credit_card_transactions(id) on delete cascade,
  mileage_trip_id uuid references finance_mileage_trips(id) on delete cascade,
  grant_id uuid not null references grants(id),
  allocated_amount numeric(10, 2),
  allocated_percentage numeric(5, 2),
  created_at timestamptz not null default now(),
  check (
    (finance_ticket_id is not null)::int + (credit_card_transaction_id is not null)::int + (mileage_trip_id is not null)::int = 1
  )
);

create table finance_ticket_office_allocations (
  id uuid primary key default gen_random_uuid(),
  finance_ticket_id uuid references finance_tickets(id) on delete cascade,
  credit_card_transaction_id uuid references finance_credit_card_transactions(id) on delete cascade,
  mileage_trip_id uuid references finance_mileage_trips(id) on delete cascade,
  office_id uuid not null references b2s_offices(id),
  created_at timestamptz not null default now(),
  check (
    (finance_ticket_id is not null)::int + (credit_card_transaction_id is not null)::int + (mileage_trip_id is not null)::int = 1
  )
);

-- ============================================================
-- Link the master ticket to its type-specific detail row
-- ============================================================
alter table finance_tickets add column if not exists credit_card_statement_id uuid references finance_credit_card_statements(id);
alter table finance_tickets add column if not exists honorarium_id uuid references finance_honorariums(id);
alter table finance_tickets add column if not exists mileage_batch_id uuid references finance_mileage_batches(id);
alter table finance_tickets add column if not exists utility_id uuid references finance_utilities(id);
alter table finance_tickets add column if not exists vendor_id uuid references finance_vendors(id);
alter table finance_tickets add column if not exists pex_new_request_id uuid references finance_pex_new_requests(id);
alter table finance_tickets add column if not exists pex_recharge_request_id uuid references finance_pex_recharge_requests(id);

-- ============================================================
-- RLS - detail tables follow the same "own ticket or admin" shape.
-- Since these are only ever reached through their owning ticket (no
-- direct list view of, say, "all honorariums"), a straightforward
-- own-or-admin policy keyed on requestor_id is enough - it doesn't
-- need to re-derive access through the parent finance_tickets row.
-- ============================================================
alter table finance_pex_cards enable row level security;
alter table finance_credit_card_statements enable row level security;
alter table finance_credit_card_transactions enable row level security;
alter table finance_honorariums enable row level security;
alter table finance_mileage_batches enable row level security;
alter table finance_mileage_trips enable row level security;
alter table finance_utilities enable row level security;
alter table finance_vendors enable row level security;
alter table finance_pex_new_requests enable row level security;
alter table finance_pex_recharge_requests enable row level security;
alter table finance_ticket_grant_allocations enable row level security;
alter table finance_ticket_office_allocations enable row level security;

create policy "finance_pex_cards admin or own" on finance_pex_cards for select using (
  employee_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_pex_cards admin manage" on finance_pex_cards for insert with check (is_admin());
create policy "finance_pex_cards admin update" on finance_pex_cards for update using (is_admin());
create policy "finance_pex_cards admin delete" on finance_pex_cards for delete using (is_admin());

create policy "finance_credit_card_statements own or admin" on finance_credit_card_statements for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_credit_card_statements own create" on finance_credit_card_statements for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_credit_card_statements admin all" on finance_credit_card_statements for all using (is_admin());

create policy "finance_credit_card_transactions via statement" on finance_credit_card_transactions for select using (
  exists (select 1 from finance_credit_card_statements s where s.id = statement_id and (s.requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()))
);
create policy "finance_credit_card_transactions own create" on finance_credit_card_transactions for insert with check (
  exists (select 1 from finance_credit_card_statements s where s.id = statement_id and s.requestor_id = (select id from employees where auth_user_id = auth.uid()))
);
create policy "finance_credit_card_transactions admin all" on finance_credit_card_transactions for all using (is_admin());

create policy "finance_honorariums own or admin" on finance_honorariums for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_honorariums own create" on finance_honorariums for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_honorariums admin all" on finance_honorariums for all using (is_admin());

create policy "finance_mileage_batches own or admin" on finance_mileage_batches for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_mileage_batches own create" on finance_mileage_batches for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_mileage_batches admin all" on finance_mileage_batches for all using (is_admin());

create policy "finance_mileage_trips via batch" on finance_mileage_trips for select using (
  exists (select 1 from finance_mileage_batches b where b.id = batch_id and (b.requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()))
);
create policy "finance_mileage_trips own create" on finance_mileage_trips for insert with check (
  exists (select 1 from finance_mileage_batches b where b.id = batch_id and b.requestor_id = (select id from employees where auth_user_id = auth.uid()))
);
create policy "finance_mileage_trips admin all" on finance_mileage_trips for all using (is_admin());

create policy "finance_utilities own or admin" on finance_utilities for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_utilities own create" on finance_utilities for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_utilities admin all" on finance_utilities for all using (is_admin());

create policy "finance_vendors own or admin" on finance_vendors for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_vendors own create" on finance_vendors for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_vendors admin all" on finance_vendors for all using (is_admin());

create policy "finance_pex_new_requests own or admin" on finance_pex_new_requests for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_pex_new_requests own create" on finance_pex_new_requests for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_pex_new_requests admin all" on finance_pex_new_requests for all using (is_admin());

create policy "finance_pex_recharge_requests own or admin" on finance_pex_recharge_requests for select using (
  requestor_id = (select id from employees where auth_user_id = auth.uid()) or is_admin()
);
create policy "finance_pex_recharge_requests own create" on finance_pex_recharge_requests for insert with check (
  requestor_id = (select id from employees where auth_user_id = auth.uid())
);
create policy "finance_pex_recharge_requests admin all" on finance_pex_recharge_requests for all using (is_admin());

create policy "finance_ticket_grant_allocations admin only" on finance_ticket_grant_allocations for all using (is_admin());
create policy "finance_ticket_office_allocations admin only" on finance_ticket_office_allocations for all using (is_admin());
