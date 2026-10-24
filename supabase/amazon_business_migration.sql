-- ============================================================
-- Amazon Business -> Portal
--
-- A nightly sync (and a "Sync now" button on Admin -> Amazon Business)
-- pulls ICNA Relief's Amazon Business purchases through the
-- Reconciliation API and each invoice PDF through the Document API.
--
--   * A purchase whose PO number is a Help Desk ticket number
--     (e.g. HD-002703), or whose order number was added to a ticket,
--     attaches its invoice to that hardware ticket automatically -
--     which is what unlocks Close.
--   * Pay by Invoice purchases also become a Finance "Vendor Payment"
--     ticket with the PDF attached, so Finance can pay Amazon. If the
--     purchase came from an approved hardware ticket it's already
--     approved; otherwise it goes through the normal finance chain
--     when someone sends it to Finance.
--   * Amazon's payment status for each Pay by Invoice invoice (Issued,
--     Past Due, Payment Processing, Closed) is refreshed every sync.
--
-- Credentials live in integration_settings (amazon_business_*), set on
-- Admin -> Connectors. Every table here is service-role only.
-- ============================================================

create table if not exists amzb_purchases (
  id uuid primary key default gen_random_uuid(),
  -- "inv:<invoice number>" for anything Amazon invoiced, else "txn:<transaction id>"
  purchase_key text not null unique,
  invoice_number text,
  transaction_ids text[] not null default '{}',
  order_ids text[] not null default '{}',
  po_numbers text[] not null default '{}',
  transaction_type text,
  payment_type text not null default 'other' check (payment_type in ('pay_by_invoice', 'card', 'other')),
  payment_instrument text,
  card_last4 text,
  amount numeric(12, 2),
  currency text,
  transaction_date timestamptz,
  buyer_name text,
  buyer_email text,
  items jsonb not null default '[]',

  pdf_status text not null default 'pending' check (pdf_status in ('pending', 'requested', 'ready', 'failed', 'unavailable')),
  pdf_report_id text,
  pdf_storage_path text,
  pdf_error text,
  pdf_attempts int not null default 0,

  matched_request_id uuid references helpdesk_requests(id) on delete set null,
  matched_leg_id uuid references helpdesk_request_legs(id) on delete set null,
  match_method text check (match_method in ('po_number', 'order_number', 'manual')),
  helpdesk_attachment_id uuid references helpdesk_attachments(id) on delete set null,
  finance_ticket_id uuid references finance_tickets(id) on delete set null,

  payment_status text,
  payment_due_date timestamptz,
  payment_checked_at timestamptz,

  status text not null default 'new' check (status in ('new', 'matched', 'sent_to_finance', 'ignored')),
  note text,
  handled_by uuid references employees(id),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_amzb_purchases_status on amzb_purchases (status, transaction_date desc);
create index if not exists idx_amzb_purchases_leg on amzb_purchases (matched_leg_id);
create index if not exists idx_amzb_purchases_orders on amzb_purchases using gin (order_ids);
alter table amzb_purchases enable row level security;

create table if not exists amzb_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null default 'cron',
  started_by uuid references employees(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb,
  error text
);
alter table amzb_sync_runs enable row level security;

insert into storage.buckets (id, name, public)
values ('amazon-business-invoices', 'amazon-business-invoices', false)
on conflict (id) do nothing;

-- Amazon order numbers IT adds to a hardware ticket (the PO number
-- route is automatic; this covers orders placed without it).
alter table helpdesk_leg_details_it add column if not exists amazon_order_ids text[] not null default '{}';

-- Invoices that arrived from Amazon rather than an upload, and the
-- Pay by Invoice payment method.
alter table helpdesk_attachments add column if not exists source text not null default 'upload'
  check (source in ('upload', 'amazon_business'));
alter table helpdesk_attachments drop constraint if exists helpdesk_attachments_payment_method_check;
alter table helpdesk_attachments add constraint helpdesk_attachments_payment_method_check
  check (payment_method is null or payment_method in ('pex', 'corporate_card', 'check', 'ach', 'reimbursement', 'pay_by_invoice', 'other'));

-- Hard duplicate guards, so overlapping syncs / button clicks can't
-- double up:
--   * each Amazon transaction belongs to exactly one purchase
--   * each purchase attaches to a ticket at most once
--   * each purchase becomes at most one Finance ticket
create table if not exists amzb_purchase_transactions (
  transaction_id text primary key,
  purchase_id uuid not null references amzb_purchases(id) on delete cascade
);
alter table amzb_purchase_transactions enable row level security;

alter table helpdesk_attachments add column if not exists amzb_purchase_id uuid references amzb_purchases(id) on delete set null;
create unique index if not exists helpdesk_attachments_amzb_uniq on helpdesk_attachments (amzb_purchase_id) where amzb_purchase_id is not null;

create unique index if not exists finance_tickets_amzb_purchase_uniq on finance_tickets ((detail ->> 'amzb_purchase_id')) where detail ? 'amzb_purchase_id';

-- Sending to Finance is claimed with an expiring timestamp, so a run
-- that dies half way doesn't leave a purchase stuck.
alter table amzb_purchases add column if not exists finance_claimed_at timestamptz;
