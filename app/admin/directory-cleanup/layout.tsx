import { redirect } from "next/navigation";
import HubTabs from "@/components/admin/HubTabs";
import { getDeviceViewer } from "@/lib/devices/access";

// People & access hub tab. IT/admin only (it writes to Entra).
export default async function DirectoryCleanupLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getDeviceViewer();
  if (!viewer) redirect("/admin");
  return (
    <>
      <HubTabs hub="people" />
      {children}
    </>
  );
}
