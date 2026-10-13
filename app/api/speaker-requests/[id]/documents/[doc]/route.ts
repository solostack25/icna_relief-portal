import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSpeakerViewer, canViewRequest } from "@/lib/speakerRequestAccess";

// Login-gated redirect to a short-lived signed URL for a speaker's W-9
// or signed agreement. This is the link stored on the finance
// honorarium ticket (w9_url / invoice_url) so Finance can open the
// paperwork straight from their queue, without the files ever being
// public.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  const viewer = await getSpeakerViewer();
  if (!viewer) {
    const url = new URL("/", req.url);
    return NextResponse.redirect(url);
  }
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("speaker_requests")
    .select("id, coordinator_id, area_manager_email, finance_ticket_id, w9_storage_path, agreement_storage_path, request_number")
    .eq("id", id)
    .maybeSingle();
  if (!request || !(await canViewRequest(viewer, request))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let path: string | null = null;
  let filename = `${request.request_number}-${doc}`;
  if (doc === "agreement") {
    path = request.agreement_storage_path;
    filename += ".pdf";
  } else if (doc === "w9") {
    // W-9s carry a taxpayer ID - Finance and admins only.
    if (!viewer.isAdmin && !viewer.canManageFinance) {
      return NextResponse.json({ error: "Only Finance can open W-9s." }, { status: 403 });
    }
    path = request.w9_storage_path;
    if (path) filename += "." + (path.split(".").pop() ?? "pdf");
  }
  if (!path) return NextResponse.json({ error: "Document not on file yet." }, { status: 404 });

  const { data: signed, error } = await admin.storage.from("speaker-documents").createSignedUrl(path, 120, { download: filename });
  if (error || !signed) return NextResponse.json({ error: error?.message ?? "Couldn't open document" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
