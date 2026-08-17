"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// The component-only bundle. The default "botframework-webchat" entry also
// pulls in the DirectLine and Speech SDKs, which drag untranspiled ESM into the
// build — and we don't need either, since CopilotStudioWebChat supplies the
// connection. WebChat injects its own styles at runtime, so there is no
// stylesheet to import alongside it.
import { ReactWebChat } from "botframework-webchat/component.js";
import {
  CopilotStudioClient,
  CopilotStudioWebChat,
} from "@microsoft/agents-copilotstudio-client";
import { acquireCopilotToken } from "@/lib/portalAssistant/auth";
import { getCopilotSettings } from "@/lib/portalAssistant/config";

type Status = "connecting" | "ready" | "signin-required" | "error";

type Props = {
  /** Pass the signed-in employee's UPN so MSAL can skip the account picker. */
  loginHint?: string;
  onClose?: () => void;
};

export default function PortalAssistantPanel({ loginHint, onClose }: Props) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<unknown>(null);
  const [needsInteractive, setNeedsInteractive] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    connect({ allowInteractive: false });
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect({ allowInteractive }: { allowInteractive: boolean }) {
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const { token } = await acquireCopilotToken({
        allowInteractive,
        loginHint,
      });
      if (cancelled.current) return;

      const client = new CopilotStudioClient(getCopilotSettings(), token);
      const directLine = CopilotStudioWebChat.createConnection(client, {
        showTyping: true,
      });

      if (cancelled.current) return;
      setConnection(directLine);
      setStatus("ready");
    } catch (error) {
      if (cancelled.current) return;
      if (!allowInteractive) {
        // Silent attempt failed — this is normal, not an error. Offer the button.
        setNeedsInteractive(true);
        setStatus("signin-required");
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Could not reach the assistant."
      );
      setStatus("error");
    }
  }

  const styleOptions = useMemo(
    () => ({
      // Layout
      rootHeight: "100%",
      rootWidth: "100%",
      backgroundColor: "transparent",
      paddingRegular: 12,
      bubbleBorderRadius: 14,
      bubbleFromUserBorderRadius: 14,
      bubbleMaxWidth: 420,

      // Palette — swap these for your portal tokens
      bubbleBackground: "var(--pa-bot-bubble, #F1F4F9)",
      bubbleTextColor: "var(--pa-bot-text, #16202E)",
      bubbleFromUserBackground: "var(--pa-user-bubble, #1F6F54)",
      bubbleFromUserTextColor: "var(--pa-user-text, #FFFFFF)",
      sendBoxBackground: "var(--pa-sendbox-bg, #FFFFFF)",
      sendBoxTextColor: "var(--pa-sendbox-text, #16202E)",
      sendBoxBorderTop: "1px solid var(--pa-border, #E1E6ED)",
      suggestedActionBackgroundColor: "transparent",
      suggestedActionBorderColor: "var(--pa-accent, #1F6F54)",
      suggestedActionTextColor: "var(--pa-accent, #1F6F54)",
      suggestedActionBorderRadius: 999,

      // Type
      primaryFont:
        "var(--pa-font, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)",

      // Chrome we don't need for an internal assistant
      hideUploadButton: true,
      botAvatarInitials: "IR",
      userAvatarInitials: "",
      avatarSize: 28,
      timestampFormat: "relative" as const,
    }),
    []
  );

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
        {status === "connecting" && (
          <p className="pa-state">Connecting…</p>
        )}

        {status === "signin-required" && needsInteractive && (
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

        {status === "ready" && connection != null && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <ReactWebChat directLine={connection as any} styleOptions={styleOptions} />
        )}
      </div>

      <style jsx>{`
        .pa-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--pa-surface, #ffffff);
          border: 1px solid var(--pa-border, #e1e6ed);
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
          border-bottom: 1px solid var(--pa-border, #e1e6ed);
        }
        .pa-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--pa-heading, #16202e);
        }
        .pa-subtitle {
          margin: 2px 0 0;
          font-size: 0.78rem;
          color: var(--pa-muted, #5d6b7d);
        }
        .pa-close {
          border: 0;
          background: transparent;
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          color: var(--pa-muted, #5d6b7d);
          padding: 2px 6px;
          border-radius: 6px;
        }
        .pa-close:focus-visible,
        .pa-action:focus-visible {
          outline: 2px solid var(--pa-accent, #1f6f54);
          outline-offset: 2px;
        }
        .pa-body {
          flex: 1;
          min-height: 0;
        }
        .pa-state {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          padding: 20px 16px;
          font-size: 0.85rem;
          color: var(--pa-muted, #5d6b7d);
        }
        .pa-error {
          margin: 0;
          color: var(--pa-danger, #a4262c);
        }
        .pa-action {
          border: 1px solid var(--pa-accent, #1f6f54);
          background: transparent;
          color: var(--pa-accent, #1f6f54);
          border-radius: 999px;
          padding: 6px 16px;
          font-size: 0.82rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
