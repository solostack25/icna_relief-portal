import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { graphGetAll, graphGet } from "@/lib/msgraph";

// Runs the AD → portal role sync. Reads ad_role_mappings to know
// which AD Security Groups matter and what each grants — never
// infers anything from job title text. Every change is logged to
// ad_sync_log.
//
// GET  — called by Vercel Cron (see vercel.json). Vercel auto-adds
//        an `Authorization: Bearer $CRON_SECRET` header when
//        CRON_SECRET is set as an env var, which is what's checked
//        here.
// POST — manual trigger from the admin UI, requires an admin session.
async function runSync() {
  const admin = createAdminClient();

  const { data: mappings, error: mappingsError } = await admin
    .from("ad_role_mappings")
    .select("*");

  if (mappingsError) {
    return { status: 500, body: { error: mappingsError.message } };
  }

  const changes: any[] = [];
  const errors: any[] = [];

  // desired[email] accumulates what every matching group says this
  // person should have, so someone in multiple mapped groups gets
  // the union of program access (role/office/region: last group wins,
  // logged either way so it's visible)
  const desired: Record<
    string,
    {
      role: string;
      officeId: string | null;
      region: string | null;
      programSlugs: Set<string>;
      groupIds: string[];
      adObjectId: string;
    }
  > = {};

  for (const mapping of mappings ?? []) {
    let members: any[];
    try {
      members = await graphGetAll(`/v1.0/groups/${mapping.ad_group_id}/members`);
    } catch (e: any) {
      errors.push({ group: mapping.ad_group_name, error: e.message });
      continue;
    }

    for (const member of members) {
      const email = (member.mail || member.userPrincipalName || "").toLowerCase();
      if (!email) continue;

      if (!desired[email]) {
        desired[email] = {
          role: mapping.portal_role,
          officeId: mapping.assigned_office_id,
          region: mapping.assigned_region,
          programSlugs: new Set(mapping.program_slugs ?? []),
          groupIds: [],
          adObjectId: member.id,
        };
      } else {
        desired[email].role = mapping.portal_role;
        desired[email].officeId = mapping.assigned_office_id;
        desired[email].region = mapping.assigned_region;
        for (const slug of mapping.program_slugs ?? []) desired[email].programSlugs.add(slug);
      }
      desired[email].groupIds.push(mapping.ad_group_id);
    }
  }

  // apply to matching employees rows
  for (const [email, want] of Object.entries(desired)) {
    const { data: employeeRaw } = await admin
      .from("employees")
      .select("id, role, assigned_office_id, assigned_region")
      .eq("email", email)
      .single();

    const employee = employeeRaw as {
      id: string;
      role: string;
      assigned_office_id: string | null;
      assigned_region: string | null;
    } | null;

    if (!employee) continue; // no portal account yet — provisioned at first login instead

    const updates: Record<string, any> = {};
    if (employee.role !== want.role) {
      changes.push({ employee_id: employee.id, field_changed: "role", old_value: employee.role, new_value: want.role, ad_group_id: want.groupIds[0] });
      updates.role = want.role;
    }
    if (employee.assigned_office_id !== want.officeId) {
      changes.push({ employee_id: employee.id, field_changed: "assigned_office_id", old_value: employee.assigned_office_id, new_value: want.officeId, ad_group_id: want.groupIds[0] });
      updates.assigned_office_id = want.officeId;
    }
    if (employee.assigned_region !== want.region) {
      changes.push({ employee_id: employee.id, field_changed: "assigned_region", old_value: employee.assigned_region, new_value: want.region, ad_group_id: want.groupIds[0] });
      updates.assigned_region = want.region;
    }

    if (Object.keys(updates).length > 0) {
      await admin.from("employees").update(updates).eq("id", employee.id);
    }

    // reconcile program access to match the union of mapped groups
    const { data: currentAccess } = await admin
      .from("employee_program_access")
      .select("program_slug")
      .eq("employee_id", employee.id);
    const currentSlugs = new Set<string>(
      ((currentAccess ?? []) as { program_slug: string }[]).map((a) => a.program_slug)
    );

    for (const slug of want.programSlugs) {
      if (!currentSlugs.has(slug)) {
        await admin.from("employee_program_access").insert({ employee_id: employee.id, program_slug: slug });
        changes.push({ employee_id: employee.id, field_changed: "program_access_added", old_value: null, new_value: slug, ad_group_id: want.groupIds[0] });
      }
    }
    for (const slug of currentSlugs) {
      if (!want.programSlugs.has(slug)) {
        await admin.from("employee_program_access").delete().eq("employee_id", employee.id).eq("program_slug", slug);
        changes.push({ employee_id: employee.id, field_changed: "program_access_removed", old_value: slug, new_value: null, ad_group_id: want.groupIds[0] });
      }
    }

    // informational fields — use the real AD object ID, not the portal row id
    try {
      const adUser = await graphGet(`/v1.0/users/${want.adObjectId}?$select=jobTitle`);
      let managerEmail: string | null = null;
      try {
        const manager = await graphGet(`/v1.0/users/${want.adObjectId}/manager?$select=mail`);
        managerEmail = manager.mail ?? null;
      } catch {
        // no manager set — fine
      }
      await admin
        .from("employees")
        .update({
          job_title: adUser.jobTitle ?? null,
          manager_email: managerEmail,
          ad_object_id: want.adObjectId,
          ad_synced_at: new Date().toISOString(),
        })
        .eq("id", employee.id);
    } catch {
      // profile lookup failed — role/access sync above still succeeded, not fatal
    }
  }

  if (changes.length > 0) {
    await admin.from("ad_sync_log").insert(changes);
  }

  return {
    status: 200,
    body: {
      ok: true,
      employeesUpdated: Object.keys(desired).length,
      changesLogged: changes.length,
      errors,
    },
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSync();
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runSync();
  return NextResponse.json(result.body, { status: result.status });
}
