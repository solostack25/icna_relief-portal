"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { INTL_LOCALE } from "@/lib/i18n/translations";
import type { MyDayData, RequestItem, WaitingItem } from "@/lib/myDay";

const C = {
  ink: "#16302B",
  ink2: "rgba(22,48,43,0.62)",
  ink3: "rgba(22,48,43,0.45)",
  line: "rgba(22,48,43,0.10)",
  track: "#EDEBE5",
  data: "#13805A",
  gold: "#B7791F",
  red: "#B42318",
};

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;
const compact = (n: number, unit: "money" | "count") =>
  (unit === "money" ? "$" : "") + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)) : 0);

const KIND_TINT: Record<WaitingItem["kind"], { bg: string; fg: string; label: string }> = {
  finance: { bg: "#E7F3EE", fg: "#14513D", label: "$" },
  speaker: { bg: "#EFEAF4", fg: "#5B3F7B", label: "🎤" },
  zakat: { bg: "#FBF0D9", fg: "#7A4F12", label: "Z" },
  training: { bg: "#E8EEF8", fg: "#22427A", label: "✓" },
};

function Card({ title, count, children, action }: { title: string; count?: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-5 min-w-0" style={{ boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: C.ink }}>{title}</h2>
          {count != null && count > 0 && (
            <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: "#FBF0D9", color: "#7A4F12" }}>{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Steps({ state, t }: { state: RequestItem["state"]; t: (k: string) => string }) {
  const at = state === "paid" ? 3 : state === "approved" || state === "processing" ? 2 : 1;
  const bad = state === "denied";
  const warn = state === "sent_back";
  const labels = [t("myDay.steps.submitted"), t("myDay.steps.approval"), t("myDay.steps.approved"), t("myDay.steps.paid")];
  return (
    <div className="flex items-center gap-1 mt-2" aria-hidden>
      {labels.map((l, i) => {
        const done = !bad && i <= at;
        const color = bad && i === 1 ? C.red : warn && i === 1 ? C.gold : done ? C.data : C.track;
        return (
          <div key={l} className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full" style={{ background: color }} />
            <div className="text-[10px] mt-1 truncate" style={{ color: i === at && !bad ? C.ink : C.ink3, fontWeight: i === at ? 600 : 400 }}>{l}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function MyDay({ data }: { data: MyDayData }) {
  const { t, locale } = useLanguage();
  const dateFmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(INTL_LOCALE[locale] ?? "en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

  const track = (r: RequestItem) => {
    switch (r.state) {
      case "with_approver":
        return t("myDay.track.with", { name: r.who ?? "", date: dateFmt(r.since) }) + (r.typicalDays ? ` · ${r.typicalDays <= 1 ? t("myDay.track.usuallyDay") : t("myDay.track.usually", { days: r.typicalDays })}` : "");
      case "sent_back": return t("myDay.track.sentBack");
      case "approved": return t("myDay.track.approved");
      case "processing": return t("myDay.track.processing");
      case "paid": return t("myDay.track.paid", { date: dateFmt(r.since) });
      case "denied": return t("myDay.track.denied");
      case "open": return t("myDay.track.open", { date: dateFmt(r.since) });
      case "pending_am": return t("myDay.track.pendingAm");
      case "pending_leadership": return t("myDay.track.pendingLeadership");
      default: return t("myDay.track.onHold");
    }
  };

  const actionable = data.waiting.filter((w) => w.kind !== "training").length;

  return (
    <div className="mb-10">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("myDay.waiting.title")} count={actionable}>
          {data.waiting.length === 0 ? (
            <p className="text-sm" style={{ color: C.ink2 }}>{t("myDay.waiting.empty")}</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: C.line }}>
              {data.waiting.slice(0, 6).map((w, i) => {
                const k = KIND_TINT[w.kind];
                const d = daysSince(w.since);
                return (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: C.line }}>
                    <Link href={w.href} className="flex items-center gap-3 group">
                      <span className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: k.bg, color: k.fg }}>{k.label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate" style={{ color: C.ink }}>
                          {w.kind === "training" ? t("myDay.training", { count: Number(w.title) || 0 }) : w.title}
                        </span>
                        <span className="block text-xs truncate" style={{ color: C.ink2 }}>
                          {[w.amount != null ? money(w.amount) : null, w.since ? (d === 0 ? t("myDay.age.today") : t("myDay.age.days", { days: d })) : null, w.sub || null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 group-hover:opacity-90" style={{ background: w.kind === "training" ? "#E8EEF8" : "#1F6F54", color: w.kind === "training" ? "#22427A" : "#fff" }}>
                        {w.kind === "training" ? t("myDay.open") : t("myDay.waiting.review")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {data.waiting.length > 6 && <p className="text-xs mt-2" style={{ color: C.ink3 }}>+{data.waiting.length - 6}</p>}
        </Card>

        <Card
          title={t("myDay.requests.title")}
          action={
            <Link href="/finance-tickets/new" className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ border: `1.5px solid ${C.line}`, color: C.ink2 }}>
              + {t("myDay.requests.new")}
            </Link>
          }
        >
          {data.requests.length === 0 ? (
            <p className="text-sm" style={{ color: C.ink2 }}>{t("myDay.requests.empty")}</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: C.line }}>
              {data.requests.slice(0, 5).map((r, i) => (
                <li key={i} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: C.line }}>
                  <Link href={r.href} className="block">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: C.ink }}>{r.title}</span>
                      {r.amount != null && <span className="text-sm font-semibold shrink-0" style={{ color: C.ink }}>{money(r.amount)}</span>}
                    </div>
                    <div className="text-xs" style={{ color: r.state === "sent_back" ? C.gold : r.state === "denied" ? C.red : C.ink2, fontWeight: r.state === "sent_back" ? 600 : 400 }}>
                      {r.ref ? `${r.ref} · ` : ""}{track(r)}
                    </div>
                    {r.kind === "finance" && <Steps state={r.state} t={t} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.requests.length > 5 && (
            <Link href="/finance-tickets" className="block text-xs font-semibold mt-3" style={{ color: "#1F6F54" }}>{t("myDay.requests.all")} →</Link>
          )}
        </Card>
      </div>

      {data.office && (
        <div className="rounded-3xl bg-white p-5 mt-4" style={{ boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
          <h2 className="text-[15px] font-bold mb-3" style={{ color: C.ink }}>{t("myDay.office.title", { office: data.office.name, year: data.office.year })}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.office.goals.map((g) => {
              const pct = g.goal > 0 ? g.actual / g.goal : 0;
              const over = g.metric === "budget" && pct > 1;
              return (
                <div key={g.metric}>
                  <div className="text-xs" style={{ color: C.ink2 }}>{t(`myDay.goal.${g.metric}`)}</div>
                  <div className="text-lg font-bold" style={{ color: over ? C.red : C.ink }}>
                    {compact(g.actual, g.unit)} <span className="text-xs font-normal" style={{ color: C.ink3 }}>{t("myDay.goal.of", { goal: compact(g.goal, g.unit) })}</span>
                  </div>
                  <div className="h-2 rounded-full mt-1.5 overflow-hidden" style={{ background: C.track }} role="img" aria-label={`${Math.round(pct * 100)}%`}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: over ? C.red : C.data }} />
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: C.ink3 }}>{Math.round(pct * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function MyDaySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 mb-10 animate-pulse">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-3xl bg-white p-5 h-40" style={{ boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
          <div className="h-4 w-32 rounded" style={{ background: C.track }} />
          <div className="h-3 w-full rounded mt-5" style={{ background: C.track }} />
          <div className="h-3 w-4/5 rounded mt-3" style={{ background: C.track }} />
        </div>
      ))}
    </div>
  );
}
