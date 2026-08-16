"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const FIELDS = [
  { key: "tag", label: "Has tag", type: "text" },
  { key: "source", label: "Contact source", type: "text" },
  { key: "email_opt_out", label: "Email opted out", type: "boolean" },
  { key: "sms_opt_out", label: "SMS opted out", type: "boolean" },
  { key: "created_after", label: "Contact created after", type: "date" },
  { key: "donation_total_12mo", label: "Total given, last 12mo ($)", type: "number" },
  { key: "donation_count_12mo", label: "Number of gifts, last 12mo", type: "number" },
] as const;

const OPS: Record<string, { value: string; label: string }[]> = {
  text: [{ value: "eq", label: "is" }],
  boolean: [{ value: "eq", label: "is" }],
  date: [{ value: "gte", label: "after" }],
  number: [
    { value: "gte", label: "at least" },
    { value: "lte", label: "at most" },
    { value: "eq", label: "exactly" },
  ],
};

type Leaf = { field: string; op: string; value: string | number | boolean };

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [leaves, setLeaves] = useState<Leaf[]>([{ field: "tag", op: "eq", value: "" }]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const rules = { op: combinator, rules: leaves.filter((l) => l.value !== "" && l.value !== null) };

  const runPreview = useCallback(async () => {
    if (rules.rules.length === 0) {
      setPreviewCount(null);
      return;
    }
    setPreviewing(true);
    const res = await fetch("/api/marketing/segments/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    const data = await res.json();
    setPreviewCount(res.ok ? data.count : null);
    setPreviewing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rules)]);

  useEffect(() => {
    const t = setTimeout(runPreview, 400); // debounce while typing
    return () => clearTimeout(t);
  }, [runPreview]);

  const updateLeaf = (i: number, patch: Partial<Leaf>) => {
    setLeaves((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const fieldType = (field: string) => FIELDS.find((f) => f.key === field)?.type ?? "text";

  const save = async () => {
    if (!name.trim()) return alert("Name is required");
    setSaving(true);
    const res = await fetch("/api/marketing/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, type: "dynamic", rules }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) router.push("/marketing/segments");
    else alert(data.error ?? "Could not save segment");
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">New Segment</h1>
      <p className="text-sm text-gray-500 mb-6">
        Dynamic segments recalculate automatically as contacts and donation data change — e.g. &quot;Top Donors&quot;
        stays current on its own.
      </p>

      <div className="space-y-3 mb-6">
        <input
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Segment name, e.g. Top Donors"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="border rounded p-4 mb-6">
        <div className="flex items-center gap-2 mb-4 text-sm">
          <span>Match</span>
          <select
            className="border rounded px-2 py-1"
            value={combinator}
            onChange={(e) => setCombinator(e.target.value as "and" | "or")}
          >
            <option value="and">ALL</option>
            <option value="or">ANY</option>
          </select>
          <span>of the following:</span>
        </div>

        <div className="space-y-3">
          {leaves.map((leaf, i) => {
            const type = fieldType(leaf.field);
            return (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={leaf.field}
                  onChange={(e) => {
                    const newType = fieldType(e.target.value);
                    updateLeaf(i, { field: e.target.value, op: OPS[newType][0].value, value: newType === "boolean" ? true : "" });
                  }}
                >
                  {FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={leaf.op}
                  onChange={(e) => updateLeaf(i, { op: e.target.value })}
                >
                  {OPS[type].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {type === "boolean" ? (
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={String(leaf.value)}
                    onChange={(e) => updateLeaf(i, { value: e.target.value === "true" })}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                    className="border rounded px-2 py-1 text-sm flex-1"
                    value={String(leaf.value ?? "")}
                    onChange={(e) => updateLeaf(i, { value: type === "number" ? Number(e.target.value) : e.target.value })}
                  />
                )}
                <button
                  className="text-gray-400 text-sm"
                  onClick={() => setLeaves((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>

        <button
          className="text-sm text-emerald-600 mt-3"
          onClick={() => setLeaves((prev) => [...prev, { field: "tag", op: "eq", value: "" }])}
        >
          + Add condition
        </button>
      </div>

      <div className="mb-6 text-sm">
        {previewing ? (
          <span className="text-gray-400">Calculating match count...</span>
        ) : previewCount !== null ? (
          <span className="font-medium">
            Matches <span className="text-emerald-600">{previewCount.toLocaleString()}</span> contacts right now
          </span>
        ) : (
          <span className="text-gray-400">Add a condition to preview matches</span>
        )}
      </div>

      <button
        className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Segment"}
      </button>
    </div>
  );
}
