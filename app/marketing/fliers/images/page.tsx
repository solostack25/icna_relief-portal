import { redirect } from "next/navigation";
import Link from "next/link";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import PortalHeader from "@/app/PortalHeader";
import ImagesClient from "./ImagesClient";

export default async function ApprovedImagesPage() {
  const access = await getFlierMarketingAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1
            style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}
          >
            Approved Images
          </h1>
          <Link href="/marketing/fliers/builder" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Templates
          </Link>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          Browse photos already uploaded to a program's Dropbox folder and approve the ones field
          offices are allowed to use in fliers. Only approved images show up in the flier tool.
        </p>
        <ImagesClient />
      </div>
    </main>
  );
}
