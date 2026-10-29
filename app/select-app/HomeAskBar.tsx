"use client";

import { useEffect, useRef, useState } from "react";
import { ASSISTANT_STARTERS, renderRich, typingLabel, useAssistantChat } from "@/components/PortalAssistant/chatShared";

// The Portal Assistant as a bar tucked under the green greeting box
// (tablet/desktop). Asking a question opens the conversation right below
// the bar and the rest of the home page slides down to make room.
// Collapsing keeps the conversation; a pill under the bar brings it back.
// Phones use the Ask button in the bottom tab bar instead (MobileTabBar).

export default function HomeAskBar() {
  const { messages, sending, error, send, reset, lastUser } = useAssistantChat({ withGreeting: false });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Ctrl/Cmd + K jumps to the bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && window.matchMedia("(min-width: 640px)").matches) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  async function submit(preset?: string) {
    if (preset && preset.endsWith(": ")) {
      setQ(preset);
      inputRef.current?.focus();
      return;
    }
    const text = (preset ?? q).trim();
    if (!text || sending) return;
    setQ("");
    setOpen(true);
    await send(text);
  }

  const hasChat = messages.length > 0;
  const lit = focused || open;

  return (
    <section aria-label="Ask the Portal Assistant" className="hab hidden sm:block relative z-10 -mt-8 mx-6 mb-10">
      <div
        className="flex items-center gap-3 bg-white rounded-full pl-5 pr-2 py-2"
        style={{
          border: `1px solid ${focused ? "var(--portal-emerald)" : "var(--portal-line)"}`,
          boxShadow: lit
            ? "0 0 0 3px rgba(31,111,84,0.16), 0 14px 34px rgba(22,48,43,0.14)"
            : "0 10px 30px rgba(22,48,43,0.12)",
          transition: "box-shadow 300ms ease, border-color 300ms ease",
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--portal-gold)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden className="flex-shrink-0">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
        </svg>
        <label htmlFor="home-ask" className="sr-only">
          Ask the Portal Assistant or search the portal
        </label>
        <input
          id="home-ask"
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={hasChat ? "Ask a follow-up…" : "Ask anything or search: policies, people, forms, your tickets…"}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none py-3 text-base"
          style={{ color: "var(--portal-ink)" }}
        />
        <kbd
          className="hidden md:inline-block text-xs rounded-lg px-2 py-1 whitespace-nowrap"
          style={{ fontFamily: "inherit", color: "rgba(22,48,43,0.65)", border: "1px solid var(--portal-line)" }}
        >
          Ctrl K
        </kbd>
        <button
          type="button"
          onClick={() => submit()}
          disabled={sending}
          aria-label="Send"
          className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-60"
          style={{ background: "var(--portal-emerald)", color: "#fff" }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {!open && !hasChat && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="text-sm pr-1" style={{ color: "rgba(22,48,43,0.65)" }}>
            Try
          </span>
          {ASSISTANT_STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => submit(s.text)}
              className="rounded-full bg-white px-4 text-sm transition-colors hover:bg-[var(--portal-sand)]"
              style={{ minHeight: 40, border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {!open && hasChat && (
        <div className="flex justify-center mt-3.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 text-sm font-semibold"
            style={{ minHeight: 40, background: "#EAF3EF", border: "1px solid #CFE0D7", color: "var(--portal-emerald)" }}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
            Continue your conversation · {messages.length} messages
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      )}

      <div
        className="hab-panel"
        aria-hidden={!open}
        style={{
          maxHeight: open ? 660 : 0,
          opacity: open ? 1 : 0,
          marginTop: open ? 18 : 0,
          visibility: open ? "visible" : "hidden",
          overflow: "hidden",
          transition: `max-height 480ms cubic-bezier(.2,.8,.2,1), margin-top 480ms cubic-bezier(.2,.8,.2,1), opacity 320ms ease, visibility 0s linear ${open ? "0s" : "480ms"}`,
        }}
      >
        <div className="bg-white rounded-3xl px-5 pt-4 pb-3" style={{ border: "1px solid var(--portal-line)", boxShadow: "0 12px 32px rgba(22,48,43,0.08)" }}>
          <div className="flex items-center justify-between gap-3 pb-3" style={{ borderBottom: "1px solid rgba(22,48,43,0.08)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--portal-emerald)", color: "var(--portal-gold-soft)" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold" style={{ color: "var(--portal-ink)" }}>
                  Portal Assistant
                </div>
                <div className="text-[13px] truncate" style={{ color: "rgba(22,48,43,0.65)" }}>
                  Fliers, tickets, calls, texts, and finding your way around
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  reset();
                  inputRef.current?.focus();
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 text-sm"
                style={{ minHeight: 40, border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New chat
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Collapse conversation"
                className="w-11 h-11 rounded-full bg-white flex items-center justify-center"
                style={{ border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 15l6-6 6 6" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex flex-col gap-4 overflow-y-auto py-4 px-1" style={{ maxHeight: 440 }} aria-live="polite">
            {!hasChat && !sending && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="m-0" style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: "var(--portal-emerald)" }}>
                  What can I help you find?
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {ASSISTANT_STARTERS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => submit(s.text)}
                      className="rounded-full px-4 text-sm"
                      style={{ minHeight: 40, background: "var(--portal-sand)", border: "1px solid var(--portal-line)", color: "var(--portal-ink)" }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[72%] px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap" style={{ background: "var(--portal-emerald)", color: "#fff", borderRadius: "20px 20px 6px 20px" }}>
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3 items-start max-w-[84%]">
                  <BotDot />
                  <div className="hab-msg min-w-0 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap" style={{ background: "var(--portal-sand)", color: "var(--portal-ink)", borderRadius: "6px 20px 20px 20px" }}>
                    {renderRich(m.content)}
                  </div>
                </div>
              )
            )}

            {sending && (
              <div className="flex gap-3 items-center">
                <BotDot />
                <span className="text-sm italic" style={{ color: "rgba(22,48,43,0.65)" }}>
                  {typingLabel(lastUser)}
                </span>
              </div>
            )}
            {error && (
              <p className="text-sm m-0" style={{ color: "#A4262C" }}>
                {error}
              </p>
            )}
          </div>

          <p className="text-xs m-0 pt-2.5" style={{ color: "rgba(22,48,43,0.65)", borderTop: "1px solid rgba(22,48,43,0.08)" }}>
            Keep typing in the bar above to follow up. Press Esc or the arrow to collapse; your conversation stays put.
          </p>
        </div>
      </div>

      <style jsx>{`
        .hab :global(.hab-msg .pa-img-wrap) {
          display: block;
          margin: 8px 0;
          text-decoration: none;
          color: inherit;
        }
        .hab :global(.hab-msg .pa-img) {
          display: block;
          width: 100%;
          max-width: 280px;
          border-radius: 10px;
          border: 1px solid var(--portal-line);
        }
        .hab :global(.hab-msg .pa-img-cap) {
          display: block;
          font-size: 0.72rem;
          opacity: 0.7;
          margin-top: 3px;
        }
        .hab :global(.hab-msg .pa-link) {
          color: var(--portal-emerald);
          text-decoration: underline;
          word-break: break-word;
        }
        @media (prefers-reduced-motion: reduce) {
          .hab-panel {
            transition: none !important;
          }
        }
      `}</style>
    </section>
  );
}

function BotDot() {
  return (
    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#FBF0DC", color: "#8A6A12" }} aria-hidden>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      </svg>
    </span>
  );
}
