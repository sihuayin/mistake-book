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
    <section className="mx-auto max-w-7xl space-y-5 pb-8">
      <header className="overflow-hidden rounded-[28px] border border-slate-100 bg-white/90 px-5 py-5 shadow-sm md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-sky-600/70">Export Preview</div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">导出预览</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              预览和导出共用同一份 SVG，确认布局通过后再点击导出。
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
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
              返回
            </Link>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="rounded-full bg-slate-950 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "导出中..." : "导出图片"}
            </button>
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-900">{data.student.name}</span>
            {data.student.current_grade && (
              <span className="text-xs text-slate-400">{data.student.current_grade}</span>
            )}
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-700">
              {data.status_label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>证据 {totalEvidenceCount} 条</span>
            <span>可信度 {averageConfidence}%</span>
            <span className={`rounded-full px-2 py-0.5 font-medium ${scoreColor(data.overall_score)}`}>
              {data.overall_score} 分
            </span>
          </div>
        </div>

        <div className="bg-[linear-gradient(180deg,#f8faff_0%,#f0f5ff_100%)] px-3 py-4 md:px-5 md:py-5">
          <div className="flex items-center justify-center">
            <div className="w-full max-w-[1240px]">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`${data.student.name} 的导出预览`}
                  className="block h-auto w-full rounded-2xl shadow-lg"
                  draggable={false}
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-white text-sm text-slate-500">
                  预览生成中...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
