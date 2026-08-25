"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type PendingApproval = {
  request_id: string;
  amount: number;
  title: string | null;
  submitted_by: string | null;
  approver_name: string;
  approver_job_title: string | null;
};

type UnassignedManager = { id: string; first_name: string; last_name: string };

export default function AdminHomeView({
  canManageFinance,
  pendingApprovals,
  isAdmin,
  unassignedAreaManagers,
  employeeCount,
}: {
  canManageFinance: boolean;
  pendingApprovals: PendingApproval[];
  isAdmin: boolean;
  unassignedAreaManagers: UnassignedManager[];
  employeeCount: number | null;
}) {
  const { t } = useLanguage();

  const managerCount = unassignedAreaManagers.length;
  const managerLine =
    managerCount === 1
      ? t("adminHome.areaManagersNeedOffice_one").replace("{count}", String(managerCount))
      : t("adminHome.areaManagersNeedOffice_other").replace("{count}", String(managerCount));

  return (
    <div>
      <h1
        style={{
          fontFamily: "'Fraunces', serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 30,
          margin: "0 0 4px",
        }}
      >
        {t("adminHome.welcomeBack")}
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        {t("adminHome.subtitle")}
      </p>

      {canManageFinance && pendingApprovals.length > 0 && (
        <>
          <div
            className="text-xs font-medium mb-3"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--portal-emerald)",
            }}
          >
            {t("adminHome.awaitingApproval")}
          </div>
          <div
            className="rounded-2xl bg-white overflow-hidden mb-10"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            {pendingApprovals.map((p, i) => (
              <Link
                key={i}
                href={`/helpdesk/${p.request_id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 hover:bg-black/[0.02] transition-colors"
                style={{
                  borderBottom: i < pendingApprovals.length - 1 ? "1px solid var(--portal-line)" : "none",
                }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{p.title ?? t("adminHome.untitledRequest")}</div>
                  <div
                    className="text-[11px]"
                    style={{ color: "rgba(22,48,43,0.5)", fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {p.submitted_by?.toUpperCase()} · ${p.amount.toLocaleString()}
                  </div>
                </div>
                <span
                  className="text-[10.5px] px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: "var(--portal-gold-soft)", color: "#7A5A17" }}
                >
                  {t("adminHome.awaitingPrefix")} {p.approver_job_title ?? p.approver_name}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {isAdmin && managerCount > 0 && (
        <div
          className="rounded-2xl px-4 py-3 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1"
          style={{ background: "#FBF0E6", border: "1px solid #E9C9A6" }}
        >
          <span style={{ fontWeight: 700, color: "#8A4A1E" }}>{managerLine}</span>
          {unassignedAreaManagers.map((e, i) => (
            <span key={e.id}>
              <Link href={`/admin/employees/${e.id}`} style={{ color: "#8A4A1E", textDecoration: "underline" }}>
                {e.first_name} {e.last_name}
              </Link>
              {i < managerCount - 1 ? "," : ""}
            </span>
          ))}
        </div>
      )}

      {isAdmin && (
        <>
          <div
            className="text-xs font-medium mb-3"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--portal-emerald)",
            }}
          >
            {t("adminHome.employees")}
          </div>
          <Link
            href="/admin/employees"
            className="flex items-center justify-between rounded-2xl bg-white px-5 py-4"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <span className="text-sm">
              <span style={{ fontWeight: 700, fontSize: 20 }}>{employeeCount ?? 0}</span>{" "}
              <span style={{ color: "rgba(22,48,43,0.5)" }}>{t("adminHome.employeesSignedIn")}</span>
            </span>
            <span style={{ color: "var(--portal-emerald)", fontWeight: 600 }}>{t("adminHome.viewAll")}</span>
          </Link>
        </>
      )}
    </div>
  );
}
