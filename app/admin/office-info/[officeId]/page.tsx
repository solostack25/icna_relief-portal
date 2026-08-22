import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OfficeInfoEditorClient from "./OfficeInfoEditorClient";

export default async function OfficeInfoEditorPage({ params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) redirect("/select-app");
  // Belt-and-suspenders — RLS already blocks a staff member's writes to
  // another office, but bounce them out of the editor UI entirely rather
  // than let them stare at a save that silently does nothing.
  if (me.role !== "admin" && me.assigned_office_id !== officeId) redirect("/admin/office-info");

  const { data: office } = await supabase.from("b2s_offices").select("id, field_office").eq("id", officeId).single();
  if (!office) redirect("/admin/office-info");

  const [{ data: hoursRows }, { data: notesRows }] = await Promise.all([
    supabase.from("office_hours").select("day_of_week, open_time, close_time, is_closed").eq("office_id", officeId),
    supabase
      .from("office_info_notes")
      .select("id, label, content, sort_order")
      .eq("office_id", officeId)
      .order("sort_order", { ascending: true }),
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

      <OfficeInfoEditorClient officeId={office.id} initialHours={hoursRows ?? []} initialNotes={notesRows ?? []} />
    </div>
  );
}
