"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildOverviewExportSvg, downloadOverviewPng } from "@/lib/overview-export";
import type {
  AbilityDimension,
  StudentOverviewPayload,
} from "@/lib/overview";

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-100";
  if (score >= 60) return "text-amber-700 bg-amber-100";
  return "text-rose-700 bg-rose-100";
}

function trendColor(direction: "up" | "down" | "flat") {
  if (direction === "up") return "text-emerald-700 bg-emerald-100";
  if (direction === "down") return "text-rose-700 bg-rose-100";
  return "text-stone-600 bg-stone-100";
}

function trendLabel(direction: "up" | "down" | "flat", delta: number) {
  if (direction === "up") return `↑ ${Math.abs(delta)}`;
  if (direction === "down") return `↓ ${Math.abs(delta)}`;
  return "→ 0";
}

function levelLabel(score: number) {
  if (score >= 80) return "表现稳定";
  if (score >= 60) return "继续补强";
  return "优先关注";
}

function simplifyStatusSummary(summary: string) {
  return summary
    .replace("当前整体状态较稳，可以把训练重点放在提速和综合题。", "整体比较稳定，可以开始做更综合的题。")
    .replace("基础和习惯都有一定积累，但还有几项能力需要刻意补强。", "基础已经有了，接下来重点补两项短板。")
    .replace("整体能力结构还不均衡，建议先抓最薄弱的两项，形成小闭环。", "先别同时补很多，先集中解决最弱的两项。");
}

function normalizeRecommendationDetail(detail: string) {
  return detail
    .replace("建议优先回到高频错题章节，先做同知识点的基础题，降低题型跳跃。", "先回到最近最常错的知识点，做几道基础同类题，把概念站稳。")
    .replace("建议集中做步骤短、反馈快的计算题，盯住符号、抄写和移项这类过程错误。", "先做几道短题，专门盯住符号、抄写和移项。")
    .replace("建议把反思从“我不会”升级成“我错在第几步、下次怎么避免”。", "每道错题都尽量说清：错在哪一步，下次怎么避免。")
    .replace("建议先把已经录入的错题复盘完，再继续新增练习，避免旧问题反复出现。", "先把已有错题复盘完，再继续加新题。")
    .replace("建议先固定每天一个短时练习窗口，优先覆盖当前年级的薄弱章节。", "先恢复每天固定练习，优先练当前最薄弱的章节。");
}

function normalizeFocusDetail(detail: string) {
  return detail
    .replace("这一项是当前最短板，先把相关动作做连续 3 到 5 天，比同时摊开很多任务更有效。", "这是当前最需要先补的一项，连续练 3 到 5 天会更有效。")
    .replace("建议从这个知识点开始做 2 到 3 组同类题，目标不是刷量，而是把错误模式改掉。", "先围绕这个知识点做 2 到 3 组同类题，重点是改掉老问题。")
    .replace("先把已经到期的错题复盘掉，再继续新增练习，能更快提升整体稳定性。", "先把到期错题复盘完，再加新练习，效果会更稳。")
    .replace("把练习和复盘固定在每天同一时间，优先维持节奏，不要忽快忽慢。", "把练习和复盘固定在同一时间，先把节奏稳住。");
}

const DIMENSION_GUIDE: Record<
  string,
  {
    title: string;
    detail: string;
    compare: string;
  }
> = {
  knowledge_mastery: {
    title: "知识掌握",
    detail: "看章节知识点是否真正会了，重点是同类题是否反复出错。",
    compare: "分数越高，说明知识结构越稳，同一个学生前后对比更有意义。",
  },
  calculation_stability: {
    title: "计算稳定",
    detail: "看过程是否稳，是否容易在符号、抄写、移项和步骤上丢分。",
    compare: "分数越高，说明做题过程越稳定，更适合看连续变化。",
  },
  reflection_quality: {
    title: "反思质量",
    detail: "看错题后有没有写清错因和改法，而不只是写“粗心”或“不会”。",
    compare: "分数越高，说明错题能沉淀成经验，长期提升更明显。",
  },
  review_execution: {
    title: "复习执行",
    detail: "看到期复习有没有完成，错题有没有真正被回看和订正。",
    compare: "分数越高，说明复盘闭环越完整，和上次比更能看出进步。",
  },
  practice_engagement: {
    title: "练习投入",
    detail: "看最近练习是否连续、是否覆盖足够、是否把题真正做完。",
    compare: "分数越高，说明练习节奏更稳定，适合跟踪趋势。",
  },
};

function useRadarPoints(dimensions: AbilityDimension[]) {
  return useMemo(() => buildRadarPoints(dimensions), [dimensions]);
}

