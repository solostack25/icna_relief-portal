import { redirect } from "next/navigation";

// Superseded by /helpdesk/manage, which now handles quest theming
// automatically for anyone managing IT (not just admins - matches how
// HR/Marketing/Finance managers reach their own queues the same way,
// via employee_program_access rather than a hard admin-role gate).
export default function AdminHelpdeskQuestRedirect() {
  redirect("/helpdesk/manage");
}
