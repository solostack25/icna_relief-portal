import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import { uploadContentFile, getTemporaryImageLink } from "@/lib/dropbox";

// Marketing already has approval rights (that's what getFlierMarketingAccess
// checks), so routing them through the separate Upload Content -> go
// approve it -> come back flow is pure friction with no real brand-
// control benefit. This uploads to a dedicated Dropbox folder and
// inserts straight into approved_flier_images as already-approved, in
// one request.
const QUICK_UPLOAD_FOLDER = "Flier Builder Uploads";

export async function POST(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { path } = await uploadContentFile({
      dropboxFolderName: QUICK_UPLOAD_FOLDER,
      fileName: file.name,
      fileBuffer: buffer,
    });

    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("approved_flier_images")
      .insert({ dropbox_path: path, display_name: file.name, approved_by: access.employeeId })
      .select("id, dropbox_path, display_name")
      .single();
    if (error) throw new Error(error.message);

    const link = await getTemporaryImageLink(path);
    return NextResponse.json({ image: { ...row, link } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
