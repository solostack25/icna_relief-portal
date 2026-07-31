"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Member = {
  id: string;
  first_name: string;
  dob: string;
  gender: "male" | "female" | null;
};

function calcAge(dob: string) {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function levelFor(age: number): "elementary" | "middle" | "high" | null {
  if (age >= 5 && age <= 10) return "elementary";
  if (age >= 11 && age <= 13) return "middle";
  if (age >= 14 && age <= 18) return "high";
  return null;
}

const LEVEL_LABEL: Record<string, string> = {
  elementary: "Elementary (5–10)",
  middle: "Middle (11–13)",
  high: "High School (14–18)",
};

export default function DistributeBackpackButton({
  clientId,
  members,
}: {
  clientId: string;
  members: Member[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = members
    .map((m) => ({ ...m, age: calcAge(m.dob), level: levelFor(calcAge(m.dob)) }))
    .filter((m) => m.level !== null) as {
    id: string;
    first_name: string;
    dob: string;
    gender: "male" | "female" | null;
    age: number;
    level: "elementary" | "middle" | "high";
  }[];

  const [selections, setSelections] = useState<
    Record<string, { give: boolean; gender: "male" | "female" | "" }>
  >({});

  function openModal() {
    const initial: Record<string, { give: boolean; gender: "male" | "female" | "" }> = {};
    for (const child of eligible) {
      initial[child.id] = { give: true, gender: child.gender ?? "" };
    }
    setSelections(initial);
    setError(null);
    setOpen(true);
  }

  function updateSelection(id: string, patch: Partial<{ give: boolean; gender: "male" | "female" | "" }>) {
    setSelections((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }

  async function handleSubmit() {
    setError(null);

    const chosen = eligible.filter((c) => selections[c.id]?.give);

    if (chosen.length === 0) {
      setError("Select at least one child to receive a backpack.");
      return;
    }

    if (chosen.some((c) => !selections[c.id]?.gender)) {
      setError("Select a gender for every child receiving a backpack.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: me } = await supabase
      .from("employees")
      .select("id, assigned_office_id, role")
      .eq("auth_user_id", user?.id)
      .single();

    if (!me?.assigned_office_id && me?.role !== "admin") {
      setSaving(false);
      setError("Your account isn't assigned to an office yet — contact an admin.");
      return;
    }

    const counts = {
      elementary_boys: 0,
      elementary_girls: 0,
      middle_boys: 0,
      middle_girls: 0,
      high_boys: 0,
      high_girls: 0,
    };

    for (const child of chosen) {
      const gender = selections[child.id].gender;
      const key = `${child.level}_${gender === "male" ? "boys" : "girls"}` as keyof typeof counts;
      counts[key] += 1;
    }

    // persist gender back onto the household record so it's known going forward
    await Promise.all(
      chosen
        .filter((c) => !c.gender)
        .map((c) =>
          supabase
            .from("household_members")
            .update({ gender: selections[c.id].gender })
            .eq("id", c.id)
        )
    );

    const now = new Date();

    const { error: insertError } = await supabase.from("b2s_submissions").insert({
      client_id: clientId,
      office_id: me.assigned_office_id,
      employee_id: me.id,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      elementary_backpacks: counts.elementary_boys + counts.elementary_girls,
      middle_backpacks: counts.middle_boys + counts.middle_girls,
      high_backpacks: counts.high_boys + counts.high_girls,
      elementary_boys: counts.elementary_boys,
      elementary_girls: counts.elementary_girls,
      middle_boys: counts.middle_boys,
      middle_girls: counts.middle_girls,
      high_boys: counts.high_boys,
      high_girls: counts.high_girls,
      households_served: 1,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (eligible.length === 0) {
    return (
      <button
        disabled
        className="rounded-lg border border-[var(--color-border)] text-[var(--color-text-dim)] text-sm font-medium px-4 py-2 cursor-not-allowed"
        title="No household members between ages 5–18 on file"
      >
        Distribute Backpack
      </button>
    );
  }

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2"
      >
        Distribute Backpack
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h2 className="text-sm font-medium mb-1">Distribute Backpacks</h2>
            <p className="text-xs text-[var(--color-text-dim)] mb-4">
              {eligible.length} eligible child{eligible.length !== 1 ? "ren" : ""} on file
              (ages 5–18)
            </p>

            <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
              {eligible.map((child) => {
                const sel = selections[child.id] ?? { give: true, gender: child.gender ?? "" };
                return (
                  <div
                    key={child.id}
                    className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={sel.give}
                      onChange={(e) => updateSelection(child.id, { give: e.target.checked })}
                    />
                    <div className="flex-1">
                      <div className="text-sm">{child.first_name}</div>
                      <div className="text-xs text-[var(--color-text-dim)]">
                        Age {child.age} · {LEVEL_LABEL[child.level]}
                      </div>
                    </div>
                    <select
                      value={sel.gender}
                      onChange={(e) =>
                        updateSelection(child.id, { gender: e.target.value as "male" | "female" | "" })
                      }
                      disabled={!sel.give}
                      className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm disabled:opacity-50"
                    >
                      <option value="">Gender...</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                );
              })}
            </div>

            {error && <p className="text-sm text-[#B55139] mb-3">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-[var(--color-border)] text-sm py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-2 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
