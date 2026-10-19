import SectionTabs from "@/components/admin/SectionTabs";
import { REVENUE_TABS } from "@/lib/adminNav";

// Revenue and Grants are one area: all streams, and the grants-only
// view of the same data.
export default function RevenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={REVENUE_TABS} ariaLabel="Revenue" />
      {children}
    </>
  );
}
