import HubTabs from "@/components/admin/HubTabs";

// One of the "fliers" hub's tabs - see lib/adminNav.ts.
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HubTabs hub="fliers" />
      {children}
    </>
  );
}
