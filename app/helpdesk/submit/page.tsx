import { HelpdeskView } from "../HelpdeskView";

// Forces the plain, everyone-sees-this view regardless of who's asking.
// Exists because an admin visiting the normal /helpdesk always gets the
// quest theme (they manage "it"), which means they'd otherwise never see
// the exact same submit-a-request experience a regular employee does.
// Linked from the Admin Portal / Admin Helpdesk Workload as a separate,
// explicit "open a ticket like everyone else" path.
export default async function HelpdeskSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return <HelpdeskView status={status} forceTheme="plain" />;
}
