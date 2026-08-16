import { redirect } from "next/navigation";
import { getInkindAccess } from "@/lib/inkind/access";
import Shell from "./components/Shell";

// Gates the whole /inkind-admin tree behind program access, same
// program_slug pattern used across the portal (see select-app). Uses
// the existing 'in-kind-donation' slug already in app_registry (it
// previously pointed at the standalone admin app's URL - repointed to
// here as part of this port). Admins bypass, same pattern as the rest
// of the portal.
//
// This only covers page navigation. The API routes under
// /api/inkind-admin/* are independently reachable and re-check the same
// access via getInkindAccess() themselves - see lib/inkind/access.ts.
export default async function InkindAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getInkindAccess();
  if (!access.ok) redirect("/select-app");

  return <Shell>{children}</Shell>;
}
