"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildOverviewExportSvg, downloadOverviewPng } from "@/lib/overview-export";
import type { StudentOverviewPayload } from "@/lib/overview";

interface StudentOption {
  id: string;
  name: string;
  current_grade: string | null;
}

type PreviewPayload = StudentOverviewPayload & {
  student_options?: StudentOption[];
};

function sanitizeFilename(name: string) {
  return `${name || "student"}-five-point-radar`
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-100";
  if (score >= 60) return "text-amber-700 bg-amber-100";
  return "text-rose-700 bg-rose-100";
}

export default function StudentOverviewExportPreview({ studentId }: { studentId?: string }) {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState(studentId ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedStudentId) params.set("student_id", selectedStudentId);

    fetch(`/api/overview?${params}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "加载失败");
        }
        setData(payload);
        if (!selectedStudentId && payload.student?.id) {
          setSelectedStudentId(payload.student.id);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "加载失败");
        setLoading(false);
      });
  }, [selectedStudentId]);

  const previewUrl = useMemo(
    () => (data ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildOverviewExportSvg(data))}` : ""),
    [data]
  );

  async function handleExport() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const svg = buildOverviewExportSvg(data);
      await downloadOverviewPng(svg, `${sanitizeFilename(data.student.name)}.png`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">导出预览加载中...</div>;
  }

  if (error || !data) {
    return <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700">{error || "暂无预览数据"}</div>;
  }

  const totalEvidenceCount = data.dimensions.reduce((sum, dimension) => sum + dimension.evidence_count, 0);
  const averageConfidence = Math.round(
    data.dimensions.reduce((sum, dimension) => sum + dimension.confidence, 0) / data.dimensions.length
  );

  return (
    <section className="relative isolate space-y-6 pb-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(93,183,255,0.14)_0%,rgba(93,183,255,0)_68%)] blur-3xl" />
        <div className="absolute right-[-6rem] top-28 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(255,216,77,0.18)_0%,rgba(255,216,77,0)_70%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-1 md:px-0">
        <header className="overflow-hidden rounded-[32px] bg-white/88 px-5 py-5 shadow-[0_24px_60px_rgba(77,107,170,0.08)] md:px-7 md:py-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.34em] text-sky-600/75">Export Preview</div>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-tight text-slate-950">
                导出预览
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                这里直接展示最终导出的图片。确认布局没问题后，再点击导出即可。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:pt-1">
              {data.student_options && data.student_options.length > 1 && (
                <select
                  value={selectedStudentId}
                  onChange={(e) => {
                    setSelectedStudentId(e.target.value);
                    setLoading(true);
                    setError("");
                  }}
                  className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {data.student_options.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                      {student.current_grade ? ` · ${student.current_grade}` : ""}
                    </option>
                  ))}
                </select>
              )}
              <Link
                href="/profile"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                返回个人中心
              </Link>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? "导出中..." : "导出图片"}
              </button>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[292px_minmax(0,1fr)] xl:items-start">
          <aside className="space-y-4 xl:sticky xl:top-6">
            <div className="overflow-hidden rounded-[28px] bg-white/90 p-5 shadow-[0_18px_50px_rgba(64,92,143,0.08)]">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">校样面板</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{data.student.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                {data.student.current_grade ? `${data.student.current_grade} · ` : ""}
                先看版式，再导出
              </div>

              <div className="mt-4 rounded-[22px] bg-[linear-gradient(135deg,rgba(93,183,255,0.12)_0%,rgba(255,216,77,0.18)_100%)] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">当前状态</div>
                <div className="mt-3 text-4xl font-semibold text-slate-950">{data.overall_score}</div>
                <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${scoreColor(data.overall_score)}`}>
                  {data.status_label}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {data.overall_trend.summary}
                </p>
                <div className="mt-3 rounded-[16px] bg-white/60 px-3 py-2 text-[11px] leading-5 text-slate-600">
                  本次基于 {totalEvidenceCount} 条学习证据，整体可信度约 {averageConfidence}%
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">导出原则</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  预览和导出共用同一份 SVG，左侧只做判断，右侧只看最终版式。
                </p>
              </div>

              <div className="mt-4 rounded-[22px] border border-sky-100 bg-sky-50/80 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">怎么比较</div>
                <p className="mt-2 text-sm leading-6 text-sky-800">
                  这个五维更适合看“同一个学生的前后变化”，不要拿不同难度、不同题量的试卷硬比高低。
                </p>
              </div>
            </div>
          </aside>

          <div className="overflow-hidden rounded-[32px] bg-white/90 shadow-[0_24px_70px_rgba(64,92,143,0.10)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Preview</div>
                <div className="mt-1 text-sm font-medium text-slate-900">预览和导出同源</div>
              </div>
              <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">实时校样</div>
            </div>

            <div className="bg-[linear-gradient(180deg,#f7fbff_0%,#eef4ff_100%)] px-4 py-4 md:px-6 md:py-6">
              <div className="flex min-h-[calc(100vh-18rem)] items-center justify-center">
                <div className="w-full max-w-[1240px] px-1 md:px-2">
                  {previewUrl ? (
                    // The preview intentionally uses the exact SVG that will be exported.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={`${data.student.name} 的导出预览`}
                      className="block h-auto w-full"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center rounded-[28px] bg-white/60 text-sm text-slate-500">
                      预览生成中...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
