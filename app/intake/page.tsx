import { redirect } from "next/navigation";

// The search-then-create intake flow was merged into the unified
// /clients page (live search + "New Household Intake" action).
// This redirect keeps old bookmarks/links working.
export default function IntakeRedirect() {
  redirect("/clients");
}
