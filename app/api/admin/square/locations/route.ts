import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSquareAccessToken, isSquareConfigured, listSquareLocations } from "@/lib/square";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getSquareAccessToken();
  if (!isSquareConfigured(token)) return NextResponse.json({ error: "Square Access Token not set" }, { status: 400 });

  try {
    const locations = await listSquareLocations(token);
    const admin = createAdminClient();
    const { data: existingMap } = await admin.from("square_location_map").select("square_location_id, office_id");
    const officeByLocation = new Map((existingMap ?? []).map((m: { square_location_id: string; office_id: string | null }) => [m.square_location_id, m.office_id]));

    return NextResponse.json({
      locations: locations.map((l) => ({
        square_location_id: l.id,
        location_name: l.name,
        office_id: officeByLocation.get(l.id) ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list Square locations" }, { status: 502 });
  }
}
