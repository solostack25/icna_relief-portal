import { redirect } from "next/navigation";
import HubTabs from "@/components/admin/HubTabs";
import { getDeviceViewer } from "@/lib/devices/access";

// Device Management hub (Devices / Licenses / Activity log). IT only.
export default async function DevicesLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getDeviceViewer();
  if (!viewer) redirect("/admin");
  return (
    <>
      <HubTabs hub="devices" />
      {children}
    </>
  );
}
