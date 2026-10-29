import { redirect } from "next/navigation";
import HubTabs from "@/components/admin/HubTabs";
import { getDeviceViewer } from "@/lib/devices/access";

// Phones hub: 3CX (live calls, extensions, call history, routing) and
// Skyetel (numbers, SMS, billing). IT only, same people as Devices.
export default async function PhonesLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getDeviceViewer();
  if (!viewer) redirect("/admin");
  return (
    <>
      <div className="mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Phones</h1>
        <p className="text-sm mt-1 mb-0" style={{ color: "rgba(22,48,43,0.68)" }}>
          3CX phone system and Skyetel numbers. Changes here save straight to 3CX or Skyetel and are logged.
        </p>
      </div>
      <HubTabs hub="phones" />
      {children}
    </>
  );
}
