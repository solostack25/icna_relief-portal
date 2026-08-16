import { redirect } from "next/navigation";

// Moved under /admin/* so it's covered by the persistent admin sidebar.
export default function HelpdeskManageRedirect() {
  redirect("/admin/helpdesk/manage");
}
