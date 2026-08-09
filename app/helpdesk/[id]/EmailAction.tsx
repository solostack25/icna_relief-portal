"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmailAction({
  legId,
  defaultSubject,
  submittedBy,
}: {
  legId: string;
  defaultSubject: string;
  submittedBy: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(
    `Hi ${submittedBy.split(" ")[0]},\n\nJust wanted to update you on your ticket — `
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/helpdesk/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legId, subject, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setSent(true);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to send email");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p style={{ fontSize: 12, color: "#5FFFAE", fontWeight: 700 }}>✓ Email sent to {submittedBy}.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 12,
          fontWeight: 800,
          padding: "8px 14px",
          borderRadius: 10,
          border: "none",
          background: "linear-gradient(90deg,#FFD700,#FF9E3E)",
          color: "#150B2E",
          cursor: "pointer",
        }}
      >
        📧 Email {submittedBy.split(" ")[0]}
      </button>
    );
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid #4A3B7A",
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
      }}
    >
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        style={{
          width: "100%",
          marginBottom: 8,
          padding: "8px 10px",
          borderRadius: 8,
          background: "#1A1035",
          border: "1px solid #4A3B7A",
          color: "#EDE6FF",
          fontSize: 12,
        }}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          background: "#1A1035",
          border: "1px solid #4A3B7A",
          color: "#EDE6FF",
          fontSize: 12,
        }}
      />
      {error && <p style={{ fontSize: 11, color: "#FF6B9C", marginTop: 6 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={send}
          disabled={busy || !subject.trim() || !message.trim()}
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: "7px 14px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(90deg,#FFD700,#FF9E3E)",
            color: "#150B2E",
            cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            fontSize: 12,
            padding: "7px 14px",
            borderRadius: 10,
            border: "1px solid #4A3B7A",
            background: "transparent",
            color: "#B5A8E8",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
