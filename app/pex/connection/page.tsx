import { getPexViewer, pexAdmin } from "@/lib/pex/access";
import { Card, Notice, PageTitle } from "@/components/grantManagement/ui";
import { dim, emerald, ink, rose } from "@/components/grantManagement/styles";
import { ago } from "@/components/grantManagement/pex/pexUi";
import PexSettingsPanel from "@/components/grantManagement/pex/PexSettingsPanel";

export default async function PexConnectionPage() {
  const viewer = (await getPexViewer())!;
  if (!viewer.isAdmin) return <Notice tone="warn">Only Finance or a PEX admin can manage the PEX connection.</Notice>;
  const db = pexAdmin();
  const [{ data: runs }, { data: hooks }] = await Promise.all([
    db.from("pex_sync_runs").select("id, kind, trigger, started_at, finished_at, ok, stats, error").order("started_at", { ascending: false }).limit(10),
    db.from("pex_webhook_events").select("id, received_at, event_kind, network_type, error").order("received_at", { ascending: false }).limit(8),
  ]);
  return (
    <div>
      <PageTitle eyebrow="PEX" title="Connection & sync" />
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <PexSettingsPanel isAdmin={viewer.isAdmin} />
        <div className="space-y-5">
          <Card>
            <div className="text-sm font-bold mb-2" style={{ color: ink }}>
              Recent syncs
            </div>
            {!runs?.length ? (
              <p className="text-sm" style={{ color: dim }}>
                No syncs yet.
              </p>
            ) : (
              <div className="space-y-2">
                {runs.map((r) => {
                  const s = (r.stats ?? {}) as { cards?: { seen: number }; transactions?: { inserted: number; updated: number; settled: number } };
                  return (
                    <div key={r.id} className="text-xs flex justify-between gap-3 pb-2" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
                      <div>
                        <span className="font-semibold" style={{ color: r.ok ? emerald : r.ok === false ? rose : dim }}>
                          {r.ok ? "OK" : r.ok === false ? "Failed" : "Running"}
                        </span>{" "}
                        · {r.trigger} · {ago(r.started_at)}
                        {r.error && <div style={{ color: rose }}>{r.error}</div>}
                      </div>
                      <div className="text-right" style={{ color: dim }}>
                        {s.cards && <div>{s.cards.seen} cards</div>}
                        {s.transactions && (
                          <div>
                            +{s.transactions.inserted} new · {s.transactions.updated} updated · {s.transactions.settled} settled
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card>
            <div className="text-sm font-bold mb-2" style={{ color: ink }}>
              Recent webhooks
            </div>
            {!hooks?.length ? (
              <p className="text-sm" style={{ color: dim }}>
                None received yet.
              </p>
            ) : (
              hooks.map((h) => (
                <div key={h.id} className="text-xs py-1" style={{ color: h.error ? rose : dim }}>
                  {ago(h.received_at)} · {h.event_kind}
                  {h.network_type ? ` (${h.network_type})` : ""}
                  {h.error ? ` · ${h.error}` : ""}
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
