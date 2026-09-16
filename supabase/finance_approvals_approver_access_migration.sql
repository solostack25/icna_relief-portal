-- The "Pending Your Approval" widget (and the new /finance-ticket-
-- approvals list page) query finance_approvals/finance_tickets with
-- the signed-in user's own session, filtering by approver_email. But
-- existing RLS on both tables only ever granted read access to: the
-- ticket's own requestor, admins, and (as of this session) finance
-- department staff. A regular manager who is simply next in someone's
-- approval chain — the actual, most common case — had no read access
-- at all, so any session-scoped query for "what's pending on me"
-- silently returned nothing for them specifically.
--
-- The single-ticket approval action page (/finance-ticket-approvals/
-- [token]) was never affected by this — it authenticates by the
-- unguessable token itself via an admin (RLS-bypassing) client, not
-- by session, which is exactly why it already "works whether or not
-- you've logged into the Portal." This migration is only needed for
-- session-authenticated list/summary views.

create policy "finance_approvals approver read" on finance_approvals
  for select using (
    approver_email is not null
    and lower(approver_email) = lower((select email from employees where auth_user_id = auth.uid()))
  );

create policy "finance_tickets approver read" on finance_tickets
  for select using (
    exists (
      select 1 from finance_approvals fa
      where fa.finance_ticket_id = finance_tickets.id
      and lower(fa.approver_email) = lower((select email from employees where auth_user_id = auth.uid()))
    )
  );
