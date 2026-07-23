"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DiagramPreview from "@/components/DiagramPreview";
import MathContent from "@/components/MathContent";
import type { ImageRegion, QuestionPayload } from "@/lib/types";
import { pickPayloadSplitIndex, splitNumberedProblemText } from "@/lib/ocr-split";

type ErrorType = "粗心" | "概念混淆" | "思路断链" | "完全不会";

type ParsedProblem = {
  question_text: string;
  latex_content?: string;
  question_payload?: QuestionPayload;
  knowledge_points?: string[];
  student_answer?: string;
  matched_section_id?: string;
  section_name?: string;
  confidence?: number;
  order_index?: number;
  error_type?: ErrorType | "";
  reflection_text?: string;
};

function countReadableChars(input: string) {
  return input.replace(/\s+/g, "").length;
}

function pickBetterQuestionText(questionText: string, latexContent: string) {
  const cleanQuestion = sanitizeText(questionText);
  const cleanLatex = sanitizeText(latexContent);
  const questionLen = countReadableChars(cleanQuestion);
  const latexLen = countReadableChars(cleanLatex);
  const looksFragmented =
    questionLen < 18 ||
    /^[A-Z0-9°\s.、()（）-]+$/.test(cleanQuestion) ||
    cleanQuestion.split("\n").filter((line) => line.trim().length <= 3).length >= 3;

  if (looksFragmented && latexLen > questionLen) {
    return cleanLatex;
  }

  return cleanQuestion || cleanLatex;
}

function repairJsonBackslashes(input: string) {
  let output = "";
  let inString = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1] ?? "";

    if (char === '"') {
      const escaped = i > 0 && input[i - 1] === "\\";
      if (!escaped) {
        inString = !inString;
      }
      output += char;
      continue;
    }

    if (char === "\\" && inString) {
      const isValidEscape =
        next === '"' ||
        next === "\\" ||
        next === "/" ||
        next === "b" ||
        next === "f" ||
        next === "n" ||
        next === "r" ||
        next === "t" ||
        next === "u";
      output += isValidEscape ? "\\" : "\\\\";
      continue;
    }

    output += char;
  }

  return output;
}

