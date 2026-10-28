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

const GREETING =
  "Hi! Tell me if something isn't working and I'll help you fix it (or open a ticket if we can't). I can also design an on-brand flier, look up a coworker, place calls, send texts, or find your way around the portal.";

const QUICK_ACTIONS: { label: string; text: string }[] = [
  { label: "✦ Make a flier", text: "I need a flier. Here are the details: " },
  { label: "Translate a flier", text: "Translate my flier to Spanish" },
  { label: "🛠 Something's not working", text: "Something isn't working: " },
  { label: "Open a ticket", text: "I need to open a helpdesk ticket" },
  { label: "Office hours", text: "What are my office's hours?" },
];

// Minimal markdown for assistant replies: images, links, bare URLs, bold.
// The model is told to show generated fliers as ![Option 1](url), so this
// is what turns those into actual pictures in the chat.
function renderRich(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<)]+)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) {
      out.push(
        <a key={k++} href={m[2]} target="_blank" rel="noreferrer" className="pa-img-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m[2]} alt={m[1] || "Flier"} className="pa-img" />
          {m[1] && <span className="pa-img-cap">{m[1]} · tap to open</span>}
        </a>
      );
    } else if (m[4]) {
      out.push(
        <a key={k++} href={m[4]} target="_blank" rel="noreferrer" className="pa-link">
          {m[3]}
        </a>
      );
    } else if (m[5]) {
      out.push(
        <a key={k++} href={m[5]} target="_blank" rel="noreferrer" className="pa-link">
          {m[5]}
        </a>
      );
    } else if (m[6]) {
      out.push(<strong key={k++}>{m[6]}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function PortalAssistantPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
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
          <p className="pa-subtitle">Fliers, tickets, calls, texts, and finding your way around — ask in plain language</p>
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
            <div className={`pa-bubble ${m.role === "user" ? "pa-bubble-user" : "pa-bubble-bot"}`}>{m.role === "assistant" ? renderRich(m.content) : m.content}</div>
          </div>
        ))}
        {messages.length === 1 && !sending && (
          <div className="pa-chips">
            {QUICK_ACTIONS.map((q) => (
              <button key={q.label} type="button" className="pa-chip" onClick={() => (q.text.endsWith(": ") ? setInput(q.text) : send(q.text))}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        {sending && (
          <div className="pa-bubble-row pa-row-bot">
            <div className="pa-bubble pa-bubble-bot pa-typing">{/designing|generat|flier/i.test(messages[messages.length - 1]?.content ?? "") ? "Working on it — designing can take up to a minute…" : /not working|broken|can.?t|won.?t|error|slow|down/i.test(messages[messages.length - 1]?.content ?? "") ? "Checking your account and devices…" : "Thinking…"}</div>
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
        <button type="button" onClick={() => send()} disabled={sending || !input.trim()} aria-label="Send">
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
      `}</style>
    </div>
  );
}
