"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MathContent from "@/components/MathContent";
import DiagramPreview from "@/components/DiagramPreview";
import ImageModal from "@/components/ImageModal";
import type { DiagramRelation, QuestionPayload } from "@/lib/types";

interface Reflection {
  id: string;
  error_type: string;
  card_type: string;
  free_text: string | null;
  created_at: number;
}

interface MistakeDetail {
  question: {
    id: string;
    section_id: string;
    section_name?: string | null;
    chapter_title?: string | null;
    grade?: string | null;
    question_text: string;
    latex_content: string | null;
    question_payload?: QuestionPayload | null;
    knowledge_points?: string[] | null;
    source: string;
    question_type: string;
  };
  attempt: {
    id: string;
    answer: string;
    is_correct: number;
    ai_feedback: string | null;
    step_scores: string | null;
    created_at: number;
  } | null;
  reflections: Reflection[];
}

const ERROR_TYPE_COLORS: Record<string, string> = {
  粗心: "bg-yellow-100 text-yellow-700",
  概念混淆: "bg-purple-100 text-purple-700",
  思路断链: "bg-orange-100 text-orange-700",
  完全不会: "bg-red-100 text-red-700",
};

function formatRelationText(relation: DiagramRelation) {
  if (relation.kind === "angle") {
    return relation.value
      ? `角 ${relation.name ?? ""} 的大小是 ${relation.value}`.trim()
      : `图中标出了角 ${relation.name ?? ""}`.trim();
  }
  if (relation.kind === "right_angle") {
    return relation.at ? `${relation.at} 点是直角` : "图中存在直角关系";
  }
  if (relation.kind === "parallel") {
    return relation.items?.length
      ? `${relation.items.map((pair) => `${pair[0]}${pair[1]}`).join("、")} 互相平行`
      : "图中存在平行关系";
  }
  if (relation.kind === "target") {
    return relation.name ? `题目要求求出 ${relation.name}` : "题目给出了待求目标";
  }
  if (relation.kind === "equal") {
    return relation.items?.length
      ? `${relation.items.map((pair) => `${pair[0]}${pair[1]}`).join("、")} 长度或关系相等`
      : "图中存在相等关系";
  }
  return [relation.name, relation.value, relation.at].filter(Boolean).join(" · ") || "已识别出一个图形关系";
}

