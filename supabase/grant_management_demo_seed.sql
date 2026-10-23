-- ============================================================
-- Grant Management DEMO data - five demo grants for trying the module
-- end to end. Safe to re-run (it skips if the demo grants exist).
--
-- Everything created is marked: grant codes DEMO-*, names [DEMO] *,
-- PEX ids DEMO-PX*, upload file names [DEMO] *. Each demo grant also
-- gets a linked [DEMO] row in `grants` (Revenue) so it shows up in the
-- grant dropdowns on Finance Tickets, saved utilities and Zakat Finance.
--
-- Remove everything with supabase/grant_management_demo_cleanup.sql.
--
-- Set the two people below before running: the manager who "did" the
-- setup/approvals, and an office user (gets the Orlando demo grant).
-- ============================================================
do $$
declare
  manager uuid := (select id from employees where lower(email) = 'tali@icnarelief.org' limit 1);
  office_user uuid := (select id from employees where lower(email) = 'ovu411@gmail.com' limit 1);
  today date := current_date;
  threshold numeric := 500;

  grants_spec jsonb := '[
    {"code":"DEMO-EFSP-HOU","name":"[DEMO] Emergency Food & Shelter Program – Phase 43","funder":"FEMA / United Way of Greater Houston","program":"Hunger Prevention","office":"Houston Office","award":85000,"start":"2026-01-01","end":"2026-12-31","target":0.78,
     "lines":[["Personnel","Salaries/Wages",38000],["Personnel","FICA",2900],["Direct Client Assistance",null,30000],["Operational",null,8100],["Travel","Mileage",2500],["Occupancy","Rent",3500]]},
    {"code":"DEMO-ORR-STL","name":"[DEMO] Refugee Support Services – Case Management","funder":"Office of Refugee Resettlement","program":"Refugee Services","office":"St. Louis Office","award":150000,"start":"2025-10-01","end":"2026-12-15","target":0.97,"amended":true,
     "lines":[["Personnel","Salaries/Wages",82000],["Personnel","FICA",6270],["Travel","Mileage",4000],["Travel","Gas",1800],["Direct Client Assistance",null,42000],["Community Education & Outreach",null,6930],["Contractual Services",null,7000]]},
    {"code":"DEMO-SHFB-ORL","name":"[DEMO] Pantry Capacity Building Grant","funder":"Second Harvest Food Bank of Central Florida","program":"Hunger Prevention","office":"Orlando Office","award":35000,"start":"2026-03-01","end":"2026-11-30","target":0.86,"office_user":true,
     "lines":[["Building & Equipment",null,18000],["Operational",null,9000],["Direct Client Assistance",null,8000]]},
    {"code":"DEMO-UW-FATE-LA","name":"[DEMO] FATE Youth Workforce Program","funder":"United Way of Greater Los Angeles","program":"FATE","office":"Los Angeles Office","award":60000,"start":"2026-01-01","end":"2026-12-31","target":0.20,"slow":true,
     "lines":[["Personnel","Salaries/Wages",30000],["Personnel","FICA",2300],["Community Education & Outreach",null,15000],["Operational",null,8700],["Travel","Mileage",4000]]},
    {"code":"DEMO-HRSA-NJ","name":"[DEMO] Free Clinic Expansion","funder":"Health Resources & Services Administration","program":"Health Services","office":"New Jersey Office","award":120000,"start":"2026-07-01","end":"2027-06-30","target":0.31,
     "lines":[["Personnel","Salaries/Wages",70000],["Personnel","FICA",5355],["Building & Equipment",null,18000],["Operational",null,12645],["Contractual Services",null,14000]]}
  ]';
  vendors jsonb := '{
    "Direct Client Assistance":[["Kroger","Groceries for pantry distribution"],["Walmart Supercenter","Emergency food boxes"],["Sam''s Club","Bulk rice, beans and oil"],["Costco Wholesale","Hygiene kits for clients"],["Aldi","Fresh produce for Saturday distribution"]],
    "Operational":[["Office Depot","Office supplies"],["Staples","Printer toner and paper"],["Uline","Distribution bags and gloves"],["Amazon Business","Tablet cases and chargers for intake"]],
    "Community Education & Outreach":[["Vistaprint","Flyers for outreach event"],["Eventbrite","Community workshop registration"],["Facebook Ads","Social media outreach"]],
    "Contractual Services":[["Bright Path Interpreters LLC","Interpretation services"],["Metro Cleaning Co.","Cleaning services"]],
    "Travel":[["Shell","Fuel for delivery van"],["Chevron","Fuel for client home visits"]]
  }';
  equipment jsonb := '[["Lowe''s","Commercial freezer for cold storage"],["Grainger","Pallet jack and hand trucks"],["Best Buy Business","Laptops for client intake"]]';
  pms text[] := array['pex','pex','pex','corporate_card','check','reimbursement'];

  g jsonb; ln jsonb; v jsonb;
  gid uuid; rid uuid; lid uuid; v1 uuid; v2 uuid; off record;
  s date; e date; m date; d date; months int; budget_total numeric; share numeric; monthly numeric; amt numeric; n int; k int; i int; j int;
  amended boolean; entered_by uuid; kind text; cat text; sub text; orig numeric;
  payroll_batch uuid := gen_random_uuid(); pex_batch uuid := gen_random_uuid();
  lines_out jsonb;
