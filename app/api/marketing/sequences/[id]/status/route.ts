import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { status } = await req.json();
  if (!["active", "paused"].includes(status)) {
    return NextResponse.json({ error: "status must be 'active' or 'paused'" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("campaign_sequences").update({ status }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
