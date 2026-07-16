"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QuestionPayload } from "@/lib/types";

type ErrorType = "粗心" | "概念混淆" | "思路断链" | "完全不会";

type ParsedProblem = {
  question_text: string;
  latex_content?: string;
  question_payload?: QuestionPayload;
  student_answer?: string;
  matched_section_id?: string;
  section_name?: string;
  confidence?: number;
  error_type?: ErrorType | "";
  reflection_text?: string;
};

const ERROR_TYPES: { type: ErrorType; emoji: string; desc: string }[] = [
  { type: "粗心", emoji: "😓", desc: "会做但算错或写错" },
  { type: "概念混淆", emoji: "🤔", desc: "概念理解偏差" },
  { type: "思路断链", emoji: "😵", desc: "做到中途卡住" },
  { type: "完全不会", emoji: "😰", desc: "完全没有思路" },
];

export default function AddMistakePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageBase64, setImageBase64] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [summary, setSummary] = useState("");
  const [problems, setProblems] = useState<ParsedProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState("");

  function resetAll() {
    setImageBase64("");
    setImagePreview("");
    setSummary("");
    setProblems([]);
    setError("");
    setDoneCount(0);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1] ?? "");
      setProblems([]);
      setSummary("");
      setDoneCount(0);
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function runOcr() {
    if (!imageBase64) {
      setError("请先上传错题图片");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "识别失败");

      const nextProblems = Array.isArray(data.problems) ? data.problems : [];
      if (!nextProblems.length) {
        throw new Error("没有识别出可保存的题目，请换一张更清晰的照片");
      }

      setSummary(data.summary ?? "");
      setProblems(
        nextProblems.map((problem: ParsedProblem) => ({
          question_text: problem.question_text ?? "",
          latex_content: problem.latex_content ?? problem.question_text ?? "",
          question_payload: problem.question_payload,
          student_answer: problem.student_answer ?? "",
          matched_section_id: problem.matched_section_id ?? "",
          section_name: problem.section_name ?? "",
          confidence: problem.confidence ?? 0,
          error_type: problem.error_type ?? "",
          reflection_text: "",
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setLoading(false);
    }
  }

  function updateProblem(index: number, patch: Partial<ParsedProblem>) {
    setProblems((current) =>
      current.map((problem, i) => (i === index ? { ...problem, ...patch } : problem))
    );
  }

  function addManualProblem() {
    setProblems((current) => [
      ...current,
      {
        question_text: "",
        latex_content: "",
        question_payload: undefined,
        student_answer: "",
        matched_section_id: "",
        section_name: "",
        confidence: 0,
        error_type: "",
        reflection_text: "",
      },
    ]);
  }

  function removeProblem(index: number) {
    setProblems((current) => current.filter((_, i) => i !== index));
  }

  async function saveAll() {
    const validProblems = problems.filter((problem) => problem.question_text.trim());
    if (!validProblems.length) {
      setError("至少保留一道题目");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validProblems.map((problem) => ({
            question_text: problem.question_text.trim(),
            latex_content: (problem.latex_content || problem.question_text).trim(),
            question_payload: problem.question_payload,
            section_id: problem.matched_section_id || undefined,
            source: imageBase64 ? "ocr" : "bank",
            question_type: "解答",
            is_correct: 0,
            answer: problem.student_answer ?? "",
            error_type: problem.error_type || undefined,
            reflection_text: problem.reflection_text?.trim() || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setDoneCount(data.count ?? validProblems.length);
      setProblems([]);
      setSummary("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (doneCount > 0) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center text-center">
        <div className="mb-4 text-6xl">✅</div>
        <h2 className="mb-2 text-xl font-bold">已保存 {doneCount} 道错题</h2>
        <p className="mb-6 text-sm text-gray-500">知识点已自动关联，后续会进入复习与能力分析。</p>
        <div className="flex gap-3">
          <button
            onClick={resetAll}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
          >
            继续拍照录入
          </button>
          <button
            onClick={() => router.push("/mistakes")}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            查看错题本
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="glass-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-sky-600/70">Photo Capture</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">拍照录入错题</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              直接上传试卷或作业照片。系统会优先用国内大模型自动识别多道题、拆分题目，并自动关联知识点。
            </p>
          </div>
          <button
            onClick={addManualProblem}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            手动补录一题
          </button>
        </div>
      </section>

      <section className="glass-panel rounded-[28px] p-6">
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            {imagePreview ? (
              <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="题目图片" className="max-h-[360px] w-full rounded-[18px] object-contain" />
                <button
                  onClick={resetAll}
                  className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 text-center transition-colors hover:border-sky-300 hover:bg-sky-50"
              >
                <div className="mb-3 text-5xl">📷</div>
                <div className="text-base font-medium text-slate-900">上传试卷或作业照片</div>
                <div className="mt-1 text-sm text-slate-500">支持一张图中包含多道题和作答</div>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="flex gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                重新选择图片
              </button>
              <button
                onClick={runOcr}
                disabled={!imageBase64 || loading}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {loading ? "Gemini 识别中..." : "开始识别"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(93,183,255,0.08)_0%,rgba(255,216,77,0.14)_100%)] p-4">
              <div className="text-sm font-medium text-slate-900">自动处理内容</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                自动拆分多道题、识别学生作答、判断错题候选，并自动关联到知识图谱章节。
              </div>
            </div>

            {summary && (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-medium text-slate-900">识别摘要</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
              </div>
            )}

            {error && (
              <div className="rounded-[18px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}
          </div>
        </div>
      </section>

      {problems.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">识别出的题目</h2>
              <p className="mt-1 text-sm text-slate-500">可以修改题干和错误类型，知识点将自动保存。</p>
            </div>
            <button
              onClick={saveAll}
              disabled={saving}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? "保存中..." : `保存这 ${problems.filter((p) => p.question_text.trim()).length} 道题`}
            </button>
          </div>

          <div className="space-y-4">
            {problems.map((problem, index) => (
              <div key={`${index}-${problem.question_text.slice(0, 12)}`} className="glass-panel rounded-[26px] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">第 {index + 1} 题</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {problem.section_name && (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs text-sky-700">
                          {problem.section_name}
                        </span>
                      )}
                      {typeof problem.confidence === "number" && problem.confidence > 0 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                          识别置信度 {Math.round(problem.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeProblem(index)}
                    className="text-sm text-slate-400 hover:text-rose-500"
                  >
                    删除
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">题目内容</label>
                    <textarea
                      value={problem.question_text}
                      onChange={(e) =>
                        updateProblem(index, {
                          question_text: e.target.value,
                          latex_content: problem.latex_content || e.target.value,
                        })
                      }
                      rows={4}
                      className="w-full rounded-[18px] border border-slate-200 px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">数学格式文本</label>
                    <textarea
                      value={problem.latex_content ?? ""}
                      onChange={(e) => updateProblem(index, { latex_content: e.target.value })}
                      rows={4}
                      className="w-full rounded-[18px] border border-slate-200 px-3 py-3 font-mono text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="公式请用 $...$ 或 $$...$$ 包裹，例如：解方程 $2x+3=7$"
                    />
                  </div>

                  {problem.question_payload?.diagram && (
                    <div className="rounded-[18px] bg-slate-50 px-4 py-4">
                      <div className="text-sm font-medium text-slate-900">识别到图形关系</div>
                      <div className="mt-2 text-xs leading-6 text-slate-500">
                        {problem.question_payload.diagram.scene || "已提取几何图形关系，可用于后续展示和分析。"}
                      </div>
                      {problem.question_payload.diagram.points?.length ? (
                        <div className="mt-2 text-xs text-slate-500">
                          点位：{problem.question_payload.diagram.points.join("、")}
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">学生作答，可选</label>
                    <textarea
                      value={problem.student_answer ?? ""}
                      onChange={(e) => updateProblem(index, { student_answer: e.target.value })}
                      rows={2}
                      className="w-full rounded-[18px] border border-slate-200 px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <div className="mb-2 block text-sm font-medium text-slate-700">错误原因，可选</div>
                    <div className="grid gap-2 md:grid-cols-4">
                      {ERROR_TYPES.map((item) => (
                        <button
                          key={item.type}
                          onClick={() =>
                            updateProblem(index, {
                              error_type: problem.error_type === item.type ? "" : item.type,
                            })
                          }
                          className={`rounded-[18px] border px-3 py-3 text-left transition-colors ${
                            problem.error_type === item.type
                              ? "border-sky-300 bg-sky-50"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="text-lg">{item.emoji}</div>
                          <div className="mt-1 text-sm font-medium text-slate-900">{item.type}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">补充说明，可选</label>
                    <textarea
                      value={problem.reflection_text ?? ""}
                      onChange={(e) => updateProblem(index, { reflection_text: e.target.value })}
                      rows={2}
                      className="w-full rounded-[18px] border border-slate-200 px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="例如：把方程列错了，单位没有统一"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
