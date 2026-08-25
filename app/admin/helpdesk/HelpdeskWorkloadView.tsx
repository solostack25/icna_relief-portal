"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Department, LegStatus } from "@/lib/helpdesk";

const DEPT_KEYS: Record<Department, string> = {
  it: "helpdesk.dept.it",
  hr: "helpdesk.dept.hr",
  marketing: "helpdesk.dept.marketing",
  finance: "helpdesk.dept.finance",
};

const STATUS_KEYS: Record<LegStatus, string> = {
  open: "helpdesk.status.open",
  in_progress: "helpdesk.status.in_progress",
  on_hold: "helpdesk.status.on_hold",
  quality_assurance: "helpdesk.status.quality_assurance",
  handed_off: "helpdesk.status.handed_off",
  closed: "helpdesk.status.closed",
};

type Leg = {
  id: string;
  status: string;
  priority: string;
  category: string | null;
  request_id: string;
};

type GroupEntry = {
  key: string;
  displayNameKind: "unassigned" | "employee" | "legacy";
  displayName: string; // for employee/legacy: the actual name text
  legs: Leg[];
};

export default function HelpdeskWorkloadView({
  allDepartments,
  activeDept,
  groups,
  requestMap,
}: {
  allDepartments: Department[];
  activeDept: Department;
  groups: GroupEntry[];
  requestMap: Record<string, { title: string | null }>;
}) {
  const { t } = useLanguage();

  const nameFor = (g: GroupEntry) => {
    if (g.displayNameKind === "unassigned") return t("helpdesk.workload.unassigned");
    if (g.displayNameKind === "legacy") return `${g.displayName} ${t("helpdesk.workload.legacy")}`;
    return g.displayName || t("helpdesk.workload.formerStaff");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
            {t("helpdesk.workload.title")}
          </h1>
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.55)" }}>
            {t("helpdesk.workload.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/helpdesk/manage" className="text-sm text-[var(--color-accent)] hover:underline">
            {t("helpdesk.workload.manageTickets")}
          </Link>
          <Link href="/helpdesk/wizard" className="text-sm text-[var(--color-accent)] hover:underline">
            {t("helpdesk.workload.submitTicket")}
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {allDepartments.map((d) => (
          <Link
            key={d}
            href={`/admin/helpdesk?dept=${d}`}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              activeDept === d
                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]"
            }`}
          >
            {t(DEPT_KEYS[d])}
          </Link>
        ))}
      </div>

      <form action="/api/admin/import-it-tickets" method="POST" className="mb-8">
        <button
          formTarget="_blank"
          className="text-sm px-4 py-2.5 rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:border-[var(--color-accent)] cursor-pointer"
        >
          {t("helpdesk.workload.importSync")}
        </button>
        <p className="text-xs text-[var(--color-text-dim)] mt-1.5">{t("helpdesk.workload.importSafe")}</p>
      </form>

      <div className="space-y-6">
        {groups.map((g) => (
          <div
            key={g.key}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 bg-black/[0.03] border-b border-[var(--color-border)]">
              <span className="text-sm font-semibold">{nameFor(g)}</span>
              <span className="text-xs text-[var(--color-text-dim)]">
                {g.legs.length} {g.legs.length === 1 ? t("helpdesk.workload.ticket_one") : t("helpdesk.workload.ticket_other")}
              </span>
            </div>
            {g.legs.length === 0 ? (
              <p className="px-5 py-4 text-xs text-[var(--color-text-dim)]">{t("helpdesk.workload.noActiveTickets")}</p>
            ) : (
              g.legs.map((leg) => {
                const req = requestMap[leg.request_id];
                return (
                  <Link
                    key={leg.id}
                    href={`/helpdesk/${leg.request_id}`}
                    className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] last:border-b-0 hover:bg-black/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm truncate">{req?.title ?? t("helpdesk.workload.untitledRequest")}</div>
                      <div className="text-xs text-[var(--color-text-dim)]">
                        {leg.category ?? t("helpdesk.workload.noCategory")} · {leg.priority}
                      </div>
                    </div>
                    <span className="text-xs whitespace-nowrap px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                      {t(STATUS_KEYS[leg.status as LegStatus])}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
