import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OfficeInfoEditorClient from "./OfficeInfoEditorClient";
import OfficeDashboardStats from "./OfficeDashboardStats";
import OfficeUtilityBills from "./OfficeUtilityBills";
import WebsiteListingEditor, { type WebsiteListing } from "./WebsiteListingEditor";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

export default async function OfficeInfoEditorPage({ params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) redirect("/select-app");
  // Belt-and-suspenders — RLS already blocks a non-area-manager's writes
  // to any office, but bounce them out of the editor UI entirely rather
  // than let them stare at a save that silently does nothing.
  if (me.role !== "admin" && (me.role !== "area_manager" || me.assigned_office_id !== officeId)) redirect("/admin/office-info");

  const { data: office } = await supabase.from("b2s_offices").select("id, field_office").eq("id", officeId).single();
  if (!office) redirect("/admin/office-info");

  const [{ data: hoursRows }, { data: notesRows }, { data: listing }] = await Promise.all([
    supabase.from("office_hours").select("day_of_week, open_time, close_time, is_closed").eq("office_id", officeId),
    supabase
      .from("office_info_notes")
      .select("id, label, content, sort_order")
      .eq("office_id", officeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("web_office_listings")
      .select("is_public, display_name, kind, address1, address2, city, state, zip, phone, email, services, public_note, geo_source")
      .eq("office_id", officeId)
      .maybeSingle(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>
          {office.field_office}
        </h1>
        {me.role === "admin" && (
          <Link href="/admin/office-info" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← All Offices
          </Link>
        )}
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Shortcode for this office&apos;s site: <code>[icna_office_info office_id=&quot;{office.id}&quot;]</code>
      </p>

      {office.id === ORLANDO_OFFICE_ID && (
        // Orlando-only: the Houston_Automation duplicate lives inside the
        // portal and is launched from here (see lib/orlandoAutomation).
        <Link
          href="/orlando-automation"
          className="flex items-center justify-between mb-8 transition hover:shadow-md"
          style={{
            background: "#fff",
            border: "1px solid rgba(22,48,43,0.1)",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "#16302B" }}>Orlando Automation</div>
            <div className="text-sm" style={{ color: "rgba(22,48,43,0.55)" }}>
              Distributions, appointments &amp; check-in, clients, waitlist, broadcasts, campaigns, and stats
            </div>
          </div>
          <span className="text-sm font-medium" style={{ color: "var(--portal-emerald)" }}>
            Open →
          </span>
        </Link>
      )}

      <OfficeDashboardStats officeId={office.id} />

      <OfficeUtilityBills officeId={office.id} />

      <WebsiteListingEditor officeId={office.id} officeName={office.field_office} initial={(listing as WebsiteListing | null) ?? null} />

      <OfficeInfoEditorClient officeId={office.id} initialHours={hoursRows ?? []} initialNotes={notesRows ?? []} />
    </div>
  );
}
