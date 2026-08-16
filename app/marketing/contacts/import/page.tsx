"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";

// Fixed fields we know how to map into real contact columns.
// Anything left mapped to "custom" becomes a contact_fields row
// instead, so nothing from the source CSV gets silently dropped.
const TARGET_FIELDS = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "skip", label: "Don't import this column" },
  { key: "custom", label: "Import as custom field" },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

export default function ImportContactsPage() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetKey>>({});
  const [applyTagsInput, setApplyTagsInput] = useState("");
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(
    null
  );

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const cols = parsed.meta.fields ?? [];
        setHeaders(cols);
        setRows(parsed.data);

        // Best-effort auto-map by header name, so Pardot's typical
        // export headers ("Email", "First Name", ...) map themselves
        // and the person only has to fix what's actually ambiguous.
        const guessed: Record<string, TargetKey> = {};
        for (const col of cols) {
          const lower = col.toLowerCase().replace(/[^a-z]/g, "");
          if (lower.includes("email")) guessed[col] = "email";
          else if (lower.includes("phone") || lower.includes("mobile")) guessed[col] = "phone";
          else if (lower === "firstname" || lower === "fname") guessed[col] = "first_name";
          else if (lower === "lastname" || lower === "lname") guessed[col] = "last_name";
          else guessed[col] = "custom";
        }
        setMapping(guessed);
        setStep("map");
      },
    });
  }, []);

  const submit = async () => {
    setSubmitting(true);
    const applyTags = applyTagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean);

    const mappedRows = rows.map((row) => {
      const mapped: Record<string, unknown> = { fields: {} as Record<string, string> };
      for (const [col, target] of Object.entries(mapping)) {
        if (target === "skip") continue;
        if (target === "custom") {
          (mapped.fields as Record<string, string>)[col] = row[col];
        } else {
          mapped[target] = row[col];
        }
      }
      return mapped;
    });

    const res = await fetch("/api/marketing/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: fileName,
        columnMapping: mapping,
        rows: mappedRows,
        applyTags,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setResult(data);
      setStep("result");
    } else {
      alert(data.error ?? "Import failed");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-1">Import Contacts</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload a CSV export (e.g. from Pardot) and map its columns to contact fields.
      </p>

      {step === "upload" && (
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 cursor-pointer hover:border-emerald-500 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <span className="text-gray-600">Drag a CSV here, or click to choose a file</span>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      )}

      {step === "map" && (
        <div>
          <div className="text-sm text-gray-500 mb-4">
            {fileName} &middot; {rows.length.toLocaleString()} rows detected
          </div>

          <div className="space-y-2 mb-6">
            {headers.map((col) => (
              <div key={col} className="flex items-center gap-3">
                <span className="w-48 truncate text-sm font-medium">{col}</span>
                <span className="text-gray-400">&rarr;</span>
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={mapping[col]}
                  onChange={(e) => setMapping({ ...mapping, [col]: e.target.value as TargetKey })}
                >
                  {TARGET_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 truncate">e.g. &quot;{rows[0]?.[col]}&quot;</span>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">
              Tag every contact in this import (optional)
            </label>
            <input
              type="text"
              className="border rounded px-3 py-2 w-full text-sm"
              placeholder="e.g. ramadan_2026, top_donor"
              value={applyTagsInput}
              onChange={(e) => setApplyTagsInput(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Comma-separated. Useful for one-time lists like a campaign mailing list.</p>
          </div>

          <div className="flex gap-3">
            <button
              className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "Importing..." : `Import ${rows.length.toLocaleString()} contacts`}
            </button>
            <button className="text-sm text-gray-500" onClick={() => setStep("upload")}>
              Start over
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-semibold text-emerald-600">{result.created}</div>
              <div className="text-xs text-gray-500">Created</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-semibold text-blue-600">{result.updated}</div>
              <div className="text-xs text-gray-500">Updated (matched by email)</div>
            </div>
            <div className="border rounded p-4 text-center">
              <div className="text-2xl font-semibold text-gray-400">{result.skipped}</div>
              <div className="text-xs text-gray-500">Skipped</div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 mb-6 text-xs text-amber-800 max-h-40 overflow-y-auto">
              {result.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <button
            className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium"
            onClick={() => router.push("/marketing/contacts")}
          >
            View Contacts
          </button>
        </div>
      )}
    </div>
  );
}
