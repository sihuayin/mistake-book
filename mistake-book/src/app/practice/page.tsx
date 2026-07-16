"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface WeakSection {
  section_id: string;
  section_name: string;
  grade: string;
  chapter_title: string;
  error_count: number;
}

interface KnowledgeGraph {
  grade_groups?: Array<{ grade: string }>;
}

interface User {
  current_grade: string | null;
}

function PracticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetSection = searchParams.get("section_id");
  const presetGrade = searchParams.get("grade") ?? "";

  const [sections, setSections] = useState<WeakSection[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [filterGrade, setFilterGrade] = useState(presetGrade);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((user: User | null) => {
        if (!user) {
          router.push("/login");
          return;
        }
        if (!presetGrade && user.current_grade) {
          setFilterGrade((current) => current || user.current_grade || "");
        }
      });
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((kg: KnowledgeGraph) => setGrades((kg.grade_groups ?? []).map((group) => group.grade)))
      .catch(() => {});
  }, [presetGrade, router]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterGrade) params.set("grade", filterGrade);
    fetch(`/api/practice?${params}`)
      .then((r) => r.json())
      .then((data) => { setSections(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filterGrade]);

  async function startSession(sectionId: string) {
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: sectionId }),
    });
    const data = await res.json();
    router.push(`/practice/${data.session_id}?section_id=${sectionId}${filterGrade ? `&grade=${encodeURIComponent(filterGrade)}` : ""}`);
  }

  // Auto-start if section preset from URL
  useEffect(() => {
    if (presetSection && sections.length > 0) {
      startSession(presetSection);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSection, sections]);

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  const weakSections = sections.filter((s) => s.error_count > 0);
  const allSections = sections;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">智能练习</h1>

      <div className="flex gap-3 flex-wrap">
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">全部年级</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>{grade}</option>
          ))}
        </select>
      </div>

      {weakSections.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-3">推荐练习（根据你的薄弱点）</h2>
          <div className="space-y-3">
            {weakSections.slice(0, 5).map((s) => (
              <div
                key={s.section_id}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-sm">{s.section_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.grade} · {s.chapter_title}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                    {s.error_count} 道错题
                  </span>
                  <button
                    onClick={() => startSession(s.section_id)}
                    className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    开始
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">全部章节</h2>
        <div className="space-y-2">
          {allSections.map((s) => (
            <div
              key={s.section_id}
              className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between"
            >
              <div>
                <span className="text-sm font-medium">{s.section_name}</span>
                <span className="text-xs text-gray-400 ml-2">{s.grade} · {s.section_id}</span>
              </div>
              <button
                onClick={() => startSession(s.section_id)}
                className="text-xs text-blue-600 hover:underline"
              >
                练习 →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">加载中...</div>}>
      <PracticeContent />
    </Suspense>
  );
}
