import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Admins see every office and pick one to edit. Staff have exactly one
// office they can touch (RLS enforces this anyway on save), so we skip
// the picker entirely and drop them straight into their own office's
// editor rather than showing a list of one.
export default async function OfficeInfoIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role, assigned_office_id").eq("auth_user_id", user.id).single();
  if (!me) redirect("/select-app");

  if (me.role !== "admin") {
    if (!me.assigned_office_id) redirect("/select-app");
    redirect(`/admin/office-info/${me.assigned_office_id}`);
  }

  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, state, is_active")
    .order("field_office", { ascending: true });

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Office Hours &amp; Info
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Pick an office to manage its hours and any custom categories (pantry, health clinic, holiday schedule,
        etc.). These publish live to that office&apos;s WordPress page via the <code>[icna_office_info]</code>{" "}
        shortcode — no deploy needed.
      </p>

      <div className="grid gap-2" style={{ maxWidth: 520 }}>
        {(offices ?? []).map((office) => (
          <Link
            key={office.id}
            href={`/admin/office-info/${office.id}`}
            className="flex items-center justify-between px-4 py-3 rounded-lg border transition"
            style={{
              borderColor: "rgba(22,48,43,0.1)",
              background: "#fff",
              opacity: office.is_active === false ? 0.5 : 1,
            }}
          >
            <span style={{ fontWeight: 600 }}>{office.field_office}</span>
            <span className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
              {office.state}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
