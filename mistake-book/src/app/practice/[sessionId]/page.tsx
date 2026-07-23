"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import MathContent from "@/components/MathContent";

interface Question {
  question: string;
  latex_content?: string;
  answer?: string;
  solution_steps?: string[];
  solution?: string;
  difficulty?: string;
  question_text?: string;
  id?: string;
}

type PracticePhase = "loading" | "question" | "submitted" | "variation";

interface PracticeSessionResponse {
  session_id: string;
  current_section_id: string;
  source: "bank" | "ai";
  started_at: number;
  finished_at: number | null;
  current_question_id?: string;
  question_count?: number;
  section?: {
    section_id: string;
    section_name: string;
    grade: string;
    chapter_title: string;
  };
  question: Record<string, unknown> | null;
}

function normalizeQuestion(raw: Record<string, unknown>): Question {
  const solutionSteps =
    Array.isArray(raw.solution_steps)
      ? raw.solution_steps.filter((step): step is string => typeof step === "string")
      : typeof raw.solution_steps === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(raw.solution_steps);
              return Array.isArray(parsed) ? parsed.filter((step): step is string => typeof step === "string") : [raw.solution_steps];
            } catch {
              return [raw.solution_steps];
            }
          })()
        : undefined;

  const questionText =
    typeof raw.question_text === "string"
      ? raw.question_text
      : typeof raw.question === "string"
        ? raw.question
        : "";

  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    question: questionText,
    question_text: questionText,
    latex_content: typeof raw.latex_content === "string" ? raw.latex_content : questionText,
    answer: typeof raw.answer === "string" ? raw.answer : undefined,
    solution_steps: solutionSteps,
    solution: typeof raw.solution === "string" ? raw.solution : undefined,
    difficulty: typeof raw.difficulty === "string" ? raw.difficulty : undefined,
  };
}

