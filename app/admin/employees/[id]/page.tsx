import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccessEditor from "./AccessEditor";
import OfficeAssignmentEditor from "./OfficeAssignmentEditor";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/select-app");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, role, is_active, auth_user_id, assigned_office_id, assigned_region")
    .eq("id", id)
    .single();

  if (!employee) redirect("/admin");

  // separate queries, merge in memory (no relational joins on this key format)
  const { data: allApps } = await supabase
    .from("app_registry")
    .select("slug, display_name")
    .eq("is_active", true)
    .order("sort_order");

  const { data: access } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employee.id);

  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, region, field_office, state")
    .eq("is_active", true)
    .order("region");

  const { data: regions } = await supabase
    .from("b2s_regions")
    .select("region, rsn")
    .order("rsn");

  const grantedSlugs = (access ?? []).map((a) => a.program_slug);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <Link
          href="/admin"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to employees
        </Link>

        <h1 className="text-xl font-semibold mt-4 mb-1">
          {employee.first_name} {employee.last_name}
        </h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          {employee.email}
        </p>

        <div className="space-y-8">
          <OfficeAssignmentEditor
            employeeId={employee.id}
            offices={offices ?? []}
            regions={regions ?? []}
            currentOfficeId={employee.assigned_office_id}
            currentRegion={employee.assigned_region}
            currentRole={employee.role}
          />

          <AccessEditor
            employeeId={employee.id}
            authUserId={employee.auth_user_id}
            allApps={allApps ?? []}
            grantedSlugs={grantedSlugs}
          />
        </div>
      </div>
    </main>
  );
}
