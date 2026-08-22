import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/adminAccess";
import PortalHeader from "@/app/PortalHeader";
import AdminSidebar from "./AdminSidebar";

// Wraps every /admin/* page - the sidebar persists across navigation
// within this tree instead of each page rendering its own header and
// "back to admin" link independently. Tools that live at their own
// top-level URLs (Manage Tickets, InKind Admin, Flier Builder,
// Workboards) are still linked FROM this sidebar, but navigating to one
// leaves this persistent layout since Next.js layouts only wrap their
// own route segment - retrofitting those into a fully unified shell is
// a separate, larger job left for later.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const access = await getAdminAccess(supabase, me.id, me.role, me.assigned_office_id);
  if (!access.hasAnyAccess) redirect("/select-app");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-[1800px] mx-auto px-4 sm:px-10 py-8 sm:py-10 flex flex-col md:flex-row gap-4 md:gap-8 items-start">
        <AdminSidebar access={access} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </main>
  );
}
