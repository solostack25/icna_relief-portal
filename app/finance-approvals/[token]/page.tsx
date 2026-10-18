import Link from "next/link";

// Approval links from the retired helpdesk finance-approval emails land here.
// Finance approvals now run through Finance Tickets.
export default function RetiredFinanceApprovalPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand, #F4F1EA)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 32px", maxWidth: 460, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#16302B", margin: "0 0 8px" }}>This approval link has expired</h1>
        <p style={{ fontSize: 14, color: "rgba(22,48,43,0.65)", margin: "0 0 18px", lineHeight: 1.5 }}>
          Finance approvals have moved to Finance Tickets. Anything waiting on you is listed under My Approvals.
        </p>
        <Link href="/finance-ticket-approvals" style={{ display: "inline-block", background: "#1F6F54", color: "#fff", borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 600 }}>
          Open My Approvals
        </Link>
      </div>
    </main>
  );
}
