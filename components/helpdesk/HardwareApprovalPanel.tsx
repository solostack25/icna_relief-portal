// Purchase approval + invoice panel on a Hardware Request ticket. No
// hooks, so the server-rendered ticket page can render it in either
// theme; the interactive bits (re-send, invoice upload) are client
// children. tone: "quest" for the IT team, "plain" for everyone else.

import HardwareResendButton from "./HardwareResendButton";
import HardwareInvoices from "./HardwareInvoices";

export type HardwarePanelStep = {
  stage: "supervisor" | "executive";
  roles: string[];
  approver_name: string;
  approver_email: string;
  decision: "pending" | "approved" | "denied" | "superseded";
  notes: string | null;
  decided_at: string | null;
  emailed_at: string | null;
  approved_amount?: number | null;
};
export type HardwarePanelLineItem = { description: string; quantity: number; unit_price: number };

const usd = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
export type HardwarePanelEvent = { kind: string; message: string; ok: boolean; created_at: string };

const ROLE: Record<string, string> = { supervisor: "Direct supervisor", cio: "CIO", cso: "CSO" };

export default function HardwareApprovalPanel({
  tone,
  legId,
  gated,
  approvalStatus,
  steps,
  events,
  canResend,
  canUploadInvoice,
  legClosed,
  lineItems = [],
  proposedAmount = null,
  budget = null,
}: {
  tone: "quest" | "plain";
  legId: string;
  gated: boolean;
  approvalStatus: "pending" | "approved" | "denied" | null;
  steps: HardwarePanelStep[];
  events: HardwarePanelEvent[];
  canResend: boolean;
  canUploadInvoice: boolean;
  legClosed: boolean;
  lineItems?: HardwarePanelLineItem[];
  /** Supervisor's approved amount, waiting on the CIO/CSO. */
  proposedAmount?: number | null;
  /** Final approved budget. */
  budget?: number | null;
}) {
  const quest = tone === "quest";
  const c = quest
    ? { bg: "rgba(255,255,255,0.04)", border: "1px solid #3A2C68", dim: "#9C8FD9", text: "#EDE6FF", ok: "#5FFFAE", bad: "#FF6B6B", wait: "#FFD36B" }
    : { bg: "var(--color-surface)", border: "1px solid var(--color-border)", dim: "var(--color-text-dim)", text: "inherit", ok: "#15803d", bad: "#dc2626", wait: "#b45309" };

  const headline =
    !gated
      ? null
      : approvalStatus === "pending"
        ? { label: "Waiting on approval", color: c.wait, text: "Nothing can be purchased until the direct supervisor, then the CIO and CSO, approve." }
        : approvalStatus === "approved"
          ? { label: "Approved", color: c.ok, text: "Approved to purchase within the budget below. The invoice must be uploaded before this ticket can be closed." }
          : approvalStatus === "denied"
            ? { label: "Denied", color: c.bad, text: "The purchase was denied, so the ticket was closed." }
            : null;

  const shown = steps.filter((s) => s.decision !== "superseded" || s.decided_at);
  const stuck = gated && approvalStatus === "pending" && !steps.some((s) => s.decision === "pending");
  const lastEvents = events.slice(-6);

  const label = { fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: c.dim };

  return (
    <div style={{ background: c.bg, border: c.border, borderRadius: 12, padding: 14, marginBottom: 16, color: c.text }}>
      {headline && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={label}>🖥️ Hardware purchase approval</div>
            <span style={{ fontSize: 11, fontWeight: 800, color: headline.color, border: `1px solid ${headline.color}`, borderRadius: 20, padding: "2px 9px" }}>
              {headline.label}
            </span>
          </div>
          <p style={{ fontSize: 12.5, margin: "0 0 10px", color: c.dim }}>{headline.text}</p>

          {(budget != null || (proposedAmount != null && approvalStatus === "pending")) && (
            <div style={{ marginBottom: 10 }}>
              <div style={label}>{budget != null ? "Approved budget" : "Approved by supervisor, waiting on CIO/CSO"}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: budget != null ? c.ok : c.text }}>
                {usd(budget ?? proposedAmount)}
              </div>
            </div>
          )}

          {shown.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {shown.map((s, i) => (
                <div key={i} style={{ fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <strong>{s.approver_name}</strong>{" "}
                      <span style={{ color: c.dim }}>· {s.roles.map((r) => ROLE[r] ?? r).join(" + ")}</span>
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        color: s.decision === "approved" ? c.ok : s.decision === "denied" ? c.bad : s.decision === "pending" ? c.wait : c.dim,
                      }}
                    >
                      {s.decision === "superseded" ? "not needed" : s.decision}
                      {s.approved_amount != null ? ` ${usd(s.approved_amount)}` : ""}
                      {s.decided_at ? ` · ${new Date(s.decided_at).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                  {s.notes && <div style={{ color: c.dim, fontSize: 12, marginTop: 2 }}>“{s.notes}”</div>}
                </div>
              ))}
            </div>
          )}

          {stuck && (
            <p style={{ fontSize: 12.5, margin: "0 0 10px", color: c.bad, fontWeight: 600 }}>
              Approval isn&apos;t with anyone right now. See the latest note below, fix it, then re-send.
            </p>
          )}

          {lastEvents.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, color: c.dim, cursor: "pointer" }}>Approval history</summary>
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                {lastEvents.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: e.ok ? c.dim : c.bad }}>
                    {new Date(e.created_at).toLocaleString()} · {e.message}
                  </div>
                ))}
              </div>
            </details>
          )}

          {approvalStatus === "pending" && canResend && <HardwareResendButton legId={legId} tone={tone} stuck={stuck} />}
        </>
      )}

      {lineItems.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...label, marginBottom: 6 }}>📦 Devices on this order</div>
          <div style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
            {lineItems.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  {l.description} <span style={{ color: c.dim }}>· {l.quantity} × {usd(l.unit_price)}</span>
                </span>
                <span style={{ fontWeight: 700 }}>{usd(l.quantity * l.unit_price)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: c.border, paddingTop: 4, fontWeight: 800 }}>
              <span>Order total</span>
              <span>{usd(Math.round(lineItems.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100)}</span>
            </div>
          </div>
        </div>
      )}

      {approvalStatus !== "denied" && (
        <div style={{ marginTop: headline ? 12 : 0 }}>
          <div style={{ ...label, marginBottom: 6 }}>🧾 Invoice{gated ? " (required to close)" : ""}</div>
          <HardwareInvoices
            legId={legId}
            tone={tone}
            canUpload={canUploadInvoice && approvalStatus !== "pending"}
            canRemove={canUploadInvoice && !legClosed}
            waitingOnApproval={approvalStatus === "pending"}
          />
        </div>
      )}
    </div>
  );
}
