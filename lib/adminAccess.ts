import type { SupabaseClient } from "@supabase/supabase-js";
import { getManagedDepartments } from "@/lib/helpdesk";

export type AdminAccess = {
  isAdmin: boolean;
  canManageTickets: boolean;
  canManageFinance: boolean;
  canInkind: boolean;
  canManageFliers: boolean;
  canManageMarketing: boolean;
  canReview: boolean;
  hasOfficeInfo: boolean;
  hasAnyAccess: boolean;
};

// One place computing every access flag the Admin Portal's navigation
// needs - the sidebar needs the FULL set (not just "does this person
// have access to the page they're currently on") to know what else to
// show them, so this replaces what used to be duplicated ad hoc in
// every single admin page.
export async function getAdminAccess(
  supabase: SupabaseClient,
  employeeId: string,
  role: string,
  assignedOfficeId?: string | null
): Promise<AdminAccess> {
  const isAdmin = role === "admin";
  // Admins manage every office's hours/info; staff manage only the one
  // office they're assigned to (RLS enforces the same boundary on the
  // office_hours/office_info_notes tables, this just controls nav
  // visibility) - so anyone with an assigned office gets the link too,
  // not just admins.
  const hasOfficeInfo = isAdmin || !!assignedOfficeId;
  const managedDepartments = await getManagedDepartments(supabase, employeeId, role);
  const canManageTickets = isAdmin || managedDepartments.length > 0;
  const canManageFinance = isAdmin || managedDepartments.includes("finance") || managedDepartments.includes("it");
  const canReview = isAdmin || role === "regional_director" || role === "program_director";

  const { data: inkindAccess } = isAdmin
    ? { data: null }
    : await supabase
        .from("employee_program_access")
        .select("program_slug")
        .eq("employee_id", employeeId)
        .eq("program_slug", "in-kind-donation")
        .maybeSingle();
  const canInkind = isAdmin || !!inkindAccess;

  const { data: flierAccess } = isAdmin
    ? { data: null }
    : await supabase
        .from("employee_program_access")
        .select("program_slug")
        .eq("employee_id", employeeId)
        .eq("program_slug", "flier-marketing")
        .maybeSingle();
  const canManageFliers = isAdmin || !!flierAccess;

  const { data: marketingAccess } = isAdmin
    ? { data: null }
    : await supabase
        .from("employee_program_access")
        .select("program_slug")
        .eq("employee_id", employeeId)
        .eq("program_slug", "marketing-contacts")
        .maybeSingle();
  const canManageMarketing = isAdmin || !!marketingAccess;

  return {
    isAdmin,
    canManageTickets,
    canManageFinance,
    canInkind,
    canManageFliers,
    canManageMarketing,
    canReview,
    hasOfficeInfo,
    hasAnyAccess:
      isAdmin ||
      canManageTickets ||
      canManageFinance ||
      canInkind ||
      canManageFliers ||
      canManageMarketing ||
      canReview ||
      hasOfficeInfo,
  };
}
