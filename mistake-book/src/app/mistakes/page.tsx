"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import MathContent from "@/components/MathContent";
import ImageModal from "@/components/ImageModal";
import type { QuestionPayload } from "@/lib/types";

interface Mistake {
  id: string;
  section_id: string;
  question_text: string;
  latex_content?: string | null;
  error_type: string | null;
  grade?: string | null;
  is_correct: number;
  created_at: number;
  question_payload?: QuestionPayload | null;
  knowledge_points?: string[] | null;
}

interface Section {
  id: string;
  name: string;
  grade?: string;
  chapter_title?: string;
}

interface KnowledgeGraph {
  grade_groups?: Array<{ grade: string }>;
  chapters: Array<{
    grade: string;
    title: string;
    sections: Array<{ id: string; name: string }>;
  }>;
}

interface User {
  current_grade: string | null;
}

const ERROR_TYPE_COLORS: Record<string, string> = {
  粗心: "bg-yellow-100 text-yellow-700",
  概念混淆: "bg-purple-100 text-purple-700",
  思路断链: "bg-orange-100 text-orange-700",
  完全不会: "bg-red-100 text-red-700",
};

function MistakeListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null);
  const [filterGrade, setFilterGrade] = useState(searchParams.get("grade") ?? "");
  const [filterSection, setFilterSection] = useState(searchParams.get("section_id") ?? "");
  const [filterError, setFilterError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((user: User | null) => {
        if (!user) {
          router.push("/login");
          return;
        }
        if (!searchParams.get("grade") && user.current_grade) {
          setFilterGrade((current) => current || user.current_grade || "");
        }
      });
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((kg: KnowledgeGraph) => {
        const flat: Section[] = [];
        for (const ch of kg.chapters) {
          for (const s of ch.sections) flat.push({ id: s.id, name: s.name, grade: ch.grade, chapter_title: ch.title });
        }
        setGrades((kg.grade_groups ?? []).map((group) => group.grade));
        setSections(flat);
      });
  }, [router, searchParams]);

  useEffect(() => {
    let active = true;

    async function loadMistakes() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (filterGrade) params.set("grade", filterGrade);
      if (filterSection) params.set("section_id", filterSection);
      if (filterError) params.set("error_type", filterError);

      try {
        const response = await fetch(`/api/mistakes?${params}`);
        const data = (await response.json()) as Mistake[] | { error?: string };
        if (!active) return;

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("error" in data ? data.error || "错题加载失败" : "错题加载失败");
        }

        setMistakes(Array.isArray(data) ? data : []);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadMistakes();

    return () => {
      active = false;
    };
  }, [filterGrade, filterSection, filterError, router]);

  const visibleSections = filterGrade
    ? sections.filter((section) => section.grade === filterGrade)
    : sections;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">错题本</h1>
        <Link
          href="/mistakes/add"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          + 录入错题
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterGrade}
          onChange={(e) => {
            setFilterGrade(e.target.value);
            setFilterSection("");
          }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">全部年级</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>{grade}</option>
          ))}
        </select>
        <select
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">全部章节</option>
          {visibleSections.map((s) => (
            <option key={s.id} value={s.id}>{s.grade ? `${s.grade} · ${s.name}` : s.name}</option>
          ))}
        </select>
        <select
          value={filterError}
          onChange={(e) => setFilterError(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">全部类型</option>
          <option value="粗心">粗心</option>
          <option value="概念混淆">概念混淆</option>
          <option value="思路断链">思路断链</option>
          <option value="完全不会">完全不会</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-5 text-sm text-rose-700">
          {error}
        </div>
      ) : mistakes.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📝</div>
          <p className="text-gray-500">没有符合条件的错题</p>
          <Link href="/mistakes/add" className="inline-block mt-4 text-blue-600 text-sm hover:underline">
            录入第一道错题 →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {mistakes.map((m) => (
            <Link
              key={m.id}
              href={`/mistakes/${m.id}`}
              className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
                <div className="min-w-0">
                  <MathContent
                    content={m.latex_content || m.question_text}
                    className="line-clamp-2 text-sm leading-6 text-gray-800"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {(() => {
                        const section = sections.find((s) => s.id === m.section_id);
                        return section?.grade ? `${section.grade} · ${section.name}` : section?.name ?? m.section_id;
                      })()}
                    </span>
                    {m.knowledge_points?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {m.knowledge_points.slice(0, 3).map((point, pointIndex) => (
                          <span
                            key={`${m.id}-${point}-${pointIndex}`}
                            className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                          >
                            {point}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {m.question_payload?.diagram ? (
                      <span className="text-xs rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">
                        含图形
                      </span>
                    ) : null}
                    {m.error_type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ERROR_TYPE_COLORS[m.error_type] ?? "bg-gray-100 text-gray-500"}`}>
                        {m.error_type}
                      </span>
                    )}
                    <span className="text-xs text-gray-300 ml-auto">
                      {new Date(m.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>

                <div className="hidden md:block">
                  {m.question_payload?.question_preview_image_base64 || m.question_payload?.diagram?.preview_image_base64 ? (
                    <div className="space-y-2">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-2">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                          局部预览
                        </div>
                        {m.question_payload?.question_preview_image_base64 ? (
                          <button
                            onClick={() =>
                              setModalImage({
                                src: m.question_payload!.question_preview_image_base64!,
                                alt: "题干裁剪预览",
                              })
                            }
                            className="w-full text-left"
                          >
                          <div className="overflow-hidden rounded-xl border border-white bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.question_payload.question_preview_image_base64}
                              alt="题干裁剪预览"
                              className="h-20 w-full cursor-pointer object-contain transition-opacity hover:opacity-75"
                            />
                          </div>
                          </button>
                        ) : null}
                        {m.question_payload?.diagram?.preview_image_base64 ? (
                          <button
                            onClick={() =>
                              setModalImage({
                                src: m.question_payload!.diagram!.preview_image_base64!,
                                alt: "图形裁剪预览",
                              })
                            }
                            className="w-full text-left"
                          >
                          <div className="mt-2 overflow-hidden rounded-xl border border-white bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.question_payload.diagram.preview_image_base64}
                              alt="图形裁剪预览"
                              className="h-20 w-full cursor-pointer object-contain transition-opacity hover:opacity-75"
                            />
                          </div>
                          </button>
                        ) : null}
                      </div>
                      {m.question_payload?.diagram?.scene ? (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                          {m.question_payload.diagram.scene}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                      无局部预览
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
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

export default function MistakeListPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">加载中...</div>}>
      <MistakeListContent />
    </Suspense>
  );
}
