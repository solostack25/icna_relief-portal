"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import PortalHeader from "@/app/PortalHeader";
import PortalAssistantLauncher from "@/components/PortalAssistant/PortalAssistantLauncher";
import ClockControl from "./ClockControl";

type ProgramApp = { slug: string; display_name: string; route: string };

export default function SelectAppView({
  employeeId,
  employeeFirstName,
  openClockEntry,
  openTicketsCount,
  pendingApprovalsCount,
  trainingDueCount,
  itTicketSlot,
  showClientIntake,
  visibleApps,
  programStats,
  canSeeAdminPortal,
  employeeIsAdmin,
  todayLabel,
  hourNow,
}: {
  employeeId: string;
  employeeFirstName: string;
  openClockEntry: { id: string; clock_in_at: string } | null;
  openTicketsCount: number;
  pendingApprovalsCount: number;
  trainingDueCount: number;
  itTicketSlot: React.ReactNode;
  showClientIntake: boolean;
  visibleApps: ProgramApp[];
  programStats: Record<string, string>;
  canSeeAdminPortal: boolean;
  employeeIsAdmin: boolean;
  todayLabel: string;
  hourNow: number;
}) {
  const { t } = useLanguage();

  const greeting =
    hourNow < 12
      ? t("selectApp.greeting.morning")
      : hourNow < 17
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
                {todayLabel}
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
                {greeting},<br />
                <span style={{ fontStyle: "normal", fontWeight: 600, color: "var(--portal-gold-soft)" }}>
                  {employeeFirstName}.
                </span>
              </h1>
              <p className="text-sm max-w-md" style={{ color: "rgba(251,247,239,0.78)" }}>
                {t("selectApp.subtitle")}
              </p>
              <div className="mt-4">
                <ClockControl employeeId={employeeId} initialOpenEntry={openClockEntry} />
              </div>
            </div>

            <div
              className="flex flex-wrap rounded-2xl overflow-hidden"
              style={{ background: "rgba(251,247,239,0.08)", border: "1px solid rgba(251,247,239,0.18)" }}
            >
              <HeroStat value={openTicketsCount} label={t("selectApp.stat.openTickets")} />
              <HeroStat value={pendingApprovalsCount} label={t("selectApp.stat.awaitingApproval")} gold />
              <HeroStat value={trainingDueCount} label={t("selectApp.stat.trainingDue")} />
              {itTicketSlot}
            </div>
          </div>
        </div>

        {/* ---------- QUICK ACTIONS ---------- */}
        <SectionHead title={t("selectApp.quickActions.title")} note={t("selectApp.quickActions.note")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          {showClientIntake && (
            <QuickCard
              href="/clients"
              title={t("selectApp.card.clients.title")}
              desc={t("selectApp.card.clients.desc")}
              tint="#EAF3EF"
              iconColor="var(--portal-emerald)"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
                </svg>
              }
            />
          )}
          <QuickCard
            href="/directory"
            title={t("selectApp.card.directory.title")}
            desc={t("selectApp.card.directory.desc")}
            tint="#FBF0DC"
            iconColor="#A57420"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
                <path d="M8 10h6M8 14h8" />
              </svg>
            }
          />
          <QuickCard
            href="/office-apps"
            title={t("selectApp.card.officeApps.title")}
            desc={t("selectApp.card.officeApps.desc")}
            tint="#E9F1F4"
            iconColor="var(--portal-sky)"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M3 9h18" />
              </svg>
            }
          />
          <QuickCard
            href="/training"
            title={t("selectApp.card.training.title")}
            desc={t("selectApp.card.training.desc")}
            tint="#F3E9F4"
            iconColor="#8A5FA0"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 10L12 5 2 10l10 5 10-5z" />
                <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
              </svg>
            }
          />
          <QuickCard
            href="/upload-content"
            title={t("selectApp.card.uploadContent.title")}
            desc={t("selectApp.card.uploadContent.desc")}
            tint="#E3EEF8"
            iconColor="#2B6CB0"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <path d="M17 8l-5-5-5 5M12 3v12" />
              </svg>
            }
          />
          <QuickCard
            href="/fliers"
            title={t("selectApp.card.flier.title")}
            desc={t("selectApp.card.flier.desc")}
            tint="#F4E9EE"
            iconColor="#A0498A"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            }
          />
          <QuickCard
            href="/fundraisers"
            title={t("selectApp.card.fundraisers.title")}
            desc={t("selectApp.card.fundraisers.desc")}
            tint="#EAF3EF"
            iconColor="var(--portal-emerald)"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            }
          />
          <QuickCard
            href="/marketing/donor-calling"
            title={t("selectApp.card.donorCalling.title")}
            desc={t("selectApp.card.donorCalling.desc")}
            tint="#E3EEF8"
            iconColor="#2B6CB0"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .6 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.5 2.9.6a2 2 0 011.7 2.1z" />
              </svg>
            }
          />
        </div>

        {/* ---------- YOUR PROGRAMS ---------- */}
        {(visibleApps.length > 0 || employeeIsAdmin) && (
          <>
            <SectionHead title={t("selectApp.yourPrograms.title")} note={t("selectApp.yourPrograms.note")} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-10">
              {visibleApps.map((app) => (
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
    <div
      className="px-5 py-4 min-w-[100px]"
      style={{ borderRight: last ? "none" : "1px solid rgba(251,247,239,0.16)" }}
    >
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

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
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
      <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
        {note}
      </div>
    </div>
  );
}

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
      className="relative block rounded-2xl bg-white p-6 transition-all hover:-translate-y-0.5"
      style={{
        border: "1px solid var(--portal-line)",
        boxShadow: "0 1px 2px rgba(22,48,43,0.04), 0 8px 24px -8px rgba(22,48,43,0.10)",
      }}
    >
      <div
        className="w-[42px] h-[42px] rounded-xl flex items-center justify-center mb-4"
        style={{ background: tint, color: iconColor }}
      >
        <span style={{ width: 21, height: 21, display: "block" }}>{icon}</span>
      </div>
      <h3 className="text-[15.5px] font-bold m-0 mb-1" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-xs m-0 leading-relaxed" style={{ color: "rgba(22,48,43,0.55)" }}>
        {desc}
      </p>
    </Link>
  );
}
