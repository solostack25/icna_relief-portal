"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createRequestWithFirstLeg,
  DEPARTMENT_LABELS,
  type Department,
  type Priority,
} from "@/lib/helpdesk";

// Inferred from the original SharePoint lists' Request Category /
// Category columns for each department. Free text isn't used here on
// purpose — consistent category values are what make department
// queues and future reporting useful; easy to extend as real usage
// surfaces gaps.
const CATEGORIES: Record<Department, string[]> = {
  it: [
    "General Support",
    "3CX Support",
    "Salesforce",
    "Hardware Request",
    "Software Request",
    "Website Support",
    "New Employee",
    "App Issues",
  ],
  hr: ["Hiring Request", "Position Change", "Offboarding", "Title Change", "Other"],
  marketing: ["Event Materials", "Email Campaign", "Graphic Design", "Website Content", "Other"],
  finance: ["Reimbursement", "Check Request", "PEX Card", "Vendor Payment", "Other"],
};

export default function NewRequestPage() {
  const supabase = createClient();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "it" as Department,
    category: CATEGORIES.it[0],
    priority: "normal" as Priority,
    submitted_by: "",
    submitted_by_email: "",
  });

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("employees")
        .select("first_name, last_name, email")
        .eq("auth_user_id", user.id)
        .single();
      if (me) {
        setForm((f) => ({
          ...f,
          submitted_by: `${me.first_name} ${me.last_name}`,
          submitted_by_email: me.email,
        }));
      }
    })();
  }, [supabase]);

  function handleDepartmentChange(dept: Department) {
    setForm((f) => ({ ...f, department: dept, category: CATEGORIES[dept][0] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { requestId } = await createRequestWithFirstLeg(supabase, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        submitted_by: form.submitted_by.trim(),
        submitted_by_email: form.submitted_by_email.trim(),
        department: form.department,
        category: form.category,
        priority: form.priority,
      });
      router.push(`/helpdesk/${requestId}`);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">Submit a Request</h1>
          <Link
            href="/helpdesk"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">Department</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => handleDepartmentChange(d)}
                  className={`text-sm py-2 rounded-lg border ${
                    form.department === d
                      ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-text-dim)]"
                  }`}
                >
                  {DEPARTMENT_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              placeholder="What do you need?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                {CATEGORIES[form.department].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Submitted By</label>
              <input
                type="text"
                value={form.submitted_by}
                onChange={(e) => setForm({ ...form, submitted_by: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={form.submitted_by_email}
                onChange={(e) => setForm({ ...form, submitted_by_email: e.target.value })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3 disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </form>
      </div>
    </main>
  );
}
