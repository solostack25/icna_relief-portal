"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import PortalAssistantBoundary from "./PortalAssistantBoundary";

const PortalAssistantPanel = dynamic(() => import("./PortalAssistantPanel"), {
  ssr: false,
  loading: () => null,
});

export default function PortalAssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="pa-dock">
          <PortalAssistantBoundary onClose={() => setOpen(false)}>
            <PortalAssistantPanel onClose={() => setOpen(false)} />
          </PortalAssistantBoundary>
        </div>
      )}

      <button type="button" className="pa-launcher" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Close assistant" : "Ask the assistant"}
      </button>

      <style jsx>{`
        .pa-dock,
        .pa-launcher {
          --pa-accent: var(--portal-emerald, #1f6f54);
        }
        .pa-dock {
          position: fixed;
          right: 20px;
          bottom: 84px;
          width: min(400px, calc(100vw - 40px));
          height: min(620px, calc(100vh - 140px));
          z-index: 60;
        }
        .pa-launcher {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 60;
          border: 0;
          border-radius: 999px;
          padding: 12px 22px;
          font-size: 0.88rem;
          font-weight: 600;
          color: #fff;
          background: var(--pa-accent, #1f6f54);
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(18, 59, 45, 0.32);
          transition: transform 140ms ease;
        }
        .pa-launcher:hover {
          transform: translateY(-1px);
        }
        .pa-launcher:focus-visible {
          outline: 2px solid var(--portal-gold, #c99a3d);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .pa-launcher {
            transition: none;
          }
        }
        @media (max-width: 480px) {
          .pa-dock {
            right: 12px;
            left: 12px;
            width: auto;
            bottom: 76px;
          }
        }
      `}</style>
    </>
  );
}
