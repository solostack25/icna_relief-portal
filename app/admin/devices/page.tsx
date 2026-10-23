import { getDeviceViewer } from "@/lib/devices/access";
import { loadDeviceList, loadLastSync, loadPendingRequests } from "./data";
import DevicesClient from "./DevicesClient";
import { RequestDecision, SyncButton, SyncStatus } from "./ui";
import { card, dim, fmtDate, rose } from "./style";

export const dynamic = "force-dynamic";

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const viewer = (await getDeviceViewer())!;
  const [devices, run, pending] = await Promise.all([loadDeviceList(), loadLastSync(), loadPendingRequests()]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Devices</h1>
          <p className="text-sm mt-1" style={{ color: dim }}>
            Every computer and phone signed in with an ICNA Relief account, from Entra ID and Intune. Synced nightly.
          </p>
        </div>
        <SyncButton />
      </div>
      <SyncStatus run={run} />

      {pending.length > 0 && (
        <section className="mb-6 p-4" style={{ ...card, borderColor: `${rose}55` }}>
          <div className="text-sm font-bold mb-3" style={{ color: rose }}>
            Waiting for approval · {pending.length}
          </div>
          <div className="grid gap-3">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm min-w-0">
                  <a href={`/admin/devices/${encodeURIComponent(r.device_key)}`} className="font-bold underline">
                    {r.action === "wipe" ? "Wipe" : "Retire"} {r.device_name ?? "device"}
                  </a>
                  <div className="text-xs" style={{ color: dim }}>
                    {r.requested_by_name} · {fmtDate(r.requested_at)} · {r.reason}
                    {r.ticket_ref ? ` · ${r.ticket_ref}` : ""}
                  </div>
                </div>
                <RequestDecision id={r.id} mine={r.requested_by === viewer.employeeId} />
              </div>
            ))}
          </div>
        </section>
      )}

      <DevicesClient devices={devices} initialQuery={q ?? ""} />
    </div>
  );
}
