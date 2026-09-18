"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

type AlertType = "error" | "success" | "info";

type AlertState = {
  message: string;
  type: AlertType;
  onClose?: () => void;
} | null;

type AlertContextValue = {
  showAlert: (message: string, type?: AlertType, onClose?: () => void) => void;
};

const AlertContext = createContext<AlertContextValue | null>(null);

const ICONS: Record<AlertType, string> = {
  error: "⚠️",
  success: "✅",
  info: "ℹ️",
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertState>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  function showAlert(message: string, type: AlertType = "info", onClose?: () => void) {
    setAlert({ message, type, onClose });
  }

  function close() {
    const cb = alert?.onClose;
    setAlert(null);
    cb?.();
  }

  useEffect(() => {
    if (!alert) return;
    okRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert]);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alert && <AlertModal alert={alert} onClose={close} okRef={okRef} />}
    </AlertContext.Provider>
  );
}

function AlertModal({
  alert,
  onClose,
  okRef,
}: {
  alert: NonNullable<AlertState>;
  onClose: () => void;
  okRef: React.RefObject<HTMLButtonElement>;
}) {
  const { t } = useLanguage();

  const accentByType: Record<AlertType, string> = {
    error: "text-red-600",
    success: "text-[var(--color-accent)]",
    info: "text-[var(--color-text)]",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-message"
        className="w-full max-w-sm rounded-xl bg-[var(--color-input-bg)] border border-[var(--color-border)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="alert-modal-message"
          className={`text-sm mb-5 ${accentByType[alert.type]}`}
        >
          <span className="mr-2" aria-hidden="true">
            {ICONS[alert.type]}
          </span>
          {alert.message}
        </p>
        <button
          ref={okRef}
          onClick={onClose}
          className="w-full rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium py-2.5"
        >
          {t("common.ok")}
        </button>
      </div>
    </div>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within an AlertProvider");
  return ctx;
}
