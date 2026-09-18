"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

export default function ClientBlockControl({
  clientId,
  initialBlocked,
  initialReason,
}: {
  clientId: string;
  initialBlocked: boolean;
  initialReason: string | null;
}) {
  const supabase = createClient();
  const { t } = useLanguage();

  const [isBlocked, setIsBlocked] = useState(initialBlocked);
  const [reason, setReason] = useState(initialReason ?? "");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function getEmployeeId() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
    return employee?.id ?? null;
  }

  async function handleBlock() {
    setSaving(true);
    const employeeId = await getEmployeeId();

    await supabase
      .from("clients")
      .update({
        is_blocked: true,
        blocked_reason: reason || null,
        blocked_at: new Date().toISOString(),
        blocked_by: employeeId,
      })
      .eq("id", clientId);

    await logAudit(supabase, employeeId, "block_client", "client", clientId, { reason });

    setIsBlocked(true);
    setShowConfirm(false);
    setSaving(false);
  }

  async function handleUnblock() {
    setSaving(true);
    const employeeId = await getEmployeeId();

    await supabase
      .from("clients")
      .update({
        is_blocked: false,
        blocked_reason: null,
        blocked_at: null,
        blocked_by: null,
      })
      .eq("id", clientId);

    await logAudit(supabase, employeeId, "unblock_client", "client", clientId, {});

    setIsBlocked(false);
    setReason("");
    setSaving(false);
  }

  if (isBlocked) {
    return (
      <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-700">{t("block.isBlocked")}</p>
            {reason && <p className="text-xs text-red-600 mt-1">{reason}</p>}
            <p className="text-xs text-red-600 mt-1">{t("block.cannotSelfBook")}</p>
          </div>
          <button
            onClick={handleUnblock}
            disabled={saving}
            className="text-xs font-medium rounded-lg px-3 py-2 border border-red-300 dark:border-red-900 text-red-700 hover:bg-[var(--color-input-bg)] disabled:opacity-50 shrink-0"
          >
            {saving ? t("block.working") : t("block.unblock")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="text-xs text-[var(--color-text-dim)] hover:text-red-600"
        >
          {t("block.blockThisClient")}
        </button>
      ) : (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
          <label htmlFor="block-reason" className="block text-xs text-red-700 mb-1">{t("block.reasonLabel")}</label>
          <input
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("block.reasonPlaceholder")}
            className="w-full rounded-lg border border-red-200 dark:border-red-900 bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-red-400 dark:border-red-800 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleBlock}
              disabled={saving}
              className="text-xs font-medium rounded-lg px-3 py-2 bg-red-600 text-white disabled:opacity-50"
            >
              {saving ? t("block.blocking") : t("block.blockThisClient")}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border)]"
            >
              {t("common.neverMind")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
