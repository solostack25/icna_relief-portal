import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAmzbViewer } from "@/lib/amazonBusiness/access";
import { AMZB_BUCKET } from "@/lib/amazonBusiness/sync";

// Opens an Amazon Business invoice PDF (IT, Finance, admins). Used from
// Admin -> Amazon Business and as the invoice link on Finance tickets.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getAmzbViewer();
  if (!viewer) return NextResponse.json({ error: "IT, Finance or admins only" }, { status: 403 });
  const admin = createAdminClient();
  const { data: p } = await admin.from("amzb_purchases").select("pdf_storage_path").eq("id", id).maybeSingle();
  if (!p?.pdf_storage_path) return NextResponse.json({ error: "No PDF for this purchase yet." }, { status: 404 });
  const { data } = await admin.storage.from(AMZB_BUCKET).createSignedUrl(p.pdf_storage_path, 120, { download: false });
  if (!data?.signedUrl) return NextResponse.json({ error: "Couldn't open the PDF." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
