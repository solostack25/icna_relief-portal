"use client";

import React from "react";

type Props = { children: React.ReactNode; onClose?: () => void };
type State = { message: string | null };

/**
 * Keeps an assistant failure contained. Without this, anything thrown while the
 * panel or its API call errors could unmount the whole React tree and
 * /select-app renders as "Application error: a client-side exception has
 * occurred" instead of just the assistant panel showing an error.
 */
export default class PortalAssistantBoundary extends React.Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Surfaces in the browser console with a stable prefix so it's greppable.
    console.error("[PortalAssistant] panel crashed:", error, info);
  }

  render() {
    if (this.state.message !== null) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-start",
            height: "100%",
            padding: "18px 16px",
            background: "#ffffff",
            border: "1px solid rgba(22,48,43,0.12)",
            borderRadius: 16,
            boxShadow: "0 18px 48px rgba(16,26,40,0.16)",
            font: "500 13px/1.5 ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
            color: "#16302B",
          }}
        >
          <strong style={{ fontSize: 14 }}>The assistant didn&apos;t load</strong>
          <p style={{ margin: 0, color: "rgba(22,48,43,0.6)" }}>
            The rest of the portal is unaffected. Details are in the browser
            console.
          </p>
          <code
            style={{
              fontSize: 11,
              color: "#A4262C",
              wordBreak: "break-word",
              maxHeight: 120,
              overflow: "auto",
            }}
          >
            {this.state.message}
          </code>
          {this.props.onClose && (
            <button
              type="button"
              onClick={this.props.onClose}
              style={{
                border: "1px solid #1F6F54",
                background: "transparent",
                color: "#1F6F54",
                borderRadius: 999,
                padding: "6px 16px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
