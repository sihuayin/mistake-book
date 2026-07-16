"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface AbilityDimension {
  key: string;
  label: string;
  shortLabel: string;
  score: number;
  summary: string;
  trend: {
    delta: number;
    direction: "up" | "down" | "flat";
    summary: string;
  };
}

interface OverviewRecommendation {
  type: "dimension" | "section";
  title: string;
  detail: string;
  href: string;
}

interface OverviewFocusItem {
  title: string;
  detail: string;
}

interface OverviewConversationTip {
  audience: "student" | "parent" | "teacher";
  title: string;
  prompt: string;
}

interface StudentOption {
  id: string;
  name: string;
  current_grade: string | null;
}

interface StudentOverviewPayload {
  student: {
    id: string;
    name: string;
    current_grade: string | null;
  };
  audience: "student" | "parent";
  dimensions: AbilityDimension[];
  overall_score: number;
  overall_trend: {
    delta: number;
    direction: "up" | "down" | "flat";
    summary: string;
  };
  status_label: string;
  status_summary: string;
  weak_sections: Array<{
    section_id: string;
    section_name: string;
    chapter_title: string;
    grade: string | null;
    error_count: number;
  }>;
  recommendations: OverviewRecommendation[];
  weekly_focus: OverviewFocusItem[];
  conversation_tips: OverviewConversationTip[];
  student_options?: StudentOption[];
}

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

function useRadarPoints(dimensions: AbilityDimension[]) {
  return useMemo(() => {
    const cx = 140;
    const cy = 140;
    const radius = 96;
    return dimensions.map((dimension, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / dimensions.length;
      const outerX = cx + Math.cos(angle) * radius;
      const outerY = cy + Math.sin(angle) * radius;
      const pointRadius = radius * (dimension.score / 100);
      const valueX = cx + Math.cos(angle) * pointRadius;
      const valueY = cy + Math.sin(angle) * pointRadius;
      const labelX = cx + Math.cos(angle) * (radius + 26);
      const labelY = cy + Math.sin(angle) * (radius + 26);

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
  }, [dimensions]);
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

  useEffect(() => {
    setLoading(true);
    setError("");
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
            {data.status_summary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data.student_options && data.student_options.length > 1 && (
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
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
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#10203e_0%,#17305c_45%,#1f5b9a_100%)] px-5 py-5 text-white shadow-[0_24px_60px_rgba(21,56,103,0.34)]">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(255,216,77,0.6)_0%,rgba(255,216,77,0)_72%)]" />
          <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(94,215,178,0.38)_0%,rgba(94,215,178,0)_72%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-stretch">
            <div className="min-w-0">
              <svg viewBox="0 0 280 280" className="relative mx-auto block h-[360px] w-full max-w-[420px] lg:mx-0 lg:h-[420px] lg:max-w-[500px]">
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
                    <circle cx={point.valueX} cy={point.valueY} r="4.5" fill="#fff4b6" stroke="#0f172a" strokeWidth="2" />
                    <text
                      x={point.labelX}
                      y={point.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(255,255,255,0.92)"
                      fontSize="12"
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-[24px] border border-slate-200/70 bg-white/86 p-4 shadow-[0_14px_30px_rgba(72,102,159,0.06)]">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{dimension.label}</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="text-3xl font-semibold text-slate-900">{dimension.score}</div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${scoreColor(dimension.score)}`}>
                      {dimension.score >= 80 ? "稳" : dimension.score >= 60 ? "中" : "弱"}
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${trendColor(dimension.trend.direction)}`}>
                      {trendLabel(dimension.trend.direction, dimension.trend.delta)}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">{dimension.summary}</p>
                <p className="mt-2 text-[11px] text-slate-400">{dimension.trend.summary}</p>
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
                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
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
                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
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
