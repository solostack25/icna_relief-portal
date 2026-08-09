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
}: {
  legId: string;
  requestId: string;
  department: Department;
  status: LegStatus;
  currentUserId: string;
  commentOnly?: boolean;
  departmentStaff?: { id: string; first_name: string; last_name: string }[];
  assignedToEmployeeId?: string | null;
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

  async function updateStatus(newStatus: LegStatus) {
    setBusy(true);
    setError(null);
    try {
      if (newStatus === "closed") {
        await closeLeg(supabase, { legId, requestId });
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

  if (commentOnly) {
    return (
      <div className="space-y-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add a comment…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={submitComment}
          disabled={busy || !comment.trim()}
          className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          Add Comment
        </button>
      </div>
    );
  }

  const isTerminal = status === "closed" || status === "handed_off";
  if (isTerminal) return null;

  const otherDepartments = ALL_DEPARTMENTS.filter((d) => d !== department);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
        >
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
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          Assign
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {status !== "in_progress" && (
          <button
            onClick={() => updateStatus("in_progress")}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-50"
          >
            Mark In Progress
          </button>
        )}
        {status !== "on_hold" && (
          <button
            onClick={() => updateStatus("on_hold")}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-50"
          >
            Put On Hold
          </button>
        )}
        <button
          onClick={() => updateStatus("closed")}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          Close
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={handoffTarget}
          onChange={(e) => setHandoffTarget(e.target.value as Department)}
          className="text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
        >
          <option value="">Hand off to…</option>
          {otherDepartments.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <button
          onClick={submitHandoff}
          disabled={busy || !handoffTarget}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-50"
        >
          Transfer
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
