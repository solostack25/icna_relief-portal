import ReportsHubTabs from "@/components/admin/ReportsHubTabs";

// Part of the Reports hub (Overview / Programs / Standard reports /
// Custom reports) - see lib/adminNav.ts.
export default function ReportsHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ReportsHubTabs />
      {children}
    </>
  );
}
