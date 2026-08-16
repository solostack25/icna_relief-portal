"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Folder = { id: string; name: string; dropbox_folder_name: string };
type DropboxImg = { path: string; name: string; link: string | null };
type GalleryItem = DropboxImg & {
  folderId: string;
  folderName: string;
  uploadedBy: string | null;
  uploadedAt: string | null;
};

export default function ImagesClient() {
  const supabase = createClient();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [approvedPaths, setApprovedPaths] = useState<Set<string>>(new Set());
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [browseRes, uploadsRes, approvedRes] = await Promise.all([
        fetch("/api/marketing/dropbox-browse?all=true"),
        supabase
          .from("content_uploads")
          .select("dropbox_path, employee_id, uploaded_at")
          .order("uploaded_at", { ascending: false }),
        supabase.from("approved_flier_images").select("dropbox_path").eq("is_active", true),
      ]);

      const browseBody = await browseRes.json();
      if (!browseRes.ok) throw new Error(browseBody.error);
      setFolders(browseBody.folders);

      // Two-query pattern (avoid relational joins) - look up uploader
      // names separately rather than trying a nested select.
      const uploads = uploadsRes.data ?? [];
      const employeeIds = [...new Set(uploads.map((u) => u.employee_id))];
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
      const empMap = new Map((employees ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
      // Most recent upload record per path wins, for display purposes.
      const uploadByPath = new Map<string, { uploadedBy: string; uploadedAt: string }>();
      for (const u of uploads) {
        if (!uploadByPath.has(u.dropbox_path)) {
          uploadByPath.set(u.dropbox_path, {
            uploadedBy: empMap.get(u.employee_id) ?? "Unknown",
            uploadedAt: u.uploaded_at,
          });
        }
      }

      const gallery: GalleryItem[] = (browseBody.results ?? []).flatMap((r: any) =>
        r.images.map((img: DropboxImg) => ({
          ...img,
          folderId: r.folderId,
          folderName: r.folderName,
          uploadedBy: uploadByPath.get(img.path)?.uploadedBy ?? null,
          uploadedAt: uploadByPath.get(img.path)?.uploadedAt ?? null,
        }))
      );
      // Most recently uploaded first where known, otherwise keep folder order.
      gallery.sort((a, b) => {
        if (a.uploadedAt && b.uploadedAt) return a.uploadedAt < b.uploadedAt ? 1 : -1;
        if (a.uploadedAt) return -1;
        if (b.uploadedAt) return 1;
        return 0;
      });
      setItems(gallery);

      setApprovedPaths(new Set((approvedRes.data ?? []).map((r) => r.dropbox_path)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleApprove(img: GalleryItem) {
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

  if (!folders || loading) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading every folder — a moment…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const visibleItems = activeFolder ? items!.filter((i) => i.folderId === activeFolder) : items!;
  const approvedCount = items!.filter((i) => approvedPaths.has(i.path)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveFolder(null)}
            className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
            style={{
              border: `1.5px solid ${activeFolder === null ? "var(--portal-emerald)" : "var(--portal-line)"}`,
              background: activeFolder === null ? "#F3F8F6" : "white",
              color: activeFolder === null ? "var(--portal-emerald)" : "rgba(22,48,43,0.6)",
            }}
          >
            All ({items!.length})
          </button>
          {folders.map((f) => {
            const count = items!.filter((i) => i.folderId === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.id)}
                className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
                style={{
                  border: `1.5px solid ${activeFolder === f.id ? "var(--portal-emerald)" : "var(--portal-line)"}`,
                  background: activeFolder === f.id ? "#F3F8F6" : "white",
                  color: activeFolder === f.id ? "var(--portal-emerald)" : "rgba(22,48,43,0.6)",
                }}
              >
                {f.name} ({count})
              </button>
            );
          })}
        </div>
        <span className="text-xs whitespace-nowrap ml-3" style={{ color: "rgba(22,48,43,0.45)" }}>
          {approvedCount} approved
        </span>
      </div>

      {visibleItems.length === 0 && (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          Nothing here yet — photos uploaded via Upload Content will show up automatically.
        </p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {visibleItems.map((img) => {
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
              {(!activeFolder || img.uploadedBy) && (
                <div
                  className="absolute top-1 left-1 right-1 text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(22,48,43,0.6)", color: "white" }}
                >
                  {!activeFolder && <span>{img.folderName}</span>}
                  {img.uploadedBy && (
                    <span className="block truncate">
                      {img.uploadedBy} · {new Date(img.uploadedAt!).toLocaleDateString()}
                    </span>
                  )}
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
      </div>
    </div>
  );
}
