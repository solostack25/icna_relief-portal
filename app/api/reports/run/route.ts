import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";
import { getReportModule, modulesForRole } from "@/lib/reports/registry";

type RunRequest = {
  module_slug: string;
  dimensions: string[];      // keys, must be in module.dimensions
  metrics: string[];         // keys, must be in module.metrics
  filters?: {
    date_from?: string;      // ISO date
    date_to?: string;        // ISO date
    office_id?: string;      // only honored for admins/regional directors picking a specific office
  };
};

export async function POST(req: Request) {
  const access = await getReportsAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });

  const body = (await req.json()) as RunRequest;
  const mod = getReportModule(body.module_slug);
  if (!mod) return NextResponse.json({ error: "Unknown report module" }, { status: 400 });

  const allowed = modulesForRole(access.role);
  if (!allowed.some((m) => m.slug === mod.slug)) {
    return NextResponse.json({ error: "You don't have access to this report module" }, { status: 403 });
  }

  // Whitelist check - only accept dimension/metric keys defined on this module.
  const dims = mod.dimensions.filter((d) => body.dimensions?.includes(d.key));
  const mets = mod.metrics.filter((m) => body.metrics?.includes(m.key));
  if (dims.length === 0 && mets.length === 0) {
    return NextResponse.json({ error: "Select at least one dimension or metric" }, { status: 400 });
  }
  if (body.dimensions?.some((k) => !dims.find((d) => d.key === k))) {
    return NextResponse.json({ error: "Invalid dimension selected" }, { status: 400 });
  }
  if (body.metrics?.some((k) => !mets.find((m) => m.key === k))) {
    return NextResponse.json({ error: "Invalid metric selected" }, { status: 400 });
  }

  const supabase = await createClient();

  // Figure out which office_ids this employee is even allowed to see,
  // before we touch the report table. Admin = no restriction.
  // Regional director = every office in their assigned_region.
  // Everyone else = only their own assigned office.
  let allowedOfficeIds: string[] | "all" = "all";
  if (!access.isAdmin) {
    if (access.role === "regional_director" && access.assignedRegion) {
      const { data: offices } = await supabase
        .from("b2s_offices")
        .select("id")
        .eq("region", access.assignedRegion);
      allowedOfficeIds = (offices ?? []).map((o) => o.id);
    } else {
      allowedOfficeIds = access.assignedOfficeId ? [access.assignedOfficeId] : [];
    }
    // An explicit office filter from the UI narrows further, but never
    // outside what this employee is already allowed to see.
    if (body.filters?.office_id) {
      allowedOfficeIds = allowedOfficeIds.includes(body.filters.office_id) ? [body.filters.office_id] : [];
    }
  } else if (body.filters?.office_id) {
    allowedOfficeIds = [body.filters.office_id];
  }

  if (allowedOfficeIds !== "all" && allowedOfficeIds.length === 0 && mod.scope.type !== "none") {
    return NextResponse.json({ dimensions: dims.map((d) => d.key), metrics: mets.map((m) => m.key), rows: [], row_count: 0 });
  }

  // For via_client modules, resolve which client_ids fall inside the
  // allowed offices first, since hp_intakes/th_intakes don't carry
  // office_id themselves (see reports_migration.sql note).
  let clientIdFilter: string[] | null = null;
  if (mod.scope.type === "via_client" && allowedOfficeIds !== "all") {
    const { data: clients } = await supabase.from("clients").select("id").in("office_id", allowedOfficeIds);
    clientIdFilter = (clients ?? []).map((c) => c.id);
    if (clientIdFilter.length === 0) {
      return NextResponse.json({ dimensions: dims.map((d) => d.key), metrics: mets.map((m) => m.key), rows: [], row_count: 0 });
    }
  }

  // Build the select list: every distinct source column we need,
  // from both dimensions and metrics, plus the date column for range
  // filtering.
  const columns = new Set<string>([mod.defaultDateColumn]);
  dims.forEach((d) => columns.add(d.column));
  mets.forEach((m) => columns.add(m.column));

  let query = supabase.from(mod.table).select(Array.from(columns).join(","));

  if (mod.scope.type === "direct" && allowedOfficeIds !== "all") {
    query = query.in(mod.scope.officeColumn, allowedOfficeIds);
  }
  if (mod.scope.type === "via_client" && clientIdFilter) {
    query = query.in(mod.scope.clientIdColumn, clientIdFilter);
  }
  if (body.filters?.date_from) query = query.gte(mod.defaultDateColumn, body.filters.date_from);
  if (body.filters?.date_to) query = query.lte(mod.defaultDateColumn, body.filters.date_to);

  const { data, error } = await query.limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group + aggregate in memory. Report volumes here (office/program
  // level intake data) are small enough that this is simpler and more
  // predictable than relying on PostgREST's aggregate-select syntax,
  // and it lets dimensions like "month" (a truncated date) work
  // without needing a SQL expression in the select string.
  const groupKey = (row: Record<string, unknown>) =>
    dims
      .map((d) => {
        const raw = row[d.column];
        if (d.truncate && typeof raw === "string") {
          const date = new Date(raw);
          if (Number.isNaN(date.getTime())) return "—";
          return d.truncate === "month"
            ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
            : date.toISOString().slice(0, 10);
        }
        return raw ?? "—";
      })
      .join(" | ");

  const groups = new Map<string, { dimensionValues: unknown[]; rows: Record<string, unknown>[] }>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = groupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        dimensionValues: dims.map((d) => {
          const raw = row[d.column];
          if (d.truncate && typeof raw === "string") {
            const date = new Date(raw);
            return d.truncate === "month"
              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
              : date.toISOString().slice(0, 10);
          }
          return raw ?? "—";
        }),
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }

  const resultRows = Array.from(groups.values()).map((g) => {
    const metricValues = mets.map((m) => {
      const values = g.rows.map((r) => Number(r[m.column])).filter((v) => !Number.isNaN(v));
      if (m.agg === "count") return g.rows.length;
      if (m.agg === "sum") return values.reduce((s, v) => s + v, 0);
      if (m.agg === "avg") return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      return null;
    });
    return { dimensions: g.dimensionValues, metrics: metricValues };
  });

  return NextResponse.json({
    dimension_labels: dims.map((d) => d.label),
    metric_labels: mets.map((m) => m.label),
    rows: resultRows,
    row_count: data?.length ?? 0,
  });
}
