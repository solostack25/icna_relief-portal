"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EntraUser = { id: string; displayName: string; mail: string | null; userPrincipalName: string };
type License = { skuId: string; skuPartNumber: string; friendlyName: string; availableUnits: number };

const inputClass = "w-full rounded-lg text-sm";
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  boxShadow: "0 3px 12px rgba(22,48,43,0.06)",
  padding: "24px 26px",
};
const labelClass = "block text-sm font-semibold mb-1.5";

export default function EntraOnboardClient() {
  const [directory, setDirectory] = useState<EntraUser[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [managerSearch, setManagerSearch] = useState("");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    jobTitle: "",
    department: "",
    officeLocation: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ adUserId: string; userPrincipalName: string; tempPassword: string; warnings: string[] } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/entra-directory")
      .then((res) => res.json())
      .then((data) => setDirectory(data.users ?? []));
    fetch("/api/admin/graph/licenses")
      .then((res) => res.json())
      .then((data) => setLicenses(data.licenses ?? []));
  }, []);

  const managerMatches =
    managerSearch.trim().length > 1 ? directory.filter((u) => u.displayName.toLowerCase().includes(managerSearch.toLowerCase())).slice(0, 6) : [];
  const selectedManager = directory.find((u) => u.id === managerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/entra-directory/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, managerId, licenseSkuIds: Array.from(selectedLicenses) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create Entra account");
      setResult({ adUserId: data.adUserId, userPrincipalName: data.userPrincipalName, tempPassword: data.tempPassword, warnings: data.warnings ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create Entra account");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const portalSetupUrl = `/admin/employees/new?adUserId=${encodeURIComponent(result.adUserId)}&email=${encodeURIComponent(
      result.userPrincipalName
    )}&firstName=${encodeURIComponent(form.firstName)}&lastName=${encodeURIComponent(form.lastName)}`;
    return (
      <div className="max-w-xl" style={cardStyle}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>Entra account created</h2>
        <p className="text-sm mb-5" style={{ color: "rgba(22,48,43,0.55)" }}>
          {result.userPrincipalName}
        </p>

        <div className="rounded-lg p-4 mb-4" style={{ background: "#F4F3EE" }}>
          <div className="text-xs mb-1" style={{ color: "rgba(22,48,43,0.5)" }}>
            Temporary password
          </div>
          <div className="flex items-center gap-3">
            <code style={{ fontSize: 16, fontWeight: 600 }}>{result.tempPassword}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(result.tempPassword);
                setPasswordCopied(true);
              }}
              className="text-xs font-semibold px-2.5 py-1 rounded-md"
              style={{ background: "rgba(22,48,43,0.08)" }}
            >
              {passwordCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {result.warnings.length > 0 && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: "#FCEFDD" }}>
            {result.warnings.map((w, i) => (
              <p key={i} className="text-sm" style={{ color: "#A57420" }}>
                {w}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            href={portalSetupUrl}
            className="text-sm font-bold px-5 py-2.5 rounded-full hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{ background: "var(--portal-emerald, #2F6D46)", color: "#fff", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
          >
            Continue → Set Up Portal Access
          </Link>
          <Link href="/admin/entra-directory" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>First Name</label>
          <input
            required
            className={inputClass}
            style={inputStyle}
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelClass}>Last Name</label>
          <input
            required
            className={inputClass}
            style={inputStyle}
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Email (User Principal Name)</label>
        <input
          required
          type="email"
          placeholder="jane.doe@icnarelief.org"
          className={inputClass}
          style={inputStyle}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </div>

      <div>
        <label className={labelClass}>Job Title</label>
        <input className={inputClass} style={inputStyle} value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Department</label>
          <input
            className={inputClass}
            style={inputStyle}
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelClass}>Office Location</label>
          <input
            className={inputClass}
            style={inputStyle}
            value={form.officeLocation}
            onChange={(e) => setForm((f) => ({ ...f, officeLocation: e.target.value }))}
          />
        </div>
      </div>

      <div className="relative">
        <label className={labelClass}>Manager</label>
        {selectedManager ? (
          <div className="flex items-center justify-between rounded-full px-4 py-2.5" style={{ background: "#F4F3EE" }}>
            <span className="text-sm">{selectedManager.displayName}</span>
            <button
              type="button"
              onClick={() => {
                setManagerId(null);
                setManagerSearch("");
              }}
              className="text-xs font-semibold"
              style={{ color: "rgba(22,48,43,0.5)" }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              className={inputClass}
              style={inputStyle}
              placeholder="Search by name…"
              value={managerSearch}
              onChange={(e) => setManagerSearch(e.target.value)}
            />
            {managerMatches.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 4px 16px rgba(22,48,43,0.12)" }}>
                {managerMatches.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => {
                      setManagerId(u.id);
                      setManagerSearch("");
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm"
                    style={{ borderTop: "1px solid var(--portal-line, rgba(22,48,43,0.06))" }}
                  >
                    {u.displayName} <span style={{ color: "rgba(22,48,43,0.4)" }}>{u.mail}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {licenses.length > 0 && (
        <div>
          <label className={labelClass}>Licenses</label>
          <div className="flex flex-col gap-2">
            {licenses.map((lic) => (
              <label key={lic.skuId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedLicenses.has(lic.skuId)}
                  onChange={(e) =>
                    setSelectedLicenses((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(lic.skuId);
                      else next.delete(lic.skuId);
                      return next;
                    })
                  }
                />
                {lic.friendlyName}{" "}
                <span style={{ color: "rgba(22,48,43,0.4)" }}>({lic.availableUnits} available)</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "#B5566B" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="text-sm font-bold px-5 py-2.5 rounded-full cursor-pointer disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform duration-150"
        style={{ background: "var(--portal-emerald, #2F6D46)", color: "#fff", opacity: saving ? 0.6 : 1, boxShadow: saving ? "none" : "0 3px 10px rgba(31,111,84,0.3)" }}
      >
        {saving ? "Creating…" : "Create Entra Account"}
      </button>
    </form>
  );
}
