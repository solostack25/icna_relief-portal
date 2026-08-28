import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testSalesforceConnection } from "@/lib/salesforce";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  let credentials = { instance_url: body.instance_url, client_id: body.client_id, client_secret: body.client_secret };
  if (body.target_id) {
    const { data: target } = await supabase
      .from("salesforce_sync_targets")
      .select("instance_url, client_id, client_secret")
      .eq("id", body.target_id)
      .single();
    if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });
    credentials = target;
  }

  if (!credentials.instance_url || !credentials.client_id || !credentials.client_secret) {
    return NextResponse.json({ error: "Instance URL, Client ID, and Client Secret are all required to test" }, { status: 400 });
  }

  const result = await testSalesforceConnection(credentials);
  return NextResponse.json(result);
}
