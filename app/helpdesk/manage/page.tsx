import { HelpdeskView } from "../HelpdeskView";

// Department ticket management - HR/Marketing/Finance managers see their
// department's plain queue, IT sees the quest board. HelpdeskView itself
// redirects to /helpdesk if the employee doesn't actually manage any
// department, so no separate gate is needed here.
export default async function HelpdeskManagePage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; status?: string }>;
}) {
  const { dept, status } = await searchParams;
  return <HelpdeskView mode="manage" dept={dept} status={status} />;
}
