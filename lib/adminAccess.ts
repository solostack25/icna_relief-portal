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
  canZakatFinance: boolean;
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
  // Area managers get the office dashboard for their one assigned
  // office; this is a real portal_role from AD (see ad_role_mappings),
  // not just "has an office" - regular staff assigned to an office
  // don't get manager-level access to it.
  const hasOfficeInfo = isAdmin || (role === "area_manager" && !!assignedOfficeId);
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

  // Marketing suite (Contacts, Segments, Donor Calling, Email/SMS
  // Campaigns, Sequences) used to be a selective grant like InKind/
  // Fliers above, but donor calling specifically is routine work every
  // office does - rather than split it out from the rest of the suite
  // it shares an access gate with, the whole thing is now baseline
  // access for any employee (see lib/marketingContactsAccess.ts).
  const canManageMarketing = true;

  const { data: employeeRow } = isAdmin
    ? { data: null }
    : await supabase.from("employees").select("is_zakat_finance").eq("id", employeeId).maybeSingle();
  const canZakatFinance = isAdmin || !!employeeRow?.is_zakat_finance;

  return {
    isAdmin,
    canManageTickets,
    canManageFinance,
    canInkind,
    canManageFliers,
    canManageMarketing,
    canReview,
    canZakatFinance,
    hasOfficeInfo,
    hasAnyAccess:
      isAdmin ||
      canManageTickets ||
      canManageFinance ||
      canInkind ||
      canManageFliers ||
      canManageMarketing ||
      canReview ||
      canZakatFinance ||
      hasOfficeInfo,
  };
}
