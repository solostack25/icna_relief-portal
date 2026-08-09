import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { graphGetAll } from "@/lib/msgraph";

// Runs right after a successful AD SSO login. If this person already
// has an employees row, does nothing. If not, checks their AD group
// memberships against ad_role_mappings — only creates a portal
// account if a mapped group actually applies. No mapped group means
// no automatic account, even though they authenticated successfully;
// an admin has to grant access deliberately in that case.
//
// Mappings are checked highest-priority first (see `priority` column)
// so someone in multiple AD groups gets provisioned with their most
// privileged matching role, not an arbitrary one.
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "No authenticated user" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ ok: true, status: "already_provisioned" });
  }

  const admin = createAdminClient();
  const email = user.email.toLowerCase();

  // Highest priority first, so a more-privileged group (e.g. Admin)
  // wins over a lower-privileged one (e.g. InKind Staff) when someone
  // belongs to multiple mapped AD groups. Previously this had no
  // ordering and effectively picked whichever mapping row Postgres
  // happened to return first.
  const { data: mappings } = await admin
    .from("ad_role_mappings")
    .select("*")
    .order("priority", { ascending: false });

  let matched: any = null;

  for (const mapping of mappings ?? []) {
    let members: any[];
    try {
      members = await graphGetAll(`/v1.0/groups/${mapping.ad_group_id}/members`);
    } catch {
      continue;
    }
    const member = members.find(
      (m) => (m.mail || m.userPrincipalName || "").toLowerCase() === email
    );
    if (member) {
      matched = { mapping, adUser: member };
      break; // first matching group wins for initial provisioning
    }
  }

  if (!matched) {
    return NextResponse.json({
      ok: true,
      status: "pending_admin_approval",
      message: "Authenticated via AD but not in any mapped group — an admin needs to grant access.",
    });
  }

  const nameParts = (matched.adUser.displayName ?? email).split(" ");
  const firstName = nameParts[0] ?? email;
  const lastName = nameParts.slice(1).join(" ") || "—";

  const { data: newEmployeeRaw, error } = await admin
    .from("employees")
    .insert({
      auth_user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      role: matched.mapping.portal_role,
      assigned_office_id: matched.mapping.assigned_office_id,
      assigned_region: matched.mapping.assigned_region,
      ad_object_id: matched.adUser.id,
    })
    .select("id")
    .single();

  const newEmployee = newEmployeeRaw as { id: string } | null;

  if (error || !newEmployee) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  for (const slug of matched.mapping.program_slugs ?? []) {
    await admin
      .from("employee_program_access")
      .insert({ employee_id: newEmployee.id, program_slug: slug });
  }

  await admin.from("ad_sync_log").insert({
    employee_id: newEmployee.id,
    field_changed: "provisioned",
    old_value: null,
    new_value: matched.mapping.portal_role,
    ad_group_id: matched.mapping.ad_group_id,
  });

  return NextResponse.json({ ok: true, status: "provisioned" });
}
