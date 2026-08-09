"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { addCardFromTicket } from "@/lib/workboard";

type BoardOption = { id: string; name: string; type: "private" | "team" };

export default function MoveToWorkboardAction({
  legId,
  ticketTitle,
  currentUserId,
}: {
  legId: string;
  ticketTitle: string;
  currentUserId: string;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardOption[] | null>(null);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null); // board id it landed on

  async function openPicker() {
    setOpen(true);
    setError(null);
    // RLS already scopes this to boards the signed-in employee can
    // actually see (their own private boards, plus the IT team board
    // if they manage IT) -- no manual filtering needed here.
    const { data } = await supabase
      .from("workboards")
      .select("id, name, type")
      .order("created_at", { ascending: false });
    setBoards(data ?? []);
    if (data && data.length > 0) setSelectedBoard(data[0].id);
  }

  async function submitMove() {
    if (!selectedBoard) return;
    setBusy(true);
    setError(null);
    try {
      const { data: firstColumn } = await supabase
        .from("workboard_columns")
        .select("id")
        .eq("board_id", selectedBoard)
        .order("sort_order", { ascending: true })
        .limit(1)
        .single();
      if (!firstColumn) throw new Error("That board has no columns yet");

      await addCardFromTicket(supabase, {
        boardId: selectedBoard,
        columnId: firstColumn.id,
        legId,
        title: ticketTitle,
        createdByEmployeeId: currentUserId,
      });
      setMoved(selectedBoard);
    } catch (e: any) {
      setError(e.message ?? "Failed to move ticket");
    } finally {
      setBusy(false);
    }
  }

  if (moved) {
    return (
      <p style={{ fontSize: 12, color: "#5FFFAE", fontWeight: 700 }}>
        ✓ Moved to workboard —{" "}
        <Link href={`/workboards/${moved}`} style={{ color: "#00E5FF" }}>
          view it there
        </Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={openPicker}
        style={{
          fontSize: 12,
          fontWeight: 800,
          padding: "8px 14px",
          borderRadius: 10,
          border: "1px solid #4A3B7A",
          background: "transparent",
          color: "#B5A8E8",
          cursor: "pointer",
        }}
      >
        📌 Move to Workboard
      </button>
    );
  }

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #4A3B7A", borderRadius: 12, padding: 12, marginTop: 8 }}>
      {boards === null ? (
        <p style={{ fontSize: 12, color: "#9C8FD9" }}>Loading your boards…</p>
      ) : boards.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9C8FD9" }}>
          You don't have any boards yet.{" "}
          <Link href="/workboards" style={{ color: "#00E5FF" }}>
            Create one first
          </Link>
          .
        </p>
      ) : (
        <>
          <select
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value)}
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
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.type === "team" ? "⚔️ " : "📋 "}
                {b.name}
              </option>
            ))}
          </select>
          {error && <p style={{ fontSize: 11, color: "#FF6B9C", marginBottom: 8 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={submitMove}
              disabled={busy}
              style={{
                fontSize: 12,
                fontWeight: 800,
                padding: "7px 14px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(90deg,#FF3EA5,#7B3EFF)",
                color: "#fff",
                cursor: "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? "Moving…" : "Move"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ fontSize: 12, padding: "7px 14px", borderRadius: 10, border: "1px solid #4A3B7A", background: "transparent", color: "#B5A8E8", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
