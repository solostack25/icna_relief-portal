"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function OfficePicker({
  offices,
  currentOfficeId,
  isAdmin,
  currentOfficeName,
}: {
  offices: { id: string; field_office: string }[];
  currentOfficeId: string | null;
  isAdmin: boolean;
  currentOfficeName: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!isAdmin) {
    return (
      <span className="text-sm font-semibold px-3 py-1.5 rounded-full" style={{ background: "#EAF5EE", color: "var(--portal-emerald, #2F6D46)" }}>
        {currentOfficeName ?? "No office assigned"}
      </span>
    );
  }

  function handleChange(officeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (officeId) params.set("office", officeId);
    else params.delete("office");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={currentOfficeId ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      className="text-sm font-semibold rounded-full px-4 py-2"
      style={{ border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))", background: "#fff", outline: "none" }}
    >
      <option value="">Select an office…</option>
      {offices.map((o) => (
        <option key={o.id} value={o.id}>
          {o.field_office}
        </option>
      ))}
    </select>
  );
}
