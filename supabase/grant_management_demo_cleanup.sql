-- Removes the Grant Management demo data created by grant_management_demo_seed.sql.
-- Only touches rows marked as demo: grant codes DEMO-*, names/titles [DEMO] *,
-- PEX ids DEMO-PX*, upload files named [DEMO] *. Real data is untouched.
begin;
delete from gm_pex_transactions where external_id like 'DEMO-PX%'
   or expense_id in (select e.id from gm_expenses e join gm_grants g on g.id = e.grant_id where g.code like 'DEMO-%');
delete from gm_expense_documents where expense_id in (select e.id from gm_expenses e join gm_grants g on g.id = e.grant_id where g.code like 'DEMO-%');
delete from gm_expenses where grant_id in (select id from gm_grants where code like 'DEMO-%');
delete from gm_import_batches where file_name like '[DEMO]%';
-- budget lines, versions, amounts, members and audit rows cascade with the grant
delete from gm_grants where code like 'DEMO-%';
delete from grants where title like '[DEMO]%' and notes like 'Demo data - linked to Grant Management grant DEMO-%';
commit;
