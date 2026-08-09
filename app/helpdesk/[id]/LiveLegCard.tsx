"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEPARTMENT_LABELS, LEG_STATUS_LABELS, type Department, type LegStatus } from "@/lib/helpdesk";
import LegActions from "./LegActions";
import EmailAction from "./EmailAction";
import MoveToWorkboardAction from "./MoveToWorkboardAction";

type ItDetail = { solution: string | null; additional_notes: string | null } | undefined;

// The one leg card on the ticket page that actually needs to be
// "live" -- this is what makes dragging a card on the workboard in
// one tab show up as a status change on an already-open ticket page
// in another, without anyone touching the ticket tab. Only the
// current/active leg gets this treatment; past legs in the chain
// (already closed or handed off) aren't changing anymore, so they
// stay plain server-rendered content on the page.
export default function LiveLegCard({
  legId,
  requestId,
  department,
  category,
  priority,
  initialStatus,
  assignedToEmployeeId,
  assigneeName,
  assignedToRawName,
  handedOffFromLegId,
  legCreatedAt,
  itDetail,
  canManage,
  departmentStaff,
  currentUserId,
  requestTitle,
  submittedBy,
}: {
  legId: string;
  requestId: string;
  department: Department;
  category: string | null;
  priority: string;
  initialStatus: LegStatus;
  assignedToEmployeeId: string | null;
  assigneeName: string | null;
  assignedToRawName: string | null;
  handedOffFromLegId: string | null;
  legCreatedAt: string;
  itDetail: ItDetail;
  canManage: boolean;
  departmentStaff: { id: string; first_name: string; last_name: string }[];
  currentUserId: string;
  requestTitle: string;
  submittedBy: string;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState<LegStatus>(initialStatus);

  useEffect(() => {
    const channel = supabase
      .channel(`leg-status-${legId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "helpdesk_request_legs", filter: `id=eq.${legId}` },
        (payload) => {
          const next = payload.new as { status: LegStatus };
          if (next?.status) setStatus(next.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  const isActive = status !== "closed" && status !== "handed_off";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid #FF3EA5",
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#00E5FF" }}>
          {department === "it" ? "⚔️ " : department === "marketing" ? "🎨 " : department === "hr" ? "🧑‍💼 " : "💰 "}
          {DEPARTMENT_LABELS[department]} Guild
          {handedOffFromLegId && <span style={{ color: "#9C8FD9", fontWeight: 500 }}> ← handed off</span>}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "#9C8FD9",
            background: "rgba(255,255,255,0.06)",
            padding: "2px 8px",
            borderRadius: 20,
            transition: "background .3s",
          }}
        >
          {LEG_STATUS_LABELS[status]}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#9C8FD9" }}>
        {category ?? "No category"} · Priority: {priority} ·{" "}
        {assigneeName ?? (assignedToRawName ? `${assignedToRawName} (legacy)` : "Unclaimed")}
      </div>
      {itDetail?.solution && (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <span style={{ color: "#9C8FD9" }}>Solution: </span>
          {itDetail.solution}
        </div>
      )}
      {itDetail?.additional_notes && (
        <div style={{ marginTop: 8, fontSize: 12.5, whiteSpace: "pre-wrap" }}>{itDetail.additional_notes}</div>
      )}

      {department === "it" && isActive && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <EmailAction legId={legId} defaultSubject={`Update on your ticket: ${requestTitle}`} submittedBy={submittedBy} />
          <MoveToWorkboardAction legId={legId} ticketTitle={requestTitle} currentUserId={currentUserId} />
        </div>
      )}

      {canManage && (
        <LegActions
          legId={legId}
          requestId={requestId}
          department={department}
          status={status}
          currentUserId={currentUserId}
          departmentStaff={departmentStaff}
          assignedToEmployeeId={assignedToEmployeeId}
          theme="quest"
          legCreatedAt={legCreatedAt}
        />
      )}
    </div>
  );
}
