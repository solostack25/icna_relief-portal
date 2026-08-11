import { HelpdeskView } from "./HelpdeskView";

// Always mode="submit" - open a ticket, check your own requests. The
// exact same page for everyone, no exceptions for admins or IT staff.
// Department management lives entirely separately at /helpdesk/manage.
export default async function HelpdeskPage() {
  return <HelpdeskView mode="submit" />;
}
