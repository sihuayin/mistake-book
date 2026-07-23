"use client";

import { useMemo } from "react";
import type { DiagramData, DiagramRelation } from "@/lib/types";

function inferPoints(diagram: DiagramData) {
  const explicitPoints = diagram.points ?? [];
  if (explicitPoints.length) {
    return explicitPoints;
  }

  const inferred = new Set<string>();
  (diagram.segments ?? []).forEach(([from, to]) => {
    if (from) inferred.add(from);
    if (to) inferred.add(to);
  });

  return [...inferred];
}

function buildPointMap(points: string[]) {
  const total = Math.max(points.length, 1);
  const radius = total <= 3 ? 82 : total <= 5 ? 94 : 104;
  const centerX = 160;
  const centerY = 120;

  return new Map(
    points.map((point, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
      return [
        point,
        {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        },
      ] as const;
    })
  );
}

function relationText(relation: DiagramRelation) {
  if (relation.kind === "angle") {
    return `${relation.name ?? "角"}${relation.value ? ` = ${relation.value}` : ""}`;
  }
  if (relation.kind === "right_angle") {
    return relation.at ? `${relation.at} 点直角` : "直角";
  }
  if (relation.kind === "parallel") {
    return "平行";
  }
  if (relation.kind === "target") {
    return relation.name ? `求 ${relation.name}` : "目标";
  }
  if (relation.kind === "equal") {
    return relation.items?.length ? "相等关系" : relation.kind;
  }
  return relation.kind;
}

function DiagramMeta({
  diagram,
  className = "",
}: {
  diagram: DiagramData;
  className?: string;
}) {
  const relations = diagram.relations ?? [];
  const labels = diagram.labels ?? [];
  const points = diagram.points ?? [];

  return (
    <div className={`space-y-2 text-left ${className}`}>
      {diagram.scene ? <p className="text-xs leading-5 text-slate-600">{diagram.scene}</p> : null}
      {points.length ? (
        <div className="flex flex-wrap gap-2">
          {points.slice(0, 8).map((point, index) => (
            <span
              key={`${point}-${index}`}
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700"
            >
              {point}
            </span>
          ))}
        </div>
      ) : null}
      {labels.length ? (
        <div className="flex flex-wrap gap-2">
          {labels.slice(0, 6).map((label, index) => (
            <span
              key={`${label.text}-${index}`}
              className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] text-slate-600 shadow-sm"
            >
              {label.text}
            </span>
          ))}
        </div>
      ) : null}
      {relations.length ? (
        <div className="flex flex-wrap gap-2">
          {relations.slice(0, 4).map((relation, index) => (
            <span
              key={`${relation.kind}-${index}`}
              className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700"
            >
              {relationText(relation)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DiagramPreview({
  diagram,
  className = "",
}: {
  diagram: DiagramData;
  className?: string;
}) {
  const isCoordinateGraph = diagram.type === "coordinate_graph";
  const hasSegments = Boolean(diagram.segments?.length);

  const points = useMemo(() => {
    if (isCoordinateGraph || !hasSegments) return [];
    return inferPoints(diagram);
  }, [diagram, hasSegments, isCoordinateGraph]);
  const pointMap = useMemo(() => buildPointMap(points), [points]);
  const segments = useMemo(() => {
    if (diagram.segments?.length) {
      return diagram.segments;
    }

    if (isCoordinateGraph || !hasSegments) {
      return [];
    }

    return [];
  }, [diagram.segments, hasSegments, isCoordinateGraph]);
  const hasDrawablePoints = points.length > 0;

  if (isCoordinateGraph) {
    return (
      <div className={`rounded-[20px] bg-[linear-gradient(180deg,#f7fbff_0%,#edf5ff_100%)] p-4 ${className}`}>
        {diagram.preview_image_base64 ? (
          <div className="overflow-hidden rounded-[16px] border border-white/70 bg-white/60 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={diagram.preview_image_base64}
              alt="坐标图局部裁剪"
              className="max-h-[320px] w-full rounded-[12px] object-contain"
            />
          </div>
        ) : (
          <svg viewBox="0 0 320 240" className="w-full overflow-visible">
            <line x1="34" y1="120" x2="286" y2="120" stroke="#bfd2f3" strokeWidth="1.4" />
            <line x1="160" y1="28" x2="160" y2="212" stroke="#bfd2f3" strokeWidth="1.4" />
            <circle cx="160" cy="120" r="54" fill="none" stroke="#c9daf8" strokeDasharray="6 6" strokeWidth="2" />
            <text x="160" y="116" textAnchor="middle" fontSize="13" fontWeight="600" fill="#45658d">
              坐标图待完善
            </text>
            <text x="160" y="136" textAnchor="middle" fontSize="11" fill="#6b86ab">
              已保留图形类型与局部区域
            </text>
            </svg>
        )}
        {diagram.scene ? <p className="mt-2 text-xs leading-5 text-slate-600">{diagram.scene}</p> : null}
      </div>
    );
  }

  return (
    <div className={`rounded-[20px] bg-[linear-gradient(180deg,#f7fbff_0%,#edf5ff_100%)] p-4 ${className}`}>
      {hasSegments ? (
        <svg viewBox="0 0 320 240" className="w-full overflow-visible">
          {segments.map(([from, to], index) => {
            const start = pointMap.get(from);
            const end = pointMap.get(to);
            if (!start || !end) return null;
            return (
              <line
                key={`${from}-${to}-${index}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="#2f5c9a"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            );
          })}

          {hasDrawablePoints ? (
            [...pointMap.entries()].map(([point, position]) => (
              <g key={point}>
                <circle cx={position.x} cy={position.y} r="4.5" fill="#1d4ed8" />
                <text
                  x={position.x}
                  y={position.y - 10}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="#0f172a"
                >
                  {point}
                </text>
              </g>
            ))
          ) : (
            <g>
              <circle cx="160" cy="120" r="54" fill="none" stroke="#c9daf8" strokeDasharray="6 6" strokeWidth="2" />
              <text x="160" y="116" textAnchor="middle" fontSize="13" fontWeight="600" fill="#45658d">
                图形待完善
              </text>
              <text x="160" y="136" textAnchor="middle" fontSize="11" fill="#6b86ab">
                已保留题干与关系提示
              </text>
            </g>
          )}
        </svg>
      ) : (
        <div className="rounded-[16px] border border-white/70 bg-white/70 px-4 py-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-50 text-sky-700">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 18 9 9l4 6 3-4 4 7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 6h16" strokeLinecap="round" />
            </svg>
          </div>
          <div className="mt-3 text-sm font-medium text-slate-800">
            {diagram.points?.length ? "检测到点位名称" : "检测到图形线索"}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            {diagram.points?.length
              ? "当前只有点名，没有足够的连线信息，暂不按空间位置排布，避免误导成多边形。"
              : "当前只有标签或关系提示，暂不自动拼接轮廓，避免误画成错误图形。"}
          </div>
        </div>
      )}

      {diagram.scene || (diagram.relations ?? []).length ? <DiagramMeta diagram={diagram} className="mt-3" /> : null}
    </div>
  );
}
