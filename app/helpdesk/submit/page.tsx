import { redirect } from "next/navigation";

// /helpdesk itself is now always the plain view (see app/helpdesk/page.tsx)
// - this route is no longer needed as a distinct path. Kept as a redirect,
// same pattern as /helpdesk/it-quest, in case anything already links here.
export default function HelpdeskSubmitRedirect() {
  redirect("/helpdesk");
}
