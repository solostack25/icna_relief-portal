"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { REQUEST_STATUSES } from "@/lib/resources/schema";
import { btnGhost, card, dim, Empty, fmtDate, H1, ink, input, line, StatusPill } from "../ui";

export default function Requests() {
  const initialStatus = useSearchParams().get("status") ?? "";
  const [view, setView] = useState("open");
  const [status, setStatus] = useState(initialStatus);
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    setRows(null);
    fetch(`/api/resources/requests?view=${view}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []));
  }, [view]);

  const shown = (rows ?? []).filter((r) => !status || r.status === status);
  return (
    <div>
      <H1
        right={
          <a href={`/api/resources/requests?view=${view}&format=csv`} style={btnGhost}>
            Export to Excel (CSV)
          </a>
        }
      >
        Insurance requests
      </H1>
      <p style={{ fontSize: 14, color: dim, margin: "-6px 0 14px" }}>
        A request is created automatically whenever a vehicle, property or driver is added or removed, prefilled from the record.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <select style={{ ...input, width: "auto" }} value={view} onChange={(e) => setView(e.target.value)} aria-label="Show">
          <option value="open">Open</option>
          <option value="all">All</option>
        </select>
        <select style={{ ...input, width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {!rows && <Empty>Loading…</Empty>}
      {rows && shown.length === 0 && <Empty>No requests here.</Empty>}
      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((r) => (
          <Link key={r.id} href={`/resources/requests/${r.id}`} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", color: ink }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {r.ticket_number} · {r.asset.title}
              </div>
              <div style={{ fontSize: 12, color: dim }}>
                {r.request_type === "add" ? "Add to coverage" : r.request_type === "remove" ? "Remove from coverage" : r.request_type} · {r.office_name} · effective{" "}
                {fmtDate(r.requested_effective_date)}
                {r.carrier_reference ? ` · ref ${r.carrier_reference}` : ""}
              </div>
            </div>
            <StatusPill status={r.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
