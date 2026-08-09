"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createPrivateBoard } from "@/lib/workboard";

export default function NewBoardForm({ ownerEmployeeId }: { ownerEmployeeId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { boardId } = await createPrivateBoard(supabase, {
        name: name.trim(),
        ownerEmployeeId,
      });
      router.push(`/workboards/${boardId}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create board");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "1px dashed #4A3B7A",
          background: "transparent",
          color: "#B5A8E8",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        + New Private Board
      </button>
    );
  }

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #4A3B7A", borderRadius: 14, padding: 14 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Board name"
        autoFocus
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          background: "#1A1035",
          border: "1px solid #4A3B7A",
          color: "#EDE6FF",
          fontSize: 13,
          marginBottom: 8,
        }}
      />
      {error && <p style={{ fontSize: 11, color: "#FF6B9C", marginBottom: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
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
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            fontSize: 12,
            padding: "8px 16px",
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
