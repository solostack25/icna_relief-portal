-- ============================================================
-- Fields the actual PowerApps Canvas App screens ask for that
-- weren't captured in the original schema.txt entity dump (schema.txt
-- lists every column on the Dataverse ENTITY; the real screen source
-- - CanvasApps/*.pa.yaml - is what's actually asked of a user, and
-- differs from the entity dump in both directions). Confirmed by
-- reading the form YAML directly, not guessed.
-- ============================================================

-- Grant lookup exists on every single-record category, shown only
-- when Grant Eligible is checked - present on every *_DataField list
-- in the form source (ir_BillingGrant) but absent from schema.txt's
-- ir_FinanceHonorarium/Utility/Vendor field lists entirely.
alter table finance_honorariums add column if not exists grant_id uuid references grants(id);
alter table finance_utilities add column if not exists grant_id uuid references grants(id);
alter table finance_vendors add column if not exists grant_id uuid references grants(id);
-- Also a batch-level default on Credit Card / Mileage, distinct from
-- the per-transaction/per-trip grant_id already on
-- finance_credit_card_transactions / finance_mileage_trips.
alter table finance_credit_card_statements add column if not exists grant_id uuid references grants(id);
alter table finance_mileage_batches add column if not exists grant_id uuid references grants(id);

-- "Name of Other Utility" (shown only when Utility Type = Other) and
-- "Name of Other Vendor" (always shown on Vendor, not conditional -
-- confirmed no Visible override on that control in the Vendor form,
-- unlike Utility's explicit conditional) were both missing.
alter table finance_utilities add column if not exists other_utility_name text;
alter table finance_vendors add column if not exists other_vendor_name text;

-- PEX New Card Request: the real form has full home AND office
-- address blocks (10 fields), not just the home-or-office picklist
-- with no address capture that was built here originally.
alter table finance_pex_new_requests add column if not exists home_address_line1 text;
alter table finance_pex_new_requests add column if not exists home_address_line2 text;
alter table finance_pex_new_requests add column if not exists home_city text;
alter table finance_pex_new_requests add column if not exists home_state text;
alter table finance_pex_new_requests add column if not exists home_zip_code text;
alter table finance_pex_new_requests add column if not exists office_address_line1 text;
alter table finance_pex_new_requests add column if not exists office_address_line2 text;
alter table finance_pex_new_requests add column if not exists office_city text;
alter table finance_pex_new_requests add column if not exists office_state text;
alter table finance_pex_new_requests add column if not exists office_zip_code text;

-- PEX Recharge Request: a supervisor email field was entirely
-- missing.
alter table finance_pex_recharge_requests add column if not exists supervisor_email text;