function parseEmbeddedJson(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? (trimmed.startsWith("{") ? trimmed : "");
  if (!candidate) return null;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(repairJsonBackslashes(candidate)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function sanitizeText(input: string) {
  return input
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function decodeLooseEscapes(input: string) {
  return input
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', '"');
}

function extractRootText(input: string) {
  const parsed = parseEmbeddedJson(input);
  if (parsed) {
    const question = String(parsed.question ?? "").trim();
    const text = String(parsed.text ?? "").trim();
    return sanitizeText(decodeLooseEscapes(question || text));
  }

  const textMatch = input.match(/"text"\s*:\s*"([\s\S]*?)"\s*(,|})/);
  if (textMatch?.[1]) {
    return sanitizeText(decodeLooseEscapes(textMatch[1]));
  }

  const questionMatch = input.match(/"question(?:_text)?"\s*:\s*"([\s\S]*?)"\s*(,|})/);
  if (questionMatch?.[1]) {
    return sanitizeText(decodeLooseEscapes(questionMatch[1]));
  }

  return sanitizeText(input);
}

function shouldShowMathPreview(text: string) {
  return /(\$\$?|\b\\(?:frac|dfrac|tfrac|sqrt|begin|end|cdot|times|leq|geq|neq|pi|theta|angle|pm|text|boxed)\b|\\\(|\\\[|[_^=]|√|×|·|±|∠)/.test(
    text
  );
}

function hasEditableLatexSyntax(text: string) {
  return /\\(?:frac|dfrac|tfrac|sqrt|begin|end|cdot|times|leq|geq|neq|pi|theta|text|boxed)|\$\$?|[_^]/.test(text);
}

function shouldShowLatexEditor(problem: ParsedProblem) {
  const latex = (problem.latex_content ?? "").trim();
  const question = problem.question_text.trim();
  if (!latex) return false;
  if (!hasEditableLatexSyntax(latex)) return false;
  if (latex !== question) return true;
  return shouldShowMathPreview(latex);
}

function getReadablePreviewText(problem: ParsedProblem) {
  const question = sanitizeText(problem.question_text);
  const latex = sanitizeText(problem.latex_content ?? "");

  if (!latex) return question;
  if (latex === question) return question;

  const questionMath = shouldShowMathPreview(question);
  const latexMath = shouldShowMathPreview(latex);

  if (latexMath && !questionMath) return latex;
  if (countReadableChars(latex) >= countReadableChars(question) && latexMath) return latex;
  return question || latex;
}

function getPreviewLabel(problem: ParsedProblem) {
  const question = sanitizeText(problem.question_text);
  const latex = sanitizeText(problem.latex_content ?? "");

  if (latex && latex !== question && shouldShowMathPreview(latex)) {
    return "整理后的题面";
  }

  return "题面预览";
}

function extractChoiceOptions(text: string) {
  const normalized = text.replace(/\r/g, "").replace(/\\qquad/g, " ").trim();
  const markerPattern = /([A-D])[\.．、]\s*/g;
  const markers = [...normalized.matchAll(markerPattern)];
  if (markers.length < 2) return [];

  const options = markers
    .map((match, index) => {
      const label = match[1] ?? "";
      const start = (match.index ?? 0) + (match[0]?.length ?? 0);
      const end = index + 1 < markers.length ? (markers[index + 1].index ?? normalized.length) : normalized.length;
      const content = normalized.slice(start, end).replace(/\s+/g, " ").trim();
      return label && content ? { label, content } : null;
    })
    .filter((option): option is { label: string; content: string } => Boolean(option));

  return options.filter((option, index, array) => array.findIndex((item) => item.label === option.label) === index);
}

function getQuestionRows(problem: ParsedProblem) {
  const length = countReadableChars(problem.question_text);
  if (problem.question_payload?.diagram || problem.question_payload?.question_preview_image_base64) {
    return length > 120 ? 4 : 3;
  }
  if (length > 180) return 4;
  if (length > 80) return 3;
  return 2;
}

function getProblemKind(problem: ParsedProblem) {
  if (problem.question_payload?.diagram?.preview_image_base64 || problem.question_payload?.diagram) {
    return "图形题";
  }
  if (problem.question_payload?.question_preview_image_base64) {
    return "裁剪题";
  }
  if (shouldShowMathPreview(problem.question_text) || shouldShowMathPreview(problem.latex_content ?? "")) {
    return "数学题";
  }
  return "文本题";
}

function getProblemFocus(problem: ParsedProblem) {
  if (problem.question_payload?.diagram?.preview_image_base64 || problem.question_payload?.diagram) {
    return "图形与关系";
  }
  if (problem.question_payload?.question_preview_image_base64) {
    return "题干裁剪";
  }
  if (shouldShowMathPreview(problem.question_text) || shouldShowMathPreview(problem.latex_content ?? "")) {
    return "数学表达";
  }
  return "文字题面";
}

function getAnswerRows(problem: ParsedProblem) {
  const length = countReadableChars(problem.student_answer ?? "");
  if (length > 60) return 3;
  return 2;
}

function normalizeKnowledgePoints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function padRegion(region: ImageRegion, padding: number) {
  const left = clampUnit(region.left - padding);
  const top = clampUnit(region.top - padding);
  const right = clampUnit(region.left + region.width + padding);
  const bottom = clampUnit(region.top + region.height + padding);

  return {
    left,
    top,
    width: Math.max(0.02, right - left),
    height: Math.max(0.02, bottom - top),
    unit: "normalized" as const,
  };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败，无法生成局部裁剪"));
    image.src = src;
  });
}

function cropRegionToDataUrl(
  image: HTMLImageElement,
  region: ImageRegion,
  {
    padding = 0.02,
    maxSide = 720,
    heightScale = 1,
  }: {
    padding?: number;
    maxSide?: number;
    heightScale?: number;
  } = {}
) {
  const safeRegion = padRegion(region, padding);
  const sourceX = Math.max(0, Math.floor(safeRegion.left * image.naturalWidth));
  const sourceY = Math.max(0, Math.floor(safeRegion.top * image.naturalHeight));
  const sourceWidth = Math.max(
    24,
    Math.min(image.naturalWidth - sourceX, Math.ceil(safeRegion.width * image.naturalWidth))
  );
  const rawHeight = Math.max(
    24,
    Math.min(image.naturalHeight - sourceY, Math.ceil(safeRegion.height * image.naturalHeight))
  );
  const sourceHeight = Math.max(24, Math.round(rawHeight * Math.min(1, Math.max(0.72, heightScale))));

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) return undefined;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function attachCroppedPreviews(problems: ParsedProblem[], imageSrc: string) {
  if (!imageSrc) return problems;

  const needCrop = problems.some(
    (problem) =>
      problem.question_payload?.question_region ||
      problem.question_payload?.diagram?.region
  );
  if (!needCrop) return problems;

  const image = await loadImageElement(imageSrc);

  return problems.map((problem) => {
    const payload = problem.question_payload;
    if (!payload) return problem;

    const nextPayload: QuestionPayload = {
      ...payload,
      diagram: payload.diagram ? { ...payload.diagram } : payload.diagram,
    };

    const questionRegion = payload.question_region ?? payload.diagram?.region;

    if (questionRegion && !payload.question_preview_image_base64) {
      nextPayload.question_preview_image_base64 =
        cropRegionToDataUrl(image, questionRegion, { padding: 0.008, maxSide: 980, heightScale: 0.9 }) ??
        payload.question_preview_image_base64;
    }

    if (payload.diagram?.region && !payload.diagram.preview_image_base64) {
      nextPayload.diagram = {
        ...payload.diagram,
        preview_image_base64:
          cropRegionToDataUrl(image, payload.diagram.region, { padding: 0.012, maxSide: 760, heightScale: 0.96 }) ??
          payload.diagram.preview_image_base64,
      };
    }

    return {
      ...problem,
      question_payload: nextPayload,
    };
  });
}

function normalizeProblemLike(problem: Record<string, unknown>): ParsedProblem | null {
  const rawQuestionText = extractRootText(String(problem.question_text ?? problem.question ?? ""));
  const rawLatexContent = extractRootText(String(problem.latex_content ?? problem.latex ?? rawQuestionText));
  const studentAnswer = String(problem.student_answer ?? problem.user_answer ?? "").trim();
  const questionText = pickBetterQuestionText(rawQuestionText, rawLatexContent);
  const latexContent = sanitizeText(rawLatexContent || questionText);

  if (!questionText && !latexContent) return null;

  return {
    question_text: questionText,
    latex_content: latexContent || questionText,
    question_payload:
      problem.question_payload && typeof problem.question_payload === "object"
        ? (problem.question_payload as QuestionPayload)
        : undefined,
    knowledge_points: normalizeKnowledgePoints(problem.knowledge_points),
    student_answer: sanitizeText(studentAnswer),
    matched_section_id: String(problem.matched_section_id ?? ""),
    section_name: String(problem.section_name ?? ""),
    confidence: typeof problem.confidence === "number" ? problem.confidence : 0,
    order_index:
      typeof problem.order_index === "number" && Number.isFinite(problem.order_index)
        ? problem.order_index
        : undefined,
    error_type:
      problem.error_type === "粗心" ||
      problem.error_type === "概念混淆" ||
      problem.error_type === "思路断链" ||
      problem.error_type === "完全不会"
        ? problem.error_type
        : "",
    reflection_text: "",
  };
}

function expandParsedProblems(rawProblems: unknown[]): ParsedProblem[] {
  const expanded: ParsedProblem[] = [];

  for (const item of rawProblems) {
    const problem = item as Record<string, unknown>;
    const direct = normalizeProblemLike(problem);

    if (direct) {
      const splitTexts = splitNumberedProblemText(direct.question_text);
      if (splitTexts.length > 1) {
        const baseOrderIndex = direct.order_index ?? expanded.length + 1;
        const payloadIndex = direct.question_payload ? pickPayloadSplitIndex(splitTexts) : -1;
        expanded.push(
          ...splitTexts.map((text, splitIndex) => ({
            ...direct,
            question_text: text,
            latex_content: text,
            question_payload: splitIndex === payloadIndex ? direct.question_payload : undefined,
            knowledge_points: direct.knowledge_points ?? [],
            order_index: baseOrderIndex + splitIndex,
          }))
        );
        continue;
      }

      if (!/^```(?:json)?/i.test(direct.question_text) && !direct.question_text.startsWith("{")) {
        expanded.push(direct);
        continue;
      }
    }

    const embedded = parseEmbeddedJson(
      String(problem.question_text ?? problem.latex_content ?? problem.question ?? "")
    );

    if (embedded && Array.isArray(embedded.problems)) {
      expanded.push(...expandParsedProblems(embedded.problems as unknown[]));
      continue;
    }

    if (embedded) {
      const rootText = String(embedded.text ?? embedded.question ?? "").trim();
      const splitTexts = splitNumberedProblemText(extractRootText(rootText));
      if (splitTexts.length > 1) {
        const baseOrderIndex =
          typeof problem.order_index === "number" ? problem.order_index : expanded.length + 1;
        const payloadIndex = embedded.question_payload ? pickPayloadSplitIndex(splitTexts) : -1;
        expanded.push(
          ...splitTexts.map((text, splitIndex) => ({
            question_text: text,
            latex_content: text,
            question_payload:
              splitIndex === payloadIndex ? (embedded.question_payload as QuestionPayload | undefined) : undefined,
            knowledge_points: normalizeKnowledgePoints(problem.knowledge_points),
            student_answer: "",
            matched_section_id: String(problem.matched_section_id ?? ""),
            section_name: String(problem.section_name ?? ""),
            confidence: typeof problem.confidence === "number" ? problem.confidence : 0,
            order_index: baseOrderIndex + splitIndex,
            error_type: "" as const,
            reflection_text: "",
          }))
        );
        continue;
      }
    }

    if (direct) {
      expanded.push(direct);
    }
  }

  return expanded.filter((problem) => problem.question_text.trim() || problem.latex_content?.trim());
}

const ERROR_TYPES: { type: ErrorType; emoji: string; desc: string }[] = [
  { type: "粗心", emoji: "😓", desc: "会做但算错或写错" },
  { type: "概念混淆", emoji: "🤔", desc: "概念理解偏差" },
  { type: "思路断链", emoji: "😵", desc: "做到中途卡住" },
  { type: "完全不会", emoji: "😰", desc: "完全没有思路" },
];

export default function AddMistakePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageBase64, setImageBase64] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [summary, setSummary] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [problems, setProblems] = useState<ParsedProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState("");
  const [expandedMathEditors, setExpandedMathEditors] = useState<Record<string, boolean>>({});
  const recognizedCount = problems.filter((problem) => problem.question_text.trim()).length;
  const diagramCount = problems.filter((problem) => Boolean(problem.question_payload?.diagram)).length;
  const cropCount = problems.filter(
    (problem) =>
      Boolean(problem.question_payload?.question_preview_image_base64) ||
      Boolean(problem.question_payload?.diagram?.preview_image_base64)
  ).length;
  const mathCount = problems.filter(
    (problem) => shouldShowMathPreview(problem.question_text) || shouldShowMathPreview(problem.latex_content ?? "")
  ).length;

  function resetAll() {
    setImageBase64("");
    setImagePreview("");
    setSummary("");
    setWarnings([]);
    setProblems([]);
    setExpandedMathEditors({});
    setError("");
    setDoneCount(0);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1] ?? "");
      setProblems([]);
      setExpandedMathEditors({});
      setSummary("");
      setWarnings([]);
      setDoneCount(0);
      setError("");
    };
    reader.readAsDataURL(file);
  }

  async function runOcr() {
    if (!imageBase64) {
      setError("请先上传错题图片");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "识别失败");

      const nextProblems = Array.isArray(data.problems)
        ? await attachCroppedPreviews(
            expandParsedProblems(data.problems).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
            imagePreview
          )
        : [];
      if (!nextProblems.length) {
        throw new Error("没有识别出可保存的题目，请换一张更清晰的照片");
      }

      setSummary(data.summary ?? "");
      setWarnings(Array.isArray(data.warnings) ? data.warnings.map((item: unknown) => String(item)).filter(Boolean) : []);
      setProblems(nextProblems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setLoading(false);
    }
  }

  function updateProblem(index: number, patch: Partial<ParsedProblem>) {
    setProblems((current) =>
      current.map((problem, i) => (i === index ? { ...problem, ...patch } : problem))
    );
  }

  function addManualProblem() {
      setProblems((current) => [
        ...current,
        {
          question_text: "",
          latex_content: "",
          question_payload: undefined,
          knowledge_points: [],
          student_answer: "",
          matched_section_id: "",
          section_name: "",
          order_index: current.length + 1,
          confidence: 0,
          error_type: "",
          reflection_text: "",
        },
      ]);
  }

  function removeProblem(index: number) {
    setProblems((current) => current.filter((_, i) => i !== index));
  }

  function toggleMathEditor(key: string) {
    setExpandedMathEditors((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function saveAll() {
    const validProblems = problems.filter((problem) => problem.question_text.trim());
    if (!validProblems.length) {
      setError("至少保留一道题目");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validProblems.map((problem) => ({
            question_text: problem.question_text.trim(),
            latex_content: (problem.latex_content || problem.question_text).trim(),
            question_payload: problem.question_payload,
            knowledge_points: problem.knowledge_points,
            section_id: problem.matched_section_id || undefined,
            source: imageBase64 ? "ocr" : "bank",
            question_type: "解答",
            is_correct: 0,
            answer: problem.student_answer ?? "",
            error_type: problem.error_type || undefined,
            reflection_text: problem.reflection_text?.trim() || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setDoneCount(data.count ?? validProblems.length);
      setProblems([]);
      setSummary("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (doneCount > 0) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center text-center">
        <div className="mb-4 text-6xl">✅</div>
        <h2 className="mb-2 text-xl font-bold">已保存 {doneCount} 道错题</h2>
        <p className="mb-6 text-sm text-gray-500">知识点已自动关联，后续会进入复习与能力分析。</p>
        <div className="flex gap-3">
          <button
            onClick={resetAll}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
          >
            继续拍照录入
          </button>
          <button
            onClick={() => router.push("/mistakes")}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            查看错题本
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="glass-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-sky-600/70">Photo Capture</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 md:text-3xl">拍照录入错题</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              直接上传试卷或作业照片。系统会优先用国内大模型自动识别多道题、拆分题目，并自动关联知识点。
            </p>
          </div>
          <button
            onClick={addManualProblem}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            手动补录一题
          </button>
        </div>
      </section>

      <section className="glass-panel rounded-[28px] p-6">
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            {imagePreview ? (
              <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="题目图片" className="max-h-[360px] w-full rounded-[18px] object-contain" />
                <button
                  onClick={resetAll}
                  className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 text-center transition-colors hover:border-sky-300 hover:bg-sky-50"
              >
                <div className="mb-3 text-5xl">📷</div>
                <div className="text-base font-medium text-slate-900">上传试卷或作业照片</div>
                <div className="mt-1 text-sm text-slate-500">支持一张图中包含多道题和作答</div>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="flex gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                重新选择图片
              </button>
              <button
                onClick={runOcr}
                disabled={!imageBase64 || loading}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {loading ? "Gemini 识别中..." : "开始识别"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] bg-[linear-gradient(135deg,rgba(93,183,255,0.08)_0%,rgba(255,216,77,0.14)_100%)] p-4">
              <div className="text-sm font-medium text-slate-900">自动处理内容</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                自动拆分多道题、识别学生作答、判断错题候选，并自动关联到知识图谱章节。
              </div>
            </div>

            {summary && (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-medium text-slate-900">识别摘要</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
              </div>
            )}

            {warnings.length ? (
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-medium text-amber-900">识别提示</div>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-800">
                  {warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>• {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error && (
              <div className="rounded-[18px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}
          </div>
        </div>
      </section>

      {problems.length > 0 && (
        <section className="space-y-4">
          <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">识别出的题目</h2>
                <p className="mt-1 text-sm text-slate-500">可以修改题干和错误类型，知识点将自动保存。</p>
              </div>
              <button
                onClick={saveAll}
                disabled={saving}
                className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? "保存中..." : `保存这 ${recognizedCount} 道题`}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[20px] bg-sky-50 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">识别题数</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{recognizedCount}</div>
              </div>
              <div className="rounded-[20px] bg-emerald-50 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-700/70">图形题</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{diagramCount}</div>
              </div>
              <div className="rounded-[20px] bg-amber-50 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700/70">局部裁剪</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{cropCount}</div>
              </div>
              <div className="rounded-[20px] bg-violet-50 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-violet-700/70">数学表达</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{mathCount}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {problems.map((problem, index) => {
              const problemKind = getProblemKind(problem);
              const problemFocus = getProblemFocus(problem);
              const editorKey = String(problem.order_index ?? index);
              const optionList = extractChoiceOptions(problem.latex_content || problem.question_text);
              const showMathPreview = shouldShowMathPreview(problem.question_text) || shouldShowMathPreview(problem.latex_content ?? "");

              return (
                <div key={`${index}-${problem.question_text.slice(0, 12)}`} className="glass-panel rounded-[26px] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">第 {problem.order_index ?? index + 1} 题</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {problem.section_name && (
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs text-sky-700">
                            {problem.section_name}
                          </span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                          {problemKind}
                        </span>
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700">
                          {problemFocus}
                        </span>
                        {typeof problem.confidence === "number" && problem.confidence > 0 && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                            识别置信度 {Math.round(problem.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeProblem(index)} className="text-sm text-slate-400 hover:text-rose-500">
                      删除
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
                    <div className="space-y-4">
                      <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="text-sm font-medium text-slate-900">题面</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">先看题干，再核对数学格式和选项。</div>
                        <div className="mt-3">
                          <label className="mb-2 block text-sm font-medium text-slate-700">题目内容</label>
                          <textarea
                            value={problem.question_text}
                            onChange={(e) =>
                              updateProblem(index, {
                                question_text: e.target.value,
                                latex_content: problem.latex_content || e.target.value,
                              })
                            }
                            rows={getQuestionRows(problem)}
                            className="w-full rounded-[18px] border border-slate-200 px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                          {showMathPreview ? (
                            <div className="mt-2 rounded-[16px] bg-slate-50 px-3 py-3">
                              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                {getPreviewLabel(problem)}
                              </div>
                              <MathContent
                                content={getReadablePreviewText(problem)}
                                className="mt-2 text-sm leading-7 text-slate-700"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {optionList.length ? (
                        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-medium text-slate-900">选项预览</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">适合选择题快速复核。</div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {optionList.map((option) => (
                              <div
                                key={`${option.label}-${option.content}`}
                                className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm"
                              >
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">
                                    {option.label}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <MathContent content={option.content} className="text-sm leading-7 text-slate-700" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {problem.question_payload?.question_preview_image_base64 ||
                      problem.question_payload?.diagram?.preview_image_base64 ? (
                        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-medium text-slate-900">局部裁剪预览</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            题干和图形分开保留，便于确认每一部分属于哪道题。
                          </div>
                          <div
                            className={`mt-3 grid gap-3 ${
                              problem.question_payload?.question_preview_image_base64 &&
                              problem.question_payload?.diagram?.preview_image_base64
                                ? "md:grid-cols-2"
                                : "grid-cols-1"
                            }`}
                          >
                            {problem.question_payload?.question_preview_image_base64 ? (
                              <div className="overflow-hidden rounded-[16px] border border-slate-100 bg-slate-50 p-3">
                                <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                                  题干局部
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={problem.question_payload.question_preview_image_base64}
                                  alt={`第 ${index + 1} 题题干局部参考`}
                                  className="h-44 w-full rounded-[12px] object-contain"
                                />
                              </div>
                            ) : null}
                            {problem.question_payload?.diagram?.preview_image_base64 ? (
                              <div className="overflow-hidden rounded-[16px] border border-slate-100 bg-slate-50 p-3">
                                <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                                  图形局部
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={problem.question_payload.diagram.preview_image_base64}
                                  alt={`第 ${index + 1} 题图形局部参考`}
                                  className="h-44 w-full rounded-[12px] object-contain"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : imagePreview ? (
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-sm font-medium text-slate-900">局部裁剪待生成</div>
                          <div className="mt-2 text-xs leading-5 text-slate-500">
                            这道题还没有恢复出题干或图形的局部区域，当前先保留识别结果和题号。
                          </div>
                          <div className="mt-3 rounded-[16px] border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs leading-5 text-slate-400">
                            识别到的题干会优先以局部裁剪显示，图形题会单独保留图形区域。
                          </div>
                        </div>
                      ) : null}

                      {problem.question_payload?.diagram ? (
                        <div className="rounded-[18px] bg-slate-50 px-4 py-4">
                          <div className="text-sm font-medium text-slate-900">识别到图形关系</div>
                          <div
                            className={`mt-3 gap-3 ${
                              problem.question_payload.diagram.type === "coordinate_graph"
                                ? "space-y-3"
                                : "grid lg:grid-cols-[minmax(0,1.2fr)_180px]"
                            }`}
                          >
                            <div>
                              <DiagramPreview diagram={problem.question_payload.diagram} className="h-full" />
                              {problem.question_payload.diagram.type !== "coordinate_graph" &&
                              problem.question_payload.diagram.scene ? (
                                <div className="mt-2 text-xs leading-6 text-slate-500">
                                  {problem.question_payload.diagram.scene}
                                </div>
                              ) : null}
                            </div>
                            {problem.question_payload.diagram.type !== "coordinate_graph" ? (
                              <div className="space-y-3">
                                {problem.question_payload.diagram.preview_image_base64 ? (
                                  <div className="rounded-[16px] border border-slate-200 bg-white p-2">
                                    <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                                      图形局部裁剪
                                    </div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={problem.question_payload.diagram.preview_image_base64}
                                      alt={`第 ${index + 1} 题图形裁剪`}
                                      className="h-40 w-full rounded-[12px] object-contain"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="text-sm font-medium text-slate-900">保存信息</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">这些信息会一起写入错题库，后面用于复习和能力分析。</div>

                        {problem.knowledge_points?.length ? (
                          <div className="mt-4">
                            <div className="mb-2 text-sm font-medium text-slate-700">自动关联知识点</div>
                            <div className="flex flex-wrap gap-2">
                              {problem.knowledge_points.map((point, pointIndex) => (
                                <span
                                  key={`${point}-${pointIndex}`}
                                  className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700"
                                >
                                  {point}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4">
                          <div className="mb-2 text-sm font-medium text-slate-700">学生作答，可选</div>
                          <textarea
                            value={problem.student_answer ?? ""}
                            onChange={(e) => updateProblem(index, { student_answer: e.target.value })}
                            rows={getAnswerRows(problem)}
                            className="w-full rounded-[18px] border border-slate-200 px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>

                        <div className="mt-4">
                          <div className="mb-2 text-sm font-medium text-slate-700">错误原因，可选</div>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
                            {ERROR_TYPES.map((item) => (
                              <button
                                key={item.type}
                                onClick={() =>
                                  updateProblem(index, {
                                    error_type: problem.error_type === item.type ? "" : item.type,
                                  })
                                }
                                className={`rounded-[18px] border px-3 py-3 text-left transition-colors ${
                                  problem.error_type === item.type
                                    ? "border-sky-300 bg-sky-50"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="text-lg">{item.emoji}</div>
                                <div className="mt-1 text-sm font-medium text-slate-900">{item.type}</div>
                                <div className="mt-1 text-xs text-slate-500">{item.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="mb-2 block text-sm font-medium text-slate-700">补充说明，可选</label>
                          <textarea
                            value={problem.reflection_text ?? ""}
                            onChange={(e) => updateProblem(index, { reflection_text: e.target.value })}
                            rows={2}
                            className="w-full rounded-[18px] border border-slate-200 px-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            placeholder="例如：把方程列错了，单位没有统一"
                          />
                        </div>
                      </div>

                      {shouldShowLatexEditor(problem) ? (
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-slate-700">数学格式文本</div>
                              <div className="mt-1 text-xs leading-5 text-slate-500">
                                原始格式默认收起，需要手动核对或修正公式时再展开。
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleMathEditor(editorKey)}
                              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 hover:text-sky-600"
                            >
                              {expandedMathEditors[editorKey] ? "收起" : "展开查看"}
                            </button>
                          </div>
                          {expandedMathEditors[editorKey] ? (
                            <textarea
                              value={problem.latex_content ?? ""}
                              onChange={(e) => updateProblem(index, { latex_content: e.target.value })}
                              rows={problem.latex_content && problem.latex_content !== problem.question_text ? 3 : 2}
                              className="mt-3 w-full rounded-[18px] border border-slate-200 px-3 py-3 font-mono text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                              placeholder="公式请用 $...$ 或 $$...$$ 包裹，例如：解方程 $2x+3=7$"
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
