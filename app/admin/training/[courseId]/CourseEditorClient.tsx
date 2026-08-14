"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ModuleRow = {
  id: string;
  module_order: number;
  title: string;
  type: "lesson" | "video" | "quiz";
  content: any;
  estimated_minutes: number;
};
type Step = { heading: string; body: string; image_url?: string };
type Question = { id: string; question_order: number; question_text: string; options: string[]; correct_option_index: number; explanation: string | null };

export default function CourseEditorClient({ courseId }: { courseId: string }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"modules" | "completions">("modules");
  const [modules, setModules] = useState<ModuleRow[] | null>(null);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"lesson" | "video" | "quiz">("lesson");

  async function load() {
    const { data, error } = await supabase
      .from("lms_course_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("module_order");
    if (error) return setError(error.message);
    setModules(data as ModuleRow[]);
  }
  useEffect(() => {
    load();
  }, [courseId]);

  async function addModule() {
    if (!newTitle.trim()) return;
    const nextOrder = modules && modules.length > 0 ? Math.max(...modules.map((m) => m.module_order)) + 1 : 1;
    const defaultContent = newType === "lesson" ? { steps: [] } : newType === "video" ? { video_url: "", notes: "" } : {};
    const { error } = await supabase.from("lms_course_modules").insert({
      course_id: courseId,
      module_order: nextOrder,
      title: newTitle.trim(),
      type: newType,
      content: defaultContent,
      estimated_minutes: 5,
    });
    if (error) return setError(error.message);
    setNewTitle("");
    load();
  }

  async function deleteModule(id: string) {
    if (!confirm("Delete this module and all its progress data?")) return;
    await supabase.from("lms_course_modules").delete().eq("id", id);
    load();
  }

  if (!modules) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div>
      <div className="flex gap-2 mb-6" style={{ borderBottom: "1px solid var(--portal-line)" }}>
        {(["modules", "completions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm font-medium cursor-pointer capitalize"
            style={{
              borderBottom: tab === t ? "2px solid var(--portal-emerald)" : "2px solid transparent",
              color: tab === t ? "var(--portal-emerald)" : "rgba(22,48,43,0.5)",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {tab === "modules" && (
        <div>
          <div className="space-y-2 mb-6">
            {modules.map((m) => (
              <div key={m.id} className="rounded-xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line)" }}>
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setOpenModuleId(openModuleId === m.id ? null : m.id)}
                    className="text-left flex-1 cursor-pointer"
                  >
                    <span className="text-sm font-bold">
                      {m.module_order}. {m.title}
                    </span>
                    <span className="text-xs ml-2" style={{ color: "rgba(22,48,43,0.45)" }}>
                      ({m.type})
                    </span>
                  </button>
                  <button onClick={() => deleteModule(m.id)} className="text-xs cursor-pointer" style={{ color: "#B55139" }}>
                    Delete
                  </button>
                </div>
                {openModuleId === m.id && (
                  <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--portal-line)" }}>
                    {m.type === "lesson" && <LessonEditor module={m} onSave={load} />}
                    {m.type === "video" && <VideoEditor module={m} onSave={load} />}
                    {m.type === "quiz" && <QuizEditor module={m} onSave={load} />}
                  </div>
                )}
              </div>
            ))}
            {modules.length === 0 && (
              <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
                No modules yet — add one below.
              </p>
            )}
          </div>

          <div className="rounded-xl bg-white p-4 flex items-center gap-3" style={{ border: "1px solid var(--portal-line)" }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New module title"
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            >
              <option value="lesson">Lesson</option>
              <option value="video">Video</option>
              <option value="quiz">Quiz</option>
            </select>
            <button
              onClick={addModule}
              className="text-sm px-4 py-2 rounded-lg text-white font-medium cursor-pointer whitespace-nowrap"
              style={{ background: "var(--portal-emerald)" }}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      {tab === "completions" && <CompletionsView courseId={courseId} />}
    </div>
  );
}

function LessonEditor({ module: m, onSave }: { module: ModuleRow; onSave: () => void }) {
  const supabase = createClient();
  const [steps, setSteps] = useState<Step[]>(m.content?.steps ?? []);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps([...steps, { heading: "", body: "" }]);
  }
  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }
  async function save() {
    await supabase.from("lms_course_modules").update({ content: { steps }, updated_at: new Date().toISOString() }).eq("id", m.id);
    onSave();
  }

  return (
    <div className="pt-4 space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="rounded-lg p-3" style={{ background: "#F4F7F5" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
              Step {i + 1}
            </span>
            <button onClick={() => removeStep(i)} className="text-xs cursor-pointer" style={{ color: "#B55139" }}>
              Remove
            </button>
          </div>
          <input
            value={s.heading}
            onChange={(e) => updateStep(i, { heading: e.target.value })}
            placeholder="Step heading"
            className="w-full rounded-lg px-3 py-1.5 text-sm mb-2"
            style={{ border: "1px solid var(--portal-line)" }}
          />
          <textarea
            value={s.body}
            onChange={(e) => updateStep(i, { body: e.target.value })}
            placeholder="Step content"
            rows={3}
            className="w-full rounded-lg px-3 py-1.5 text-sm mb-2"
            style={{ border: "1px solid var(--portal-line)" }}
          />
          <input
            value={s.image_url ?? ""}
            onChange={(e) => updateStep(i, { image_url: e.target.value })}
            placeholder="Image URL (optional)"
            className="w-full rounded-lg px-3 py-1.5 text-sm"
            style={{ border: "1px solid var(--portal-line)" }}
          />
        </div>
      ))}
      <div className="flex gap-3">
        <button onClick={addStep} className="text-sm cursor-pointer" style={{ color: "var(--portal-emerald)" }}>
          + Add Step
        </button>
        <button
          onClick={save}
          className="text-sm px-4 py-1.5 rounded-lg text-white font-medium cursor-pointer"
          style={{ background: "var(--portal-emerald)" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function VideoEditor({ module: m, onSave }: { module: ModuleRow; onSave: () => void }) {
  const supabase = createClient();
  const [videoUrl, setVideoUrl] = useState(m.content?.video_url ?? "");
  const [notes, setNotes] = useState(m.content?.notes ?? "");

  async function save() {
    await supabase
      .from("lms_course_modules")
      .update({ content: { video_url: videoUrl, notes }, updated_at: new Date().toISOString() })
      .eq("id", m.id);
    onSave();
  }

  return (
    <div className="pt-4 space-y-2">
      <input
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        placeholder="Video URL (mp4 or hosted link)"
        className="w-full rounded-lg px-3 py-2 text-sm"
        style={{ border: "1px solid var(--portal-line)" }}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes shown below the video (optional)"
        rows={2}
        className="w-full rounded-lg px-3 py-2 text-sm"
        style={{ border: "1px solid var(--portal-line)" }}
      />
      <button
        onClick={save}
        className="text-sm px-4 py-1.5 rounded-lg text-white font-medium cursor-pointer"
        style={{ background: "var(--portal-emerald)" }}
      >
        Save
      </button>
    </div>
  );
}

function QuizEditor({ module: m, onSave }: { module: ModuleRow; onSave: () => void }) {
  const supabase = createClient();
  const [questions, setQuestions] = useState<Question[] | null>(null);

  async function load() {
    const { data } = await supabase
      .from("lms_quiz_questions")
      .select("*")
      .eq("module_id", m.id)
      .order("question_order");
    setQuestions((data as Question[]) ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  async function addQuestion() {
    const nextOrder = questions && questions.length > 0 ? Math.max(...questions.map((q) => q.question_order)) + 1 : 1;
    await supabase.from("lms_quiz_questions").insert({
      module_id: m.id,
      question_order: nextOrder,
      question_text: "",
      options: ["", ""],
      correct_option_index: 0,
      explanation: "",
    });
    load();
  }

  async function updateQuestion(q: Question, patch: Partial<Question>) {
    await supabase.from("lms_quiz_questions").update(patch).eq("id", q.id);
  }

  async function deleteQuestion(id: string) {
    await supabase.from("lms_quiz_questions").delete().eq("id", id);
    load();
  }

  if (!questions) return <p className="text-sm pt-4">Loading…</p>;

  return (
    <div className="pt-4 space-y-3">
      {questions.map((q, qi) => (
        <QuestionEditor
          key={q.id}
          question={q}
          index={qi}
          onChange={(patch) => setQuestions(questions.map((x) => (x.id === q.id ? { ...x, ...patch } : x)))}
          onBlurSave={(patch) => updateQuestion(q, patch)}
          onDelete={() => deleteQuestion(q.id)}
        />
      ))}
      <button onClick={addQuestion} className="text-sm cursor-pointer" style={{ color: "var(--portal-emerald)" }}>
        + Add Question
      </button>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  onChange,
  onBlurSave,
  onDelete,
}: {
  question: Question;
  index: number;
  onChange: (patch: Partial<Question>) => void;
  onBlurSave: (patch: Partial<Question>) => void;
  onDelete: () => void;
}) {
  function updateOption(oi: number, value: string) {
    const options = question.options.map((o, i) => (i === oi ? value : o));
    onChange({ options });
  }
  function addOption() {
    onChange({ options: [...question.options, ""] });
  }

  return (
    <div className="rounded-lg p-3" style={{ background: "#F4F7F5" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: "rgba(22,48,43,0.5)" }}>
          Question {index + 1}
        </span>
        <button onClick={onDelete} className="text-xs cursor-pointer" style={{ color: "#B55139" }}>
          Remove
        </button>
      </div>
      <input
        value={question.question_text}
        onChange={(e) => onChange({ question_text: e.target.value })}
        onBlur={(e) => onBlurSave({ question_text: e.target.value })}
        placeholder="Question text"
        className="w-full rounded-lg px-3 py-1.5 text-sm mb-2"
        style={{ border: "1px solid var(--portal-line)" }}
      />
      <div className="space-y-1.5 mb-2">
        {question.options.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <input
              type="radio"
              checked={question.correct_option_index === oi}
              onChange={() => {
                onChange({ correct_option_index: oi });
                onBlurSave({ correct_option_index: oi });
              }}
              title="Correct answer"
            />
            <input
              value={opt}
              onChange={(e) => updateOption(oi, e.target.value)}
              onBlur={(e) => onBlurSave({ options: question.options.map((o, i) => (i === oi ? e.target.value : o)) })}
              placeholder={`Option ${oi + 1}`}
              className="flex-1 rounded-lg px-3 py-1.5 text-sm"
              style={{ border: "1px solid var(--portal-line)" }}
            />
          </div>
        ))}
      </div>
      <button onClick={addOption} className="text-xs cursor-pointer mb-2" style={{ color: "var(--portal-emerald)" }}>
        + Add Option
      </button>
      <input
        value={question.explanation ?? ""}
        onChange={(e) => onChange({ explanation: e.target.value })}
        onBlur={(e) => onBlurSave({ explanation: e.target.value })}
        placeholder="Explanation shown after answering (optional)"
        className="w-full rounded-lg px-3 py-1.5 text-sm"
        style={{ border: "1px solid var(--portal-line)" }}
      />
      <p className="text-[10px] mt-1" style={{ color: "rgba(22,48,43,0.4)" }}>
        Select the radio button next to the correct answer.
      </p>
    </div>
  );
}

function CompletionsView({ courseId }: { courseId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<{ name: string; email: string; completed_at: string; score: number | null }[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: completions } = await supabase
        .from("lms_course_completions")
        .select("employee_id, completed_at, score")
        .eq("course_id", courseId)
        .order("completed_at", { ascending: false });
      const employeeIds = [...new Set((completions ?? []).map((c) => c.employee_id))];
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name, email")
        .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
      const empMap = new Map((employees ?? []).map((e) => [e.id, e]));
      setRows(
        (completions ?? []).map((c) => {
          const e = empMap.get(c.employee_id);
          return {
            name: e ? `${e.first_name} ${e.last_name}` : "Unknown",
            email: e?.email ?? "",
            completed_at: c.completed_at,
            score: c.score,
          };
        })
      );
    })();
  }, [courseId]);

  if (!rows) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading…</p>;

  return (
    <div className="rounded-xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line)" }}>
      {rows.length === 0 && (
        <p className="p-5 text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          No one has completed this course yet.
        </p>
      )}
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--portal-line)" : "none" }}
        >
          <div>
            <div className="text-sm font-medium">{r.name}</div>
            <div className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
              {r.email}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
              {new Date(r.completed_at).toLocaleDateString()}
            </div>
            {r.score != null && (
              <div className="text-[11px]" style={{ color: "var(--portal-emerald)" }}>
                {r.score}%
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