export default function MistakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<MistakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      fetch("/api/auth/me").then((r) => { if (!r.ok) router.push("/login"); });
      fetch(`/api/mistakes/${id}`)
        .then((r) => r.json())
        .then((data) => { setDetail(data); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [params, router]);

  if (loading) {
    return <div className="text-center py-16 text-gray-400">加载中...</div>;
  }

  if (!detail) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">未找到该错题</p>
        <Link href="/mistakes" className="text-blue-600 hover:underline mt-2 inline-block">返回错题本</Link>
      </div>
    );
  }

  const { question, attempt, reflections } = detail;
  const mainReflection = reflections[0];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Back */}
      <Link href="/mistakes" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
        ← 返回错题本
      </Link>

      {/* Question */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {question.section_name || question.section_id}
          </span>
          {question.grade || question.chapter_title ? (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {[question.grade, question.chapter_title].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{question.question_type}</span>
          {mainReflection && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${ERROR_TYPE_COLORS[mainReflection.error_type] ?? "bg-gray-100 text-gray-500"}`}>
              {mainReflection.error_type}
            </span>
          )}
        </div>
        {question.knowledge_points?.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {question.knowledge_points.map((point, index) => (
              <span key={`${point}-${index}`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                {point}
              </span>
            ))}
          </div>
        ) : null}
        <h2 className="font-semibold mb-2">题目</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            <MathContent
              content={question.latex_content || question.question_text}
              className="text-sm leading-7 text-gray-800"
            />
          </div>
          <div className="space-y-3">
            {question.question_payload?.question_preview_image_base64 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-2">
                <div className="px-1 pb-2 text-xs font-medium text-slate-500">题目裁剪</div>
                <button
                  onClick={() =>
                    setModalImage({
                      src: question.question_payload!.question_preview_image_base64!,
                      alt: "题目局部裁剪",
                    })
                  }
                  className="w-full text-left"
                >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={question.question_payload.question_preview_image_base64}
                  alt="题目局部裁剪"
                  className="max-h-[220px] w-full cursor-pointer rounded-xl object-contain transition-opacity hover:opacity-85"
                />
                </button>
              </div>
            ) : null}
            {question.question_payload?.diagram?.preview_image_base64 &&
            question.question_payload.diagram.type !== "coordinate_graph" ? (
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-2">
                <div className="px-1 pb-2 text-xs font-medium text-slate-500">图形裁剪</div>
                <button
                  onClick={() =>
                    setModalImage({
                      src: question.question_payload!.diagram!.preview_image_base64!,
                      alt: "图形局部裁剪",
                    })
                  }
                  className="w-full text-left"
                >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={question.question_payload.diagram.preview_image_base64}
                  alt="图形局部裁剪"
                  className="max-h-[220px] w-full cursor-pointer rounded-xl object-contain transition-opacity hover:opacity-85"
                />
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {question.question_payload?.options?.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {question.question_payload.options.map((option) => (
              <div key={option.label} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-medium">{option.label}. </span>
                <MathContent content={option.latex || option.text} className="inline text-sm text-slate-700" />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {question.question_payload?.diagram && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold mb-3">图形关系</h2>
          <DiagramPreview diagram={question.question_payload.diagram} className="mb-4" />
          {question.question_payload.diagram.scene ? (
            <p className="text-sm text-gray-700 leading-6">{question.question_payload.diagram.scene}</p>
          ) : null}
          {question.question_payload.diagram.points?.length ? (
            <p className="mt-3 text-sm text-gray-600">点位：{question.question_payload.diagram.points.join("、")}</p>
          ) : null}
          {question.question_payload.diagram.relations?.length ? (
            <div className="mt-3 space-y-2">
              {question.question_payload.diagram.relations.map((relation, index) => (
                <div key={`${relation.kind}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium">关系 {index + 1}</span>
                  <p className="mt-1 leading-6">{formatRelationText(relation)}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {question.question_payload?.student_marks && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold mb-3">图片批注</h2>
          {question.question_payload.student_marks.selected_option ? (
            <p className="text-sm text-gray-700">选择答案：{question.question_payload.student_marks.selected_option}</p>
          ) : null}
          {question.question_payload.student_marks.handwritten_notes?.length ? (
            <div className="mt-2 text-sm text-gray-700">
              <div>手写标注：</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {question.question_payload.student_marks.handwritten_notes.map((note, index) => (
                  <span key={`${note}-${index}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {note}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Attempt */}
      {attempt && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold mb-3">作答情况</h2>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm mb-3 ${
            attempt.is_correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>
            {attempt.is_correct ? "✓ 正确" : "✗ 错误"}
          </div>
          {attempt.ai_feedback && (
            <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-800">
              <p className="font-medium text-xs text-blue-500 mb-1">AI 反馈</p>
              <p>{attempt.ai_feedback}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            录入时间：{new Date(attempt.created_at).toLocaleString("zh-CN")}
          </p>
        </div>
      )}

      {/* Reflections */}
      {reflections.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold mb-3">反思记录</h2>
          <div className="space-y-3">
            {reflections.map((r) => (
              <div key={r.id} className="bg-gray-50 rounded-xl p-3">
                <div className={`inline-flex text-xs px-2 py-0.5 rounded-full mb-2 ${ERROR_TYPE_COLORS[r.error_type] ?? "bg-gray-100 text-gray-500"}`}>
                  {r.error_type}
                </div>
                {r.free_text ? (
                  <p className="text-sm text-gray-700 leading-relaxed">{r.free_text}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">（未填写反思文字）</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href={`/practice?section_id=${question.section_id}`}
          className="flex-1 text-center py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          练习该章节
        </Link>
        <Link
          href="/mistakes/add"
          className="flex-1 text-center py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          录入新错题
        </Link>
      </div>
      {modalImage && (
        <ImageModal
          src={modalImage.src}
          alt={modalImage.alt}
          onClose={() => setModalImage(null)}
        />
      )}
    </div>
  );
}
