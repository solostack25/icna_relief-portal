"use client";

import { useState } from "react";

export type ReceiptView = { id: string; url: string | null; is_pdf?: boolean; extracted?: { vendor?: string | null; total?: number | null; date?: string | null } | null };

// Receipt photos on a finance ticket. Tap one to see it full size.
export default function ReceiptStrip({ receipts, title = "Receipts" }: { receipts?: ReceiptView[] | null; title?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!receipts?.length) return null;
  const big = receipts.find((r) => r.id === open);
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="flex gap-2 flex-wrap">
        {receipts.map((r) =>
          r.url && r.is_pdf ? (
            // PDFs (e.g. invoices pulled from Amazon Business) open in a new tab.
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600 hover:bg-gray-100"
              style={{ width: 88, height: 110 }}
              title="Open PDF"
            >
              <span style={{ fontSize: 28 }}>📄</span>
              PDF
            </a>
          ) : r.url ? (
            <button key={r.id} onClick={() => setOpen(r.id)} className="block rounded-lg overflow-hidden border border-gray-200 bg-gray-50" style={{ width: 88, height: 110 }} title="View receipt">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt="Receipt" className="w-full h-full object-cover" />
            </button>
          ) : null
        )}
      </div>
      {big?.url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setOpen(null)}>
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big.url} alt="Receipt" className="w-full max-h-[85vh] object-contain rounded-lg bg-white" />
            <div className="flex justify-between mt-2 text-sm text-white">
              <a href={big.url} target="_blank" rel="noreferrer" className="underline">Open original</a>
              <button onClick={() => setOpen(null)} className="font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
