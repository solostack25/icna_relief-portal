import { createAdminClient } from "@/lib/supabase/server";
import { getThreeCxConfig } from "@/lib/threecx";
import { listQueues, listReceptionists, listRingGroups, listUsers } from "@/lib/threecxAdmin";
import { errorMessage } from "@/lib/phonesAdmin";
import NotConnected from "../NotConnected";
import ExtensionsClient from "./ExtensionsClient";

export const dynamic = "force-dynamic";

export default async function PhonesExtensionsPage() {
  if (!(await getThreeCxConfig())) return <NotConnected />;
  const admin = createAdminClient();
  const [users, queues, groups, menus, emps] = await Promise.allSettled([
    listUsers(),
    listQueues(),
    listRingGroups(),
    listReceptionists(),
    admin.from("employees").select("id, first_name, last_name, email, threecx_extension").eq("is_active", true).order("first_name"),
  ]);
  const v = <T,>(r: PromiseSettledResult<T>, f: T) => (r.status === "fulfilled" ? r.value : f);
  const employees = (v(emps, { data: [] } as unknown as { data: { id: string; first_name: string; last_name: string; email: string; threecx_extension: string | null }[] }).data ?? []) as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    threecx_extension: string | null;
  }[];
  return (
    <ExtensionsClient
      users={v(users, [])}
      error={users.status === "rejected" ? errorMessage(users.reason) : null}
      employees={employees}
      destOptions={[
        ...v(users, []).map((u) => ({ number: u.Number, label: [u.FirstName, u.LastName].filter(Boolean).join(" ") || u.Number, kind: "Extension" as const })),
        ...v(queues, []).map((q) => ({ number: q.Number, label: q.Name, kind: "Queue" as const })),
        ...v(groups, []).map((g) => ({ number: g.Number, label: g.Name, kind: "RingGroup" as const })),
        ...v(menus, []).map((m) => ({ number: m.Number, label: m.Name, kind: "IVR" as const })),
      ]}
    />
  );
}
