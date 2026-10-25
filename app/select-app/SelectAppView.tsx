"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INTL_LOCALE } from "@/lib/i18n/translations";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import PortalHeader from "@/app/PortalHeader";
import PortalAssistantLauncher from "@/components/PortalAssistant/PortalAssistantLauncher";
import ClockControl from "./ClockControl";
import { HERO_CELL } from "./heroCell";
import { QUICK_ACTIONS, QUICK_ACTIONS_BY_KEY, type QuickAction } from "./quickActions";
import { defaultSection, resolveSection, toSaved, type HomeLayoutPref, type LayoutItem } from "./homeLayout";
import CustomizeHomeSheet, { type SheetRowMeta, type SheetTab } from "./CustomizeHomeSheet";

type ProgramApp = { slug: string; display_name: string; route: string };

export default function SelectAppView({
  employeeId,
  employeeFirstName,
  openClockEntry,
  openTicketsCount,
  pendingApprovalsCount,
  trainingDueCount,
  itTicketSlot,
  meetingsSlot,
  meetingsTodaySlot,
  myDaySlot,
  showClientIntake,
  visibleApps,
  programStats,
  canSeeAdminPortal,
  employeeIsAdmin,
  todayLabel,
  hourNow,
  homeLayout,
}: {
  employeeId: string;
  employeeFirstName: string;
  openClockEntry: { id: string; clock_in_at: string } | null;
  openTicketsCount: number;
  pendingApprovalsCount: number;
  trainingDueCount: number;
  itTicketSlot: React.ReactNode;
  meetingsSlot: React.ReactNode;
  meetingsTodaySlot: React.ReactNode;
  myDaySlot?: React.ReactNode;
  showClientIntake: boolean;
  visibleApps: ProgramApp[];
  programStats: Record<string, string>;
  canSeeAdminPortal: boolean;
  employeeIsAdmin: boolean;
  todayLabel: string;
  hourNow: number;
  homeLayout: HomeLayoutPref | null;
}) {
  const { t, locale } = useLanguage();

  // ---- Customizable layout ----
  // What this person is allowed to see; the saved layout only reorders/hides
  // within this, it never adds access.
  const availableQuick = useMemo(
    () => QUICK_ACTIONS.filter((q) => q.requires !== "clientIntake" || showClientIntake),
    [showClientIntake]
  );
  const availablePrograms = useMemo(
    () => visibleApps.map((a) => ({ key: a.slug, defaultOn: true })),
    [visibleApps]
  );
  const [quickLayout, setQuickLayout] = useState<LayoutItem[]>(() =>
    resolveSection(availableQuick, homeLayout?.quick_actions_order, homeLayout?.quick_actions_hidden)
  );
  const [programLayout, setProgramLayout] = useState<LayoutItem[]>(() =>
    resolveSection(availablePrograms, homeLayout?.programs_order, homeLayout?.programs_hidden)
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SheetTab>("quick");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openSheet = (tab: SheetTab) => {
    setSaveError(null);
    setSheetTab(tab);
    setSheetOpen(true);
  };

  const qaTitle = (q: QuickAction) => (q.titleKey ? t(q.titleKey) : q.title ?? q.key);
  const qaDesc = (q: QuickAction) => (q.descKey ? t(q.descKey) : q.desc ?? "");

  const shownQuick = quickLayout
    .filter((i) => i.visible)
    .map((i) => QUICK_ACTIONS_BY_KEY.get(i.key))
    .filter((q): q is QuickAction => !!q);
  const appsBySlug = useMemo(() => new Map(visibleApps.map((a) => [a.slug, a])), [visibleApps]);
  const shownPrograms = programLayout
    .filter((i) => i.visible)
    .map((i) => appsBySlug.get(i.key))
    .filter((a): a is ProgramApp => !!a);

  const quickMeta: Record<string, SheetRowMeta> = Object.fromEntries(
    availableQuick.map((q) => [q.key, { label: qaTitle(q), desc: qaDesc(q), icon: q.icon, tint: q.tint, iconColor: q.iconColor }])
  );
  const programMeta: Record<string, SheetRowMeta> = Object.fromEntries(
    visibleApps.map((a) => [a.slug, { label: a.display_name, desc: programStats[a.slug] }])
  );

  const saveLayout = useCallback(
    async (quick: LayoutItem[], programs: LayoutItem[]) => {
      setSaving(true);
      setSaveError(null);
      const q = toSaved(quick);
      const p = toSaved(programs);
      const { error } = await createClient()
        .from("employee_home_layouts")
        .upsert(
          {
            employee_id: employeeId,
            quick_actions_order: q.order,
            quick_actions_hidden: q.hidden,
            programs_order: p.order,
            programs_hidden: p.hidden,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "employee_id" }
        );
      setSaving(false);
      if (error) {
        setSaveError(t("selectApp.customize.saveError"));
        return;
      }
      setQuickLayout(quick);
      setProgramLayout(programs);
      setSheetOpen(false);
    },
    [employeeId, t]
  );

  // Date and greeting come from the viewer's own clock. The server runs on
  // UTC, so its "now" is hours ahead of US staff in the evening.
  const [clock, setClock] = useState<{ hour: number; label: string } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock({ hour: d.getHours(), label: d.toLocaleDateString(INTL_LOCALE[locale] ?? "en-US", { weekday: "long", month: "long", day: "numeric" }) });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [locale]);
  const hour = clock?.hour ?? hourNow;

  const greeting =
    hour < 12
      ? t("selectApp.greeting.morning")
      : hour < 17
      ? t("selectApp.greeting.afternoon")
      : t("selectApp.greeting.evening");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />

      <div className="max-w-4xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        {/* ---------- HERO ---------- */}
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-10 mb-10"
          style={{ background: "var(--portal-emerald)", color: "var(--portal-sand)" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 480px 320px at 88% -10%, rgba(251,247,239,0.14), transparent 70%)",
            }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <div
                className="text-xs mb-3"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--portal-gold-soft)",
                }}
              >
                <span style={{ visibility: clock ? "visible" : "hidden" }}>{clock?.label ?? todayLabel}</span>
              </div>
              <h1
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(28px, 5vw, 42px)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.01em",
                  margin: "0 0 10px",
                }}
              >
                <span style={{ visibility: clock ? "visible" : "hidden" }}>{greeting},</span>
                <br />
                <span style={{ fontStyle: "normal", fontWeight: 600, color: "var(--portal-gold-soft)" }}>
                  {employeeFirstName}.
                </span>
              </h1>
              <p className="text-sm max-w-md" style={{ color: "rgba(251,247,239,0.78)" }}>
                {t("selectApp.subtitle")}
              </p>
              <div className="mt-3">{meetingsTodaySlot}</div>
              <div className="mt-4">
                <ClockControl employeeId={employeeId} initialOpenEntry={openClockEntry} />
              </div>
            </div>

            <div
              className="grid grid-cols-2 w-full sm:w-auto sm:flex sm:flex-wrap rounded-2xl overflow-hidden"
              style={{ background: "rgba(251,247,239,0.08)", border: "1px solid rgba(251,247,239,0.18)" }}
            >
              <HeroStat value={openTicketsCount} label={t("selectApp.stat.openTickets")} />
              <HeroStat value={pendingApprovalsCount} label={t("selectApp.stat.awaitingApproval")} gold />
              <HeroStat value={trainingDueCount} label={t("selectApp.stat.trainingDue")} />
              {itTicketSlot}
            </div>
          </div>
        </div>

        {/* ---------- MY DAY: what's waiting on me, my requests, my office ---------- */}
        {myDaySlot}

        {/* ---------- QUICK ACTIONS (customizable) ---------- */}
        <SectionHead
          title={t("selectApp.quickActions.title")}
          note={t("selectApp.quickActions.note")}
          action={{ label: t("selectApp.customize.button"), onClick: () => openSheet("quick") }}
        />
        {shownQuick.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-10">
            {shownQuick.map((qa) => (
              <QuickCard
                key={qa.key}
                href={qa.href}
                title={qaTitle(qa)}
                desc={qaDesc(qa)}
                tint={qa.tint}
                iconColor={qa.iconColor}
                icon={qa.icon}
              />
            ))}
          </div>
        ) : (
          <EmptyHint text={t("selectApp.customize.emptyQuick")} cta={t("selectApp.customize.button")} onClick={() => openSheet("quick")} />
        )}

        {/* ---------- TODAY'S MEETINGS ---------- */}
        <div className="mb-10">{meetingsSlot}</div>

        {/* ---------- YOUR PROGRAMS (customizable) ---------- */}
        {(visibleApps.length > 0 || employeeIsAdmin) && (
          <>
            <SectionHead
              title={t("selectApp.yourPrograms.title")}
              note={t("selectApp.yourPrograms.note")}
              action={visibleApps.length > 0 ? { label: t("selectApp.customize.button"), onClick: () => openSheet("programs") } : undefined}
            />
            {shownPrograms.length > 0 || visibleApps.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-10">
                {shownPrograms.map((app) => (
                  <Link
                    key={app.slug}
                    href={app.route}
                    className="rounded-xl bg-white p-4 transition-all hover:-translate-y-0.5"
                    style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
                  >
                    <div className="flex items-center gap-2 text-sm font-bold mb-0.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--portal-emerald)" }}
                      />
                      {app.display_name}
                    </div>
                    {programStats[app.slug] && (
                      <div
                        className="text-[11px]"
                        style={{ color: "rgba(22,48,43,0.5)", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {programStats[app.slug]}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyHint text={t("selectApp.customize.emptyPrograms")} cta={t("selectApp.customize.button")} onClick={() => openSheet("programs")} />
            )}
          </>
        )}

        {visibleApps.length === 0 && !employeeIsAdmin && (
          <p className="text-sm text-[var(--color-text-dim)] mb-10">{t("selectApp.noAppsAccess")}</p>
        )}

        {/* ---------- ADMIN PORTAL STRIP ---------- */}
        {canSeeAdminPortal && (
          <Link
            href="/admin"
            className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl px-6 py-5 transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--portal-ink)", color: "var(--portal-sand)" }}
          >
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(120deg, rgba(201,154,61,0.10), transparent 55%)" }}
            />
            <div className="relative flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(201,154,61,0.18)", color: "var(--portal-gold)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="19" height="19">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 4v5M16 4v5" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold m-0">{t("selectApp.adminPortal.title")}</h3>
                <p className="text-xs m-0" style={{ color: "rgba(251,247,239,0.55)" }}>
                  {t("selectApp.adminPortal.desc")}
                </p>
              </div>
            </div>
            <div
              className="relative text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--portal-gold)",
                border: "1px solid rgba(201,154,61,0.4)",
              }}
            >
              {t("selectApp.adminPortal.enter")}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </Link>
        )}
      </div>
      <CustomizeHomeSheet
        open={sheetOpen}
        initialTab={sheetTab}
        quick={quickLayout}
        programs={programLayout}
        quickMeta={quickMeta}
        programMeta={programMeta}
        quickDefaults={defaultSection(availableQuick)}
        programDefaults={defaultSection(availablePrograms)}
        showProgramsTab={visibleApps.length > 0}
        saving={saving}
        error={saveError}
        onClose={() => setSheetOpen(false)}
        onSave={saveLayout}
      />
      <PortalAssistantLauncher />
    </main>
  );
}

