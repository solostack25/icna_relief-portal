import HubTabs from "@/components/admin/HubTabs";

// One of the "helpDesk" hub's tabs - see lib/adminNav.ts.
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HubTabs hub="helpDesk" />
      {children}
    </>
  );
}
