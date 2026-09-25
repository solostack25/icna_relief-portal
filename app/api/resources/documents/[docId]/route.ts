import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";

// Download: short-lived signed link, only if the user can read the office's documents. Audit-logged.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: doc } = await supabase.from("res_documents").select("id, storage_path, file_name").eq("id", docId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: signed, error } = await supabase.storage.from("resources-documents").createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !signed) return NextResponse.json({ error: "Couldn't open that file." }, { status: 403 });
  await supabase.from("res_document_events").insert({ document_id: doc.id, action: "download", actor: (await supabase.auth.getUser()).data.user?.id });
  return NextResponse.redirect(signed.signedUrl);
}

// Delete (Admin / IT only): hides the document; the file and its audit trail are kept.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me?.canManage) return NextResponse.json({ error: "Only Admin / IT can delete documents." }, { status: 403 });
  const { error } = await supabase.from("res_documents").update({ deleted_at: new Date().toISOString() }).eq("id", docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("res_document_events").insert({ document_id: docId, action: "delete", actor: (await supabase.auth.getUser()).data.user?.id });
  return NextResponse.json({ ok: true });
}
