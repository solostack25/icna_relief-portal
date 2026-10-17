import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { CHECK_BUCKET } from "@/lib/inkind/cashCheck";

// Login-gated redirect to a 60-second signed URL for a check photo. After
// the Salesforce push the stored file is the blurred copy.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const supabase = await createClient();
  const { data: row } = await supabase.from("inkind_cash_donations").select("check_image_path").eq("id", params.id).maybeSingle();
  if (!row?.check_image_path) return NextResponse.json({ error: "No check image" }, { status: 404 });

  const { data, error } = await createAdminClient().storage.from(CHECK_BUCKET).createSignedUrl(row.check_image_path, 60);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't open image" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
