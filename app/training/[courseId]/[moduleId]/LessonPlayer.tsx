"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Step = { heading: string; body: string; image_url?: string };

export default function LessonPlayer({
  moduleId,
  courseId,
  nextModuleId,
  steps,
}: {
  moduleId: string;
  courseId: string;
  nextModuleId: string | null;
  steps: Step[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [i, setI] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const isLast = i === steps.length - 1;

  useEffect(() => {
    // Mark in_progress the moment someone opens the lesson.
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: employee } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (!employee) return;
      await supabase
        .from("lms_module_progress")
        .upsert(
          { employee_id: employee.id, module_id: moduleId, status: "in_progress", updated_at: new Date().toISOString() },
          { onConflict: "employee_id,module_id" }
        );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  async function finish() {
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
    if (nextModuleId) {
      router.push(`/training/${courseId}/${nextModuleId}`);
    } else {
      router.push(`/training/${courseId}`);
    }
  }

  if (steps.length === 0) {
    return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>This lesson has no content yet.</p>;
  }

  const step = steps[i];

  return (
    <div>
      <div className="flex gap-1.5 mb-6">
        {steps.map((_, idx) => (
          <div
            key={idx}
            className="flex-1 h-1 rounded-full"
            style={{ background: idx <= i ? "var(--portal-emerald)" : "var(--portal-line)" }}
          />
        ))}
      </div>

      <div
        className="rounded-2xl bg-white p-6 sm:p-8 mb-6"
        style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
      >
        <h2 className="text-lg font-bold mb-3">{step.heading}</h2>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#333" }}>
          {step.body}
        </p>
        {step.image_url && (
          <img src={step.image_url} alt="" className="rounded-lg mt-4 w-full" style={{ border: "1px solid var(--portal-line)" }} />
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
          className="text-sm px-4 py-2 rounded-lg disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          style={{ color: "rgba(22,48,43,0.6)" }}
        >
          ← Back
        </button>
        <span className="text-xs" style={{ color: "rgba(22,48,43,0.4)" }}>
          {i + 1} of {steps.length}
        </span>
        {isLast ? (
          <button
            type="button"
            onClick={finish}
            disabled={finishing}
            className="text-sm px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-60 cursor-pointer"
            style={{ background: "var(--portal-emerald)" }}
          >
            {finishing ? "Saving…" : nextModuleId ? "Finish & Continue →" : "Finish Course →"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setI((n) => n + 1)}
            className="text-sm px-5 py-2.5 rounded-lg text-white font-medium cursor-pointer"
            style={{ background: "var(--portal-emerald)" }}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
