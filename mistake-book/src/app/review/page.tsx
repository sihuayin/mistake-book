"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MathContent from "@/components/MathContent";

interface ReviewItem {
  id: string;
  question_id: string;
  section_id: string;
  question_text: string;
  latex_content: string | null;
  knowledge_points: string[];
  due_at: number;
  reviewed_at: number | null;
  status: string;
  is_overdue: boolean;
}

export default function ReviewPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const authRes = await fetch("/api/auth/me");
      if (!authRes.ok) { router.push("/login"); return; }
      const res = await fetch("/api/reviews");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setReviews(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void loadReviews(); }, [loadReviews]);

  async function markDone(id: string) {
    try {
      const res = await fetch("/api/reviews/" + id, { method: "PATCH" });
      if (!res.ok) throw new Error("操作失败");
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, status: "done", reviewed_at: Date.now() } : r));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "操作失败"); }
  }

  async function markMissed(id: string) {
    try {
      const res = await fetch("/api/reviews/" + id, { method: "DELETE" });
      if (!res.ok) throw new Error("操作失败");
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, status: "missed", reviewed_at: Date.now() } : r));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "操作失败"); }
  }

  const pending = reviews.filter((r) => r.status === "pending");
  const overdue = pending.filter((r) => r.is_overdue);
  const upcoming = pending.filter((r) => !r.is_overdue);
  const done = reviews.filter((r) => r.status === "done");

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">复习计划加载中...</div>;
  }

  return (
    <section className="relative isolate overflow-hidden rounded-[36px] px-4 py-5 md:px-6 md:py-6 bg-gradient-to-b from-sky-50 via-blue-50 to-white">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 overflow-hidden rounded-[32px] border border-white/70 bg-white/88 px-5 py-5 shadow-md md:px-7 md:py-6">
          <div className="text-xs uppercase tracking-widest text-rose-500">Review Schedule</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">复习计划</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            错题录入后，系统按艾宾浩斯遗忘曲线自动安排了复习时间点。按计划完成复习，才能真正把错题转化为能力提升。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-white px-4 py-4">
              <div className="text-xs uppercase tracking-wider text-rose-600">已过期</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{overdue.length}</div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-white px-4 py-4">
              <div className="text-xs uppercase tracking-wider text-sky-600">即将到期</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{upcoming.length}</div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white px-4 py-4">
              <div className="text-xs uppercase tracking-wider text-emerald-600">已完成</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{done.length}</div>
            </div>
          </div>
        </header>

        {error ? <div className="mb-5 rounded-2xl bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div> : null}

        {reviews.length === 0 ? (
          <div className="rounded-3xl border bg-white/90 px-6 py-12 text-center">
            <div className="text-5xl mb-4">📅</div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">暂无复习计划</h2>
            <p className="text-sm text-slate-500 mb-4">录入错题后会自动生成复习计划，按时完成复习才能巩固记忆。</p>
            <Link href="/mistakes/add" className="inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">去录入错题</Link>
          </div>
        ) : (
          <div className="space-y-5">
            {overdue.length > 0 && (
              <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-md md:p-6">
                <h2 className="text-base font-semibold text-rose-700 mb-1">⚠️ 已过期复习</h2>
                <p className="text-sm text-slate-500 mb-4">这些复习已经到期，尽快完成可以帮助巩固记忆。</p>
                <div className="space-y-3">
                  {overdue.slice(0, 10).map((review) => (
                    <div key={review.id} className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <MathContent content={review.latex_content || review.question_text} className="text-sm font-medium text-slate-900 leading-6 line-clamp-2" />
                          {review.knowledge_points?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {review.knowledge_points.map((kp, i) => (
                                <span key={kp + i} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-700">{kp}</span>
                              ))}
                            </div>
                          )}
                          <p className="mt-2 text-xs text-rose-600">原定 {new Date(review.due_at).toLocaleDateString("zh-CN")} 到期</p>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button onClick={() => void markDone(review.id)} className="rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200">已完成</button>
                          <button onClick={() => void markMissed(review.id)} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200">跳过</button>
                        </div>
                      </div>
                      <Link href={"/mistakes/" + review.question_id} className="mt-2 inline-block text-xs text-sky-700 hover:underline">查看题目详情 →</Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-md md:p-6">
                <h2 className="text-base font-semibold text-sky-700 mb-1">🔔 即将到期</h2>
                <p className="text-sm text-slate-500 mb-4">合理安排时间，不要等到过期再匆忙完成。</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcoming.slice(0, 8).map((review) => (
                    <div key={review.id} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <MathContent content={review.latex_content || review.question_text} className="text-sm text-slate-900 leading-6 line-clamp-2" />
                          <p className="mt-2 text-xs text-sky-600">到期: {new Date(review.due_at).toLocaleDateString("zh-CN")}</p>
                        </div>
                        <button onClick={() => void markDone(review.id)} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 shrink-0">标记完成</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
