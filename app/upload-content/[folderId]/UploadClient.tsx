"use client";

import { useState, useRef } from "react";

type FileStatus = { name: string; status: "pending" | "uploading" | "done" | "error"; error?: string };

export default function UploadClient({ folderId }: { folderId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function upload() {
    if (files.length === 0) return;
    setUploading(true);
    setStatuses(files.map((f) => ({ name: f.name, status: "uploading" })));

    const formData = new FormData();
    formData.append("folderId", folderId);
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch("/api/content-upload", { method: "POST", body: formData });
      const body = await res.json();
      const results: { fileName: string; ok: boolean; error?: string }[] = body.results ?? [];
      setStatuses(
        files.map((f) => {
          const r = results.find((x) => x.fileName === f.name);
          return { name: f.name, status: r?.ok ? "done" : "error", error: r?.error };
        })
      );
      if (results.every((r) => r.ok)) {
        setFiles([]);
      }
    } catch (e: any) {
      setStatuses(files.map((f) => ({ name: f.name, status: "error", error: e.message })));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl p-10 text-center cursor-pointer mb-4"
        style={{
          border: `2px dashed ${dragOver ? "var(--portal-emerald)" : "var(--portal-line)"}`,
          background: dragOver ? "#F3F8F6" : "white",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="text-sm font-medium mb-1">Drag files here, or click to browse</div>
        <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
          Photos, documents — up to ~145MB per file
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map((f) => {
            const status = statuses.find((s) => s.name === f.name);
            return (
              <div
                key={f.name}
                className="flex items-center justify-between rounded-lg px-4 py-2.5"
                style={{ border: "1px solid var(--portal-line)", background: "white" }}
              >
                <div className="text-sm truncate flex-1 mr-3">{f.name}</div>
                {status?.status === "uploading" && (
                  <span className="text-xs" style={{ color: "#A57420" }}>
                    Uploading…
                  </span>
                )}
                {status?.status === "done" && (
                  <span className="text-xs" style={{ color: "var(--portal-emerald)" }}>
                    ✓ Uploaded
                  </span>
                )}
                {status?.status === "error" && (
                  <span className="text-xs" style={{ color: "#B55139" }} title={status.error}>
                    Failed
                  </span>
                )}
                {!status && (
                  <button
                    onClick={() => removeFile(f.name)}
                    className="text-xs cursor-pointer"
                    style={{ color: "rgba(22,48,43,0.4)" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {statuses.some((s) => s.status === "error") && (
        <p className="text-xs mb-4" style={{ color: "#B55139" }}>
          Some files failed to upload — check the error above each one, or try again.
        </p>
      )}

      <button
        onClick={upload}
        disabled={files.length === 0 || uploading}
        className="text-sm px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        style={{ background: "var(--portal-emerald)" }}
      >
        {uploading ? "Uploading…" : `Upload ${files.length || ""} File${files.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