export function HeroStat({
  value,
  label,
  gold,
  last,
}: {
  value: number | string;
  label: string;
  gold?: boolean;
  last?: boolean;
}) {
  return (
    <div className={HERO_CELL} data-last={last ? "" : undefined}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 24,
          fontWeight: 500,
          color: gold ? "var(--portal-gold-soft)" : "var(--portal-sand)",
        }}
      >
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "rgba(251,247,239,0.65)" }}>
        {label}
      </div>
    </div>
  );
}

function SectionHead({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div
        className="text-xs font-medium"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--portal-emerald)",
        }}
      >
        {title}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
          {note}
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors hover:bg-white"
            style={{ border: "1px solid var(--portal-line)", color: "var(--portal-emerald)" }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyHint({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full mb-10 rounded-xl px-4 py-5 text-sm text-center transition-colors hover:bg-white"
      style={{ border: "1.5px dashed var(--portal-line)", color: "rgba(22,48,43,0.6)" }}
    >
      {text} <span className="font-semibold" style={{ color: "var(--portal-emerald)" }}>{cta} →</span>
    </button>
  );
}

// Compact launcher tile: icon + name. The longer description is kept as
// a hover tooltip and for screen readers, so the grid reads at a glance.
function QuickCard({
  href,
  title,
  desc,
  icon,
  tint,
  iconColor,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  tint: string;
  iconColor: string;
}) {
  return (
    <Link
      href={href}
      title={desc}
      aria-description={desc}
      className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-3 transition-all hover:-translate-y-0.5"
      style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: tint, color: iconColor }}
      >
        <span style={{ width: 18, height: 18, display: "block" }}>{icon}</span>
      </span>
      <span className="text-sm font-semibold leading-tight" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </span>
    </Link>
  );
}
