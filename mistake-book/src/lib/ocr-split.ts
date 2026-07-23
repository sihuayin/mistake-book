export function splitNumberedProblemText(text: string) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const strongMatches = [
    ...normalized.matchAll(
      /(?:^|[\n\r\s。；;])\s*(\d{1,2})[\.．、]\s*(?=(?:\(|（)?(?:本题|如图|如果|已知|在|解|计算|判断|求|设))/g
    ),
  ];
  const matches =
    strongMatches.length >= 2
      ? strongMatches
      : [...normalized.matchAll(/(?:^|[\n\r\s。；;])\s*(\d{1,2})[\.．、]\s*/g)];

  if (matches.length < 2) {
    return [normalized];
  }

  const parts = matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const actualStart = normalized[start] === "\n" ? start + 1 : start;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
      return normalized.slice(actualStart, end).trim();
    })
    .filter((part) => part.length > 12);

  return parts.length ? parts : [normalized];
}

const DIAGRAM_CUE_PATTERN = /如图|图中|图示|下图|上图|坐标系|函数图像|平移|旋转|对称|直角三角板|图\w/;

export function pickPayloadSplitIndex(splitTexts: string[]) {
  if (splitTexts.length <= 1) return 0;
  const cueIndex = splitTexts.findIndex((text) => DIAGRAM_CUE_PATTERN.test(text));
  return cueIndex >= 0 ? cueIndex : 0;
}
