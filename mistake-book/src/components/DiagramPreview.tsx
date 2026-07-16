"use client";

import { useMemo } from "react";
import type { DiagramData, DiagramRelation } from "@/lib/types";

function buildPointMap(diagram: DiagramData) {
  const points = diagram.points ?? [];
  const total = Math.max(points.length, 1);
  const radius = total <= 3 ? 82 : total <= 5 ? 94 : 106;
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
  return relation.kind;
}

export default function DiagramPreview({
  diagram,
  className = "",
}: {
  diagram: DiagramData;
  className?: string;
}) {
  const pointMap = useMemo(() => buildPointMap(diagram), [diagram]);
  const relations = diagram.relations ?? [];
  const segments = diagram.segments ?? [];

  return (
    <div className={`rounded-[20px] bg-[linear-gradient(180deg,#f7fbff_0%,#edf5ff_100%)] p-4 ${className}`}>
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

        {[...pointMap.entries()].map(([point, position]) => (
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
        ))}

        {relations.slice(0, 4).map((relation, index) => (
          <text
            key={`${relation.kind}-${index}`}
            x="12"
            y={20 + index * 18}
            fontSize="11"
            fill="#45658d"
          >
            {relationText(relation)}
          </text>
        ))}
      </svg>
    </div>
  );
}