function buildRadarPoints(dimensions: AbilityDimension[]) {
  const cx = 140;
  const cy = 140;
  const radius = 90;
  return dimensions.map((dimension, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / dimensions.length;
    const outerX = cx + Math.cos(angle) * radius;
    const outerY = cy + Math.sin(angle) * radius;
    const pointRadius = radius * (dimension.score / 100);
    const valueX = cx + Math.cos(angle) * pointRadius;
    const valueY = cy + Math.sin(angle) * pointRadius;
    const labelRadius = radius + 18;
    const labelX = cx + Math.cos(angle) * labelRadius;
    const labelY = cy + Math.sin(angle) * labelRadius + (Math.sin(angle) > 0 ? -8 : 8);

    return {
      ...dimension,
      outerX,
      outerY,
      valueX,
      valueY,
      labelX,
      labelY,
    };
  });
}
export default function StudentOverviewPanel({
  studentId,
  title = "能力总览",
}: {
  studentId?: string;
  title?: string;
}) {
  const [data, setData] = useState<StudentOverviewPayload | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState(studentId ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

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

  const radarPoints = useRadarPoints(data?.dimensions ?? []);
  const polygonPoints = radarPoints.map((point) => `${point.valueX},${point.valueY}`).join(" ");
  const ringLevels = [0.25, 0.5, 0.75, 1];

  if (loading) {
    return <div className="rounded-[28px] border border-stone-200 bg-white p-6 text-sm text-gray-400">能力总览加载中...</div>;
  }

  if (error || !data) {
    return <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700">{error || "暂无总览数据"}</div>;
  }

  const visibleTips =
    data.audience === "student"
      ? data.conversation_tips.filter((tip) => tip.audience !== "parent")
      : data.conversation_tips.filter((tip) => tip.audience !== "student");
  const topDimensions = [...data.dimensions].sort((a, b) => b.score - a.score);
  const strongestDimension = topDimensions[0];
  const weakestDimension = [...data.dimensions].sort((a, b) => a.score - b.score)[0];
  const visibleRecommendations = data.recommendations.slice(0, 3);
  const visibleWeakSections = data.weak_sections.slice(0, 3);
  const visibleFocus = data.weekly_focus.slice(0, 3);
  const visibleTipCards = visibleTips.slice(0, 2);
  const totalEvidenceCount = data.dimensions.reduce((sum, dimension) => sum + dimension.evidence_count, 0);
  const averageConfidence = Math.round(
    data.dimensions.reduce((sum, dimension) => sum + dimension.confidence, 0) / data.dimensions.length
  );

  async function handleExport() {
    if (!data || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const svg = buildOverviewExportSvg(data);
      const safeName = `${data.student.name || "student"}-five-point-radar`
        .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      await downloadOverviewPng(svg, `${safeName}.png`);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="glass-panel overflow-hidden rounded-[34px] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-sky-600/70">Learning Snapshot</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
            {data.student.name}
            {data.student.current_grade ? ` · ${data.student.current_grade}` : ""}
            {" · "}
            {simplifyStatusSummary(data.status_summary)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data.student_options && data.student_options.length > 1 && (
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value);
                setLoading(true);
                setError("");
              }}
              className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {data.student_options.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}{student.current_grade ? ` · ${student.current_grade}` : ""}
                </option>
              ))}
            </select>
          )}
          <div className={`rounded-full px-4 py-1.5 text-xs font-medium ${scoreColor(data.overall_score)}`}>
            {data.status_label} · {data.overall_score}
          </div>
          <Link
            href="/profile/export-preview"
            className="rounded-full border border-sky-200 bg-sky-50/80 px-4 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
          >
            查看导出预览
          </Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? "导出中..." : "导出图片"}
          </button>
        </div>
      </div>

      {exportError ? (
        <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {exportError}
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#10203e_0%,#17305c_45%,#1f5b9a_100%)] px-5 py-5 text-white shadow-[0_24px_60px_rgba(21,56,103,0.34)]">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(255,216,77,0.6)_0%,rgba(255,216,77,0)_72%)]" />
          <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(94,215,178,0.38)_0%,rgba(94,215,178,0)_72%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-stretch">
            <div className="min-w-0">
              <svg viewBox="0 0 280 280" className="relative mx-auto block h-[320px] w-full max-w-[380px] lg:mx-0 lg:h-[380px] lg:max-w-[460px]">
                {ringLevels.map((level) => {
                  const ring = radarPoints
                    .map((point) => {
                      const x = 140 + (point.outerX - 140) * level;
                      const y = 140 + (point.outerY - 140) * level;
                      return `${x},${y}`;
                    })
                    .join(" ");
                  return <polygon key={level} points={ring} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />;
                })}

                {radarPoints.map((point) => (
                  <line
                    key={`axis-${point.key}`}
                    x1="140"
                    y1="140"
                    x2={point.outerX}
                    y2={point.outerY}
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="1"
                  />
                ))}

                <polygon
                  points={polygonPoints}
                  fill="rgba(93,183,255,0.34)"
                  stroke="rgba(255,216,77,0.96)"
                  strokeWidth="2.5"
                />

                {radarPoints.map((point) => (
                  <g key={point.key}>
                    <circle cx={point.valueX} cy={point.valueY} r="4.2" fill="#fff4b6" stroke="#0f172a" strokeWidth="2" />
                    <text
                      x={point.labelX}
                      y={point.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(255,255,255,0.92)"
                      fontSize="11"
                    >
                      {point.shortLabel}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="flex flex-col items-stretch gap-3">
              <div className="rounded-[18px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.22em] text-sky-100/70">Five-point Radar</div>
                <div className="mt-2 text-5xl font-semibold tracking-tight text-white">{data.overall_score}</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${trendColor(data.overall_trend.direction)}`}>
                    近7日 {trendLabel(data.overall_trend.direction, data.overall_trend.delta)}
                  </div>
                </div>
                <div className="mt-3 text-xs text-sky-100/72">
                  <div>整体状态</div>
                  <div className="mt-1 leading-5">{data.overall_trend.summary}</div>
                </div>
                <div className="mt-3 rounded-[14px] bg-white/10 px-3 py-2 text-[11px] leading-5 text-sky-100/78">
                  本次基于 {totalEvidenceCount} 条学习证据，整体可信度约 {averageConfidence}%
                </div>
              </div>
              <div className="rounded-[18px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/70">最稳的一项</div>
                <div className="mt-2 text-sm font-medium text-white">{strongestDimension?.label ?? "暂无数据"}</div>
                <div className="mt-1 text-xs leading-5 text-sky-100/78">{strongestDimension?.summary ?? "继续保持当前节奏"}</div>
              </div>
              <div className="rounded-[18px] bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/70">最该补的一项</div>
                <div className="mt-2 text-sm font-medium text-white">{weakestDimension?.label ?? "暂无数据"}</div>
                <div className="mt-1 text-xs leading-5 text-sky-100/78">{weakestDimension?.trend.summary ?? "先从最薄弱维度开始"}</div>
              </div>
            </div>
          </div>
        </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">五维怎么看</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  这不是单次分数，而是基于当前证据形成的学习快照。样本越多，判断越稳。
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                本次证据 {totalEvidenceCount} 条
                </div>
              </div>
              <div className="mt-4 rounded-[20px] bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-900">怎么比较</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  这个五维更适合看“同一个学生的前后变化”，不要拿不同难度、不同题量的试卷硬比高低。
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {data.dimensions.map((dimension) => {
                  const guide = DIMENSION_GUIDE[dimension.key];
                return (
                  <div key={`guide-${dimension.key}`} className="rounded-[20px] bg-slate-50 px-4 py-4">
                    <div className="text-sm font-medium text-slate-900">{guide?.title ?? dimension.label}</div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{guide?.detail ?? dimension.summary}</p>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">{guide?.compare ?? dimension.trend.summary}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-[24px] border border-slate-200/70 bg-white/86 p-4 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{dimension.label}</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="text-3xl font-semibold text-slate-900">{dimension.score}</div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${scoreColor(dimension.score)}`}>
                      {levelLabel(dimension.score)}
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${trendColor(dimension.trend.direction)}`}>
                      {trendLabel(dimension.trend.direction, dimension.trend.delta)}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">{dimension.summary}</p>
                <p className="mt-2 text-[11px] text-slate-400">{dimension.trend.summary}</p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  {dimension.evidence_label}，可信度 {dimension.confidence}%
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[26px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">下一步先做什么</h3>
                <span className="text-xs text-slate-400">只盯住 1 到 3 项</span>
              </div>
              <div className="mt-4 space-y-3">
                {visibleRecommendations.map((item, index) => (
                  <Link
                    key={`${item.type}-${index}`}
                    href={item.href}
                    className="block rounded-[20px] border border-slate-200/80 bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-900">{item.title}</div>
                      <span className="text-xs text-sky-700">去完成</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{normalizeRecommendationDetail(item.detail)}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">高风险知识点</h3>
                <span className="text-xs text-slate-400">优先止住反复出错</span>
              </div>
              <div className="mt-4 space-y-3">
                {data.weak_sections.length === 0 ? (
                  <div className="rounded-[18px] bg-emerald-50 px-4 py-5 text-sm text-emerald-700">
                    目前没有明显堆积的薄弱章节，整体状态比较均衡。
                  </div>
                ) : (
                  visibleWeakSections.map((section) => (
                    <Link
                      key={section.section_id}
                      href={`/practice?section_id=${section.section_id}${section.grade ? `&grade=${encodeURIComponent(section.grade)}` : ""}`}
                      className="block rounded-[20px] border border-slate-200/80 bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/70"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{section.section_name}</div>
                        <div className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                          {section.error_count} 次失误
                        </div>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {[section.grade, section.chapter_title].filter(Boolean).join(" · ")}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[26px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">本周优先事项</h3>
                <span className="text-xs text-slate-400">少而稳，比堆任务更重要</span>
              </div>
              <div className="mt-4 space-y-3">
                {visibleFocus.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-[20px] bg-[linear-gradient(135deg,rgba(93,183,255,0.08)_0%,rgba(255,216,77,0.16)_100%)] px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">{item.title}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{normalizeFocusDetail(item.detail)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200/70 bg-white/86 p-5 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">沟通建议</h3>
                <span className="text-xs text-slate-400">一句话说清重点</span>
              </div>
              <div className="mt-4 space-y-3">
                {visibleTipCards.map((tip) => (
                  <div key={tip.title} className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">{tip.title}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{tip.prompt}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
