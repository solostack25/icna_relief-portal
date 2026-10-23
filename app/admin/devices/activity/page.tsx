import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { employeeNames } from "../data";
import { card, dim, faint, fmtDate, ink, line, rose } from "../style";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  view_bitlocker_key: "Viewed BitLocker key",
  view_laps_password: "Viewed local admin password",
  sync: "Sync",
  restart: "Restart",
  lock: "Lock",
  disable: "Disabled in Entra",
  enable: "Re-enabled in Entra",
  request_wipe: "Requested wipe",
  request_retire: "Requested retire",
  approve_wipe: "Approved wipe",
  approve_retire: "Approved retire",
  deny_wipe: "Denied wipe",
  deny_retire: "Denied retire",
  cancel_wipe: "Cancelled wipe request",
  cancel_retire: "Cancelled retire request",
  wipe: "Wipe sent",
  retire: "Retire sent",
};

// Every recovery-key lookup and device action, newest first.
export default async function DeviceActivityPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const admin = createAdminClient();
  let q = admin.from("it_device_audit").select("id, device_key, device_name, action, actor_id, reason, ticket_ref, ok, detail, created_at").order("created_at", { ascending: false }).limit(300);
  if (type === "secrets") q = q.in("action", ["view_bitlocker_key", "view_laps_password"]);
  if (type === "actions") q = q.not("action", "in", '("view_bitlocker_key","view_laps_password")');
  const { data } = await q;
  const rows = (data ?? []) as { id: string; device_key: string | null; device_name: string | null; action: string; actor_id: string; reason: string | null; ticket_ref: string | null; ok: boolean; created_at: string }[];
  const names = await employeeNames(rows.map((r) => r.actor_id));

  const pill = (t: string | undefined, label: string) => (
    <Link
      href={t ? `/admin/devices/activity?type=${t}` : "/admin/devices/activity"}
      className="text-xs font-bold rounded-full px-3 py-1.5"
      style={{ border: `1.5px solid ${line}`, background: type === t ? ink : "#fff", color: type === t ? "#fff" : ink }}
    >
      {label}
    </Link>
  );

  return (
    <div className="max-w-5xl">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Activity log</h1>
      <p className="text-sm mt-1 mb-4" style={{ color: dim }}>
        Who looked at a recovery key or password, and every action sent to a device. Kept permanently.
      </p>
      <div className="flex gap-2 mb-4">
        {pill(undefined, "Everything")}
        {pill("secrets", "Key & password views")}
        {pill("actions", "Device actions")}
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: dim }}>
            Nothing logged yet.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm" style={{ borderTop: `1px solid ${line}` }}>
              <div className="min-w-0">
                <b style={{ color: r.ok ? ink : rose }}>{LABEL[r.action] ?? r.action}</b>
                {!r.ok && <span style={{ color: rose }}> (failed)</span>} ·{" "}
                {r.device_key ? (
                  <Link href={`/admin/devices/${encodeURIComponent(r.device_key)}`} className="underline">
                    {r.device_name ?? "device"}
                  </Link>
                ) : (
                  r.device_name ?? "device"
                )}{" "}
                · {names.get(r.actor_id)?.name ?? "Someone"}
                {(r.reason || r.ticket_ref) && (
                  <div className="text-xs" style={{ color: dim }}>
                    {[r.reason, r.ticket_ref].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <span className="text-xs whitespace-nowrap" style={{ color: faint }}>
                {fmtDate(r.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
