import { redirect } from "next/navigation";

// /helpdesk/it-quest used to be a separate page duplicating the IT
// queue in quest styling. Merged into /helpdesk itself -- the whole
// page now renders in the quest theme automatically for anyone who
// manages the IT department (see the isQuestThemed check in
// app/helpdesk/page.tsx). This redirect just catches old bookmarks.
export default function ItQuestRedirect() {
  redirect("/helpdesk?dept=it");
}
