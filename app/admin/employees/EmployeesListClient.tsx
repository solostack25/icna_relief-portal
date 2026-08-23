"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  assigned_office_id: string | null;
};
type Office = { id: string; field_office: string };

const PAGE_SIZE = 25;

const inputStyle: React.CSSProperties = {
  border: "1px solid rgba(22,48,43,0.15)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  background: "#fff",
};

const ROLE_LABELS: Record<string, string> = {
  staff: "Staff",
  area_manager: "Area Manager",
  regional_director: "Regional Director",
  program_director: "Program Director",
  admin: "Admin",
};

export default function EmployeesListClient({ employees, offices }: { employees: Employee[]; offices: Office[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [page, setPage] = useState(1);

  const officeMap = useMemo(() => new Map(offices.map((o) => [o.id, o.field_office])), [offices]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of employees) counts[e.role] = (counts[e.role] ?? 0) + 1;
    return counts;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      if (roleFilter && e.role !== roleFilter) return false;
      if (officeFilter && e.assigned_office_id !== officeFilter) return false;
      if (q) {
        const haystack = `${e.first_name} ${e.last_name} ${e.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, roleFilter, officeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function updateFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <div>
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="rounded-xl px-4 py-2.5" style={{ background: "#fff", border: "1px solid rgba(22,48,43,0.1)" }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{employees.length}</span>{" "}
          <span className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            total
          </span>
        </div>
        {Object.entries(roleCounts).map(([role, count]) => (
          <button
            key={role}
            onClick={() => updateFilter(() => setRoleFilter(roleFilter === role ? "" : role))}
            className="rounded-xl px-4 py-2.5 text-left"
            style={{
              background: roleFilter === role ? "var(--icna-green, #2F6D46)" : "#fff",
              color: roleFilter === role ? "#fff" : "#16302B",
              border: "1px solid rgba(22,48,43,0.1)",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 18 }}>{count}</span>{" "}
            <span className="text-sm" style={{ opacity: 0.7 }}>
              {ROLE_LABELS[role] ?? role}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => updateFilter(() => setSearch(e.target.value))}
          style={{ ...inputStyle, flex: "1 1 240px" }}
        />
        <select value={officeFilter} onChange={(e) => updateFilter(() => setOfficeFilter(e.target.value))} style={inputStyle}>
          <option value="">All offices</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.field_office}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => updateFilter(() => setStatusFilter(e.target.value as typeof statusFilter))} style={inputStyle}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All statuses</option>
        </select>
        {(roleFilter || officeFilter || search) && (
          <button
            onClick={() =>
              updateFilter(() => {
                setSearch("");
                setRoleFilter("");
                setOfficeFilter("");
              })
            }
            className="text-sm"
            style={{ color: "rgba(22,48,43,0.5)" }}
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.4)" }}>
        {filtered.length} of {employees.length} employees
      </p>

      <div className="rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line, rgba(22,48,43,0.1))" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--portal-line, rgba(22,48,43,0.1))" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                Email
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                Role
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                Office
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "rgba(22,48,43,0.5)" }}>
                Status
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
                  No employees match these filters.
                </td>
              </tr>
            )}
            {pageItems.map((emp, i) => (
              <tr key={emp.id} style={{ borderBottom: i < pageItems.length - 1 ? "1px solid var(--portal-line, rgba(22,48,43,0.1))" : "none" }}>
                <td className="px-4 py-3">
                  {emp.first_name} {emp.last_name}
                </td>
                <td className="px-4 py-3" style={{ color: "rgba(22,48,43,0.55)" }}>
                  {emp.email}
                </td>
                <td className="px-4 py-3">{ROLE_LABELS[emp.role] ?? emp.role}</td>
                <td className="px-4 py-3" style={{ color: "rgba(22,48,43,0.55)" }}>
                  {emp.assigned_office_id ? officeMap.get(emp.assigned_office_id) ?? "—" : "—"}
                </td>
                <td className="px-4 py-3">
                  {emp.is_active ? (
                    <span style={{ color: "var(--portal-emerald, #2F6D46)" }}>Active</span>
                  ) : (
                    <span style={{ color: "#B55139" }}>Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/employees/${emp.id}`} style={{ color: "var(--portal-emerald, #2F6D46)" }}>
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pageSafe === 1}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(22,48,43,0.06)", opacity: pageSafe === 1 ? 0.4 : 1 }}
          >
            ← Previous
          </button>
          <span className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            Page {pageSafe} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageSafe === totalPages}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(22,48,43,0.06)", opacity: pageSafe === totalPages ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
