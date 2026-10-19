import HubTabs from "@/components/admin/HubTabs";

// Reports → Power BI (temporary): the Power BI versions of the reports and
// the portal-vs-Power BI comparison. See lib/powerbiReports.
export default function PowerBiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HubTabs hub="reports" />
      {children}
    </>
  );
}
