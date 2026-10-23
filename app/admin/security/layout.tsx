import { redirect } from "next/navigation";
import HubTabs from "@/components/admin/HubTabs";
import { getDeviceViewer } from "@/lib/devices/access";

// Security hub (Overview / Incidents / Secure Score / MFA / Risky users). IT only.
export default async function SecurityLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getDeviceViewer();
  if (!viewer) redirect("/admin");
  return (
    <>
      <HubTabs hub="security" />
      {children}
    </>
  );
}
