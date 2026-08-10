export default function InvoiceBadge({ invoiceId }: { invoiceId: string | null | undefined }) {
  if (!invoiceId) return null;
  return (
    <div className="fixed top-4 right-4 z-50 rounded-lg bg-brand-dark text-white text-xs font-mono px-3 py-1.5 shadow-lg">
      {invoiceId}
    </div>
  );
}
