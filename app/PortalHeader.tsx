import LogoutButton from "@/app/select-app/LogoutButton";

// Shared between select-app (home) and /admin — the two pages that got
// the redesign. Logo replaces the old "ICNA Relief Portal" text; the
// bar is deliberately white/light (not the emerald used elsewhere in
// the redesign) so the logo's actual brand colors (green/orange) read
// at full fidelity instead of fighting a colored background.
export default function PortalHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 sm:px-10"
      style={{ background: "#fff", borderBottom: "1px solid var(--portal-line)" }}
    >
      <img src="/icna-relief-logo.png" alt="ICNA Relief" className="h-7 sm:h-8" />
      <div className="flex items-center gap-5 text-sm" style={{ color: "rgba(22,48,43,0.6)" }}>
        {subtitle && <span className="hidden sm:inline">{subtitle}</span>}
        <LogoutButton />
      </div>
    </div>
  );
}
