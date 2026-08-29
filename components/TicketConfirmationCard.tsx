"use client";

import Link from "next/link";

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const primaryButton: React.CSSProperties = {
  border: "1.5px solid #8A5FB5",
  background: "rgba(138,95,181,0.1)",
  color: "#8A5FB5",
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "center",
};
const secondaryButton: React.CSSProperties = {
  border: "1.5px solid rgba(22,48,43,0.12)",
  background: "#fff",
  color: "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "center",
};

export type ConfirmationShortcut = { label: string; href: string; primary?: boolean };

// Shared post-submission confirmation UI, used the same way across
// every ticket/request-style system in the portal (Helpdesk, Finance
// Tickets, IRFAS) so "what happens right after I submit something"
// looks and behaves consistently everywhere instead of each system
// inventing its own version.
export default function TicketConfirmationCard({
  systemLabel,
  ticketNumber,
  title,
  note,
  shortcuts,
}: {
  systemLabel: string;
  ticketNumber: string;
  title: string;
  note?: string;
  shortcuts: ConfirmationShortcut[];
}) {
  return (
    <div style={{ ...cardStyle, display: "grid", gap: 16, textAlign: "center" }}>
      <div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(31,111,84,0.12)",
            color: "#1F6F54",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            margin: "0 auto 12px",
          }}
        >
          ✓
        </div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{systemLabel} Submitted</div>
        <div style={{ fontSize: 13, color: "rgba(22,48,43,0.5)", marginTop: 4 }}>{title}</div>
      </div>

      <div style={{ background: "#F4F3EE", borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(22,48,43,0.5)", letterSpacing: 0.5 }}>CONFIRMATION NUMBER</div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", marginTop: 2 }}>{ticketNumber}</div>
      </div>

      {note && <p style={{ fontSize: 13, color: "rgba(22,48,43,0.6)", margin: 0 }}>{note}</p>}

      <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(22,48,43,0.5)", textAlign: "left" }}>WHAT'S NEXT</div>
        {shortcuts.map((s) => (
          <Link key={s.href + s.label} href={s.href} style={s.primary ? primaryButton : secondaryButton}>
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
