import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EmployeesListClient from "./EmployeesListClient";

export default async function EmployeesListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  const [{ data: employees }, { data: offices }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, email, role, is_active, assigned_office_id")
      .order("last_name", { ascending: true }),
    supabase.from("b2s_offices").select("id, field_office").order("field_office"),
  ]);

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Employees
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Every employee who has signed in at least once — new employees are added automatically the first time
        they sign in with Microsoft, matched against an AD Mapping.
      </p>
      <EmployeesListClient employees={employees ?? []} offices={offices ?? []} />
    </div>
  );
}
