import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/adminAccess";

export type SpeakerViewer = {
  employeeId: string;
  email: string;
  name: string;
  role: string;
  assignedOfficeId: string | null;
  assignedRegion: string | null;
  isAdmin: boolean;
  canManageFinance: boolean;
};

export async function getSpeakerViewer(): Promise<SpeakerViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: me } = await admin
    .from("employees")
    .select("id, email, first_name, last_name, role, assigned_office_id, assigned_region")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return null;
  const access = await getAdminAccess(supabase, me.id, me.role, me.assigned_office_id);
  return {
    employeeId: me.id,
    email: me.email ?? user.email ?? "",
    name: `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() || me.email || "",
    role: me.role,
    assignedOfficeId: me.assigned_office_id,
    assignedRegion: me.assigned_region,
    isAdmin: access.isAdmin,
    canManageFinance: access.canManageFinance,
  };
}

// Escape LIKE wildcards so an email containing "_" or "%" can only
// match itself in a case-insensitive .ilike() comparison.
export function escapeLike(s: string) {
  return s.trim().replace(/[\\%_]/g, (c) => "\\" + c);
}

// Coordinator, the AM on the request, anyone with an approval step on
// it, admins, and Finance can see a request.
export async function canViewRequest(
  viewer: SpeakerViewer,
  request: { id: string; coordinator_id: string | null; area_manager_email: string; finance_ticket_id?: string | null }
) {
  if (viewer.isAdmin || viewer.canManageFinance) return true;
  if (request.coordinator_id === viewer.employeeId) return true;
  const email = viewer.email.toLowerCase();
  if (request.area_manager_email.toLowerCase() === email) return true;
  const admin = createAdminClient();
  const { data } = await admin.from("speaker_request_approvals").select("id").eq("request_id", request.id).ilike("approver_email", escapeLike(email)).limit(1);
  if ((data ?? []).length > 0) return true;
  // People in the generated finance ticket's approval chain (e.g. the
  // coordinator's manager) need to see what they're approving.
  if (request.finance_ticket_id) {
    const pattern = escapeLike(email);
    const [{ data: a1 }, { data: a2 }] = await Promise.all([
      admin.from("finance_approvals").select("id").eq("finance_ticket_id", request.finance_ticket_id).ilike("approver_email", pattern).limit(1),
      admin.from("finance_approvals").select("id").eq("finance_ticket_id", request.finance_ticket_id).ilike("chain_person_email", pattern).limit(1),
    ]);
    const fa = [...(a1 ?? []), ...(a2 ?? [])];
    if (fa.length > 0) return true;
  }
  return false;
}
