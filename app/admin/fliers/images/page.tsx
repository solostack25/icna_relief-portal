import { redirect } from "next/navigation";
import Link from "next/link";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import ImagesClient from "./ImagesClient";

export default async function ApprovedImagesPage() {
  const access = await getFlierMarketingAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>
          Content Library
        </h1>
        <Link href="/admin/fliers/builder" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← Templates
        </Link>
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Every photo uploaded through the portal, across every program folder, in one place —
        with who uploaded it and when, where that's known. Approve the ones field offices are
        allowed to use in fliers; only approved images show up in the flier tool.
      </p>
      <ImagesClient />
    </div>
  );
}
