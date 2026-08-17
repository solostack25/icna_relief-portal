"use client";

import { useEffect, useRef, useState } from "react";
import {
  CopilotStudioClient,
  CopilotStudioWebChat,
} from "@microsoft/agents-copilotstudio-client";
import { acquireCopilotToken } from "@/lib/portalAssistant/auth";
import { getCopilotSettings } from "@/lib/portalAssistant/config";

/**
 * WebChat is loaded from Microsoft's CDN rather than the npm package.
 *
 * The npm `botframework-webchat` dist is already bundled and minified; running
 * it through Next's minifier corrupts embedded JSON string literals, which
 * surfaces at runtime as "Bad control character in string literal in JSON"
 * from inside the WebChat chunk. The CDN build is prebuilt and never touches
 * our bundler, so there is nothing to corrupt.
 *
 * If the portal ever gets a Content-Security-Policy, cdn.botframework.com must
 * be allowed in script-src or this will fail to load.
 */
const WEBCHAT_CDN =
  "https://cdn.botframework.com/botframework-webchat/latest/webchat.js";

declare global {
  interface Window {
    WebChat?: {
      renderWebChat: (props: Record<string, unknown>, element: HTMLElement) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadWebChat(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.WebChat) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WEBCHAT_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the chat library from Microsoft's CDN."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type Status = "connecting" | "ready" | "signin-required" | "error";

type Props = {
  /** The signed-in employee's UPN, so MSAL can skip the account picker. */
  loginHint?: string;
  onClose?: () => void;
};

export default function PortalAssistantPanel({ loginHint, onClose }: Props) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cancelled = useRef(false);
  const rendered = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    connect({ allowInteractive: false });
    return () => {
      cancelled.current = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
      rendered.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect({ allowInteractive }: { allowInteractive: boolean }) {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      await loadWebChat();
      if (cancelled.current) return;

      const { token } = await acquireCopilotToken({ allowInteractive, loginHint });
      if (cancelled.current) return;

      const client = new CopilotStudioClient(getCopilotSettings(), token);
      const directLine = CopilotStudioWebChat.createConnection(client, {
        showTyping: true,
      });
      if (cancelled.current) return;

      setStatus("ready");

      // The container only exists once status is "ready", so wait a tick for
      // React to commit it before handing the node to WebChat.
      requestAnimationFrame(() => {
        if (cancelled.current || rendered.current) return;
        const el = containerRef.current;
        if (!el || !window.WebChat) return;

        window.WebChat.renderWebChat(
          {
            directLine,
            locale: "en-US",
            styleOptions: {
              rootHeight: "100%",
              rootWidth: "100%",
              backgroundColor: "transparent",
              paddingRegular: 12,
              bubbleBorderRadius: 14,
              bubbleFromUserBorderRadius: 14,
              bubbleMaxWidth: 420,

              // Portal emerald/gold. Literal hex rather than CSS vars — these
              // are consumed by WebChat's own JS, not always as inline styles.
              bubbleBackground: "#FBF7EF",
              bubbleTextColor: "#16302B",
              bubbleFromUserBackground: "#1F6F54",
              bubbleFromUserTextColor: "#FFFFFF",
              sendBoxBackground: "#FFFFFF",
              sendBoxTextColor: "#16302B",
              sendBoxBorderTop: "1px solid rgba(22,48,43,0.12)",
              suggestedActionBackgroundColor: "transparent",
              suggestedActionBorderColor: "#1F6F54",
              suggestedActionTextColor: "#1F6F54",
              suggestedActionBorderRadius: 999,
              accent: "#1F6F54",

              primaryFont:
                "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",

              hideUploadButton: true,
              botAvatarInitials: "IR",
              userAvatarInitials: "",
              avatarSize: 28,
            },
          },
          el
        );

        rendered.current = true;
      });
    } catch (error) {
      if (cancelled.current) return;

      if (!allowInteractive) {
        // A failed silent attempt is expected, not an error — offer the button.
        setStatus("signin-required");
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Could not reach the assistant."
      );
      setStatus("error");
    }
  }

  return (
    <div className="pa-panel" role="dialog" aria-label="Portal Assistant">
      <header className="pa-header">
        <div>
          <p className="pa-title">Portal Assistant</p>
          <p className="pa-subtitle">
            Tickets, calls, and texts — ask in plain language
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            className="pa-close"
            onClick={onClose}
            aria-label="Close assistant"
          >
            ×
          </button>
        )}
      </header>

      <div className="pa-body">
        {status === "connecting" && <p className="pa-state">Connecting…</p>}

        {status === "signin-required" && (
          <div className="pa-state">
            <p>Sign in to start a conversation.</p>
            <button
              type="button"
              className="pa-action"
              onClick={() => connect({ allowInteractive: true })}
            >
              Sign in
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="pa-state">
            <p className="pa-error">{errorMessage}</p>
            <button
              type="button"
              className="pa-action"
              onClick={() => connect({ allowInteractive: true })}
            >
              Try again
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className="pa-webchat"
          style={{ display: status === "ready" ? "block" : "none" }}
        />
      </div>

      <style jsx>{`
        .pa-panel {
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
          color: var(--portal-ink, #16302b);
        }
        .pa-subtitle {
          margin: 2px 0 0;
          font-size: 0.78rem;
          color: rgba(22, 48, 43, 0.55);
        }
        .pa-close {
          border: 0;
          background: transparent;
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          color: rgba(22, 48, 43, 0.55);
          padding: 2px 6px;
          border-radius: 6px;
        }
        .pa-close:focus-visible,
        .pa-action:focus-visible {
          outline: 2px solid var(--portal-emerald, #1f6f54);
          outline-offset: 2px;
        }
        .pa-body {
          flex: 1;
          min-height: 0;
          position: relative;
        }
        .pa-webchat {
          height: 100%;
          width: 100%;
        }
        .pa-state {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          padding: 20px 16px;
          font-size: 0.85rem;
          color: rgba(22, 48, 43, 0.55);
        }
        .pa-error {
          margin: 0;
          color: #a4262c;
        }
        .pa-action {
          border: 1px solid var(--portal-emerald, #1f6f54);
          background: transparent;
          color: var(--portal-emerald, #1f6f54);
          border-radius: 999px;
          padding: 6px 16px;
          font-size: 0.82rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
