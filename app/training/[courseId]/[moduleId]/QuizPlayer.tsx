"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Question = { id: string; question_order: number; question_text: string; options: string[] };
type Result = { questionId: string; correct: boolean; correctOptionIndex: number; explanation: string | null };

export default function QuizPlayer({
  moduleId,
  courseId,
  nextModuleId,
}: {
  moduleId: string;
  courseId: string;
  nextModuleId: string | null;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ results: Result[]; scorePercent: number; passed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lms/${moduleId}/quiz`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setQuestions(body.questions);
      })
      .catch((e) => setError(e.message));
  }, [moduleId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lms/${moduleId}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setOutcome(body);
      if (body.passed) {
        await fetch("/api/lms/check-course-completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function retake() {
    setOutcome(null);
    setAnswers({});
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!questions) return <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>Loading quiz…</p>;

  if (outcome) {
    return (
      <div>
        <div
          className="rounded-2xl px-6 py-5 mb-6"
          style={{
            background: outcome.passed ? "#E3F0EA" : "#FBE3DC",
            color: outcome.passed ? "var(--portal-emerald)" : "#B55139",
          }}
        >
          <div className="text-2xl font-bold mb-1">{outcome.scorePercent}%</div>
          <div className="text-sm font-medium">{outcome.passed ? "Passed — nice work." : "Not quite — take another look and retry."}</div>
        </div>

        <div className="space-y-3 mb-6">
          {questions.map((q) => {
            const r = outcome.results.find((res) => res.questionId === q.id)!;
            return (
              <div
                key={q.id}
                className="rounded-xl bg-white p-4"
                style={{ border: `1px solid ${r.correct ? "var(--portal-line)" : "#F0B8A8"}` }}
              >
                <div className="text-sm font-medium mb-1">
                  {r.correct ? "✅" : "❌"} {q.question_text}
                </div>
                <div className="text-xs" style={{ color: "rgba(22,48,43,0.55)" }}>
                  Correct answer: {q.options[r.correctOptionIndex]}
                </div>
                {r.explanation && (
                  <div className="text-xs mt-1 italic" style={{ color: "rgba(22,48,43,0.5)" }}>
                    {r.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {outcome.passed ? (
          <button
            type="button"
            onClick={() => router.push(nextModuleId ? `/training/${courseId}/${nextModuleId}` : `/training/${courseId}`)}
            className="text-sm px-5 py-2.5 rounded-lg text-white font-medium cursor-pointer"
            style={{ background: "var(--portal-emerald)" }}
          >
            {nextModuleId ? "Continue →" : "Finish Course →"}
          </button>
        ) : (
          <button
            type="button"
            onClick={retake}
            className="text-sm px-5 py-2.5 rounded-lg text-white font-medium cursor-pointer"
            style={{ background: "var(--portal-emerald)" }}
          >
            Retake Quiz
          </button>
        )}
      </div>
    );
  }

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  return (
    <div>
      <div className="space-y-5 mb-6">
        {questions.map((q, qi) => (
          <div
            key={q.id}
            className="rounded-2xl bg-white p-5"
            style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
          >
            <div className="text-sm font-bold mb-3">
              {qi + 1}. {q.question_text}
            </div>
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer text-sm"
                  style={{
                    border: `1.5px solid ${answers[q.id] === oi ? "var(--portal-emerald)" : "var(--portal-line)"}`,
                    background: answers[q.id] === oi ? "#F3F8F6" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === oi}
                    onChange={() => setAnswers({ ...answers, [q.id]: oi })}
                    className="sr-only"
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{
                      border: "1.5px solid var(--portal-line)",
                      background: answers[q.id] === oi ? "var(--portal-emerald)" : "transparent",
                    }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!allAnswered || submitting}
        className="text-sm px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        style={{ background: "var(--portal-emerald)" }}
      >
        {submitting ? "Grading…" : "Submit Quiz"}
      </button>
    </div>
  );
}
