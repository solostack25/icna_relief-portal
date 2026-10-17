import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { pushConfigured } from "@/lib/push";
import PushCenter, { type PushEmployee, type PushHistoryRow, type PushOffice } from "./PushCenter";

// Notification Center: write a message and send it as a push notification
// to staff who turned notifications on in the portal app (phone home
// screen or browser). Admins only.
export default async function PushNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/admin");

  const admin = createAdminClient();
  const [{ data: offices }, { data: emps }, { data: subs }, { data: history }] = await Promise.all([
    admin.from("b2s_offices").select("id, field_office, region").eq("is_active", true).order("field_office"),
    admin.from("employees").select("id, first_name, last_name, role, assigned_office_id").eq("is_active", true).order("first_name"),
    admin.from("portal_push_subscriptions").select("employee_id"),
    admin
      .from("portal_push_messages")
      .select("id, title, body, url, audience_label, recipients, devices, delivered, failed, created_at, sent_by")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const devicesByEmployee = new Map<string, number>();
  (subs ?? []).forEach((s: { employee_id: string }) =>
    devicesByEmployee.set(s.employee_id, (devicesByEmployee.get(s.employee_id) ?? 0) + 1)
  );
  const nameById = new Map<string, string>();
  const employees: PushEmployee[] = (emps ?? []).map((e: { id: string; first_name: string | null; last_name: string | null; role: string | null; assigned_office_id: string | null }) => {
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unnamed";
    nameById.set(e.id, name);
    return { id: e.id, name, role: e.role ?? "", officeId: e.assigned_office_id, devices: devicesByEmployee.get(e.id) ?? 0 };
  });

  const historyRows: PushHistoryRow[] = (history ?? []).map((h: Record<string, unknown>) => ({
    id: h.id as string,
    title: h.title as string,
    body: h.body as string,
    url: (h.url as string) ?? null,
    audienceLabel: h.audience_label as string,
    recipients: h.recipients as number,
    devices: h.devices as number,
    delivered: h.delivered as number,
    failed: h.failed as number,
    createdAt: h.created_at as string,
    sentBy: h.sent_by ? nameById.get(h.sent_by as string) ?? null : null,
  }));

  const officeList: PushOffice[] = (offices ?? []).map((o: { id: string; field_office: string | null; region: string | null }) => ({
    id: o.id,
    name: o.field_office ?? "Office",
    region: o.region,
  }));

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Notification Center
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Send a push notification to staff phones. People get it if they turned on notifications in the portal app
        (home-screen app on iPhone, or the app / Chrome on Android).
      </p>
      <PushCenter
        configured={pushConfigured()}
        offices={officeList}
        employees={employees}
        history={historyRows}
        totalDevices={(subs ?? []).length}
      />
    </div>
  );
}
