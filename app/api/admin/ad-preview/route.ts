import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { graphGetAll } from "@/lib/msgraph";

// Read-only preview of who WOULD get provisioned, and with what
// role/office/program access, without touching auth.users or employees
// at all. Mirrors provisionEmployee.ts's exact matching logic (highest
// priority mapping wins) so what this shows is a true preview, not an
// approximation that could drift from what actually happens on login.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: mappings } = await admin
    .from("ad_role_mappings")
    .select("*")
    .order("priority", { ascending: false });

  const { data: existingEmployees } = await admin
    .from("employees")
    .select("email, role, auth_user_id, assigned_office_id, assigned_region");

  type EmployeeRow = {
    email: string;
    role: string;
    auth_user_id: string | null;
    assigned_office_id: string | null;
    assigned_region: string | null;
  };

  const existingByEmail = new Map(
    ((existingEmployees ?? []) as EmployeeRow[]).map((e) => [e.email.toLowerCase(), e])
  );

  // email -> the highest-priority mapping/AD user that would win for
  // them, same "first match wins" order provisionEmployee.ts uses.
  const resolved = new Map<
    string,
    { mapping: any; adUser: any }
  >();

  const groupErrors: { ad_group_name: string; ad_group_id: string; error: string }[] = [];

  for (const mapping of mappings ?? []) {
    let members: any[];
    try {
      members = await graphGetAll(`/v1.0/groups/${mapping.ad_group_id}/members`);
    } catch (err) {
      groupErrors.push({
        ad_group_name: mapping.ad_group_name,
        ad_group_id: mapping.ad_group_id,
        error: err instanceof Error ? err.message : "Unknown Graph API error",
      });
      continue;
    }

    for (const m of members) {
      const email = (m.mail || m.userPrincipalName || "").toLowerCase();
      if (!email) continue;
      // Already matched by a higher-priority mapping — don't overwrite.
      if (resolved.has(email)) continue;
      resolved.set(email, { mapping, adUser: m });
    }
  }

  const rows = Array.from(resolved.entries()).map(([email, { mapping, adUser }]) => {
    const existing = existingByEmail.get(email);
    let status: "already_provisioned" | "would_provision" | "role_would_change";

    if (existing?.auth_user_id) {
      const roleMatches = existing.role === mapping.portal_role;
      const officeMatches = existing.assigned_office_id === mapping.assigned_office_id;
      const regionMatches = existing.assigned_region === mapping.assigned_region;
      status = roleMatches && officeMatches && regionMatches ? "already_provisioned" : "role_would_change";
    } else {
      status = "would_provision";
    }

    return {
      email,
      displayName: adUser.displayName ?? email,
      matchedGroup: mapping.ad_group_name,
      wouldBeRole: mapping.portal_role,
      wouldBeOfficeId: mapping.assigned_office_id,
      wouldBeRegion: mapping.assigned_region,
      programSlugs: mapping.program_slugs ?? [],
      status,
      currentRole: existing?.role ?? null,
    };
  });

  // Employees who exist in the portal but aren't covered by ANY current
  // mapping — worth surfacing separately since it's a different problem
  // (no mapping exists for them at all, not just "hasn't logged in yet").
  const unmappedExisting = ((existingEmployees ?? []) as EmployeeRow[])
    .filter((e) => !resolved.has(e.email.toLowerCase()))
    .map((e) => ({ email: e.email, currentRole: e.role }));

  return NextResponse.json({
    rows: rows.sort((a, b) => a.email.localeCompare(b.email)),
    unmappedExisting,
    groupErrors,
    mappingCount: mappings?.length ?? 0,
  });
}
