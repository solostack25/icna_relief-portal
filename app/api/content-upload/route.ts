import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { uploadContentFile } from "@/lib/dropbox";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const formData = await req.formData();
  const folderId = formData.get("folderId") as string | null;
  const files = formData.getAll("files") as File[];

  if (!folderId || files.length === 0) {
    return NextResponse.json({ error: "folderId and at least one file are required" }, { status: 400 });
  }

  const { data: folder } = await supabase
    .from("content_folders")
    .select("id, dropbox_folder_name")
    .eq("id", folderId)
    .eq("is_active", true)
    .single();
  if (!folder) return NextResponse.json({ error: "Unknown or inactive folder" }, { status: 404 });

  const admin = createAdminClient();
  const results: { fileName: string; ok: boolean; error?: string }[] = [];

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { path, sizeBytes } = await uploadContentFile({
        dropboxFolderName: folder.dropbox_folder_name,
        fileName: file.name,
        fileBuffer: buffer,
      });
      await admin.from("content_uploads").insert({
        folder_id: folder.id,
        employee_id: employee.id,
        file_name: file.name,
        dropbox_path: path,
        file_size_bytes: sizeBytes,
      });
      results.push({ fileName: file.name, ok: true });
    } catch (err: any) {
      results.push({ fileName: file.name, ok: false, error: err.message });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ results }, { status: allOk ? 200 : 207 });
}
