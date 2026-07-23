"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  const [error, setError] = useState("");

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
    let active = true;

    async function loadSections() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (filterGrade) params.set("grade", filterGrade);

      try {
        const response = await fetch(`/api/practice?${params}`);
        const data = await response.json();
        if (!active) return;

        if (!response.ok) {
          throw new Error(data?.error || "练习列表加载失败");
        }

        setSections(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : "练习列表加载失败");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSections();

    return () => {
      active = false;
    };
  }, [filterGrade]);

  async function startSession(sectionId: string) {
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: sectionId }),
    });
    const data = await res.json();
    router.push(`/practice/${data.session_id}`);
  }

  useEffect(() => {
    if (presetSection && sections.length > 0) {
      void startSession(presetSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetSection, sections]);

  const weakSections = useMemo(() => sections.filter((s) => s.error_count > 0), [sections]);
  const totalSections = sections.length;
  const totalWeakErrors = weakSections.reduce((sum, section) => sum + section.error_count, 0);
  const topWeakSection = weakSections[0];

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">练习场加载中...</div>;
  }

  return (
    <section className="relative isolate overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,#f7fbff_0%,#edf3ff_42%,#ffffff_100%)] px-4 py-5 md:px-6 md:py-6">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-6rem] top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(93,183,255,0.22)_0%,rgba(93,183,255,0)_72%)] blur-2xl" />
        <div className="absolute right-[-4rem] top-28 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,216,77,0.22)_0%,rgba(255,216,77,0)_72%)] blur-2xl" />
        <div className="absolute bottom-[-6rem] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(94,215,178,0.18)_0%,rgba(94,215,178,0)_72%)] blur-2xl" />
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[32px] border border-white/70 bg-white/88 px-5 py-5 shadow-[0_20px_60px_rgba(82,112,170,0.10)] md:px-7 md:py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.32em] text-sky-600/70">Practice Atlas</div>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-tight text-slate-950">
                练习场
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                先看薄弱点，再开始练习。这里把“该练什么”和“为什么要练”放在最前面，减少盲目刷题。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px] lg:grid-cols-1">
              <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(93,183,255,0.16)_0%,rgba(255,255,255,0.85)_100%)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">章节总数</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{totalSections}</div>
              </div>
              <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(255,216,77,0.20)_0%,rgba(255,255,255,0.85)_100%)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700/70">薄弱章节</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{weakSections.length}</div>
              </div>
              <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(94,215,178,0.18)_0%,rgba(255,255,255,0.85)_100%)] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-700/70">错题数量</div>
                <div className="mt-2 text-3xl font-semibold text-slate-950">{totalWeakErrors}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="rounded-[30px] border border-white/70 bg-white/88 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">按年级筛选</h2>
                  <p className="mt-1 text-sm text-slate-500">先缩小范围，再找最值得练的一章。</p>
                </div>
                <select
                  value={filterGrade}
                  onChange={(e) => setFilterGrade(e.target.value)}
                  className="min-w-[180px] rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">全部年级</option>
                  {grades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? (
              <div className="rounded-[24px] border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {weakSections.length > 0 ? (
              <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">优先练这一章</h2>
                    <p className="mt-1 text-sm text-slate-500">根据错题量和章节分布自动提取，适合今天先补。</p>
                  </div>
                  <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    建议优先
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {weakSections.slice(0, 5).map((section, index) => (
                    <button
                      key={section.section_id}
                      onClick={() => void startSession(section.section_id)}
                      className="group grid gap-4 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(93,183,255,0.06)_0%,rgba(255,255,255,1)_48%,rgba(255,216,77,0.10)_100%)] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_14px_34px_rgba(82,112,170,0.10)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-sky-600/70">重点 {index + 1}</div>
                          <div className="mt-2 text-sm font-semibold text-slate-950">{section.section_name}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {section.grade} · {section.chapter_title}
                          </div>
                        </div>
                        <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
                          {section.error_count} 道错题
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs leading-5 text-slate-500">
                          适合先做 10 到 15 分钟，把这一章的老问题先打掉。
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors group-hover:border-sky-300 group-hover:text-sky-700">
                          开始练习
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)] md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">章节地图</h2>
                  <p className="mt-1 text-sm text-slate-500">所有章节都在这里，按需进入。</p>
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  可随时切换
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {sections.map((section) => (
                  <button
                    key={section.section_id}
                    onClick={() => void startSession(section.section_id)}
                    className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_12px_28px_rgba(82,112,170,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-950">{section.section_name}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {section.grade} · {section.chapter_title}
                        </div>
                      </div>
                      {section.error_count > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                          {section.error_count} 错
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                          状态平稳
                        </span>
                      )}
                    </div>
                    <div className="mt-3 text-xs text-sky-700">进入练习 →</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(16,32,62,0.98)_0%,rgba(31,91,154,0.98)_100%)] p-5 text-white shadow-[0_24px_60px_rgba(21,56,103,0.24)]">
              <div className="text-[11px] uppercase tracking-[0.24em] text-sky-100/75">Today</div>
              <div className="mt-2 text-xl font-semibold">今天先做什么</div>
              <p className="mt-3 text-sm leading-6 text-sky-100/78">
                先打开最薄弱的章节，做一组题，把遗留的错题趋势压下去。
              </p>
              <div className="mt-4 rounded-[22px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/70">当前优先</div>
                <div className="mt-2 text-base font-medium text-white">
                  {topWeakSection ? topWeakSection.section_name : "暂无明显薄弱章节"}
                </div>
                <div className="mt-1 text-sm leading-6 text-sky-100/78">
                  {topWeakSection
                    ? `${topWeakSection.grade} · ${topWeakSection.chapter_title}`
                    : "整体练习比较均衡，可以从最近章节开始保持节奏。"}
                </div>
              </div>
              <div className="mt-4 rounded-[22px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/70">练习建议</div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-sky-100/82">
                  <li>先做薄弱章，再补中间章节。</li>
                  <li>一次只盯一章，练完立刻复盘。</li>
                  <li>把错题和练习连在一起看。</li>
                </ul>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_54px_rgba(82,112,170,0.08)]">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Filter Result</div>
              <div className="mt-2 text-sm font-medium text-slate-900">当前筛选</div>
              <div className="mt-3 space-y-3">
                <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">年级</div>
                  <div className="mt-1 text-sm text-slate-900">{filterGrade || "全部年级"}</div>
                </div>
                <div className="rounded-[18px] bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">章节</div>
                  <div className="mt-1 text-sm text-slate-900">{sections.length ? `${sections.length} 个可练章节` : "暂无章节"}</div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">练习场加载中...</div>}>
      <PracticeContent />
    </Suspense>
  );
}
