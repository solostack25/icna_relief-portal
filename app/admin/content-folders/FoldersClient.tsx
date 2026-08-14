"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Folder = { id: string; name: string; dropbox_folder_name: string; sort_order: number; is_active: boolean };

export default function FoldersClient() {
  const supabase = createClient();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function load() {
    const { data, error } = await supabase.from("content_folders").select("*").order("sort_order");
    if (error) return setError(error.message);
    setFolders(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function addFolder() {
    if (!newName.trim()) return;
    const nextOrder = folders && folders.length > 0 ? Math.max(...folders.map((f) => f.sort_order)) + 1 : 1;
    const { error } = await supabase.from("content_folders").insert({
      name: newName.trim(),
      dropbox_folder_name: newName.trim(),
      sort_order: nextOrder,
    });
    if (error) return setError(error.message);
    setNewName("");
    load();
  }

  async function toggleActive(f: Folder) {
    await supabase.from("content_folders").update({ is_active: !f.is_active }).eq("id", f.id);
    load();
  }

  async function rename(f: Folder, name: string) {
    if (!name.trim() || name === f.name) return;
    // Deliberately does NOT rename the Dropbox folder itself - only the
    // display name shown in the portal. Renaming dropbox_folder_name
    // after uploads already exist would split content across two
    // differently-named folders in Dropbox, which is exactly the
    // confusion this tool exists to avoid.
    await supabase.from("content_folders").update({ name: name.trim() }).eq("id", f.id);
    load();
  }

  if (!folders) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="space-y-2 mb-6">
        {folders.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between rounded-xl bg-white px-5 py-3.5"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <div className="flex-1">
              <input
                defaultValue={f.name}
                onBlur={(e) => rename(f, e.target.value)}
                className="text-sm font-bold bg-transparent border-none outline-none w-full"
              />
              <div className="text-[11px]" style={{ color: "rgba(22,48,43,0.45)" }}>
                Dropbox folder: /{f.dropbox_folder_name}
                {!f.is_active ? " · INACTIVE" : ""}
              </div>
            </div>
            <button onClick={() => toggleActive(f)} className="text-xs cursor-pointer" style={{ color: "rgba(22,48,43,0.5)" }}>
              {f.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="flex-1 rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--portal-line)" }}
        />
        <button
          onClick={addFolder}
          className="text-sm px-4 py-2 rounded-lg text-white font-medium cursor-pointer whitespace-nowrap"
          style={{ background: "var(--portal-emerald)" }}
        >
          + Add Category
        </button>
      </div>
    </div>
  );
}
