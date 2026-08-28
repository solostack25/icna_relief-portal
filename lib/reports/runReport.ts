import type { SupabaseClient } from "@supabase/supabase-js";
import { getReportModule, modulesForRole, isDurationMetric, type ReportModule } from "@/lib/reports/registry";

export type ReportScopeContext = {
  isAdmin: boolean;
  role: "staff" | "regional_director" | "program_director" | "admin";
  assignedOfficeId: string | null;
  assignedRegion: string | null;
};

export type RunReportParams = {
  module_slug: string;
  dimensions: string[];
  metrics: string[];
  filters?: {
    date_from?: string;
    date_to?: string;
    office_id?: string;
  };
};

export type RunReportResult =
  | { error: string; status: number }
  | {
      module: ReportModule;
      dimension_labels: string[];
      metric_labels: string[];
      rows: { dimensions: unknown[]; metrics: (number | null)[] }[];
      row_count: number;
    };

// Core of the report engine: whitelist-validate the request against
// the registry, resolve which offices this employee/report-owner is
// allowed to see, fetch the scoped rows, and group/aggregate them in
// memory. Shared by app/api/reports/run (interactive) and
// app/api/cron/report-schedule (scheduled email delivery) so both
// paths enforce the exact same scoping - a scheduled report can never
// see more than the owner could see running it themselves.
export async function runReport(
  supabase: SupabaseClient,
  access: ReportScopeContext,
  params: RunReportParams
): Promise<RunReportResult> {
  const mod = getReportModule(params.module_slug);
  if (!mod) return { error: "Unknown report module", status: 400 };

  const allowed = modulesForRole(access.role);
  if (!allowed.some((m) => m.slug === mod.slug)) {
    return { error: "You don't have access to this report module", status: 403 };
  }

  const dims = mod.dimensions.filter((d) => params.dimensions?.includes(d.key));
  const mets = mod.metrics.filter((m) => params.metrics?.includes(m.key));
  if (dims.length === 0 && mets.length === 0) {
    return { error: "Select at least one dimension or metric", status: 400 };
  }
  if (params.dimensions?.some((k) => !dims.find((d) => d.key === k))) {
    return { error: "Invalid dimension selected", status: 400 };
  }
  if (params.metrics?.some((k) => !mets.find((m) => m.key === k))) {
    return { error: "Invalid metric selected", status: 400 };
  }

  let allowedOfficeIds: string[] | "all" = "all";
  if (!access.isAdmin) {
    if (access.role === "regional_director" && access.assignedRegion) {
      const { data: offices } = await supabase.from("b2s_offices").select("id").eq("region", access.assignedRegion);
      allowedOfficeIds = (offices ?? []).map((o: { id: string }) => o.id);
    } else {
      allowedOfficeIds = access.assignedOfficeId ? [access.assignedOfficeId] : [];
    }
    if (params.filters?.office_id) {
      allowedOfficeIds = allowedOfficeIds.includes(params.filters.office_id) ? [params.filters.office_id] : [];
    }
  } else if (params.filters?.office_id) {
    allowedOfficeIds = [params.filters.office_id];
  }

  const empty = { module: mod, dimension_labels: dims.map((d) => d.label), metric_labels: mets.map((m) => m.label), rows: [], row_count: 0 };

  if (allowedOfficeIds !== "all" && allowedOfficeIds.length === 0 && mod.scope.type !== "none" && mod.scope.type !== "direct_region") {
    return empty;
  }
  if (mod.scope.type === "direct_region" && !access.isAdmin && !access.assignedRegion) {
    return empty;
  }

  // Walk the scope chain (if any): each hop narrows an id set by one
  // join, starting from allowedOfficeIds and ending with the set of
  // ids to match against the report table's finalRefColumn. A module
  // with no office concept ("none") or its own office_id ("direct")
  // skips this entirely.
  let finalRefIds: string[] | null = null;
  if (mod.scope.type === "chain" && allowedOfficeIds !== "all") {
    let currentIds: string[] = allowedOfficeIds;
    for (const hop of mod.scope.hops) {
      const filterCol = "officeColumn" in hop ? hop.officeColumn : hop.filterColumn;
      const { data: rows } = await supabase.from(hop.table).select(hop.idColumn).in(filterCol, currentIds);
      currentIds = ((rows ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r[hop.idColumn]));
      if (currentIds.length === 0) break;
    }
    finalRefIds = currentIds;
    if (finalRefIds.length === 0) return empty;
  }

  const columns = new Set<string>([mod.defaultDateColumn]);
  dims.forEach((d) => columns.add(d.column));
  mets.forEach((m) => {
    if (isDurationMetric(m)) {
      columns.add(m.startColumn);
      columns.add(m.endColumn);
    } else {
      columns.add(m.column);
    }
  });

  let query = supabase.from(mod.table).select(Array.from(columns).join(","));

  if (mod.scope.type === "direct" && allowedOfficeIds !== "all") {
    query = query.in(mod.scope.officeColumn, allowedOfficeIds);
  }
  if (mod.scope.type === "chain" && finalRefIds) {
    query = query.in(mod.scope.finalRefColumn, finalRefIds);
  }
  if (mod.scope.type === "direct_region" && !access.isAdmin && access.assignedRegion) {
    query = query.eq(mod.scope.regionColumn, access.assignedRegion);
  }
  if (mod.fixedFilter) {
    if (mod.fixedFilter.operator === "not_null") {
      query = query.not(mod.fixedFilter.column, "is", null);
    } else {
      query = query.eq(mod.fixedFilter.column, mod.fixedFilter.value);
    }
  }
  if (params.filters?.date_from) query = query.gte(mod.defaultDateColumn, params.filters.date_from);
  if (params.filters?.date_to) query = query.lte(mod.defaultDateColumn, params.filters.date_to);

  const { data, error } = await query.limit(10000);
  if (error) return { error: error.message, status: 500 };

  const truncKey = (raw: unknown, truncate?: "month" | "day") => {
    if (truncate && typeof raw === "string") {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return "—";
      return truncate === "month" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : date.toISOString().slice(0, 10);
    }
    return raw ?? "—";
  };

  const groupKey = (row: Record<string, unknown>) => dims.map((d) => truncKey(row[d.column], d.truncate)).join(" | ");

  const groups = new Map<string, { dimensionValues: unknown[]; rows: Record<string, unknown>[] }>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = groupKey(row);
    if (!groups.has(key)) {
      groups.set(key, { dimensionValues: dims.map((d) => truncKey(row[d.column], d.truncate)), rows: [] });
    }
    groups.get(key)!.rows.push(row);
  }

  const resultRows = Array.from(groups.values()).map((g) => {
    const metricValues = mets.map((m) => {
      if (isDurationMetric(m)) {
        const hours = g.rows
          .map((r) => {
            const start = r[m.startColumn];
            const end = r[m.endColumn];
            if (typeof start !== "string" || typeof end !== "string") return null;
            const startMs = new Date(start).getTime();
            const endMs = new Date(end).getTime();
            if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
            return (endMs - startMs) / (1000 * 60 * 60);
          })
          .filter((v): v is number => v !== null);
        if (m.agg === "duration_hours_sum") return hours.reduce((s, v) => s + v, 0);
        if (m.agg === "duration_hours_avg") return hours.length ? hours.reduce((s, v) => s + v, 0) / hours.length : 0;
        return null;
      }
      const values = g.rows.map((r) => Number(r[m.column])).filter((v) => !Number.isNaN(v));
      if (m.agg === "count") return g.rows.length;
      if (m.agg === "sum") return values.reduce((s, v) => s + v, 0);
      if (m.agg === "avg") return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      return null;
    });
    return { dimensions: g.dimensionValues, metrics: metricValues };
  });

  // Resolve any dimension that's a raw foreign id (e.g. course_id)
  // into a human label via a small separate lookup query, one batch
  // per lookup-bearing dimension rather than N+1 per row.
  for (let i = 0; i < dims.length; i++) {
    const lookup = dims[i].lookup;
    if (!lookup) continue;
    const ids = Array.from(new Set(resultRows.map((r) => r.dimensions[i]).filter((v): v is string => typeof v === "string" && v !== "—")));
    if (ids.length === 0) continue;
    const { data: lookupRows } = await supabase.from(lookup.table).select(["id", ...lookup.labelColumns].join(",")).in("id", ids);
    const labelById = new Map(
      ((lookupRows ?? []) as unknown as Record<string, unknown>[]).map((r) => [
        String(r.id),
        lookup.labelColumns.map((c) => r[c]).filter(Boolean).join(" "),
      ])
    );
    for (const row of resultRows) {
      const rawId = row.dimensions[i];
      if (typeof rawId === "string" && labelById.has(rawId)) row.dimensions[i] = labelById.get(rawId);
    }
  }

  return {
    module: mod,
    dimension_labels: dims.map((d) => d.label),
    metric_labels: mets.map((m) => m.label),
    rows: resultRows,
    row_count: data?.length ?? 0,
  };
}

export function reportResultToCsv(result: Extract<RunReportResult, { row_count: number }>): string {
  const header = [...result.dimension_labels, ...result.metric_labels].map(csvEscape).join(",");
  const lines = result.rows.map((r) => [...r.dimensions, ...r.metrics].map(csvEscape).join(","));
  return [header, ...lines].join("\n");
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
