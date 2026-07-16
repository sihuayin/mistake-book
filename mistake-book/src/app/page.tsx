"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MathContent from "@/components/MathContent";

interface WeakSection {
  section_id: string;
  section_name: string;
  grade?: string;
  chapter_title: string;
  error_count: number;
}

interface Mistake {
  id: string;
  section_id: string;
  question_text: string;
  latex_content?: string | null;
  grade?: string | null;
  error_type: string | null;
  created_at: number;
}

interface User {
  id: string;
  name: string;
  role: string;
  current_grade?: string | null;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [weakSections, setWeakSections] = useState<WeakSection[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!u) { router.push("/login"); return; }
        if (u.role === "parent") { router.push("/parent"); return; }
        setUser(u);
        const gradeParam = u.current_grade ? `?grade=${encodeURIComponent(u.current_grade)}` : "";
        return Promise.all([
          fetch(`/api/practice${gradeParam}`).then((r) => r.json()),
          fetch(`/api/mistakes${gradeParam}`).then((r) => r.json()),
        ]);
      })
      .then((results) => {
        if (!results) return;
        const [sections, mistakes] = results;
        setWeakSections((sections as WeakSection[]).filter((s) => s.error_count > 0).slice(0, 5));
        setRecentMistakes((mistakes as Mistake[]).slice(0, 5));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">加载中...</div>;
  }

  const totalMistakes = recentMistakes.length;
  const focusSection = weakSections[0];

  return (
    <div className="space-y-6">
      <section className="glass-panel overflow-hidden rounded-[30px] px-5 py-5 md:px-7 md:py-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:items-end">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-sky-600/70">Math Mission Control</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">你好，{user?.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              先看整体状态，再解决最容易反复出错的 1 到 2 个点。今天的重点不是刷更多题，而是把关键漏洞补住。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/practice"
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                去练习
              </Link>
              <Link
                href="/mistakes/add"
                className="rounded-full bg-[linear-gradient(135deg,#5db7ff_0%,#7f78ff_100%)] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                录入错题
              </Link>
              <Link
                href="/profile"
                className="rounded-full border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-medium text-slate-700 transition-transform hover:-translate-y-0.5"
              >
                查看能力总览
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(93,183,255,0.14)_0%,rgba(255,216,77,0.16)_100%)] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-sky-700/70">Today Focus</div>
            <div className="mt-3 text-lg font-semibold text-slate-900">
              {focusSection?.section_name ?? "今天先做一次轻复盘"}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {focusSection
                ? "先把当前最薄弱的章节做一轮针对练习，再回看对应错题。"
                : "没有明显薄弱项时，适合用少量练习维持节奏。"}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-panel rounded-[24px] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Weekly Mistakes</div>
          <div className="mt-3 text-4xl font-semibold text-sky-600">{totalMistakes}</div>
          <div className="mt-2 text-sm text-slate-600">本周新录入错题</div>
        </div>
        <div className="glass-panel rounded-[24px] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Risk Chapters</div>
          <div className="mt-3 text-4xl font-semibold text-amber-500">{weakSections.length}</div>
          <div className="mt-2 text-sm text-slate-600">当前需要重点补强的章节</div>
        </div>
        <div className="glass-panel rounded-[24px] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Today Focus</div>
          <div className="mt-3 text-lg font-semibold text-emerald-600">
            {focusSection?.section_name ?? "继续保持"}
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {focusSection
              ? "先把最靠前的薄弱点吃透，再扩大练习范围"
              : "今天适合做少量复盘，维持手感"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel rounded-[28px] p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">能力总览已移到个人中心</h2>
              <p className="mt-1 text-xs text-slate-500">五维能力、趋势和建议统一放到一个页面查看</p>
            </div>
            <Link href="/profile" className="text-sm text-sky-700 hover:underline">
              去个人中心
            </Link>
          </div>
          <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(93,183,255,0.12)_0%,rgba(127,120,255,0.1)_55%,rgba(255,216,77,0.16)_100%)] p-5">
            <div className="text-sm font-medium text-slate-900">更适合整块查看整体状态</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              首页只保留欢迎和今天要做的事，能力五芒星、薄弱项分析、本周优先事项都集中到个人中心，阅读会更清楚。
            </p>
          </div>
        </section>

        <section className="glass-panel min-w-0 rounded-[28px] p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">优先突破的章节</h2>
              <p className="mt-1 text-xs text-slate-500">先修最容易反复丢分的地方</p>
            </div>
            <Link href="/practice" className="text-sm text-sky-700 hover:underline">
              去练习
            </Link>
          </div>

          {weakSections.length === 0 ? (
            <div className="rounded-[22px] bg-emerald-50 px-5 py-8 text-center text-emerald-700">
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-sm">暂无明显薄弱章节，继续保持这个节奏。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weakSections.map((s) => (
                <Link
                  key={s.section_id}
                  href={`/practice?section_id=${s.section_id}${s.grade ? `&grade=${encodeURIComponent(s.grade)}` : ""}`}
                  className="group block rounded-[22px] border border-slate-200/70 bg-white/80 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-sky-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">{s.section_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{[s.grade, s.chapter_title].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs text-rose-700">
                      {s.error_count} 道错题
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-sky-700">
                    去做这个章节的针对练习
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="glass-panel min-w-0 rounded-[28px] p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">最近错题</h2>
            <p className="mt-1 text-xs text-slate-500">回看最近的失误，避免重复出现</p>
          </div>
          <Link href="/mistakes" className="text-sm text-sky-700 hover:underline">
            看全部
          </Link>
        </div>

        {recentMistakes.length === 0 ? (
          <div className="rounded-[22px] bg-slate-50 px-5 py-8 text-center text-slate-500">
            <div className="text-4xl mb-2">📝</div>
            <p className="text-sm">还没有错题，先录入第一道题。</p>
            <Link href="/mistakes/add" className="mt-3 inline-block text-sm text-sky-700 hover:underline">
              去录入
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentMistakes.map((m) => (
              <Link
                key={m.id}
                href={`/mistakes/${m.id}`}
                className="block rounded-[20px] border border-slate-200/70 bg-white/85 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-cyan-300"
              >
                <MathContent
                  content={m.latex_content || m.question_text}
                  className="line-clamp-2 text-sm leading-6 text-slate-800"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">{[m.grade, m.section_id].filter(Boolean).join(" · ")}</span>
                  {m.error_type && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      {m.error_type}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/knowledge-base"
          className="glass-panel rounded-[26px] p-6 transition-transform hover:-translate-y-0.5"
        >
          <div className="text-3xl mb-3">🗺️</div>
          <div className="font-medium text-base text-slate-900">知识图谱</div>
          <div className="mt-1 text-sm text-slate-500">按初中阶段查看章节，把练习放到正确知识点上</div>
        </Link>
        <Link
          href="/profile"
          className="rounded-[26px] border border-transparent bg-[linear-gradient(135deg,rgba(93,183,255,0.17)_0%,rgba(127,120,255,0.14)_55%,rgba(255,216,77,0.22)_100%)] p-6 shadow-[0_20px_45px_rgba(93,183,255,0.16)] transition-transform hover:-translate-y-0.5"
        >
          <div className="text-3xl mb-3">⭐</div>
          <div className="font-medium text-base text-sky-800">个人中心</div>
          <div className="mt-1 text-sm text-sky-700/80">查看五维能力、薄弱点分析和本周学习建议</div>
        </Link>
      </div>
    </div>
  );
}
