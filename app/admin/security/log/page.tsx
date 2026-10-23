import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { SEC_ACTION_LABELS } from "@/lib/security/labels";
import { employeeNames } from "../../devices/data";
import { PageHead, card, dim, faint, fmtDate, ink, line, rose } from "../style";

export const dynamic = "force-dynamic";

const DEVICE_ACTIONS = ["isolate_full", "isolate_selective", "release", "scan_quick", "scan_full", "update_signatures"];

// Every security response action: users and incidents (sec_action_log)
// plus Defender device actions (it_device_audit). Newest first.
export default async function ResponseLogPage() {
  const admin = createAdminClient();
  const [{ data: sec }, { data: dev }] = await Promise.all([
    admin.from("sec_action_log").select("id, target_type, target_id, target_name, action, actor_id, reason, ok, detail, created_at").order("created_at", { ascending: false }).limit(300),
    admin.from("it_device_audit").select("id, device_key, device_name, action, actor_id, reason, ok, detail, created_at").in("action", DEVICE_ACTIONS).order("created_at", { ascending: false }).limit(300),
  ]);
  type Row = { id: string; kind: string; targetName: string | null; href: string | null; action: string; actor_id: string; reason: string | null; ok: boolean; error: string | null; created_at: string };
  const rows: Row[] = [
    ...((sec ?? []) as { id: string; target_type: string; target_id: string; target_name: string | null; action: string; actor_id: string; reason: string | null; ok: boolean; detail: { error?: string } | null; created_at: string }[]).map((r) => ({
      id: r.id,
      kind: r.target_type,
      targetName: r.target_name ?? r.target_id,
      href: r.target_type === "user" ? `/admin/security/user?id=${r.target_id}` : r.target_type === "incident" ? "/admin/security/incidents?status=all" : null,
      action: r.action,
      actor_id: r.actor_id,
      reason: r.reason,
      ok: r.ok,
      error: r.detail?.error ?? null,
      created_at: r.created_at,
    })),
    ...((dev ?? []) as { id: string; device_key: string | null; device_name: string | null; action: string; actor_id: string; reason: string | null; ok: boolean; detail: { error?: string } | null; created_at: string }[]).map((r) => ({
      id: r.id,
      kind: "device",
      targetName: r.device_name,
      href: r.device_key ? `/admin/devices/${encodeURIComponent(r.device_key)}` : null,
      action: r.action,
      actor_id: r.actor_id,
      reason: r.reason,
      ok: r.ok,
      error: r.detail?.error ?? null,
      created_at: r.created_at,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const names = await employeeNames(rows.map((r) => r.actor_id));

  return (
    <div className="max-w-5xl">
      <PageHead title="Response log" sub="Every security action taken from the portal: who, on what, why, and whether Microsoft accepted it." />
      <div className="mt-4" style={{ ...card, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: dim }}>
            No actions yet.
          </div>
        ) : (
          rows.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm" style={{ borderTop: `1px solid ${line}` }}>
              <div className="min-w-0">
                <b style={{ color: r.ok ? ink : rose }}>{SEC_ACTION_LABELS[r.action] ?? r.action}</b>
                {!r.ok && <span style={{ color: rose }}> (failed)</span>} ·{" "}
                {r.href ? (
                  <Link href={r.href} className="underline">
                    {r.targetName}
                  </Link>
                ) : (
                  r.targetName
                )}{" "}
                <span style={{ color: faint }}>({r.kind})</span> · {names.get(r.actor_id)?.name ?? "Someone"}
                {(r.reason || r.error) && (
                  <div className="text-xs" style={{ color: dim }}>
                    {[r.reason, r.error].filter(Boolean).join(" · ")}
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
