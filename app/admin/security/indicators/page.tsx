import { INDICATOR_TYPES, type IndicatorType } from "@/lib/security/indicators";
import { explainMdeError, mdeGet } from "@/lib/security/mde";
import RowActions from "../RowActions";
import { PageHead, card, dim, emerald, faint, fmtDate, gold, ink, line } from "../style";
import AddIndicator from "./AddIndicator";

export const dynamic = "force-dynamic";

type Indicator = {
  id: string | number;
  indicatorValue: string;
  indicatorType: string;
  action: string;
  title?: string;
  description?: string;
  createdBy?: string;
  createdByDisplayName?: string;
  creationTimeDateTimeUtc?: string;
  expirationTime?: string | null;
};

// Defender custom indicators: files, sites and IPs blocked on every
// onboarded device. Live from Defender; nothing stored locally.
export default async function IndicatorsPage() {
  let rows: Indicator[] = [];
  let error: string | null = null;
  try {
    const data = await mdeGet("/indicators?$top=500");
    rows = ((data?.value ?? []) as Indicator[]).filter((i) => !i.expirationTime || new Date(i.expirationTime).getTime() > Date.now());
    rows.sort((a, b) => (b.creationTimeDateTimeUtc ?? "").localeCompare(a.creationTimeDateTimeUtc ?? ""));
  } catch (e) {
    error = explainMdeError(e, "Ti.ReadWrite.All");
  }

  return (
    <div className="max-w-5xl">
      <PageHead
        title="Blocked items"
        sub="Block a malicious file, link, website or IP address on every PC onboarded to Defender for Endpoint. Use it right after a phishing email or a malware alert, so no one else can open the same thing."
      />

      <section className="p-5 my-4" style={card}>
        <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: emerald }}>
          Block something
        </div>
        <AddIndicator />
      </section>

      {error ? (
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: `${gold}10`, border: `1px solid ${gold}40`, color: ink }}>
          {error}
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div className="px-4 py-3 text-sm font-bold" style={{ color: ink }}>
            Currently blocked · {rows.length}
          </div>
          {rows.length === 0 ? (
            <div className="px-4 pb-6 text-sm" style={{ color: dim }}>
              Nothing blocked yet.
            </div>
          ) : (
            rows.map((i) => (
              <div key={String(i.id)} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3" style={{ borderTop: `1px solid ${line}` }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold break-all" style={{ color: ink }}>
                    {i.indicatorValue}
                  </div>
                  <div className="text-xs" style={{ color: faint }}>
                    {INDICATOR_TYPES[i.indicatorType as IndicatorType]?.label ?? i.indicatorType} · {i.action} · added {fmtDate(i.creationTimeDateTimeUtc)}
                    {i.createdByDisplayName || i.createdBy ? ` by ${i.createdByDisplayName ?? i.createdBy}` : ""}
                    {i.expirationTime ? ` · expires ${fmtDate(i.expirationTime)}` : " · no expiry"}
                  </div>
                  {i.description && (
                    <div className="text-xs mt-0.5" style={{ color: dim }}>
                      {i.description}
                    </div>
                  )}
                </div>
                <RowActions
                  endpoint="/api/security/indicators"
                  actions={[{ key: "remove", label: "Unblock", needsReason: true, body: { id: String(i.id), value: i.indicatorValue } }]}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