function StepChecklist({
  stepResults,
}: {
  stepResults: { step: number; description: string; score: number; max: number; feedback: string }[];
}) {
  return (
    <div className="space-y-3">
      {stepResults.map((step) => {
        const passed = step.score >= step.max;
        return (
          <div
            key={step.step}
            className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(82,112,170,0.06)]"
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                  passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                {passed ? "✓" : "!"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-950">步骤 {step.step}</span>
                  <span className="text-xs text-slate-400">{step.score}/{step.max} 分</span>
                </div>
                <div className="mt-1 text-sm leading-6 text-slate-700">{step.description}</div>
                {step.feedback ? (
                  <div className="mt-2 rounded-[16px] bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    {step.feedback}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SessionContent() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? "";

  const [phase, setPhase] = useState<PracticePhase>("loading");
  const [question, setQuestion] = useState<Question | null>(null);
  const [variation, setVariation] = useState<Question | null>(null);
  const [sessionInfo, setSessionInfo] = useState<PracticeSessionResponse | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [gradeResult, setGradeResult] = useState<{
    total_score: number;
    max_score: number;
    overall_feedback: string;
    step_results?: { step: number; description: string; score: number; max: number; feedback: string }[];
  } | null>(null);
  const [loadingVariation, setLoadingVariation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  const loadSessionQuestion = useCallback(async () => {
    const authRes = await fetch("/api/auth/me");
    if (!authRes.ok) {
      router.push("/login");
      return null;
    }

    const res = await fetch(`/api/practice/${sessionId}`);
    const data = (await res.json().catch(() => null)) as PracticeSessionResponse | { error?: string } | null;
    if (!res.ok || !data || typeof data !== "object" || Array.isArray(data) || !("question" in data)) {
      throw new Error((data as { error?: string } | null)?.error || "题目加载失败");
    }

    const sessionData = data as PracticeSessionResponse;
    setSessionInfo(sessionData);

    if (sessionData.question) {
      setQuestion(normalizeQuestion(sessionData.question));
    } else {
      setQuestion(null);
    }
    setVariation(null);
    setStudentAnswer("");
    setGradeResult(null);
    setPhase("question");
    return sessionData;
  }, [router, sessionId]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const sessionData = await loadSessionQuestion();
        if (!active) {
          return;
        }
        if (sessionData) setPhase("question");
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : "页面初始化失败");
        }
      } finally {
        if (active) {
          setSessionReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [loadSessionQuestion]);

  const currentQuestion = phase === "variation" ? variation : question;
  const currentSection = sessionInfo?.section;
  const currentSectionId = sessionInfo?.current_section_id ?? "";
  const scorePercent = useMemo(() => {
    if (!gradeResult || !gradeResult.max_score) return 0;
    return Math.round((gradeResult.total_score / gradeResult.max_score) * 100);
  }, [gradeResult]);

  async function submitAnswer() {
    if (!studentAnswer.trim() || !currentQuestion) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/ai/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.question,
          studentAnswer,
          solutionSteps: currentQuestion.solution_steps ?? [currentQuestion.answer ?? ""],
        }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((result as { error?: string })?.error || "评分失败");
      }

      setGradeResult(result);

      await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: currentQuestion.question,
          latex_content: currentQuestion.latex_content ?? currentQuestion.question,
          section_id: currentSectionId,
          question_type: "解答",
          source: "bank",
          answer: studentAnswer,
          is_correct: result.total_score >= result.max_score * 0.7,
        }),
      });

      setPhase("submitted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadVariation() {
    if (!currentQuestion || !currentSectionId) return;
    setLoadingVariation(true);
    setError("");
    try {
      const res = await fetch("/api/ai/variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: currentSectionId, originalQuestion: currentQuestion.question }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error || "变式题生成失败");
      }

      setVariation(normalizeQuestion(data as Record<string, unknown>));
      setPhase("variation");
      setStudentAnswer("");
      setGradeResult(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "变式题生成失败");
    } finally {
      setLoadingVariation(false);
    }
  }

  async function loadNextQuestion() {
    try {
      setPhase("loading");
      setError("");
      await loadSessionQuestion();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "下一题加载失败");
      setPhase("submitted");
    }
  }

  if (!sessionReady && phase === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">
        练习页加载中...
      </div>
    );
  }

  return (
    <section className="relative isolate overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,#f7fbff_0%,#edf3ff_42%,#ffffff_100%)] px-4 py-5 md:px-6 md:py-6">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-6rem] top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(93,183,255,0.22)_0%,rgba(93,183,255,0)_72%)] blur-2xl" />
        <div className="absolute right-[-4rem] top-28 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,216,77,0.22)_0%,rgba(255,216,77,0)_72%)] blur-2xl" />
        <div className="absolute bottom-[-6rem] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(94,215,178,0.18)_0%,rgba(94,215,178,0)_72%)] blur-2xl" />
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="mb-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/90 px-5 py-5 shadow-[0_20px_60px_rgba(82,112,170,0.10)] md:px-7 md:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.32em] text-sky-600/70">Practice Session</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold tracking-tight text-slate-950">
                  练习进行中
                </h1>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  会话 {sessionId.slice(0, 8) || "—"}
                </span>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                先完成当前题，再看反馈和变式。把每次练习变成一次真正的修正，而不是只做完。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(93,183,255,0.16)_0%,rgba(255,255,255,0.92)_100%)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">章节</div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {currentSection?.section_name || currentSectionId || "未指定"}
                </div>
              </div>
              <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(255,216,77,0.20)_0%,rgba(255,255,255,0.92)_100%)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700/70">年级</div>
                <div className="mt-2 text-sm font-semibold text-slate-950">{currentSection?.grade || "全部"}</div>
              </div>
              <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(94,215,178,0.18)_0%,rgba(255,255,255,0.92)_100%)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-700/70">状态</div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {phase === "submitted" ? "已评分" : phase === "variation" ? "变式题" : "待作答"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-5 rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="space-y-6">
            <div className="rounded-[30px] border border-white/70 bg-white/92 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  {phase === "variation" ? "变式练习" : "当前题目"}
                </span>
                {currentQuestion?.difficulty ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {currentQuestion.difficulty}
                  </span>
                ) : null}
                {currentQuestion?.id ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    题目 {currentQuestion.id}
                  </span>
                ) : null}
              </div>

              {currentSection ? (
                <div className="mt-3 rounded-[22px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">{currentSection.section_name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {currentSection.grade} · {currentSection.chapter_title}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 min-h-[160px] rounded-[24px] bg-[linear-gradient(135deg,rgba(248,251,255,1)_0%,rgba(255,255,255,1)_70%,rgba(240,248,255,1)_100%)] p-5">
                {currentQuestion ? (
                  <MathContent
                    content={currentQuestion.latex_content ?? currentQuestion.question}
                    className="text-sm leading-7 text-slate-800 md:text-[15px]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white/80 px-6 py-16 text-center text-sm text-slate-500">
                    这道练习暂时没有题目内容，可以返回章节重新进入。
                  </div>
                )}
              </div>
            </div>

            {phase === "question" || phase === "variation" ? (
              <div className="rounded-[30px] border border-white/70 bg-white/92 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">写下你的解题过程</h2>
                    <p className="mt-1 text-sm text-slate-500">尽量分步写，方便后面 AI 给你逐步反馈。</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                    支持分步作答
                  </span>
                </div>

                <textarea
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  rows={8}
                  className="mt-4 w-full resize-none rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  placeholder="先写已知条件，再写公式和推理过程。"
                />

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={submitAnswer}
                    disabled={!studentAnswer.trim() || submitting}
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-[linear-gradient(135deg,#5db7ff_0%,#7f78ff_100%)] px-5 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? "AI 评分中..." : "提交答案"}
                  </button>
                  <button
                    onClick={() => setStudentAnswer("")}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                  >
                    清空
                  </button>
                </div>
              </div>
            ) : null}

            {phase === "submitted" && gradeResult ? (
              <div className="space-y-6">
                <div className="rounded-[30px] border border-white/70 bg-white/92 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">AI 评分结果</h2>
                      <p className="mt-1 text-sm text-slate-500">评分看分数，也看步骤里哪里开始偏离。</p>
                    </div>
                    <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(93,183,255,0.14)_0%,rgba(255,255,255,1)_100%)] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">得分率</div>
                      <div className="mt-1 text-3xl font-semibold text-slate-950">{scorePercent}%</div>
                      <div className="text-xs text-slate-500">
                        {gradeResult.total_score}/{gradeResult.max_score}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#5db7ff_0%,#7f78ff_100%)]"
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>

                  {gradeResult.step_results?.length ? (
                    <div className="mt-5">
                      <StepChecklist stepResults={gradeResult.step_results} />
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-[24px] bg-[linear-gradient(135deg,rgba(93,183,255,0.10)_0%,rgba(127,120,255,0.10)_55%,rgba(94,215,178,0.12)_100%)] p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-sky-700/70">总体反馈</div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{gradeResult.overall_feedback}</p>
                  </div>
                </div>

                {currentQuestion?.solution ? (
                  <div className="rounded-[30px] border border-white/70 bg-white/92 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
                    <h2 className="text-base font-semibold text-slate-950">参考解析</h2>
                    {currentQuestion.solution_steps?.length ? (
                      <div className="mt-4 space-y-3">
                        {currentQuestion.solution_steps.map((step, index) => (
                          <div
                            key={index}
                            className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4"
                          >
                            <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                              解析 {index + 1}
                            </div>
                            <MathContent content={step} className="text-sm leading-7 text-slate-700" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-[22px] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(82,112,170,0.06)]">
                      <MathContent content={currentQuestion.solution} className="text-sm leading-7 text-slate-700" />
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={loadVariation}
                    disabled={loadingVariation || !currentSectionId}
                    className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-5 py-3 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loadingVariation ? "变式题生成中..." : "做一道变式题"}
                  </button>
                  <Link
                    href="/practice"
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
                  >
                    返回练习首页
                  </Link>
                </div>

                <button
                  onClick={() => void loadNextQuestion()}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                >
                  下一题
                </button>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(16,32,62,0.98)_0%,rgba(31,91,154,0.98)_100%)] p-5 text-white shadow-[0_24px_60px_rgba(21,56,103,0.24)]">
              <div className="text-[11px] uppercase tracking-[0.24em] text-sky-100/75">今日建议</div>
              <div className="mt-2 text-xl font-semibold">只做当前这一个任务</div>
              <p className="mt-3 text-sm leading-6 text-sky-100/78">
                先做题，再看反馈，再决定要不要开变式题。节奏清楚，练习更容易形成闭环。
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-[22px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/70">当前章节</div>
                  <div className="mt-2 text-base font-medium text-white">
                    {currentSection?.section_name || currentSectionId || "未选择"}
                  </div>
                  {currentSection ? (
                    <div className="mt-1 text-xs text-sky-100/75">
                      {currentSection.grade} · {currentSection.chapter_title}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[22px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/70">操作顺序</div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-sky-100/82">
                    <li>1. 读题并写出过程。</li>
                    <li>2. 看评分里的每一步。</li>
                    <li>3. 做变式题巩固同类思路。</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)]">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Session Summary</div>
              <div className="mt-2 text-sm font-medium text-slate-900">当前状态</div>
              <div className="mt-3 space-y-3">
                <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">会话</div>
                  <div className="mt-1 text-sm text-slate-900">{sessionId || "未生成"}</div>
                </div>
                <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">来源</div>
                  <div className="mt-1 text-sm text-slate-900">{sessionInfo?.source || "未确定"}</div>
                </div>
                <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">题目状态</div>
                  <div className="mt-1 text-sm text-slate-900">
                    {phase === "submitted" ? "已完成评分" : phase === "variation" ? "进入变式题" : "等待提交"}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default function PracticeSessionPage() {
  return <SessionContent />;
}
