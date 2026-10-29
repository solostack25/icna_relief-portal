"use client";

import { useCallback, useState } from "react";

// Shared by every place the Portal Assistant appears: the ask bar on the
// home page, the full-screen sheet behind the phone tab bar's Ask button,
// and the floating panel.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const ASSISTANT_GREETING =
  "Hi! Tell me if something isn't working and I'll help you fix it (or open a ticket if we can't). I can also design an on-brand flier, look up a coworker, place calls, send texts, or find your way around the portal.";

/** Starter prompts. Ones ending in ": " are put in the box to finish typing. */
export const ASSISTANT_STARTERS: { label: string; text: string }[] = [
  { label: "Request time off", text: "How do I request time off?" },
  { label: "✦ Make a flier", text: "I need a flier. Here are the details: " },
  { label: "Something's not working", text: "Something isn't working: " },
  { label: "Open a ticket", text: "I need to open a helpdesk ticket" },
  { label: "Office hours", text: "What are my office's hours?" },
];

export function typingLabel(lastUserText: string): string {
  if (/designing|generat|flier/i.test(lastUserText)) return "Working on it — designing can take up to a minute…";
  if (/not working|broken|can.?t|won.?t|error|slow|down/i.test(lastUserText)) return "Checking your account and devices…";
  return "Thinking…";
}

/**
 * Chat state + sending. `withGreeting` seeds the assistant's hello as the
 * first message (the floating panel does; the home bar shows starters
 * instead, so the conversation opens with the person's own question).
 */
export function useAssistantChat({ withGreeting = true }: { withGreeting?: boolean } = {}) {
  const initial: ChatMessage[] = withGreeting ? [{ role: "assistant", content: ASSISTANT_GREETING }] : [];
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || sending) return false;
      const next: ChatMessage[] = [...messages, { role: "user", content: t }];
      setMessages(next);
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/portal-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "The assistant couldn't respond.");
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setSending(false);
      }
      return true;
    },
    [messages, sending]
  );

  const reset = useCallback(() => {
    setMessages(withGreeting ? [{ role: "assistant", content: ASSISTANT_GREETING }] : []);
    setError(null);
  }, [withGreeting]);

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  return { messages, sending, error, send, reset, lastUser };
}

// Minimal markdown for assistant replies: images, links, bare URLs, bold.
// The model is told to show generated fliers as ![Option 1](url), so this
// is what turns those into actual pictures in the chat.
export function renderRich(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|(https?:\/\/[^\s<)]+)|\*\*([^*]+)\*\*/g;
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
      const internal = m[4].startsWith("/");
      out.push(
        <a key={k++} href={m[4]} target={internal ? undefined : "_blank"} rel={internal ? undefined : "noreferrer"} className="pa-link">
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
