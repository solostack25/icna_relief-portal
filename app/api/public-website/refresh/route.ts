import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshPublicWebsite } from "@/lib/publicWebsite";

// Lets signed-in staff ask the public website to refresh portal-published data (volunteer events, office listings)
// after changes made directly from the browser. The shared secret stays on the server.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ refreshed: await refreshPublicWebsite() });
}
