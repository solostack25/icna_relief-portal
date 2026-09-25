import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { ASSETS, DOC_TYPES, isAssetType } from "@/lib/resources/schema";
import { getResourcesUser } from "@/lib/resources/access";
import { friendlyDbError } from "@/lib/resources/db";
import { notifyResources } from "@/lib/resources/notify";

// Upload a document (optionally a new version of an existing one) to private storage.
// Storage access is enforced by RLS on the office folder; every upload is audit-logged.
export async function POST(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!isAssetType(type)) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = ASSETS[type];
  const { data: asset } = await supabase.from(cfg.table).select("*").eq("id", id).maybeSingle();
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Files must be 25 MB or smaller." }, { status: 400 });
  const docType = String(form.get("doc_type") ?? "other");
  if (!DOC_TYPES.some((d) => d.value === docType)) return NextResponse.json({ error: "Choose a document type." }, { status: 400 });
  const title = String(form.get("title") ?? "").trim() || file.name;
  const expiresOn = String(form.get("expires_on") ?? "") || null;
  const replacesId = String(form.get("replaces_id") ?? "") || null;

  let version = 1;
  if (replacesId) {
    const { data: prev } = await supabase.from("res_documents").select("version").eq("id", replacesId).maybeSingle();
    version = (prev?.version ?? 0) + 1;
  }

  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100);
  const path = `${asset.office_id}/${type}/${id}/${randomUUID()}-${safe}`;
  const { error: upErr } = await supabase.storage.from("resources-documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message.includes("mime") ? "That file type isn't allowed. Use PDF, an image, Word or Excel." : upErr.message }, { status: 400 });

  const { data: doc, error } = await supabase
    .from("res_documents")
    .insert({
      office_id: asset.office_id,
      [cfg.fk]: id,
      doc_type: docType,
      title,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      version,
      replaces_id: replacesId,
      expires_on: expiresOn,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  if (replacesId) await supabase.from("res_documents").update({ deleted_at: new Date().toISOString() }).eq("id", replacesId);

  await supabase.from("res_document_events").insert({ document_id: doc.id, action: "upload", actor: (await supabase.auth.getUser()).data.user?.id });
  const typeLabel = DOC_TYPES.find((d) => d.value === docType)!.label;
  await supabase.from("res_activity").insert({
    office_id: asset.office_id,
    [cfg.fk]: id,
    action: "document_uploaded",
    summary: `${typeLabel} uploaded: ${title}${version > 1 ? ` (version ${version})` : ""}`,
  });
  await notifyResources({
    event: "document_uploaded",
    officeId: asset.office_id,
    subject: `Document uploaded: ${title}`,
    heading: `${typeLabel} uploaded for ${cfg.title(asset)}`,
    rows: [
      [cfg.singular, cfg.title(asset)],
      ["Document", `${title}${version > 1 ? ` (version ${version})` : ""}`],
      ["Expires", expiresOn],
      ["Uploaded by", me.name || me.email],
    ],
    path: `/resources/${type}/${id}`,
    related: { type, id, document_id: doc.id },
  });
  return NextResponse.json({ ok: true, id: doc.id });
}
