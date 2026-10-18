import FinanceTabs from "@/components/finance/FinanceTabs";

export default function FinanceTicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 12px" }}>Finance Tickets</h1>
      <FinanceTabs />
      {children}
    </div>
  );
}
