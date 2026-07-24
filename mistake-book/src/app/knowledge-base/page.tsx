"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MathContent from "@/components/MathContent";

interface Section {
  id: string;
  name: string;
  description: string;
  key_points: string[];
  formulas?: string;
  tags: string[];
}

interface Chapter {
  chapter_id: string;
  grade: string;
  title: string;
  sections: Section[];
}

interface GradeGroup {
  grade: string;
  chapters: Chapter[];
}

interface KnowledgeGraph {
  curriculum: string;
  grade: string;
  stage?: string;
  subject: string;
  chapters: Chapter[];
  grade_groups?: GradeGroup[];
}

interface User {
  current_grade: string | null;
}

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [gradeGroups, setGradeGroups] = useState<GradeGroup[]>([]);
  const [gradeOptions, setGradeOptions] = useState<string[]>([]);
  const [meta, setMeta] = useState<Pick<KnowledgeGraph, "curriculum" | "grade" | "subject" | "stage"> | null>(null);
  const [filterGrade, setFilterGrade] = useState("");
  const [expanded, setExpanded] = useState<string>("");
  const [seedStatus, setSeedStatus] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((user: User | null) => {
        if (!user) {
          router.push("/login");
          return;
        }
        if (user.current_grade) {
          setFilterGrade((current) => current || user.current_grade || "");
        }
      });
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((kg: KnowledgeGraph) => setGradeOptions((kg.grade_groups ?? []).map((group) => group.grade)))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterGrade) params.set("grade", filterGrade);
    fetch(`/api/knowledge?${params}`)
      .then((r) => r.json())
      .then((kg: KnowledgeGraph) => {
        setMeta({
          curriculum: kg.curriculum,
          grade: kg.grade,
          stage: kg.stage,
          subject: kg.subject,
        });
        setGradeGroups(kg.grade_groups ?? []);
        setChapters(kg.chapters);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filterGrade]);

  async function seedSection(sectionId: string, sectionName: string) {
    if (seeding) return;
    setSeeding(true);
    setSeedStatus((prev) => ({ ...prev, [sectionId]: "生成中..." }));
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sectionId, count: 3 }),
      });
      const data = await res.json();
      setSeedStatus((prev) => ({
        ...prev,
        [sectionId]: data.count > 0 ? data.count + " 道题" : "生成失败",
      }));
    } catch {
      setSeedStatus((prev) => ({ ...prev, [sectionId]: "生成失败" }));
    } finally {
      setSeeding(false);
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">加载中...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">知识图谱</h1>
        <p className="text-sm text-gray-500 mt-1">
          {meta ? `${meta.curriculum}${meta.subject} · ${meta.stage ?? meta.grade} · 全部章节知识点` : "全部章节知识点"}
        </p>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">全部年级</option>
          {gradeOptions.map((grade) => (
            <option key={grade} value={grade}>{grade}</option>
          ))}
        </select>
        <button
          onClick={async () => {
            if (seeding || !confirm("确认要一键生成当前筛选下所有章节的题库？每个章节 3 道题，建议分批次执行。")) return;
            setSeeding(true);
            const allSections = (gradeGroups.length > 0 ? gradeGroups : [{ grade: "", chapters }])
              .filter((g) => !filterGrade || g.grade === filterGrade)
              .flatMap((g) => g.chapters.flatMap((ch) => ch.sections));
            for (const s of allSections) {
              await seedSection(s.id, s.name);
            }
            setSeeding(false);
          }}
          disabled={seeding}
          className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-2 rounded-xl font-medium disabled:opacity-40"
        >
          {seeding ? "生成中..." : "一键填充题库"}
        </button>
      </div>

      <div className="space-y-6">
        {(gradeGroups.length > 0
          ? gradeGroups
          : [{ grade: meta?.grade ?? "全部年级", chapters }]).map((group) => (
          <section key={group.grade} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">{group.grade}</h2>
              <span className="text-xs text-gray-400">{group.chapters.length} 个章节</span>
            </div>

            {group.chapters.map((ch) => (
              <div key={`${group.grade}-${ch.chapter_id}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === `${group.grade}-${ch.chapter_id}` ? "" : `${group.grade}-${ch.chapter_id}`)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                      {ch.chapter_id.replace("CH", "")}
                    </span>
                    <span className="font-medium">{ch.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{ch.sections.length} 节</span>
                    <span className={`transition-transform ${expanded === `${group.grade}-${ch.chapter_id}` ? "rotate-180" : ""}`}>▾</span>
                  </div>
                </button>

                {expanded === `${group.grade}-${ch.chapter_id}` && (
                  <div className="border-t border-gray-100">
                    {ch.sections.map((s, i) => (
                      <div
                        key={s.id}
                        className={`p-4 ${i > 0 ? "border-t border-gray-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-gray-400 font-mono">{s.id}</span>
                              <h3 className="font-medium text-sm">{s.name}</h3>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed mb-2">{s.description}</p>

                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {s.key_points.map((kp) => (
                                <span key={kp} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                  {kp}
                                </span>
                              ))}
                            </div>

                            {s.formulas && (
                              <div className="bg-white rounded-[16px] border border-slate-100 px-3 py-2 mt-2 shadow-sm">
                                <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">公式</div>
                                <MathContent content={s.formulas} className="text-sm leading-6 text-slate-800" />
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                          <Link
                            href={`/practice?section_id=${s.id}&grade=${encodeURIComponent(group.grade)}`}
                            className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                          >
                            去练习 →
                          </Link>
                          <button
                            onClick={() => seedSection(s.id, s.name)}
                            disabled={seeding}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full disabled:opacity-40 whitespace-nowrap"
                          >
                            {seedStatus[s.id] || "生成题库"}
                          </button>
                        </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
