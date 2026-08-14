"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Folder = { id: string; name: string; dropbox_folder_name: string };
type DropboxImg = { path: string; name: string; link: string | null };

export default function ImagesClient() {
  const supabase = createClient();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [images, setImages] = useState<DropboxImg[] | null>(null);
  const [approvedPaths, setApprovedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketing/dropbox-browse")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setFolders(body.folders);
      })
      .catch((e) => setError(e.message));

    supabase
      .from("approved_flier_images")
      .select("dropbox_path")
      .eq("is_active", true)
      .then(({ data }) => setApprovedPaths(new Set((data ?? []).map((r) => r.dropbox_path))));
  }, []);

  async function openFolder(folder: Folder) {
    setActiveFolder(folder.dropbox_folder_name);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/dropbox-browse?folder=${encodeURIComponent(folder.dropbox_folder_name)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setImages(body.images);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleApprove(img: DropboxImg) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user!.id).single();

    if (approvedPaths.has(img.path)) {
      await supabase.from("approved_flier_images").update({ is_active: false }).eq("dropbox_path", img.path);
      setApprovedPaths((prev) => {
        const next = new Set(prev);
        next.delete(img.path);
        return next;
      });
    } else {
      await supabase.from("approved_flier_images").upsert(
        { dropbox_path: img.path, display_name: img.name, approved_by: employee?.id, is_active: true, approved_at: new Date().toISOString() },
        { onConflict: "dropbox_path" }
      );
      setApprovedPaths((prev) => new Set(prev).add(img.path));
    }
  }

  if (!folders) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-6">
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => openFolder(f)}
            className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
            style={{
              border: `1.5px solid ${activeFolder === f.dropbox_folder_name ? "var(--portal-emerald)" : "var(--portal-line)"}`,
              background: activeFolder === f.dropbox_folder_name ? "#F3F8F6" : "white",
              color: activeFolder === f.dropbox_folder_name ? "var(--portal-emerald)" : "rgba(22,48,43,0.6)",
            }}
          >
            {f.name}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading images…</p>}

      {images && !loading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((img) => {
            const approved = approvedPaths.has(img.path);
            return (
              <div key={img.path} className="rounded-lg overflow-hidden relative" style={{ border: "1px solid var(--portal-line)" }}>
                {img.link ? (
                  <img src={img.link} alt={img.name} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-xs" style={{ background: "#F4F7F5" }}>
                    Preview unavailable
                  </div>
                )}
                <button
                  onClick={() => toggleApprove(img)}
                  className="absolute bottom-1 left-1 right-1 text-[10px] py-1 rounded-md font-semibold cursor-pointer"
                  style={{
                    background: approved ? "var(--portal-emerald)" : "rgba(255,255,255,0.9)",
                    color: approved ? "white" : "#333",
                  }}
                >
                  {approved ? "✓ Approved" : "Approve"}
                </button>
              </div>
            );
          })}
          {images.length === 0 && (
            <p className="text-sm col-span-full" style={{ color: "rgba(22,48,43,0.5)" }}>
              No images found in this folder yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
