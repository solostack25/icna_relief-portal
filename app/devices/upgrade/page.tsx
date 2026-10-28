import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import UpgradeWizard from "./UpgradeWizard";

export const dynamic = "force-dynamic";

export default async function UpgradeMyPcPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>Upgrade my PC</h1>
          <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back
          </Link>
        </div>
        <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.6)" }}>
          Move your work computer to Windows 11 Pro and connect it to ICNA Relief, so you can sign in with your work account and IT can keep it secure and updated. Takes about 20 minutes; do it <b>on the PC you're upgrading</b>, plugged in.
        </p>
        <UpgradeWizard />
      </div>
    </main>
  );
}
