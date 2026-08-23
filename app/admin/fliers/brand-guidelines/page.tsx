import { redirect } from "next/navigation";
import Link from "next/link";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import BrandGuidelinesClient from "./BrandGuidelinesClient";

export default async function BrandGuidelinesPage() {
  const access = await getFlierMarketingAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>
          Brand Guidelines
        </h1>
        <Link href="/admin/fliers/builder" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← Flier Templates
        </Link>
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        These are the boundaries every flier stays inside of — the Flier Builder&apos;s color/font pickers already
        enforce the palette below, and any future AI-assisted flier generation (e.g. Copilot) will read this as its
        constraints too, the same way it only pulls images from the approved Content Library.
      </p>
      <BrandGuidelinesClient />
    </div>
  );
}
