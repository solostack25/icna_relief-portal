"use client";

import { useEffect, useRef, useState } from "react";
import { ASSISTANT_STARTERS, renderRich, typingLabel, useAssistantChat } from "./chatShared";

/**
 * Plain chat UI, no external chat-widget dependency. Identity comes from
 * the portal's own logged-in session (/api/ai/portal-assistant reads the
 * Supabase session server-side).
 *
 * variant "dock"  - the floating panel (rounded card)
 * variant "sheet" - full screen, used behind the phone tab bar's Ask button
 */

type Props = {
  onClose?: () => void;
  variant?: "dock" | "sheet";
};

export default function PortalAssistantPanel({ onClose, variant = "dock" }: Props) {
  const { messages, sending, error, send, reset, lastUser } = useAssistantChat();
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function submit(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || sending) return;
    setInput("");
    await send(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const sheet = variant === "sheet";

  return (
    <div className={`pa-panel ${sheet ? "pa-sheet" : ""}`} role="dialog" aria-label="Portal Assistant">
      <header className="pa-header">
        {sheet && onClose && (
          <button type="button" className="pa-back" onClick={onClose} aria-label="Close assistant">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
        <div className="pa-head-text">
          <p className="pa-title">Portal Assistant</p>
          {!sheet && <p className="pa-subtitle">Fliers, tickets, calls, texts, and finding your way around — ask in plain language</p>}
        </div>
        {sheet ? (
          messages.length > 1 && (
            <button type="button" className="pa-new" onClick={reset}>
              New
            </button>
          )
        ) : (
          onClose && (
            <button type="button" className="pa-close" onClick={onClose} aria-label="Close assistant">
              ×
            </button>
          )
        )}
      </header>

      <div className="pa-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={`pa-bubble-row ${m.role === "user" ? "pa-row-user" : "pa-row-bot"}`}>
            <div className={`pa-bubble ${m.role === "user" ? "pa-bubble-user" : "pa-bubble-bot"}`}>{m.role === "assistant" ? renderRich(m.content) : m.content}</div>
          </div>
        ))}
        {messages.length === 1 && !sending && (
          <div className="pa-chips">
            {ASSISTANT_STARTERS.map((q) => (
              <button key={q.label} type="button" className="pa-chip" onClick={() => (q.text.endsWith(": ") ? setInput(q.text) : submit(q.text))}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        {sending && (
          <div className="pa-bubble-row pa-row-bot">
            <div className="pa-bubble pa-bubble-bot pa-typing">{typingLabel(lastUser)}</div>
          </div>
        )}
        {error && <p className="pa-error">{error}</p>}
      </div>

      <div className="pa-sendbox">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={messages.length > 1 ? "Ask a follow-up…" : "Ask the assistant…"}
          aria-label="Message the Portal Assistant"
          rows={1}
          disabled={sending}
        />
        <button type="button" onClick={() => submit()} disabled={sending || !input.trim()} aria-label="Send">
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
        .pa-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .pa-chip {
          border: 1px solid var(--portal-line, rgba(22, 48, 43, 0.15));
          background: #fff;
          border-radius: 999px;
          padding: 6px 11px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--pa-heading);
          cursor: pointer;
        }
        .pa-chip:hover {
          background: var(--pa-bot-bubble);
        }
        .pa-bubble :global(.pa-img-wrap) {
          display: block;
          margin: 8px 0;
          text-decoration: none;
          color: inherit;
        }
        .pa-bubble :global(.pa-img) {
          display: block;
          width: 100%;
          max-width: 260px;
          border-radius: 10px;
          border: 1px solid var(--portal-line, rgba(22, 48, 43, 0.12));
          box-shadow: 0 4px 14px rgba(22, 48, 43, 0.12);
        }
        .pa-bubble :global(.pa-img-cap) {
          display: block;
          font-size: 0.72rem;
          opacity: 0.65;
          margin-top: 3px;
        }
        .pa-bubble :global(.pa-link) {
          color: var(--pa-accent);
          text-decoration: underline;
          word-break: break-all;
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
        .pa-head-text {
          flex: 1;
          min-width: 0;
        }
        .pa-back,
        .pa-new {
          flex-shrink: 0;
          min-width: 44px;
          min-height: 44px;
          border-radius: 999px;
          border: 1px solid var(--portal-line, rgba(22, 48, 43, 0.15));
          background: var(--portal-sand, #fbf7ef);
          color: var(--pa-heading);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0 14px;
        }
        .pa-back {
          padding: 0;
          width: 44px;
        }
        .pa-sheet {
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }
        .pa-sheet .pa-header {
          align-items: center;
          padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
        }
        .pa-sheet .pa-title {
          font-size: 1rem;
        }
        .pa-sheet .pa-bubble {
          font-size: 0.95rem;
        }
        .pa-sheet .pa-chip {
          min-height: 40px;
          font-size: 0.85rem;
        }
        .pa-sheet .pa-sendbox {
          padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
        }
        .pa-sheet .pa-sendbox textarea {
          font-size: 16px; /* stops iOS zooming into the box */
          border-radius: 999px;
          padding: 11px 16px;
        }
        .pa-sheet .pa-sendbox button {
          border-radius: 999px;
          min-height: 44px;
        }
      `}</style>
    </div>
  );
}
