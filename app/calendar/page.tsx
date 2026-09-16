import { redirect } from "next/navigation";
import PortalHeader from "@/app/PortalHeader";
import { createClient } from "@/lib/supabase/server";
import CalendarClient from "./CalendarClient";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: employee } = await supabase
    .from("employees")
    .select("email, first_name")
    .eq("auth_user_id", user.id)
    .single();

  if (!employee?.email) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-dim)]">
          No employee record found for this account. Contact an admin.
        </p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle="Calendar" />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8">
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 26,
            margin: "0 0 4px",
          }}
        >
          Your Calendar
        </h1>
        <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.5)" }}>
          Pulled live from your Outlook/Teams calendar — {employee.first_name}'s meetings only.
        </p>
        <CalendarClient />
      </div>
    </main>
  );
}
