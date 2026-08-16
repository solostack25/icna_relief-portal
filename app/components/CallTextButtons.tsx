"use client";

import { useState } from "react";

export default function CallTextButtons({
  phone,
  targetName,
  targetType,
  targetId,
}: {
  phone: string | null;
  targetName: string;
  targetType: "client" | "contact" | "employee" | "manual";
  targetId?: string;
}) {
  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState<string | null>(null);
  const [showTextBox, setShowTextBox] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [textMsg, setTextMsg] = useState<string | null>(null);

  if (!phone) return null;

  const call = async () => {
    setCalling(true);
    setCallMsg(null);
    const res = await fetch("/api/calling/click-to-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toNumber: phone, toName: targetName, targetType, targetId }),
    });
    const data = await res.json();
    setCalling(false);
    setCallMsg(res.ok ? "Calling — check your phone/softphone" : data.error ?? "Call failed");
  };

  const sendText = async () => {
    if (!text.trim()) return;
    setSending(true);
    setTextMsg(null);
    const res = await fetch("/api/calling/quick-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toNumber: phone, toName: targetName, targetType, targetId, text }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) {
      setTextMsg("Sent");
      setText("");
      setTimeout(() => setShowTextBox(false), 1200);
    } else {
      setTextMsg(data.error ?? "Send failed");
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={call}
          disabled={calling}
          className="text-xs px-3 py-1.5 rounded border font-medium disabled:opacity-50"
          style={{ borderColor: "var(--color-border)" }}
        >
          {calling ? "Calling..." : "📞 Call"}
        </button>
        <button
          onClick={() => setShowTextBox((v) => !v)}
          className="text-xs px-3 py-1.5 rounded border font-medium"
          style={{ borderColor: "var(--color-border)" }}
        >
          💬 Text
        </button>
      </div>
      {callMsg && <span className="text-xs text-[var(--color-text-dim)]">{callMsg}</span>}

      {showTextBox && (
        <div className="w-72 border rounded p-3" style={{ borderColor: "var(--color-border)" }}>
          <textarea
            className="border rounded px-2 py-1.5 w-full text-xs"
            rows={3}
            maxLength={1024}
            placeholder={`Text ${targetName}...`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-[var(--color-text-dim)]">{text.length}/1024</span>
            <button
              onClick={sendText}
              disabled={sending || !text.trim()}
              className="text-xs px-3 py-1 rounded bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          {textMsg && <p className="text-[10px] text-[var(--color-text-dim)] mt-1">{textMsg}</p>}
        </div>
      )}
    </div>
  );
}
