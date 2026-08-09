import { createAdminClient } from "@/lib/supabase/server";
import { graphGetAll } from "@/lib/msgraph";
import type { User } from "@supabase/supabase-js";

// Core of first-login provisioning, factored out so it can be called
// directly (in-process) from app/auth/callback/route.ts right after
// exchangeCodeForSession, instead of via a self-fetch to
// /api/auth/provision. A self-fetch is a brand-new HTTP request and
// does NOT carry the session cookie that exchangeCodeForSession just
// set on the outgoing response — that was silently making every
// first-login provisioning attempt fail with "no authenticated user",
// masked until now by the auth bugs upstream of it.
//
// app/api/auth/provision/route.ts still exists as a thin wrapper
// around this, for manually re-triggering provisioning from a
// browser session (e.g. after fixing an AD mapping).
export async function provisionEmployee(user: User) {
  if (!user.email) {
    return { ok: false as const, status: "error" as const, message: "User has no email" };
  }

  const admin = createAdminClient();
  const email = user.email.toLowerCase();

  const { data: existing } = await admin
    .from("employees")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (existing) {
    return { ok: true as const, status: "already_provisioned" as const };
  }

  // Highest priority first, so a more-privileged group (e.g. Admin)
  // wins over a lower-privileged one (e.g. InKind Staff) when someone
  // belongs to multiple mapped AD groups.
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
      break;
    }
  }

  if (!matched) {
    return {
      ok: true as const,
      status: "pending_admin_approval" as const,
      message: "Authenticated via AD but not in any mapped group — an admin needs to grant access.",
    };
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
    return { ok: false as const, status: "error" as const, message: error?.message };
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

  return { ok: true as const, status: "provisioned" as const };
}
