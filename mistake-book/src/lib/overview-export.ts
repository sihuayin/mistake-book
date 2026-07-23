import type { StudentOverviewPayload } from "./overview";

function escapeXml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildExportRadarPoints(dimensions: StudentOverviewPayload["dimensions"]) {
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

function measureTextUnits(text: string) {
  return [...text].reduce((sum, char) => sum + (/[a-zA-Z0-9]/.test(char) ? 0.6 : 1), 0);
}

function wrapTextLines(text: string, maxLines = 4, maxUnits = 28) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const clauses = normalized
    .split(/[。；;]\s*/g)
    .flatMap((piece) => piece.split(/[，,]\s*/g))
    .map((item) => item.trim())
    .filter(Boolean);

  const segments = clauses.length ? clauses : [normalized];
  const lines: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) {
      lines.push(current.trim());
      current = "";
    }
  };

  for (const segment of segments) {
    if (measureTextUnits(segment) > maxUnits) {
      pushCurrent();
      let chunk = "";
      for (const char of segment) {
        const next = chunk + char;
        if (measureTextUnits(next) > maxUnits) {
          if (chunk) lines.push(chunk);
          chunk = char;
          if (lines.length >= maxLines) break;
        } else {
          chunk = next;
        }
      }
      if (lines.length >= maxLines) break;
      if (chunk) {
        current = chunk;
      }
      continue;
    }

    const next = current ? `${current}，${segment}` : segment;
    if (measureTextUnits(next) > maxUnits) {
      pushCurrent();
      current = segment;
    } else {
      current = next;
    }
  }

  pushCurrent();

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (lines.length === maxLines) {
    const lastIndex = lines.length - 1;
    if (segments.length > lines.length || measureTextUnits(normalized) > maxUnits * maxLines) {
      lines[lastIndex] = `${lines[lastIndex].slice(0, Math.max(1, Math.floor(maxUnits - 1)))}…`;
    }
  }

  return lines.filter(Boolean);
}

function paragraphLines(
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize = 13,
  lineHeight = 19,
  maxLines = 4,
  maxUnits = 28
) {
  const lines = wrapTextLines(text, maxLines, maxUnits);

  return `
    <text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">
      ${lines
        .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
        .join("")}
    </text>
  `;
}

function shortEvaluation(data: StudentOverviewPayload) {
  return [
    `${data.status_label} · 近 7 日 ${data.overall_trend.direction === "up" ? "上升" : data.overall_trend.direction === "down" ? "回落" : "平稳"} ${Math.abs(data.overall_trend.delta)} 分`,
    data.overall_trend.summary,
    data.status_summary.replace(/[。；;]\s*/g, "。"),
  ];
}

function shortDirection(data: StudentOverviewPayload) {
  const weakest = [...data.dimensions].sort((a, b) => a.score - b.score)[0];
  const firstRecommendation = data.recommendations[0];

  return [
    `先补最弱项：${weakest?.label ?? "暂无数据"}`,
    "先做 2 到 3 组同类题，把这个维度先稳住。",
    firstRecommendation ? `建议：${firstRecommendation.title}` : "先把最薄弱的维度做成一个小闭环。",
  ];
}

function evidenceSummary(data: StudentOverviewPayload) {
  const totalEvidence = data.dimensions.reduce((sum, dimension) => sum + dimension.evidence_count, 0);
  const averageConfidence = Math.round(
    data.dimensions.reduce((sum, dimension) => sum + dimension.confidence, 0) / data.dimensions.length
  );
  return `本次基于 ${totalEvidence} 条学习证据，整体可信度约 ${averageConfidence}%`;
}

function stackedLines(
  lines: string[],
  x: number,
  y: number,
  color: string,
  fontSize = 13,
  lineHeight = 18,
  maxLinesPerItem = 1,
  maxUnits = 36
) {
  const visibleLines = lines.filter(Boolean);
  const renderedLines = visibleLines.flatMap((line) => wrapTextLines(line, maxLinesPerItem, maxUnits));
  return `
    <text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">
      ${renderedLines
        .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
        .join("")}
    </text>
  `;
}

