"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Application = {
  id: string;
  applicant_name: string;
  category: string;
  amount_requested: number;
  amount_approved: number | null;
  status: string;
  submitted_at: string;
};

const statusColor: Record<string, string> = {
  pending: "#A57420",
  approved: "#1F6F54",
  rejected: "#B5566B",
  paid: "#16302B",
};

export default function IrfasApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/irfas/applications")
      .then((r) => r.json())
      .then((d) => {
        setApplications(d.applications ?? []);
        setLoaded(true);
      });
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>
          IRFAS Applications
        </h1>
        <Link
          href="/irfas/new"
          style={{
            border: "1.5px solid #8A5FB5",
            background: "rgba(138,95,181,0.1)",
            color: "#8A5FB5",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          + New Application
        </Link>
      </div>

      {loaded && applications.length === 0 && (
        <div style={{ fontSize: 14, color: "rgba(22,48,43,0.5)", marginTop: 20 }}>No applications yet.</div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {applications.map((a) => (
          <div key={a.id} style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.applicant_name}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: statusColor[a.status] ?? "#666" }}>{a.status.toUpperCase()}</div>
            </div>
            <div style={{ fontSize: 13, color: "rgba(22,48,43,0.6)", marginTop: 4 }}>
              {a.category} · ${a.amount_requested.toLocaleString()}
              {a.amount_approved != null ? ` (approved: $${a.amount_approved.toLocaleString()})` : ""}
            </div>
            <div style={{ fontSize: 12, color: "rgba(22,48,43,0.4)", marginTop: 4 }}>
              Submitted {new Date(a.submitted_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
