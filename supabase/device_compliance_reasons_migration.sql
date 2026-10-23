-- Device Management: why a device is out of compliance.
-- Filled by the nightly sync for non-compliant Intune devices (and on
-- demand from the device page): failing settings as plain-English
-- reasons with a fix. Run after device_management_migration.sql.
alter table it_devices add column if not exists compliance_reasons jsonb;
alter table it_devices add column if not exists compliance_checked_at timestamptz;
