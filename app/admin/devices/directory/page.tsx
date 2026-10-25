import { createAdminClient } from "@/lib/supabase/server";
import { suggestOffice, type OfficeLite } from "@/lib/directory/suggestOffice";
import { dim } from "../style";
import DirectoryClient, { type DirRow, type OfficeOpt } from "./DirectoryClient";

export const dynamic = "force-dynamic";

// Directory cleanup: give every staff account an office, and switch off the
// guest accounts Teams/SharePoint sharing leaves behind.
export default async function DirectoryCleanupPage() {
  const admin = createAdminClient();
  const raw: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("it_directory_users")
      .select(
        "entra_user_id, upn, mail, display_name, account_enabled, user_type, sku_ids, last_sign_in, office_location, department, job_title, state, city, street_address, postal_code, company_name, created_at_entra, employee_id"
      )
      .range(from, from + 999);
    raw.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const { data: officesRaw } = await admin
    .from("b2s_offices")
    .select("id, field_office, state, region, entra_office_names, is_active")
    .order("field_office");
  const offices = ((officesRaw ?? []) as (OfficeLite & { region: string | null; is_active: boolean | null })[]).filter((o) => o.is_active !== false);

  const officeByName = new Map<string, string>();
  for (const o of offices) for (const n of [o.field_office, ...(o.entra_office_names ?? [])]) officeByName.set(n.trim().toLowerCase(), o.id);

  const rows: DirRow[] = raw.map((u) => {
    const isGuest = u.user_type === "Guest" || /#EXT#/i.test(u.upn ?? "");
    const matchedOfficeId = u.office_location ? officeByName.get(String(u.office_location).trim().toLowerCase()) ?? null : null;
    return {
      id: u.entra_user_id,
      name: u.display_name,
      upn: u.upn,
      mail: u.mail,
      enabled: u.account_enabled !== false,
      guest: isGuest,
      licensed: (u.sku_ids ?? []).length > 0,
      lastSignIn: u.last_sign_in,
      created: u.created_at_entra,
      officeLocation: u.office_location,
      matchedOfficeId,
      department: u.department,
      jobTitle: u.job_title,
      state: u.state,
      city: u.city,
      address: [u.street_address, u.postal_code].filter(Boolean).join(" ") || null,
      company: u.company_name,
      linked: !!u.employee_id,
      suggestion: isGuest || matchedOfficeId ? null : suggestOffice(u, offices),
    };
  });

  const opts: OfficeOpt[] = offices.map((o) => ({ id: o.id, name: o.field_office, state: o.state, region: o.region }));
  const hasLocationFields = raw.some((u) => u.state || u.city || u.street_address);

  return (
    <div className="max-w-6xl">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Directory cleanup</h1>
      <p className="text-sm mt-1 mb-5 max-w-3xl" style={{ color: dim }}>
        Give every staff account an office so it shows up on the right office&apos;s Employees page, and switch off guest accounts left behind by Teams and SharePoint sharing.
        Assigning sets the person&apos;s <b>Office Location</b> in Entra. Disabling a guest stops them signing in and can be undone here.
      </p>
      {!hasLocationFields && (
        <p className="text-sm mb-5 rounded-lg px-4 py-3" style={{ background: "#FEF3C7", color: "#92400E" }}>
          State, city and address from Entra arrive with the next device sync. Run a sync from the Devices tab to see them.
        </p>
      )}
      <DirectoryClient rows={rows} offices={opts} />
    </div>
  );
}
