import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, loadOffices } from "@/lib/grantManagement/server";
import { loadLibrary } from "@/lib/grantManagement/library";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { PageTitle } from "@/components/grantManagement/ui";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const viewer = (await getGmViewer())!;
  if (!viewer.isManager) redirect("/grant-management");
  const admin = createAdminClient();
  const [{ data: roles }, { data: emps }, offices, library, keyCreated] = await Promise.all([
    admin.from("gm_user_roles").select("employee_id, role, office_ids, is_active").eq("is_active", true),
    admin.from("employees").select("id, first_name, last_name, email, role, assigned_office_id, is_active").eq("is_active", true).order("first_name"),
    loadOffices(admin),
    loadLibrary(true),
    getIntegrationSetting("grant_management_api_key_created"),
  ]);
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]));
  const portalAdmins = (emps ?? []).filter((e) => e.role === "admin").map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, email: e.email }));

  return (
    <div>
      <PageTitle eyebrow="Grant Management" title="Settings" />
      <SettingsClient
        isAdmin={viewer.isAdmin}
        people={(roles ?? [])
          .filter((r) => empMap.has(r.employee_id))
          .map((r) => {
            const e = empMap.get(r.employee_id)!;
            return { employee_id: r.employee_id, name: `${e.first_name} ${e.last_name}`, email: e.email, role: r.role, office_ids: r.office_ids ?? [] };
          })
          .sort((a, b) => a.name.localeCompare(b.name))}
        portalAdmins={portalAdmins}
        employees={(emps ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, email: e.email, assigned_office_id: e.assigned_office_id }))}
        offices={offices.map((o) => ({ id: o.id, name: o.field_office, region: o.region }))}
        library={library}
        apiKeyCreated={keyCreated}
      />
    </div>
  );
}
