import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { lastSecuritySync } from "../data";
import { SecSyncButton, SecSyncStatus } from "../ui";
import { PageHead, SeverityPill, card, dim, faint, fmtDate, ink, line, relTime } from "../style";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { active: "New", inProgress: "In progress", resolved: "Resolved", redirected: "Merged" };

type Inc = {
  id: string;
  display_name: string | null;
  severity: string | null;
  status: string | null;
  classification: string | null;
  determination: string | null;
  assigned_to: string | null;
  created_at: string | null;
  last_update_at: string | null;
  web_url: string | null;
  alert_count: number;
  alert_titles: string[];
  devices: string[];
  users: string[];
  service_sources: string[];
};

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ status?: string; severity?: string }> }) {
  const { status = "open", severity = "" } = await searchParams;
  const admin = createAdminClient();
  let q = admin.from("sec_incidents").select("*").order("last_update_at", { ascending: false }).limit(300);
  if (status === "open") q = q.in("status", ["active", "inProgress"]);
  else if (status !== "all") q = q.eq("status", status);
  if (severity) q = q.eq("severity", severity);
  const [{ data }, run] = await Promise.all([q, lastSecuritySync()]);
  const rows = (data ?? []) as Inc[];

  const pill = (key: string, value: string, label: string, current: string) => {
    const params = new URLSearchParams({ status, severity, [key]: value });
    if (!params.get("severity")) params.delete("severity");
    const on = current === value;
    return (
      <Link
        key={`${key}-${value}`}
        href={`/admin/security/incidents?${params}`}
        className="text-xs font-bold rounded-full px-3 py-1.5"
        style={{ border: `1.5px solid ${line}`, background: on ? ink : "#fff", color: on ? "#fff" : ink }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="max-w-6xl">
      <PageHead title="Incidents" sub="Microsoft Defender XDR incidents from the last 90 days, plus anything still open. Investigate and respond in the Defender portal." right={<SecSyncButton />} />
      <SecSyncStatus run={run} />
      <div className="flex flex-wrap gap-2 mb-2">
        {pill("status", "open", "Open", status)}
        {pill("status", "resolved", "Resolved", status)}
        {pill("status", "all", "All", status)}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {pill("severity", "", "Any severity", severity)}
        {pill("severity", "high", "High", severity)}
        {pill("severity", "medium", "Medium", severity)}
        {pill("severity", "low", "Low", severity)}
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm" style={{ ...card, color: dim }}>
          {status === "open" ? "No open incidents." : "No incidents."}
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((i) => (
            <section key={i.id} className="p-4" style={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityPill severity={i.severity} />
                    <span className="text-xs font-bold" style={{ color: dim }}>
                      {STATUS_LABEL[i.status ?? ""] ?? i.status}
                    </span>
                    <span className="text-xs" style={{ color: faint }}>
                      #{i.id} · {i.alert_count} alert{i.alert_count === 1 ? "" : "s"} · {i.service_sources.join(", ")}
                    </span>
                  </div>
                  <div className="text-[15px] font-bold mt-1.5" style={{ color: ink }}>
                    {i.display_name}
                  </div>
                  {i.alert_titles.length > 0 && (
                    <div className="text-xs mt-1" style={{ color: dim }}>
                      {i.alert_titles.slice(0, 4).join(" · ")}
                      {i.alert_titles.length > 4 ? ` +${i.alert_titles.length - 4} more` : ""}
                    </div>
                  )}
                </div>
                {i.web_url && (
                  <a href={i.web_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold rounded-full px-3 py-1.5 whitespace-nowrap" style={{ border: `1.5px solid ${line}`, color: ink }}>
                    Open in Defender ↗
                  </a>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs" style={{ color: dim }}>
                {i.devices.length > 0 && (
                  <div>
                    Devices:{" "}
                    {i.devices.slice(0, 6).map((d, k) => (
                      <span key={d}>
                        {k > 0 && ", "}
                        <Link href={`/admin/devices?q=${encodeURIComponent(d.split(".")[0])}`} className="underline" style={{ color: ink }}>
                          {d.split(".")[0]}
                        </Link>
                      </span>
                    ))}
                  </div>
                )}
                {i.users.length > 0 && <div>Users: {i.users.slice(0, 6).join(", ")}</div>}
                <div>Assigned: {i.assigned_to ?? "nobody"}</div>
                <div>
                  Created {fmtDate(i.created_at)} · updated {relTime(i.last_update_at)}
                </div>
                {i.status === "resolved" && i.classification && (
                  <div>
                    Classified: {i.classification}
                    {i.determination ? ` (${i.determination})` : ""}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
