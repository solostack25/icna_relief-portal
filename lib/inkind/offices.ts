import { createAdminClient, createClient } from "@/lib/supabase/server";

// Server-only helpers for which office an in-kind intake belongs to.
//
// The scanning station can run signed out (a shared kiosk) or signed in.
//   signed-in staff  → always their own assigned office
//   admins           → whichever office they pick
//   signed out       → the office the device was set to (sent by the page)

export type InkindOffice = {
  id: string;
  name: string; // "Houston" — field office without " Office"
  fieldOffice: string;
  state: string;
  inkindPrefix: string;
  cashPrefix: string;
};

export function shortOfficeName(fieldOffice: string) {
  return fieldOffice.replace(/( Office|-Statewide| - Statewide)$/, "");
}

export async function getKioskViewer(): Promise<{ signedIn: boolean; isAdmin: boolean; assignedOfficeId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, isAdmin: false, assignedOfficeId: null };
  const { data: me } = await supabase.from("employees").select("role, assigned_office_id").eq("auth_user_id", user.id).maybeSingle();
  return { signedIn: true, isAdmin: me?.role === "admin", assignedOfficeId: me?.assigned_office_id ?? null };
}

export async function listInkindOffices(): Promise<InkindOffice[]> {
  const admin = createAdminClient();
  const [{ data: offices }, { data: settings }] = await Promise.all([
    admin.from("b2s_offices").select("id, field_office, state, is_active").eq("is_active", true).order("field_office"),
    admin.from("office_settings").select("office_id, inkind_prefix, cash_prefix"),
  ]);
  const byOffice = new Map(((settings ?? []) as { office_id: string; inkind_prefix: string; cash_prefix: string }[]).map((s) => [s.office_id, s]));
  return ((offices ?? []) as { id: string; field_office: string; state: string }[])
    .filter((o) => o.state !== "HQ" && byOffice.has(o.id))
    .map((o) => ({
      id: o.id,
      name: shortOfficeName(o.field_office),
      fieldOffice: o.field_office,
      state: o.state,
      inkindPrefix: byOffice.get(o.id)!.inkind_prefix,
      cashPrefix: byOffice.get(o.id)!.cash_prefix,
    }));
}

// Decide the office for a new intake. Signed-in non-admins can't pick
// another office; everyone else must send a valid office id.
export async function resolveIntakeOffice(requestedOfficeId: string | null | undefined): Promise<{ office: InkindOffice | null; error?: string }> {
  const viewer = await getKioskViewer();
  const offices = await listInkindOffices();
  const wanted = viewer.signedIn && !viewer.isAdmin ? viewer.assignedOfficeId : requestedOfficeId;
  if (!wanted) {
    return {
      office: null,
      error: viewer.signedIn && !viewer.isAdmin ? "Your account has no assigned office." : "Choose this station's office first.",
    };
  }
  const office = offices.find((o) => o.id === wanted) ?? null;
  return office ? { office } : { office: null, error: "That office isn't set up for in-kind intake." };
}
