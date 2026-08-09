"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { assignCard, addCardNote, getCardNotes, type WorkboardCardNote } from "@/lib/workboard";

type Card = {
  id: string;
  title: string;
  linked_leg_id: string | null;
  assigned_to_employee_id: string | null;
};

export default function CardDetailModal({
  card,
  requestId,
  assignableStaff,
  currentAssigneeName,
  currentUserId,
  onClose,
  onAssigneeChange,
  onNoteAdded,
}: {
  card: Card;
  requestId?: string;
  assignableStaff: { id: string; first_name: string; last_name: string }[];
  currentAssigneeName: string | null;
  currentUserId: string;
  onClose: () => void;
  onAssigneeChange: (cardId: string, employeeId: string | null, name: string | null) => void;
  onNoteAdded: (cardId: string) => void;
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState<WorkboardCardNote[] | null>(null);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [newNote, setNewNote] = useState("");
  const [assignee, setAssignee] = useState(card.assigned_to_employee_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const fetched = await getCardNotes(supabase, card.id);
      setNotes(fetched);

      const authorIds = [...new Set(fetched.map((n) => n.author_employee_id).filter(Boolean))] as string[];
      if (authorIds.length > 0) {
        const { data } = await supabase.from("employees").select("id, first_name, last_name").in("id", authorIds);
        const map: Record<string, string> = {};
        for (const e of data ?? []) map[e.id] = `${e.first_name} ${e.last_name}`;
        setAuthorNames(map);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  async function submitAssign() {
    setBusy(true);
    setError(null);
    try {
      await assignCard(supabase, { cardId: card.id, employeeId: assignee || null });
      const staff = assignableStaff.find((s) => s.id === assignee);
      onAssigneeChange(card.id, assignee || null, staff ? `${staff.first_name} ${staff.last_name}` : null);
    } catch (e: any) {
      setError(e.message ?? "Failed to assign");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!newNote.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addCardNote(supabase, { cardId: card.id, authorEmployeeId: currentUserId, body: newNote.trim() });
      const fetched = await getCardNotes(supabase, card.id);
      setNotes(fetched);
      setNewNote("");
      onNoteAdded(card.id);
    } catch (e: any) {
      setError(e.message ?? "Failed to add note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,6,26,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#150B2E",
          border: "1px solid #3A2C68",
          borderRadius: 16,
          padding: 20,
          maxWidth: 440,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16, paddingRight: 12 }}>{card.title}</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9C8FD9", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {requestId && (
          <Link
            href={`/helpdesk/${requestId}`}
            style={{
              display: "inline-block",
              marginBottom: 14,
              fontSize: 11,
              fontWeight: 800,
              color: "#00E5FF",
              background: "rgba(0,229,255,0.1)",
              padding: "3px 9px",
              borderRadius: 20,
              textDecoration: "none",
            }}
          >
            🎫 View linked ticket
          </Link>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9C8FD9", marginBottom: 8 }}>
          Working on this
        </div>
        {assignableStaff.length <= 1 ? (
          <p style={{ fontSize: 13, marginBottom: 18 }}>{currentAssigneeName ?? "Unassigned"}</p>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              style={{
                flex: 1,
                fontSize: 12.5,
                padding: "7px 9px",
                borderRadius: 8,
                background: "#1A1035",
                border: "1px solid #4A3B7A",
                color: "#EDE6FF",
              }}
            >
              <option value="">Unassigned</option>
              {assignableStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
            <button
              onClick={submitAssign}
              disabled={busy || assignee === (card.assigned_to_employee_id ?? "")}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "7px 14px",
                borderRadius: 8,
                border: "none",
                background: "#00E5FF",
                color: "#150B2E",
                cursor: "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              Set
            </button>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9C8FD9", marginBottom: 8 }}>
          Notes
        </div>
        <div style={{ marginBottom: 12 }}>
          {notes === null ? (
            <p style={{ fontSize: 12, color: "#9C8FD9" }}>Loading…</p>
          ) : notes.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9C8FD9" }}>
              No notes yet — leave one so whoever checks this later knows where things stand.
            </p>
          ) : (
            notes.map((n) => (
              <div key={n.id} style={{ fontSize: 12.5, borderBottom: "1px solid #3A2C68", paddingBottom: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: "#9C8FD9", marginBottom: 3 }}>
                  {n.author_employee_id ? authorNames[n.author_employee_id] ?? "…" : "Unknown"} ·{" "}
                  {new Date(n.created_at).toLocaleString()}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
              </div>
            ))
          )}
        </div>

        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          placeholder="Leave a note…"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            background: "#1A1035",
            border: "1px solid #4A3B7A",
            color: "#EDE6FF",
            fontSize: 12.5,
            marginBottom: 8,
          }}
        />
        {error && <p style={{ fontSize: 11, color: "#FF6B9C", marginBottom: 8 }}>{error}</p>}
        <button
          onClick={submitNote}
          disabled={busy || !newNote.trim()}
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: "8px 16px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(90deg,#FF3EA5,#7B3EFF)",
            color: "#fff",
            cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Add Note
        </button>
      </div>
    </div>
  );
}
