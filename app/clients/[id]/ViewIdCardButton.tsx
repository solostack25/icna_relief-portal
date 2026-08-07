"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";

// react-barcode touches the DOM directly; load it client-side only.
const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

export default function ViewIdCardButton({
  cardNumber,
  firstName,
  lastName,
}: {
  cardNumber: string | null;
  firstName: string;
  lastName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!cardNumber) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium px-4 py-2 hover:border-[var(--color-accent)]"
      >
        {open ? "Hide ID" : "View ID"}
      </button>

      {open && (
        <div className="mt-4 flex justify-center w-full">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 w-full max-w-xs print:border-0">
            <div className="text-center mb-4">
              <Image
                src="/icna-relief-logo.png"
                alt="ICNA Relief"
                width={125}
                height={125}
                className="h-12 w-12 mx-auto mb-2 object-contain"
              />
              <p className="text-xs font-medium tracking-wide text-[var(--color-accent)] uppercase">
                Client ID
              </p>
              <p className="text-lg font-semibold mt-1">
                {firstName} {lastName}
              </p>
            </div>
            <div className="flex justify-center bg-white py-2">
              <Barcode
                value={cardNumber}
                format="CODE128"
                width={1.5}
                height={60}
                fontSize={11}
                margin={0}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
