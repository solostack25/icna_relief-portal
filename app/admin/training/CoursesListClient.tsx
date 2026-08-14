"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Course = {
  id: string;
  title: string;
  category: string;
  required_for_all: boolean;
  required_for_roles: string[];
  required_for_program_slugs: string[];
  refresh_interval_months: number | null;
  is_active: boolean;
};

const ROLES = ["staff", "regional_director", "program_director", "admin"];

export default function CoursesListClient() {
  const supabase = createClient();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("onboarding");
  const [requiredForAll, setRequiredForAll] = useState(false);
  const [requiredRoles, setRequiredRoles] = useState<string[]>([]);
  const [requiredSlugs, setRequiredSlugs] = useState("");
  const [refreshMonths, setRefreshMonths] = useState("");

  async function load() {
    const { data, error } = await supabase.from("lms_courses").select("*").order("created_at", { ascending: false });
    if (error) return setError(error.message);
    setCourses(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function createCourse() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    const { error } = await supabase.from("lms_courses").insert({
      title: title.trim(),
      description: description.trim() || null,
      category,
      required_for_all: requiredForAll,
      required_for_roles: requiredRoles,
      required_for_program_slugs: requiredSlugs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      refresh_interval_months: refreshMonths ? Number(refreshMonths) : null,
    });
    if (error) return setError(error.message);
    setTitle("");
    setDescription("");
    setRequiredForAll(false);
    setRequiredRoles([]);
    setRequiredSlugs("");
    setRefreshMonths("");
    setShowForm(false);
    load();
  }

  async function toggleActive(course: Course) {
    await supabase.from("lms_courses").update({ is_active: !course.is_active }).eq("id", course.id);
    load();
  }

  if (!courses) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="space-y-2 mb-6">
        {courses.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-xl bg-white px-5 py-4"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <div>
              <Link href={`/admin/training/${c.id}`} className="text-sm font-bold hover:underline">
                {c.title}
              </Link>
              <div className="text-[11px] mt-0.5" style={{ color: "rgba(22,48,43,0.45)" }}>
                {c.category}
                {c.required_for_all
                  ? " · required for everyone"
                  : c.required_for_roles.length > 0 || c.required_for_program_slugs.length > 0
                    ? ` · required for ${[...c.required_for_roles, ...c.required_for_program_slugs].join(", ")}`
                    : " · optional"}
                {c.refresh_interval_months ? ` · refreshes every ${c.refresh_interval_months}mo` : ""}
                {!c.is_active ? " · INACTIVE" : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleActive(c)}
                className="text-xs cursor-pointer"
                style={{ color: "rgba(22,48,43,0.5)" }}
              >
                {c.is_active ? "Deactivate" : "Activate"}
              </button>
              <Link href={`/admin/training/${c.id}`} className="text-xs font-medium" style={{ color: "var(--portal-emerald)" }}>
                Manage →
              </Link>
            </div>
          </div>
        ))}
        {courses.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No courses yet.
          </p>
        )}
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="text-sm cursor-pointer"
          style={{ color: "var(--portal-emerald)" }}
        >
          + New Course
        </button>
      ) : (
        <div
          className="rounded-xl bg-white p-5 space-y-3"
          style={{ border: "1px solid var(--portal-line)" }}
        >
          <div>
            <label className="block text-xs font-medium mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--portal-line)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Refresh Every (months, optional)</label>
              <input
                type="number"
                value={refreshMonths}
                onChange={(e) => setRefreshMonths(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--portal-line)" }}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={requiredForAll} onChange={(e) => setRequiredForAll(e.target.checked)} />
            Required for every employee (e.g. new-hire onboarding)
          </label>
          {!requiredForAll && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1">Required for roles</label>
                <div className="flex gap-3 flex-wrap">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={requiredRoles.includes(r)}
                        onChange={(e) =>
                          setRequiredRoles(
                            e.target.checked ? [...requiredRoles, r] : requiredRoles.filter((x) => x !== r)
                          )
                        }
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Required for program access (comma-separated slugs, e.g. helpdesk-finance)
                </label>
                <input
                  value={requiredSlugs}
                  onChange={(e) => setRequiredSlugs(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ border: "1px solid var(--portal-line)" }}
                />
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button
              onClick={createCourse}
              className="text-sm px-4 py-2 rounded-lg text-white font-medium cursor-pointer"
              style={{ background: "var(--portal-emerald)" }}
            >
              Create Course
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-sm cursor-pointer"
              style={{ color: "rgba(22,48,43,0.5)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