begin
  if manager is null then raise exception 'Manager employee not found - edit the email at the top of the script.'; end if;
  if exists (select 1 from gm_grants where code like 'DEMO-%') then
    raise notice 'Demo grants already exist - run grant_management_demo_cleanup.sql first to reset.';
    return;
  end if;
  perform setseed(0.42);

  insert into gm_import_batches (id, kind, file_name, row_count, total, status, created_by, created_at)
  values (payroll_batch, 'expenses', '[DEMO] Payroll_Sept_2026_grant_allocation.xlsx', 0, 0, 'applied', manager, (today - 20) + time '09:12');

  for g in select * from jsonb_array_elements(grants_spec) loop
    select id, region, state into off from b2s_offices where field_office = g->>'office' limit 1;
    s := (g->>'start')::date; e := (g->>'end')::date;
    amended := coalesce((g->>'amended')::boolean, false);
    entered_by := case when (g->>'office_user')::boolean and office_user is not null then office_user else manager end;
    gid := gen_random_uuid(); rid := gen_random_uuid();

    insert into grants (id, title, funder_name, program, office_id, region, amount, fiscal_year, received_date, notes, created_by, stream)
    values (rid, g->>'name', g->>'funder', g->>'program', off.id, off.region, (g->>'award')::numeric, extract(year from s)::int, s,
            'Demo data - linked to Grant Management grant ' || (g->>'code'), manager, 'grant');

    insert into gm_grants (id, name, funder, code, program, office_id, region, state, award_amount, start_date, end_date, funder_fiscal_year,
                           status, approval_required, doc_required_over, notes, revenue_grant_id, created_by, created_at)
    values (gid, g->>'name', g->>'funder', g->>'code', g->>'program', off.id, off.region, off.state, (g->>'award')::numeric, s, e,
            case when extract(month from s) = 1 then 'FY' || extract(year from s) else 'FY' || extract(year from s) || '-' || right((extract(year from s) + 1)::text, 2) end,
            'active', true, threshold, 'Demo data for testing Grant Management. Safe to delete.', rid, manager, (s - 20) + time '10:30');
    insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, changes, created_at)
    values ('grant', gid, gid, 'created', manager, jsonb_build_object('code', g->>'code', 'award_amount', (g->>'award')::numeric), (s - 20) + time '10:30');

    -- budget: original (v1), and for the amended grant a funder-approved v2
    v1 := gen_random_uuid();
    insert into gm_budget_versions (id, grant_id, version_no, kind, status, created_by, created_at, activated_by, activated_at)
    values (v1, gid, 1, 'original', case when amended then 'superseded' else 'active' end, manager, (s - 10) + time '10:00', manager, (s - 10) + time '15:20');
    insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, changes, created_at)
    values ('budget', v1, gid, 'original_approved', manager, jsonb_build_object('version', 1, 'total_to', (g->>'award')::numeric), (s - 10) + time '15:20');
    if amended then
      v2 := gen_random_uuid();
      insert into gm_budget_versions (id, grant_id, version_no, kind, status, effective_date, funder_approved_date, reason, created_by, created_at, activated_by, activated_at)
      values (v2, gid, 2, 'amendment', 'active', s + 150, s + 147,
              'Budget modification #1 - shift $6,000 from salaries to direct client assistance (approved by ORR program officer)',
              manager, (s + 150) + time '10:40', manager, (s + 150) + time '16:50');
    end if;

    i := 0; budget_total := 0; lines_out := '[]';
    for ln in select * from jsonb_array_elements(g->'lines') loop
      lid := gen_random_uuid();
      cat := ln->>0; sub := ln->>1;
      insert into gm_budget_lines (id, grant_id, category, subcategory, sort_order, is_active) values (lid, gid, cat, sub, i, true);
      orig := (ln->>2)::numeric;
      if amended and cat = 'Direct Client Assistance' then orig := orig - 6000; end if;
      if amended and sub = 'Salaries/Wages' then orig := orig + 6000; end if;
      insert into gm_budget_amounts (version_id, line_id, amount) values (v1, lid, orig);
      if amended then insert into gm_budget_amounts (version_id, line_id, amount) values (v2, lid, (ln->>2)::numeric); end if;
      budget_total := budget_total + (ln->>2)::numeric;
      lines_out := lines_out || jsonb_build_array(jsonb_build_object('id', lid, 'cat', cat, 'sub', sub, 'amt', (ln->>2)::numeric));
      i := i + 1;
    end loop;
    if amended then
      insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, changes, note, created_at)
      values ('budget', v2, gid, 'amendment_approved', manager,
              '{"version":2,"lines":[{"line":"Personnel › Salaries/Wages","from":88000,"to":82000},{"line":"Direct Client Assistance","from":36000,"to":42000}]}'::jsonb,
              'Budget modification #1 - shift $6,000 from salaries to direct client assistance (approved by ORR program officer)', (s + 150) + time '16:50');
    end if;

    if entered_by <> manager then
      insert into gm_grant_members (grant_id, employee_id, role, added_by) values (gid, entered_by, 'office_user', manager);
      insert into gm_audit_log (entity, grant_id, action, actor_id, changes, created_at) values ('member', gid, 'members_updated', manager, '{"count":1}', (s - 5) + time '11:00');
    end if;
    insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, changes, created_at)
    values ('grant', gid, gid, 'status_changed', manager, '{"status":{"from":"draft","to":"active"}}', (s - 2) + time '09:00');

    -- spending, month by month up to today
    months := (extract(year from age(least(e, today), date_trunc('month', s)::date)) * 12 + extract(month from age(least(e, today), date_trunc('month', s)::date)))::int + 1;
    for v in select * from jsonb_array_elements(lines_out) loop
      cat := v->>'cat'; sub := v->>'sub';
      share := (v->>'amt')::numeric / budget_total * (g->>'award')::numeric * (g->>'target')::numeric;
      if (g->>'code') = 'DEMO-ORR-STL' and cat in ('Direct Client Assistance', 'Contractual Services') then share := (v->>'amt')::numeric * 1.04; end if;
      if coalesce((g->>'slow')::boolean, false) and cat <> 'Personnel' then share := share * 0.5; end if;

      if cat = 'Building & Equipment' then
        -- a few large purchases; these are the "missing documentation" examples
        k := case when share > 9000 then 3 else 2 end;
        for j in 1..k loop
          m := (date_trunc('month', s) + make_interval(months => (j * months / (k + 1))))::date;
          d := least(m + 14, today - 10);
          insert into gm_expenses (grant_id, line_id, expense_date, vendor, amount, description, program, kind, payment_method, doc_required, status, source,
                                   created_by, created_at, updated_at, submitted_by, submitted_at, reviewed_by, reviewed_at)
          values (gid, (v->>'id')::uuid, d, equipment->(j - 1)->>0, round(share / k, 2), equipment->(j - 1)->>1, g->>'program', 'purchase', 'corporate_card', true, 'approved', 'manual',
                  entered_by, d + time '11:00', d + time '11:00', entered_by, d + time '12:00', manager, (d + 2) + time '14:00');
        end loop;
        continue;
      end if;

      for i in 0..months - 1 loop
        m := (date_trunc('month', s) + make_interval(months => i))::date;
        d := greatest(s, least(m + (3 + floor(random() * 24))::int, today - 2));
        if cat = 'Personnel' or sub = 'Rent' then
          kind := case when sub = 'Salaries/Wages' then 'payroll' when cat = 'Personnel' then 'fringe' else 'other' end;
          amt := round(share / months * (0.96 + random() * 0.08)::numeric, 2);
          insert into gm_expenses (grant_id, line_id, expense_date, vendor, amount, description, program, kind, payment_method, doc_required, status, source,
                                   external_ref, import_batch_id, review_note, created_by, created_at, updated_at, submitted_by, submitted_at, reviewed_by, reviewed_at)
          values (gid, (v->>'id')::uuid, d, case when kind = 'other' then 'Regency Property Management' else 'Payroll - ADP' end, amt,
                  case kind when 'payroll' then 'Salaries ' when 'fringe' then sub || ' ' else 'Rent ' end || to_char(m, 'FMMonth YYYY'),
                  g->>'program', kind, case when kind = 'other' then 'ach' else 'payroll' end, false, 'approved', case when kind = 'other' then 'manual' else 'import' end,
                  case when kind <> 'other' and to_char(m, 'YYYY-MM') = '2026-09' then 'PR-2026-09' end,
                  case when kind <> 'other' and to_char(m, 'YYYY-MM') = '2026-09' then payroll_batch end,
                  case when kind <> 'other' and to_char(m, 'YYYY-MM') = '2026-09' then 'Bulk upload: [DEMO] Payroll_Sept_2026_grant_allocation.xlsx' end,
                  manager, d + time '11:00', d + time '11:00', manager, d + time '12:00', manager, least(d + 2, today) + time '14:00');
        else
          -- purchases kept under the receipt threshold (demo receipts can't be uploaded by script)
          monthly := share / months;
          n := greatest(1, ceil(monthly / 430)::int);
          for j in 1..n loop
            amt := round(least(495, monthly / n * (0.85 + random() * 0.30)::numeric), 2);
            continue when amt < 5;
            d := greatest(s, least(m + (3 + floor(random() * 24))::int, today - 2));
            insert into gm_expenses (grant_id, line_id, expense_date, vendor, amount, description, program, kind, payment_method, doc_required, status, source,
                                     created_by, created_at, updated_at, submitted_by, submitted_at, reviewed_by, reviewed_at)
            select gid, (v->>'id')::uuid, d,
                   case when sub = 'Mileage' then 'Staff mileage' else vv->>0 end,
                   amt,
                   case when sub = 'Mileage' then 'Client home visits and food deliveries' else vv->>1 end,
                   g->>'program', 'purchase', case when sub = 'Mileage' then 'reimbursement' else pms[1 + floor(random() * 6)::int] end,
                   amt > threshold, 'approved', 'manual', entered_by, d + time '11:00', d + time '11:00', entered_by, d + time '12:00', manager,
                   least(d + (1 + floor(random() * 4))::int, today) + time '14:00'
            from (select coalesce(vendors->cat, vendors->'Operational') as arr) a,
                 lateral (select a.arr->(floor(random() * jsonb_array_length(a.arr))::int) as vv) pick;
          end loop;
        end if;
      end loop;
    end loop;
  end loop;

  update gm_import_batches b set row_count = x.c, total = x.t
  from (select count(*) c, coalesce(sum(amount), 0) t from gm_expenses where import_batch_id = payroll_batch) x where b.id = payroll_batch;

  -- Work in progress, so Approvals / Returned / Drafts all have something in them.
  insert into gm_expenses (grant_id, line_id, expense_date, vendor, amount, description, program, kind, payment_method, doc_required, status, source,
                           created_by, created_at, updated_at, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
  select gr.id, l.id, w.d, w.vendor, w.amt, w.descr, gr.program, 'purchase', w.pm, w.amt > threshold, w.st, 'manual',
         coalesce(case when w.who = 'office' then office_user end, manager),
         w.d + time '11:00', w.d + time '11:00',
         case when w.st <> 'draft' then coalesce(case when w.who = 'office' then office_user end, manager) end,
         case when w.st <> 'draft' then w.d + time '12:00' end,
         case when w.st in ('returned', 'rejected') then manager end,
         case when w.st in ('returned', 'rejected') then (today - 1) + time '10:15' end,
         w.note
  from (values
    ('DEMO-SHFB-ORL', 'Direct Client Assistance', null, today - 3,  'Publix', 212.38, 'Groceries for Saturday pantry distribution', 'submitted', 'office', 'pex', null),
    ('DEMO-SHFB-ORL', 'Operational', null, today - 2,  'Uline', 186.10, 'Distribution bags and gloves', 'submitted', 'office', 'pex', null),
    ('DEMO-SHFB-ORL', 'Building & Equipment', null, today - 9, 'Lowe''s', 1248.77, 'Wire shelving for new cold-storage room', 'submitted', 'office', 'corporate_card', null),
    ('DEMO-SHFB-ORL', 'Operational', null, today - 11, 'Amazon Business', 164.25, 'Label printer for inventory', 'returned', 'office', 'pex',
       'Receipt total doesn''t match the amount entered. Please check and re-attach the itemized receipt.'),
    ('DEMO-SHFB-ORL', 'Direct Client Assistance', null, today - 14, 'Walmart Supercenter', 96.40, 'Gift cards for families', 'rejected', 'office', 'pex',
       'Gift cards aren''t an allowable cost under this grant.'),
    ('DEMO-SHFB-ORL', 'Direct Client Assistance', null, today - 1,  'Sam''s Club', 330.16, 'Emergency food boxes', 'draft', 'office', 'pex', null),
    ('DEMO-EFSP-HOU', 'Direct Client Assistance', null, today - 4,  'H-E-B', 412.38, 'Groceries for pantry distribution', 'submitted', 'manager', 'pex', null),
    ('DEMO-ORR-STL', 'Contractual Services', null, today - 7,  'Bright Path Interpreters LLC', 1240.00, 'Dari & Pashto interpretation - October intakes', 'submitted', 'manager', 'check', null),
    ('DEMO-HRSA-NJ', 'Building & Equipment', null, today - 9,  'Grainger', 2875.40, 'Exam table and medical cart for new exam room', 'submitted', 'manager', 'corporate_card', null),
    ('DEMO-HRSA-NJ', 'Operational', null, today - 1,  'Staples', 96.42, 'Printer toner and paper', 'draft', 'manager', 'pex', null)
  ) as w(code, cat, sub, d, vendor, amt, descr, st, who, pm, note)
  join gm_grants gr on gr.code = w.code
  join gm_budget_lines l on l.grant_id = gr.id and l.category = w.cat and l.subcategory is not distinct from w.sub;

  -- audit trail for recent manual activity (last 45 days)
  insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, created_at)
  select 'expense', id, grant_id, 'submitted', submitted_by, submitted_at
  from gm_expenses where source = 'manual' and status <> 'draft' and expense_date >= today - 45 and grant_id in (select id from gm_grants where code like 'DEMO-%');
  insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, note, created_at)
  select 'expense', id, grant_id, status, reviewed_by, review_note, reviewed_at
  from gm_expenses where source = 'manual' and status in ('approved', 'returned', 'rejected') and expense_date >= today - 45 and grant_id in (select id from gm_grants where code like 'DEMO-%');
  insert into gm_audit_log (entity, entity_id, grant_id, action, actor_id, changes, created_at)
  select 'import', payroll_batch, x.grant_id, 'imported', manager, jsonb_build_object('file', '[DEMO] Payroll_Sept_2026_grant_allocation.xlsx', 'rows', x.c, 'total', x.t, 'status', 'approved'), (today - 20) + time '09:12'
  from (select grant_id, count(*) c, sum(amount) t from gm_expenses where import_batch_id = payroll_batch group by grant_id) x;

  -- PEX queue
  insert into gm_import_batches (id, kind, file_name, row_count, total, status, created_by, created_at)
  values (pex_batch, 'pex', '[DEMO] PEX_transactions_Oct_1-21.csv', 7, 1326.33, 'applied', manager, (today - 1) + time '09:40');
  insert into gm_pex_transactions (external_id, card_holder, card_last4, employee_id, transaction_date, merchant, amount, memo, status, batch_id)
  values
    ('DEMO-PX100200', 'Arif Ali',   '4100', office_user, today - 2,  'PUBLIX #1123',      214.66, null, 'unmatched', pex_batch),
    ('DEMO-PX100201', 'Arif Ali',   '4100', office_user, today - 5,  'SHELL OIL 5741',     61.03, null, 'unmatched', pex_batch),
    ('DEMO-PX100202', 'Arif Ali',   '4100', office_user, today - 8,  'COSTCO WHSE #479',  506.88, 'Pantry restock', 'unmatched', pex_batch),
    ('DEMO-PX100203', 'Travis Ali', '4137', manager,     today - 4,  'HEB #112',          388.20, 'Pantry restock', 'unmatched', pex_batch),
    ('DEMO-PX100204', 'Travis Ali', '4137', manager,     today - 7,  'WALGREENS #3310',    42.17, null, 'unmatched', pex_batch),
    ('DEMO-PX100205', 'Card 2219',  '2219', null,        today - 10, 'AMAZON MKTPL*2K4',   89.99, null, 'unmatched', pex_batch),
    ('DEMO-PX100206', 'Travis Ali', '4137', manager,     today - 16, 'UBER *TRIP',         23.40, 'Staff ride - not a grant cost', 'ignored', pex_batch);

  -- the office user gets Grant Management for their office
  if office_user is not null then
    insert into gm_user_roles (employee_id, role, office_ids, is_active, created_by)
    select office_user, 'office_user', array[(select id from b2s_offices where field_office = 'Orlando Office' limit 1)], true, manager
    where not exists (select 1 from gm_user_roles where employee_id = office_user);
    insert into employee_program_access (employee_id, program_slug) values (office_user, 'grant-management') on conflict do nothing;
  end if;

  raise notice 'Demo data created: % expenses', (select count(*) from gm_expenses where grant_id in (select id from gm_grants where code like 'DEMO-%'));
end $$;
