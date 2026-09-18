import Link from "next/link";
import { redirect } from "next/navigation";
import PortalHeader from "@/app/PortalHeader";
import { getOrlandoAutomationAccess } from "@/lib/orlandoAutomation/access";
import { AlertProvider } from "@/lib/orlandoAutomation/alert";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

// Wraps every /orlando-automation/* page. Gate matches the Orlando office
// dashboard it's launched from (admins + Orlando's area manager). The
// .oa-scope wrapper supplies the handful of CSS variables Houston_Automation's
// pages expect that the portal theme doesn't define (see globals.css).
export default async function OrlandoAutomationLayout({ children }: { children: React.ReactNode }) {
  const access = await getOrlandoAutomationAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/select-app");

  return (
    <div className="oa-scope" style={{ minHeight: "100vh" }}>
      <PortalHeader subtitle="Orlando Automation" />
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <Link
          href={`/admin/office-info/${ORLANDO_OFFICE_ID}`}
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Orlando Office Dashboard
        </Link>
      </div>
      <AlertProvider>{children}</AlertProvider>
    </div>
  );
}
