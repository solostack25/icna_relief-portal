import { HelpdeskView } from "./HelpdeskView";

// Always the plain, everyone-sees-this view - no exceptions for admins
// or IT staff. The quest-themed board is now purely an Admin Portal
// tool, at /admin/helpdesk/quest.
export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; status?: string }>;
}) {
  const { dept, status } = await searchParams;
  return <HelpdeskView dept={dept} status={status} forceTheme="plain" />;
}