export function buildOverviewExportSvg(data: StudentOverviewPayload) {
  const radarPoints = buildExportRadarPoints(data.dimensions);
  const polygonPoints = radarPoints.map((point) => `${point.valueX},${point.valueY}`).join(" ");
  const weakest = [...data.dimensions].sort((a, b) => a.score - b.score)[0];
  const evaluationLines = shortEvaluation(data);
  const directionLines = shortDirection(data);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1060" viewBox="0 0 1200 1060">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1428" />
      <stop offset="55%" stop-color="#11284d" />
      <stop offset="100%" stop-color="#1e5c95" />
    </linearGradient>
    <radialGradient id="glow1" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffd84d" stop-opacity="0.52" />
      <stop offset="70%" stop-color="#ffd84d" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#5ed7b2" stop-opacity="0.32" />
      <stop offset="70%" stop-color="#5ed7b2" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="1200" height="1060" fill="url(#bg)" />
  <circle cx="1040" cy="150" r="220" fill="url(#glow1)" />
  <circle cx="150" cy="980" r="220" fill="url(#glow2)" />

  <text x="56" y="74" fill="#8fb8ff" font-size="14" letter-spacing="4" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">LEARNING SNAPSHOT</text>
  <text x="56" y="126" fill="#ffffff" font-size="38" font-weight="700" font-family="Noto Serif SC, Songti SC, serif">${escapeXml(data.student.name)} 的五维能力图</text>
  ${paragraphLines(
    `${data.student.current_grade ? `${data.student.current_grade} · ` : ""}${data.status_summary}`,
    56,
    166,
    "#d7e4ff",
    18,
    24,
    2,
    42
  )}

  <rect x="56" y="210" width="1088" height="396" rx="34" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />

  <text x="88" y="248" fill="#9ec0ff" font-size="14" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">学生五芒星</text>
  <text x="86" y="372" fill="#ffffff" font-size="86" font-weight="700" font-family="Noto Serif SC, Songti SC, serif">${data.overall_score}</text>
  <text x="88" y="408" fill="#fff4b6" font-size="18" font-weight="600" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(data.status_label)}</text>
  ${stackedLines(
    [
      `近 7 日 ${data.overall_trend.direction === "up" ? "↑" : data.overall_trend.direction === "down" ? "↓" : "→"} ${Math.abs(data.overall_trend.delta)} · ${data.overall_trend.summary}`,
      "学生当前整体表现的快速判断。",
    ],
    88,
    438,
    "#d7e4ff",
    13,
    20
  )}

  <g transform="translate(646, 232)">
    <svg viewBox="0 0 280 280" width="340" height="340">
      ${[0.25, 0.5, 0.75, 1]
        .map((level) => {
          const ring = radarPoints
            .map((point) => {
              const x = 140 + (point.outerX - 140) * level;
              const y = 140 + (point.outerY - 140) * level;
              return `${x},${y}`;
            })
            .join(" ");
          return `<polygon points="${ring}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1" />`;
        })
        .join("")}
      ${radarPoints
        .map((point) => `<line x1="140" y1="140" x2="${point.outerX}" y2="${point.outerY}" stroke="rgba(255,255,255,0.14)" stroke-width="1" />`)
        .join("")}
      <polygon points="${polygonPoints}" fill="rgba(93,183,255,0.34)" stroke="rgba(255,216,77,0.96)" stroke-width="2.5" />
      ${radarPoints
        .map(
          (point) => `
          <circle cx="${point.valueX}" cy="${point.valueY}" r="4.2" fill="#fff4b6" stroke="#0f172a" stroke-width="2" />
          <text x="${point.labelX}" y="${point.labelY}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.94)" font-size="11" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(point.shortLabel)}</text>
        `
        )
        .join("")}
    </svg>
  </g>

  <rect x="56" y="630" width="1088" height="186" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
  <text x="82" y="666" fill="#ffffff" font-size="22" font-weight="700" font-family="Noto Serif SC, Songti SC, serif">综合评价</text>
  <text x="82" y="696" fill="#9ec0ff" font-size="12" letter-spacing="0.18em" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">CURRENT SNAPSHOT</text>
  ${stackedLines(evaluationLines, 82, 730, "#d7e4ff", 13, 20)}
  ${stackedLines([evidenceSummary(data)], 82, 804, "#9ec0ff", 12, 18, 2, 44)}

  <rect x="56" y="824" width="1088" height="186" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" />
  <text x="82" y="860" fill="#ffffff" font-size="22" font-weight="700" font-family="Noto Serif SC, Songti SC, serif">努力方向</text>
  <text x="82" y="890" fill="#9ec0ff" font-size="12" letter-spacing="0.18em" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">NEXT STEP</text>
  <text x="82" y="924" fill="#ffffff" font-size="18" font-weight="600" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(weakest?.label ?? "暂无数据")}</text>
  ${stackedLines(directionLines, 82, 952, "#d7e4ff", 13, 20)}
  <text x="82" y="1008" fill="#9ec0ff" font-size="12" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">比较口径：更适合同一个学生的前后变化，不建议拿不同试卷硬比高低。</text>

  <text x="56" y="1034" fill="#d7e4ff" font-size="13" font-family="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif">导出时间：${new Date().toLocaleString("zh-CN")}</text>
</svg>`;
}

export async function downloadOverviewPng(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图片渲染失败"));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 1590;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("无法创建画布");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  const pngUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = pngUrl;
  link.download = filename;
  link.click();
}
