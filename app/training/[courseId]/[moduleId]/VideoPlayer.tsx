"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VideoPlayer({
  moduleId,
  courseId,
  nextModuleId,
  videoUrl,
  notes,
}: {
  moduleId: string;
  courseId: string;
  nextModuleId: string | null;
  videoUrl: string;
  notes: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);

  async function markWatched() {
    setFinishing(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
      if (employee) {
        await supabase.from("lms_module_progress").upsert(
          {
            employee_id: employee.id,
            module_id: moduleId,
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "employee_id,module_id" }
        );
      }
    }
    await fetch("/api/lms/check-course-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });
    router.push(nextModuleId ? `/training/${courseId}/${nextModuleId}` : `/training/${courseId}`);
  }

  return (
    <div>
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{ border: "1px solid var(--portal-line)", background: "#000", aspectRatio: "16/9" }}
      >
        {videoUrl ? (
          <video src={videoUrl} controls className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-sm">No video set</div>
        )}
      </div>
      {notes && (
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "#333" }}>
          {notes}
        </p>
      )}
      <button
        type="button"
        onClick={markWatched}
        disabled={finishing}
        className="text-sm px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-60 cursor-pointer"
        style={{ background: "var(--portal-emerald)" }}
      >
        {finishing ? "Saving…" : "Mark as Watched →"}
      </button>
    </div>
  );
}
