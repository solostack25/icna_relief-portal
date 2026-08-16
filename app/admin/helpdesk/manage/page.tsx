import { HelpdeskView } from "../../../helpdesk/HelpdeskView";

// Department ticket management - HR/Marketing/Finance managers see their
// department's plain queue, IT sees the quest board. HelpdeskView itself
// redirects to /helpdesk if the employee doesn't actually manage any
// department, so no separate gate is needed here.
//
// Deliberately kept OUTSIDE /admin/* - the IT quest board (one of this
// component's two "manage" render branches) is an intentionally
// distinct full-screen dark experience with its own gradient background
// and fonts, not meant to inherit the admin layout's white header and
// light sidebar. Next.js layouts can't be skipped for one child page
// based on runtime logic, so this route has to stay independent to keep
// that design intact.
export default async function HelpdeskManagePage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; status?: string }>;
}) {
  const { dept, status } = await searchParams;
  return <HelpdeskView mode="manage" dept={dept} status={status} />;
}
