"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

// react-barcode touches the DOM directly; load it client-side only.
const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

export default function ClientIdCard({
  clientNumber,
  firstName,
  lastName,
}: {
  clientNumber: string | null;
  firstName: string;
  lastName: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  if (!clientNumber) return null;

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t("idcard.title")}</h2>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)]"
        >
          {open ? t("idcard.hide") : t("idcard.viewPrint")}
        </button>
      </div>

      {open && (
        <div className="mt-4 flex justify-center">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-6 w-full max-w-xs print:border-0">
            <div className="text-center mb-4">
              <Image
                src="/images/logo-icon.png"
                alt="ICNA Relief"
                width={125}
                height={125}
                className="h-12 w-12 mx-auto mb-2"
              />
              <p className="text-xs font-medium tracking-wide text-[var(--color-accent)] uppercase">
                {t("idcard.brand")}
              </p>
              <p className="text-lg font-semibold mt-1">
                {firstName} {lastName}
              </p>
            </div>
            {/* Barcode stays left-to-right regardless of language. */}
            <div className="flex justify-center bg-white py-2" dir="ltr">
              <Barcode
                value={clientNumber}
                format="CODE128"
                width={2}
                height={70}
                fontSize={14}
                margin={0}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
