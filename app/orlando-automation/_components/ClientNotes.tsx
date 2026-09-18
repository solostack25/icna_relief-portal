"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

type Note = {
  id: string;
  note: string;
  created_at: string;
  employee_id: string | null;
};

type Employee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function ClientNotes({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const { t } = useLanguage();

  const [notes, setNotes] = useState<Note[]>([]);
  const [employees, setEmployees] = useState<Map<string, Employee>>(new Map());
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: noteRows } = await supabase
      .from("client_notes")
      .select("id, note, created_at, employee_id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    const employeeIds = Array.from(
      new Set((noteRows ?? []).map((n) => n.employee_id).filter(Boolean))
    ) as string[];

    const { data: employeeRows } = employeeIds.length
      ? await supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds)
      : { data: [] as Employee[] };

    setNotes(noteRows ?? []);
    setEmployees(new Map((employeeRows ?? []).map((e) => [e.id, e])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    await supabase.from("client_notes").insert({
      client_id: clientId,
      employee_id: employee?.id ?? null,
      note: draft.trim(),
    });

    setDraft("");
    setSaving(false);
    load();
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-sm font-medium mb-4">{t("notes.title")}</h2>

      <form onSubmit={handleAdd} className="mb-4">
        <textarea
          aria-label={t("notes.placeholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("notes.placeholder")}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] resize-none"
        />
        <button
          type="submit"
          disabled={saving || !draft.trim()}
          className="mt-2 text-xs font-medium rounded-lg px-3 py-2 bg-[var(--color-accent-solid)] text-white disabled:opacity-50"
        >
          {saving ? t("notes.saving") : t("notes.addNote")}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-[var(--color-text-dim)]">{t("common.loading")}</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">{t("notes.none")}</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => {
            const employee = n.employee_id ? employees.get(n.employee_id) : null;
            return (
              <div key={n.id} className="border-t border-[var(--color-border)] pt-3">
                <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">
                  {employee
                    ? `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim()
                    : t("notes.unknownStaff")}{" "}
                  · {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
