"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { handoffLeg, closeLeg, DEPARTMENT_LABELS, type Department, type LegStatus } from "@/lib/helpdesk";

const ALL_DEPARTMENTS: Department[] = ["it", "hr", "marketing", "finance"];

export default function LegActions({
  legId,
  requestId,
  department,
  status,
  currentUserId,
  commentOnly = false,
  departmentStaff = [],
  assignedToEmployeeId = null,
  theme = "plain",
  legCreatedAt,
}: {
  legId: string;
  requestId: string;
  department: Department;
  status: LegStatus;
  currentUserId: string;
  commentOnly?: boolean;
  departmentStaff?: { id: string; first_name: string; last_name: string }[];
  assignedToEmployeeId?: string | null;
  theme?: "plain" | "quest";
  legCreatedAt?: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffTarget, setHandoffTarget] = useState<Department | "">("");
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState(assignedToEmployeeId ?? "");

  async function submitAssign() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("helpdesk_request_legs")
        .update({ assigned_to_employee_id: assignee || null })
        .eq("id", legId);
      if (err) throw new Error(err.message);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to assign");
    } finally {
      setBusy(false);
    }
  }

  // The quest theme's only remaining status transition button here is
  // Complete Quest -- Start/Pause moved to the workboard card as a
  // pure timer (see CardTimerControl in the workboard), and QA is now
  // only reached by dragging the card into the QA-mapped column, not
  // a manual button on the ticket. The plain theme (HR/Marketing/
  // Finance) still has direct status buttons since those departments
  // don't use the workboard.
  async function updateStatus(newStatus: LegStatus) {
    setBusy(true);
    setError(null);
    try {
      if (newStatus === "closed") {
        await closeLeg(supabase, {
          legId,
          requestId,
          department,
          closedByEmployeeId: currentUserId,
          assignedToEmployeeId: assignee || null,
          legCreatedAt: legCreatedAt ?? new Date().toISOString(),
        });
      } else {
        const { error: err } = await supabase
          .from("helpdesk_request_legs")
          .update({ status: newStatus })
          .eq("id", legId);
        if (err) throw new Error(err.message);
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function submitHandoff() {
    if (!handoffTarget) return;
    setBusy(true);
    setError(null);
    try {
      await handoffLeg(supabase, { legId, requestId, toDepartment: handoffTarget });
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to hand off");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!comment.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("helpdesk_comments").insert({
        request_id: requestId,
        leg_id: legId,
        author_employee_id: currentUserId,
        body: comment.trim(),
      });
      if (err) throw new Error(err.message);
      setComment("");
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Failed to add comment");
    } finally {
      setBusy(false);
    }
  }

  const isQuest = theme === "quest";
  const selectCls = isQuest
    ? "text-xs rounded-lg px-2 py-1.5 bg-[#1A1035] border border-[#4A3B7A] text-[#EDE6FF] cursor-pointer"
    : "text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 cursor-pointer";
  const btnCls = isQuest
    ? "text-xs px-3 py-1.5 rounded-lg border border-[#4A3B7A] text-[#B5A8E8] hover:border-[#FF3EA5] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
    : "text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed";
  const primaryBtnCls = "text-xs px-3 py-1.5 rounded-lg text-white disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed";
  const primaryBtnStyle = isQuest
    ? { background: "linear-gradient(90deg,#FF3EA5,#7B3EFF)" }
    : { background: "var(--color-accent)" };
  const textareaCls = isQuest
    ? "w-full rounded-lg px-3 py-2 text-sm bg-[#1A1035] border border-[#4A3B7A] text-[#EDE6FF] placeholder:text-[#9C8FD9]"
    : "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
  const errorCls = isQuest ? "text-xs text-[#FF6B9C]" : "text-xs text-red-600";
  const dividerCls = isQuest ? "border-[#3A2C68]" : "border-[var(--color-border)]";

  if (commentOnly) {
    return (
      <div className="space-y-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add a comment…"
          className={textareaCls}
        />
        {error && <p className={errorCls}>{error}</p>}
        <button onClick={submitComment} disabled={busy || !comment.trim()} className={primaryBtnCls} style={primaryBtnStyle}>
          Add Comment
        </button>
      </div>
    );
  }

  const isTerminal = status === "closed" || status === "handed_off";
  if (isTerminal) return null;

  const otherDepartments = ALL_DEPARTMENTS.filter((d) => d !== department);

  return (
    <div className={`mt-3 pt-3 border-t ${dividerCls} space-y-3`}>
      <div className="flex items-center gap-2">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectCls}>
          <option value="">Unassigned</option>
          {departmentStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name}
            </option>
          ))}
        </select>
        <button
          onClick={submitAssign}
          disabled={busy || assignee === (assignedToEmployeeId ?? "")}
          className={btnCls}
        >
          {isQuest ? "Claim" : "Assign"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {!isQuest && (
          <>
            {status !== "in_progress" && (
              <button onClick={() => updateStatus("in_progress")} disabled={busy} className={btnCls}>
                Mark In Progress
              </button>
            )}
            {status !== "on_hold" && (
              <button onClick={() => updateStatus("on_hold")} disabled={busy} className={btnCls}>
                Put On Hold
              </button>
            )}
            {department === "it" && status !== "quality_assurance" && (
              <button onClick={() => updateStatus("quality_assurance")} disabled={busy} className={btnCls}>
                Move to Quality Assurance
              </button>
            )}
          </>
        )}
        <button onClick={() => updateStatus("closed")} disabled={busy} className={primaryBtnCls} style={primaryBtnStyle}>
          {isQuest ? "✓ Complete Quest" : "Close"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={handoffTarget}
          onChange={(e) => setHandoffTarget(e.target.value as Department)}
          className={selectCls}
        >
          <option value="">{isQuest ? "Send to another guild…" : "Hand off to…"}</option>
          {otherDepartments.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <button onClick={submitHandoff} disabled={busy || !handoffTarget} className={primaryBtnCls} style={primaryBtnStyle}>
          Transfer
        </button>
      </div>

      {error && <p className={errorCls}>{error}</p>}
    </div>
  );
}
