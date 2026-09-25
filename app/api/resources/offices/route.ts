import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";

// Offices the user can add assets to: all (Admin / IT) or their assigned office.
export async function GET() {
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let q = supabase.from("b2s_offices").select("id, field_office, state").eq("is_active", true).order("field_office");
  if (!me.canManage) q = q.eq("id", me.assignedOfficeId ?? "00000000-0000-0000-0000-000000000000");
  const { data } = await q;
  return NextResponse.json({ offices: data ?? [], canManage: me.canManage });
}
