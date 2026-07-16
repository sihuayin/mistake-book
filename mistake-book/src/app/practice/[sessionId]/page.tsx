"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import MathContent from "@/components/MathContent";

interface Question {
  question: string;
  latex_content?: string;
  answer?: string;
  solution_steps?: string[];
  solution?: string;
  difficulty?: string;
  // bank question fields
  question_text?: string;
  id?: string;
}

type PracticePhase = "loading" | "question" | "submitted" | "variation";

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionId = searchParams.get("section_id") ?? "";

  const [phase, setPhase] = useState<PracticePhase>("loading");
  const [question, setQuestion] = useState<Question | null>(null);
  const [variation, setVariation] = useState<Question | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [gradeResult, setGradeResult] = useState<{
    total_score: number;
    max_score: number;
    overall_feedback: string;
    step_results?: { step: number; description: string; score: number; max: number; feedback: string }[];
  } | null>(null);
  const [loadingVariation, setLoadingVariation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => { if (!r.ok) router.push("/login"); });
    if (sectionId) {
      fetch(`/api/practice?section_id=${sectionId}`)
        .then((r) => r.json())
        .then((data) => {
          const q = data.questions?.[0];
          if (q) {
            // Normalize bank question fields
            setQuestion({
              question: q.question_text ?? q.question,
              latex_content: q.latex_content ?? q.question_text ?? q.question,
              answer: q.answer,
              solution_steps: Array.isArray(q.solution_steps)
                ? q.solution_steps
                : typeof q.solution_steps === "string"
                ? (() => { try { return JSON.parse(q.solution_steps); } catch { return [q.solution_steps]; } })()
                : undefined,
              solution: q.solution,
              difficulty: q.difficulty,
            });
            setPhase("question");
          } else {
            setPhase("question");
          }
        });
    }
  }, [sectionId, router]);

  async function submitAnswer() {
    if (!studentAnswer.trim()) return;
    setSubmitting(true);

    const q = question;
    if (!q) return;

    try {
      // AI grade
      const res = await fetch("/api/ai/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          studentAnswer,
          solutionSteps: q.solution_steps ?? [q.answer ?? ""],
        }),
      });
      const result = await res.json();
      setGradeResult(result);

      // Save attempt
      await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: q.question,
          latex_content: q.latex_content ?? q.question,
          section_id: sectionId,
          question_type: "解答",
          source: "bank",
          answer: studentAnswer,
          is_correct: result.total_score >= (result.max_score * 0.7),
        }),
      });

      setPhase("submitted");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadVariation() {
    if (!question || !sectionId) return;
    setLoadingVariation(true);
    try {
      const res = await fetch("/api/ai/variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, originalQuestion: question.question }),
      });
      const data = await res.json();
      setVariation(data);
      setPhase("variation");
    } finally {
      setLoadingVariation(false);
    }
  }

  if (phase === "loading") {
    return <div className="text-center py-16 text-gray-400">题目加载中...</div>;
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Link href="/practice" className="text-sm text-gray-500 hover:text-gray-700">← 返回</Link>
        <span className="text-xs text-gray-400">{sectionId}</span>
      </div>

      {/* Question */}
      {question && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {phase === "variation" ? "变式练习" : "练习题"}
            </span>
            {(phase === "variation" ? variation?.difficulty : question.difficulty) && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {phase === "variation" ? variation?.difficulty : question.difficulty}
              </span>
            )}
          </div>
          <MathContent
            content={phase === "variation" ? variation?.question ?? "" : question.latex_content ?? question.question}
            className="text-sm leading-7 text-gray-800"
          />
        </div>
      )}

      {/* Answer input */}
      {(phase === "question" || phase === "variation") && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <label className="block text-sm font-medium mb-2">写出你的解题过程</label>
          <textarea
            value={studentAnswer}
            onChange={(e) => setStudentAnswer(e.target.value)}
            rows={6}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="请分步写出你的解题思路和计算过程..."
          />
          <button
            onClick={submitAnswer}
            disabled={!studentAnswer.trim() || submitting}
            className="w-full mt-3 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {submitting ? "AI 评分中..." : "提交答案"}
          </button>
        </div>
      )}

      {/* Grade result */}
      {phase === "submitted" && gradeResult && (
        <div className="space-y-4">
          {/* Score */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">AI 评分结果</h2>
              <div className={`text-2xl font-bold ${
                gradeResult.total_score >= gradeResult.max_score * 0.8 ? "text-green-500" :
                gradeResult.total_score >= gradeResult.max_score * 0.5 ? "text-amber-500" :
                "text-red-500"
              }`}>
                {gradeResult.total_score}/{gradeResult.max_score}
              </div>
            </div>

            {/* Step results */}
            {gradeResult.step_results && gradeResult.step_results.length > 0 && (
              <div className="space-y-2 mb-3">
                {gradeResult.step_results.map((sr) => (
                  <div key={sr.step} className="flex items-start gap-3 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      sr.score >= sr.max ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {sr.score >= sr.max ? "✓" : "✗"}
                    </span>
                    <div className="flex-1">
                      <span className="font-medium">步骤 {sr.step}：{sr.description}</span>
                      <span className="text-gray-400 ml-2">{sr.score}/{sr.max} 分</span>
                      {sr.feedback && <p className="text-gray-500 text-xs mt-0.5">{sr.feedback}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-800">
              <p className="font-medium text-xs text-blue-500 mb-1">总体反馈</p>
              <p>{gradeResult.overall_feedback}</p>
            </div>
          </div>

          {/* Reference solution */}
          {question?.solution && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-semibold mb-3">参考解析</h2>
              {question.solution_steps && (
                <div className="space-y-2 mb-3">
                  {question.solution_steps.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-gray-400 font-mono w-6 flex-shrink-0">{i + 1}.</span>
                      <div className="flex-1">
                        <MathContent content={s} className="text-gray-700" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <MathContent content={question.solution} className="text-sm leading-7 text-gray-600" />
            </div>
          )}

          {/* Next actions */}
          <div className="flex gap-3">
            <button
              onClick={loadVariation}
              disabled={loadingVariation}
              className="flex-1 py-2.5 border border-blue-200 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 disabled:opacity-40"
            >
              {loadingVariation ? "生成中..." : "做变式题"}
            </button>
            <Link
              href="/practice"
              className="flex-1 text-center py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              下一章节
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    params.then(({ sessionId }) => setSessionId(sessionId));
  }, [params]);

  if (!sessionId) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">加载中...</div>}>
      <SessionContent />
    </Suspense>
  );
}
