import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { doNotCall } = await req.json();
  const admin = createAdminClient();

  if (doNotCall) {
    await admin
      .from("contact_tags")
      .upsert({ contact_id: params.id, tag: "do_not_call" }, { onConflict: "contact_id,tag", ignoreDuplicates: true });
  } else {
    await admin.from("contact_tags").delete().eq("contact_id", params.id).eq("tag", "do_not_call");
  }

  return NextResponse.json({ ok: true });
}
