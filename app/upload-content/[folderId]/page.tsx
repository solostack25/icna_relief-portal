import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import UploadClient from "./UploadClient";

export default async function FolderUploadPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: folder } = await supabase
    .from("content_folders")
    .select("id, name")
    .eq("id", folderId)
    .eq("is_active", true)
    .single();
  if (!folder) notFound();

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-lg mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href="/upload-content" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← All Categories
        </Link>
        <h1
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "10px 0 24px" }}
        >
          {folder.name}
        </h1>
        <UploadClient folderId={folder.id} />
      </div>
    </main>
  );
}
