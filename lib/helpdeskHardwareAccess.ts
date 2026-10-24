// Who may act on a hardware ticket from the portal (server only).
// IT queue managers (and admins) manage it; the requester can view it
// and nudge the approvers.

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getManagedDepartments } from "@/lib/helpdesk";

export type HardwareViewer = {
  employeeId: string;
  email: string;
  isItManager: boolean;
  isRequester: boolean;
  leg: { id: string; request_id: string; department: string; status: string; hardware_gate: boolean; hardware_approval_status: string | null };
};

export async function hardwareViewer(legId: string): Promise<{ viewer: HardwareViewer } | { error: string; status: number }> {
  if (!legId || !/^[0-9a-f-]{36}$/i.test(legId)) return { error: "Pick a ticket.", status: 400 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  const { data: me } = await supabase.from("employees").select("id, role, email").eq("auth_user_id", user.id).maybeSingle();
  if (!me) return { error: "No employee record", status: 403 };

  const admin = createAdminClient();
  const { data: leg } = await admin
    .from("helpdesk_request_legs")
    .select("id, request_id, department, status, hardware_gate, hardware_approval_status")
    .eq("id", legId)
    .maybeSingle();
  if (!leg) return { error: "Ticket not found", status: 404 };
  const { data: request } = await admin.from("helpdesk_requests").select("submitted_by_email").eq("id", leg.request_id).maybeSingle();

  const managed = await getManagedDepartments(supabase, me.id, me.role);
  const isItManager = managed.includes("it");
  const isRequester = !!request && (request.submitted_by_email ?? "").toLowerCase() === (me.email ?? "").toLowerCase();
  if (!isItManager && !isRequester) return { error: "You don't have access to this ticket.", status: 403 };

  return { viewer: { employeeId: me.id, email: me.email, isItManager, isRequester, leg } };
}
