"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plain chat UI, no external chat-widget dependency.
 *
 * The previous version of this panel loaded botframework-webchat from
 * Microsoft's CDN and used MSAL to acquire a delegated Copilot Studio
 * token. Both are gone: identity now comes for free from the portal's
 * own logged-in session (this panel just calls /api/ai/portal-assistant,
 * which reads the Supabase session server-side), and there's no
 * Copilot Studio connection to authenticate to at all anymore.
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  onClose?: () => void;
};

export default function PortalAssistantPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I can create helpdesk tickets, place calls, or send texts — what do you need?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/portal-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The assistant couldn't respond.");

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="pa-panel" role="dialog" aria-label="Portal Assistant">
      <header className="pa-header">
        <div>
          <p className="pa-title">Portal Assistant</p>
          <p className="pa-subtitle">Tickets, calls, and texts — ask in plain language</p>
        </div>
        {onClose && (
          <button type="button" className="pa-close" onClick={onClose} aria-label="Close assistant">
            ×
          </button>
        )}
      </header>

      <div className="pa-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={`pa-bubble-row ${m.role === "user" ? "pa-row-user" : "pa-row-bot"}`}>
            <div className={`pa-bubble ${m.role === "user" ? "pa-bubble-user" : "pa-bubble-bot"}`}>{m.content}</div>
          </div>
        ))}
        {sending && (
          <div className="pa-bubble-row pa-row-bot">
            <div className="pa-bubble pa-bubble-bot pa-typing">Thinking…</div>
          </div>
        )}
        {error && <p className="pa-error">{error}</p>}
      </div>

      <div className="pa-sendbox">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the assistant…"
          rows={1}
          disabled={sending}
        />
        <button type="button" onClick={send} disabled={sending || !input.trim()} aria-label="Send">
          Send
        </button>
      </div>

      <style jsx>{`
        .pa-panel {
          --pa-accent: var(--portal-emerald, #1f6f54);
          --pa-heading: var(--portal-ink, #16302b);
          --pa-bot-bubble: var(--portal-sand, #fbf7ef);
          --pa-bot-text: var(--portal-ink, #16302b);
          --pa-user-bubble: var(--portal-emerald, #1f6f54);
          --pa-user-text: #ffffff;

          display: flex;
          flex-direction: column;
          height: 100%;
          background: #ffffff;
          border: 1px solid var(--portal-line, rgba(22, 48, 43, 0.12));
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 48px rgba(16, 26, 40, 0.16);
        }
        .pa-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--portal-line, rgba(22, 48, 43, 0.12));
        }
        .pa-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--pa-heading);
        }
        .pa-subtitle {
          margin: 2px 0 0;
          font-size: 0.78rem;
          color: rgba(22, 48, 43, 0.55);
        }
        .pa-close {
          border: none;
          background: transparent;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          color: rgba(22, 48, 43, 0.5);
          padding: 2px 6px;
        }
        .pa-body {
          flex: 1;
          overflow-y: auto;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .pa-bubble-row {
          display: flex;
        }
        .pa-row-user {
          justify-content: flex-end;
        }
        .pa-row-bot {
          justify-content: flex-start;
        }
        .pa-bubble {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 0.88rem;
          line-height: 1.45;
          white-space: pre-wrap;
        }
        .pa-bubble-bot {
          background: var(--pa-bot-bubble);
          color: var(--pa-bot-text);
          border-bottom-left-radius: 4px;
        }
        .pa-bubble-user {
          background: var(--pa-user-bubble);
          color: var(--pa-user-text);
          border-bottom-right-radius: 4px;
        }
        .pa-typing {
          font-style: italic;
          opacity: 0.7;
        }
        .pa-error {
          color: #a4262c;
          font-size: 0.8rem;
          margin: 4px 0 0;
        }
        .pa-sendbox {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid var(--portal-line, rgba(22, 48, 43, 0.12));
        }
        .pa-sendbox textarea {
          flex: 1;
          resize: none;
          border: 1px solid var(--portal-line, rgba(22, 48, 43, 0.15));
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 0.85rem;
          font-family: inherit;
          max-height: 90px;
        }
        .pa-sendbox button {
          border: none;
          border-radius: 10px;
          padding: 0 16px;
          background: var(--pa-accent);
          color: #fff;
          font-weight: 600;
          font-size: 0.82rem;
          cursor: pointer;
        }
        .pa-sendbox button:disabled {
          opacity: 0.5;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
