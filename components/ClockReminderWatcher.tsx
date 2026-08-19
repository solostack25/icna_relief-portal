"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// How often (while the tab stays open) to re-check clock status.
const CHECK_INTERVAL_MS = 25 * 60 * 1000; // 25 minutes
// Give someone a few minutes after landing in the portal before the
// first check — don't nag the instant they log in.
const FIRST_CHECK_DELAY_MS = 5 * 60 * 1000; // 5 minutes
// If dismissed, don't ask again for this long.
const DISMISS_THROTTLE_MS = 60 * 60 * 1000; // 1 hour
const DISMISS_KEY = "clockReminderDismissedAt";

// Pages with no portal chrome / no real staff session behind them —
// same idea as HadithBanner's exclusion list. Not strictly required
// (the auth check below already no-ops without a session) but avoids
// even attempting the check on pages where it's never relevant.
function isExcludedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  if (pathname.startsWith("/inkind")) return true;
  if (pathname.startsWith("/finance-approvals/")) return true;
  if (pathname.startsWith("/volunteer/public/")) return true;
  return false;
}

export default function ClockReminderWatcher() {
  const pathname = usePathname();
  const supabase = createClient();

  const [show, setShow] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const excluded = isExcludedPath(pathname);

  useEffect(() => {
    if (excluded) return;

    async function check() {
      const lastDismissed = Number(sessionStorage.getItem(DISMISS_KEY) ?? 0);
      if (Date.now() - lastDismissed < DISMISS_THROTTLE_MS) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: me } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (!me) return;

      const { data: openEntry } = await supabase
        .from("time_clock_entries")
        .select("id")
        .eq("employee_id", me.id)
        .is("clock_out_at", null)
        .limit(1)
        .maybeSingle();

      if (!openEntry) {
        setEmployeeId(me.id);
        setShow(true);
      }
    }

    const firstCheck = setTimeout(check, FIRST_CHECK_DELAY_MS);
    const recurring = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(firstCheck);
      clearInterval(recurring);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluded]);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  async function clockInNow() {
    if (!employeeId) return;
    setBusy(true);
    await supabase.from("time_clock_entries").insert({ employee_id: employeeId, source: "portal" });
    setBusy(false);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-[100]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-sm font-medium mb-2">You're not clocked in</h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-5">
          Just checking — should you be clocked in right now?
        </p>
        <div className="flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 rounded-lg border border-[var(--color-border)] text-sm py-2"
          >
            Not right now
          </button>
          <button
            onClick={clockInNow}
            disabled={busy}
            className="flex-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-2 disabled:opacity-50"
          >
            {busy ? "..." : "Clock In Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
