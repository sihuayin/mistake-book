/**
 * AI integration module — configurable AI provider
 *
 * Supports:
 * - kimi (Moonshot AI) — default for all tasks
 * - qwen (通义千问/DashScope) — alternative
 * - gemini (Google Gemini) — alternative, good for vision/OCR
 *
 * All AI capabilities are routed through this module:
 * - OCR (vision model with base64 image input)
 * - Classification (match question text to knowledge graph section)
 * - Reflection follow-up generation
 * - Step-level grading
 * - Variation question generation
 */

import OpenAI from "openai";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { DiagramData, ErrorType, ImageRegion, OcrProblem, OcrResult, QuestionPayload } from "./types";

// ─── Provider configuration ────────────────────────────────────────────────

type Provider = "kimi" | "qwen" | "gemini";

const PROVIDER_CONFIG: Record<
  Provider,
  {
    baseURL: string;
    apiKeyEnv: string;
    visionModel: string;
    textModel: string;
  }
> = {
  kimi: {
    baseURL: "https://api.moonshot.cn/v1",
    apiKeyEnv: "KIMI_API_KEY",
    visionModel: "moonshot-v1-vision-preview",
    textModel: "moonshot-v1-32k",
  },
  qwen: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    visionModel: "qwen-vl-max",
    textModel: "qwen-plus",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GEMINI_API_KEY",
    visionModel: "gemini-3.5-flash",
    textModel: "gemini-3.5-flash",
  },
};

function getProvider(): Provider {
  const val = (process.env.AI_PROVIDER ?? "kimi").toLowerCase().trim();
  if (val === "qwen") return "qwen";
  if (val === "gemini") return "gemini";
  return "kimi"; // default
}

function getVisionProvider(): Provider {
  const configured = getProvider();
  if (configured === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (configured === "qwen" && process.env.DASHSCOPE_API_KEY) return "qwen";
  if (configured === "kimi" && process.env.KIMI_API_KEY) return "kimi";

  if (process.env.DASHSCOPE_API_KEY) return "qwen";
  if (process.env.KIMI_API_KEY) return "kimi";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return configured;
}

export function getActiveProviderMetadata(isVision = false) {
  const provider = isVision ? getVisionProvider() : getProvider();
  const config = getModelConfig(provider);
  return {
    provider,
    model: isVision ? config.visionModel : config.textModel,
  };
}

function hasProviderKey(provider: Provider) {
  const envName = PROVIDER_CONFIG[provider].apiKeyEnv;
  return Boolean(process.env[envName]);
}

function getHttpProxy() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    "http://127.0.0.1:7890"
  );
}

function createClient(providerOverride?: Provider): OpenAI {
  const provider = providerOverride ?? getProvider();
  const cfg = PROVIDER_CONFIG[provider];
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${cfg.apiKeyEnv} environment variable is not set (provider: ${provider})`);
  }

  const httpProxy = getHttpProxy();
  const dispatcher = httpProxy ? new ProxyAgent(httpProxy) : undefined;

  return new OpenAI({
    baseURL: cfg.baseURL,
    apiKey,
    fetch: dispatcher
      ? (url, init) => undiciFetch(url as string, { ...(init as object), dispatcher }) as unknown as Promise<Response>
      : undefined,
  });
}

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set (provider: gemini)");
  }

  return apiKey;
}

function getModelConfig(provider: Provider) {
  return PROVIDER_CONFIG[provider];
}

function isRetryableProviderError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const maybeStatus = Number((error as Error & { status?: number }).status);
  return (
    maybeStatus === 404 ||
    maybeStatus === 408 ||
    maybeStatus === 409 ||
    maybeStatus === 429 ||
    maybeStatus >= 500 ||
    /404|408|409|429|rate limit|quota|model.*not found|not found|overloaded|timeout/i.test(error.message)
  );
}

function buildFallbackProviders(primary: Provider) {
  const ordered: Provider[] = [primary, "qwen", "kimi", "gemini"];
  return ordered.filter((provider, index) => ordered.indexOf(provider) === index && hasProviderKey(provider));
}

function buildOpenAIVisionMessages(imageBase64: string, prompt: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
          },
        },
        {
          type: "text",
          text: prompt,
        },
      ],
    },
  ];
}

async function createChatCompletionWithFallback(
  providers: Provider[],
  modelType: "visionModel" | "textModel",
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  requestOptions: Record<string, unknown> = {}
) {
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const client = createClient(provider);
      const model = getModelConfig(provider)[modelType];
      return await client.chat.completions.create({
        model,
        messages,
        ...requestOptions,
      });
    } catch (error: unknown) {
      lastError = error;
      if (!isRetryableProviderError(error)) {
        throw error;
      }
      continue;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`AI 识别服务当前不可用，已尝试切换备用模型。最后一次错误: ${lastError.message}`);
  }
  throw new Error("AI 识别服务当前不可用，已尝试切换备用模型。");
}

async function generateGeminiVisionText(imageBase64: string, prompt: string) {
  const apiKey = createGeminiClient();
  const httpProxy = getHttpProxy();
  const dispatcher = httpProxy ? new ProxyAgent(httpProxy) : undefined;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDER_CONFIG.gemini.visionModel}:generateContent?key=${apiKey}`;
  const response = await undiciFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
    ...(dispatcher ? { dispatcher } : {}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 400 && /API key not valid/i.test(errorText)) {
      throw new Error(
        "Gemini API key 无效，请确认使用的是可用的 Google Generative Language API key；如果你想先继续录入，可以把 AI_PROVIDER 切到已经配置好的 Kimi 或 Qwen。"
      );
    }
    throw new Error(
      `Gemini OCR request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return text.trim();
}

// ─── OCR ────────────────────────────────────────────────────────────────────

function normalizeErrorType(value: string | undefined): ErrorType | "" {
  if (value === "粗心" || value === "概念混淆" || value === "思路断链" || value === "完全不会") {
    return value;
  }
  return "";
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeRegionValue(value: unknown): ImageRegion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const region = value as Record<string, unknown>;

  const leftCandidate =
    typeof region.left === "number"
      ? region.left
      : typeof region.x === "number"
        ? region.x
        : undefined;
  const topCandidate =
    typeof region.top === "number"
      ? region.top
      : typeof region.y === "number"
        ? region.y
        : undefined;

  let widthCandidate =
    typeof region.width === "number"
      ? region.width
      : typeof region.w === "number"
        ? region.w
        : undefined;
  let heightCandidate =
    typeof region.height === "number"
      ? region.height
      : typeof region.h === "number"
        ? region.h
        : undefined;

  if (widthCandidate === undefined && typeof region.right === "number" && leftCandidate !== undefined) {
    widthCandidate = region.right - leftCandidate;
  }
  if (heightCandidate === undefined && typeof region.bottom === "number" && topCandidate !== undefined) {
    heightCandidate = region.bottom - topCandidate;
  }

  if (
    leftCandidate === undefined ||
    topCandidate === undefined ||
    widthCandidate === undefined ||
    heightCandidate === undefined
  ) {
    return undefined;
  }

  const rawValues = [leftCandidate, topCandidate, widthCandidate, heightCandidate];
  const divisor = rawValues.some((item) => item > 1) ? 1000 : 1;
  const left = clamp01(leftCandidate / divisor);
  const top = clamp01(topCandidate / divisor);
  const width = clamp01(widthCandidate / divisor);
  const height = clamp01(heightCandidate / divisor);

  if (width <= 0 || height <= 0) return undefined;

  return {
    left,
    top,
    width: Math.min(width, 1 - left),
    height: Math.min(height, 1 - top),
    unit: "normalized",
  };
}

function normalizeDiagramData(value: unknown): DiagramData | null {
  if (!value || typeof value !== "object") return null;
  const diagram = value as Record<string, unknown>;
  return {
    type:
      diagram.type === "geometry_diagram" ||
      diagram.type === "algebra_table" ||
      diagram.type === "coordinate_graph"
        ? diagram.type
        : "unknown",
    scene: typeof diagram.scene === "string" ? diagram.scene : "",
    points: Array.isArray(diagram.points) ? diagram.points.map((item) => String(item)) : [],
    segments: Array.isArray(diagram.segments)
      ? diagram.segments
          .filter((segment): segment is [unknown, unknown] => Array.isArray(segment) && segment.length === 2)
          .map((segment) => [String(segment[0]), String(segment[1])] as [string, string])
      : [],
    relations: Array.isArray(diagram.relations)
      ? diagram.relations.map((relation) => {
          const item = relation as Record<string, unknown>;
          return {
            kind: typeof item.kind === "string" ? item.kind : "unknown",
            at: typeof item.at === "string" ? item.at : undefined,
            name: typeof item.name === "string" ? item.name : undefined,
            value: typeof item.value === "string" ? item.value : undefined,
            items: Array.isArray(item.items)
              ? item.items
                  .filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && pair.length === 2)
                  .map((pair) => [String(pair[0]), String(pair[1])] as [string, string])
              : undefined,
            between: Array.isArray(item.between)
              ? item.between
                  .filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && pair.length === 2)
                  .map((pair) => [String(pair[0]), String(pair[1])] as [string, string])
              : undefined,
          };
        })
      : [],
    labels: Array.isArray(diagram.labels)
      ? diagram.labels.map((label) => {
          const item = label as Record<string, unknown>;
          return {
            text: typeof item.text === "string" ? item.text : "",
            at: typeof item.at === "string" ? item.at : undefined,
          };
        }).filter((label) => label.text)
      : [],
    region: normalizeRegionValue(diagram.region),
    preview_image_base64:
      typeof diagram.preview_image_base64 === "string" ? diagram.preview_image_base64 : undefined,
  };
}

function normalizeQuestionPayload(value: unknown): QuestionPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  return {
    stem_text: typeof payload.stem_text === "string" ? payload.stem_text : undefined,
    question_region: normalizeRegionValue(payload.question_region),
    question_preview_image_base64:
      typeof payload.question_preview_image_base64 === "string"
        ? payload.question_preview_image_base64
        : undefined,
    options: Array.isArray(payload.options)
      ? payload.options.map((option) => {
          const item = option as Record<string, unknown>;
          return {
            label: String(item.label ?? ""),
            text: String(item.text ?? ""),
            latex: typeof item.latex === "string" ? item.latex : undefined,
          };
        }).filter((option) => option.label || option.text)
      : undefined,
    diagram: normalizeDiagramData(payload.diagram),
    student_marks:
      payload.student_marks && typeof payload.student_marks === "object"
        ? {
            selected_option:
              typeof (payload.student_marks as Record<string, unknown>).selected_option === "string"
                ? String((payload.student_marks as Record<string, unknown>).selected_option)
                : undefined,
            handwritten_notes: Array.isArray((payload.student_marks as Record<string, unknown>).handwritten_notes)
              ? ((payload.student_marks as Record<string, unknown>).handwritten_notes as unknown[]).map((item) => String(item))
              : undefined,
            teacher_marks: Array.isArray((payload.student_marks as Record<string, unknown>).teacher_marks)
              ? ((payload.student_marks as Record<string, unknown>).teacher_marks as unknown[]).map((item) => String(item))
              : undefined,
          }
        : undefined,
  };
}

function repairJsonBackslashes(input: string) {
  let output = "";
  let inString = false;
  let quoteChar = '"';

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        quoteChar = char;
      }
      output += char;
      continue;
    }

    if (char === "\\") {
      const nextChar = next ?? "";
      const isValidEscape =
        nextChar === '"' ||
        nextChar === "\\" ||
        nextChar === "/" ||
        nextChar === "b" ||
        nextChar === "f" ||
        nextChar === "n" ||
        nextChar === "r" ||
        nextChar === "t" ||
        nextChar === "u";

      output += isValidEscape ? "\\" : "\\\\";
      continue;
    }

    if (char === "\n") {
      output += inString ? "\\n" : "\n";
      continue;
    }

    if (char === "\r") {
      output += inString ? "\\r" : "\r";
      continue;
    }

    if (char === "\t") {
      output += inString ? "\\t" : "\t";
      continue;
    }

    if (char === quoteChar && input[i - 1] !== "\\") {
      inString = false;
    }

    output += char;
  }

  return output;
}

function extractJsonCandidate(raw: string) {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const startIndex = raw.search(/[\{\[]/);
  if (startIndex < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let quoteChar = '"';
  let escaped = false;

  for (let i = startIndex; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const open = stack.pop();
      if (!open) break;
      const matches = (open === "{" && char === "}") || (open === "[" && char === "]");
      if (!matches) break;
      if (stack.length === 0) {
        return raw.slice(startIndex, i + 1).trim();
      }
    }
  }

  return null;
}

function parseStructuredJson(raw: string) {
  const candidate = extractJsonCandidate(raw);
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

function parseJsonObjectFromText<T extends Record<string, unknown>>(raw: string): T | null {
  const parsed = parseStructuredJson(raw);
  return parsed as T | null;
}

async function repairStructuredOcrResponse(raw: string, provider: Provider) {
  const verboseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: `你是一个 JSON 修复器。下面是 OCR 模型返回的原始内容，可能包含多余文字、Markdown 代码块、尾逗号、单引号或非标准转义。

请把它整理为“严格 JSON”，并且只返回 JSON，不要额外解释。
必须保留这些顶层字段：
- text
- summary
- latexBlocks
- confidence
- warnings
- problems

要求：
1. 保留能识别出的题目拆分结果。
2. 尽量保留 question_text、latex_content、student_answer、knowledge_points、is_correct、error_type、confidence、order_index。
3. 如果原文里还能看出 question_payload、question_region、diagram.region、question_preview_image_base64，请尽量保留。
4. 如果某些字段无法恢复，可以省略，但不要编造不存在的内容。
5. 输出必须是一个可被 JSON.parse 直接解析的对象。

原始内容：
<<<RAW>>>
${raw}
<<<END>>>`,
    },
  ];

  const compactMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: `把下面 OCR 输出修复成严格 JSON，只保留并恢复这些字段：
text, summary, latexBlocks, confidence, warnings, problems

每个 problem 至少尽量保留：
question_text, latex_content, student_answer, knowledge_points, is_correct, error_type, confidence, order_index

如果能看出题目区域或图形区域，请尽量补 question_payload.question_region 和 question_payload.diagram.region。
只输出 JSON，不要解释。

原始内容：
<<<RAW>>>
${raw}
<<<END>>>`,
    },
  ];

  try {
    const response = await createChatCompletionWithFallback(
      buildFallbackProviders(provider),
      "textModel",
      verboseMessages,
      { response_format: { type: "json_object" } }
    );
    const candidate = response.choices[0]?.message?.content ?? "";
    return parseStructuredJson(candidate);
  } catch {
    const response = await createChatCompletionWithFallback(buildFallbackProviders(provider), "textModel", verboseMessages);
    const candidate = response.choices[0]?.message?.content ?? "";
    const parsed = parseStructuredJson(candidate);
    if (parsed) return parsed;

    const retry = await createChatCompletionWithFallback(buildFallbackProviders(provider), "textModel", compactMessages).catch(() => null);
    const retryCandidate = retry?.choices[0]?.message?.content ?? "";
    return parseStructuredJson(retryCandidate);
  }
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberValue(value: unknown, fallback = 0.5) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toOrderIndex(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  return fallback;
}

function toWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function decodeLooseEscapes(input: string) {
  return input
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "")
    .replaceAll("\\t", "\t")
    .replaceAll('\\"', '"');
}

function normalizeRawTextBlock(input: string) {
  return decodeLooseEscapes(
    input
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim()
  );
}

function splitTopLevelProblems(text: string) {
  const normalized = normalizeRawTextBlock(text).replace(/\r/g, "").trim();
  if (!normalized) return [];

  const strongMatches = [
    ...normalized.matchAll(
      /(?:^|\n)\s*(\d{1,2})[\.．、]\s*(?=(?:\(|（)?(?:本题|如图|如果|已知|在|解|计算|判断|求|设))/g
    ),
  ];
  const matches =
    strongMatches.length >= 2
      ? strongMatches
      : [...normalized.matchAll(/(?:^|\n)\s*(\d{1,2})[\.．、]\s*/g)];

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

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  return null;
}

function normalizeProblemRecord(
  problem: Record<string, unknown>,
  baseConfidence: number,
  fallbackOrder: number
): OcrProblem | null {
  const questionText = toStringValue(problem.question_text, toStringValue(problem.question)).trim();
  const latexContent = toStringValue(
    problem.latex_content,
    toStringValue(problem.latex, questionText)
  ).trim();

  if (!questionText && !latexContent) return null;

  return {
    question_text: questionText || latexContent,
    latex_content: latexContent || questionText,
    question_payload: normalizeQuestionPayload(problem.question_payload),
    student_answer: toStringValue(problem.student_answer, toStringValue(problem.user_answer)).trim(),
    is_correct: normalizeBoolean(problem.is_correct),
    error_type: normalizeErrorType(
      typeof problem.error_type === "string" ? problem.error_type : undefined
    ),
    knowledge_points: toStringArray(problem.knowledge_points),
    confidence: toNumberValue(problem.confidence, baseConfidence),
    order_index: toOrderIndex(problem.order_index, fallbackOrder),
  };
}

function buildFallbackProblemsFromText(text: string, confidence: number) {
  const parts = splitTopLevelProblems(text);
  return parts
    .map<OcrProblem>((part, index) => ({
      question_text: part,
      latex_content: part,
      question_payload: undefined,
      student_answer: "",
      is_correct: null,
      error_type: "",
      knowledge_points: [],
      confidence,
      order_index: index + 1,
    }))
    .filter((problem) => problem.question_text.trim());
}

function normalizeOcrSummary(
  summary: string,
  problems: OcrProblem[],
  {
    usedTextFallback = false,
  }: {
    usedTextFallback?: boolean;
  } = {}
) {
  const trimmed = summary.trim();
  const hasAnyProblem = problems.length > 0;
  const hasUnclearProblems = problems.some((problem) => problem.is_correct === null || !problem.error_type);
  const hasKnownErrors = problems.some((problem) => problem.is_correct === false || Boolean(problem.error_type));
  const looksOverconfident = /全部正确|都正确|学生作答全部正确|没有错题|未发现错题|基础概念掌握扎实|表现稳定|掌握扎实/i.test(trimmed);
  const countText = hasAnyProblem ? `已识别出 ${problems.length} 道题` : "已完成图片识别";

  if (!trimmed) {
    if (!hasAnyProblem) {
      return "已完成图片识别，但题目拆分结果较少，建议结合原图继续核对。";
    }
    if (hasKnownErrors) {
      return "已识别出若干题目，部分题目的对错和作答信息仍需结合原图核对。";
    }
    return `${countText}，建议结合原图继续核对题干与作答。`;
  }

  if (looksOverconfident) {
    if (hasKnownErrors || hasUnclearProblems) {
      return `${countText}，题目拆分结果基本可用，但部分题目的对错判断仍建议结合原图核对。`;
    }
    return hasAnyProblem
      ? `${countText}，题目已尽量拆分。由于图片里可能存在批改痕迹或多题混排，仍建议结合原图核对关键题目。`
      : "已完成图片识别，当前结果已尽量拆分，但仍建议结合原图核对关键题目。";
  }

  const normalized = trimmed.replace(/^\s*已.*?识别.*?。?/, "").trim();
  const body = normalized || trimmed;
  const fallbackNote = usedTextFallback ? "结构化 JSON 未能解析，已自动改用文本兜底。" : "";

  if (hasAnyProblem) {
    return [countText, fallbackNote, body].filter(Boolean).join("，");
  }

  return [countText, fallbackNote, body].filter(Boolean).join("，");
}

async function generateVisionTextWithFallback(imageBase64: string, prompt: string, primaryProvider: Provider) {
  if (primaryProvider === "gemini") {
    try {
      return await generateGeminiVisionText(imageBase64, prompt);
    } catch (error: unknown) {
      const fallbackProviders = buildFallbackProviders("qwen").filter((provider) => provider !== "gemini");
      if (!fallbackProviders.length) {
        throw error;
      }

      const response = await createChatCompletionWithFallback(
        fallbackProviders,
        "visionModel",
        buildOpenAIVisionMessages(imageBase64, prompt)
      );
      return response.choices[0]?.message?.content ?? "";
    }
  }

  const response = await createChatCompletionWithFallback(
    buildFallbackProviders(primaryProvider),
    "visionModel",
    buildOpenAIVisionMessages(imageBase64, prompt)
  );

  return response.choices[0]?.message?.content ?? "";
}

export async function ocrImage(imageBase64: string): Promise<OcrResult> {
  const provider = getVisionProvider();
  const prompt = `【核心要求】严格按题分离，每道题独立列出。如果图片里有 2 道题或 3 道题，必须分开列出为独立的 problems 元素，不要合并成一道。

【失败案例 — 绝对不要犯】如果图片中有 2 道题、3 道题或更多，而你只返回了 1 个 problems，那就是严重错误。一定是拆开成多个 problems 元素。
例如：图片里有"23. 某校积极发展航模特色社团..."和"24. 如图..."和"25. 如果两个分式P与Q满足..."，则必须返回 3 个 problems，分别放着三题的文本和区域，绝不能用一段文字塞进 1 个 problems 里。

请完成这些事情：
1. 尽可能拆分出图片中的每一道独立题目。
2. 提取每道题的题干，放入 question_text；如果能看到学生作答（手写答案、计算过程、勾选等），单独放入 student_answer。
【重要】question_text 和 latex_content 只放题目本身的文本，绝对不要包含学生的作答、批改痕迹、得分等。
3. 不判断对错，is_correct 统一返回 null（由用户后续手动标记）。
4. 给每道题总结 1 到 3 个知识点关键词 knowledge_points。
5. 如果能推断出错误原因，error_type 仅可使用：粗心、概念混淆、思路断链、完全不会；否则留空字符串。
6. 给出整张图片的 summary。
7. 每道题补充 question_region，必须包含该题完整的垂直区域：从题号上方（含题号本身）开始，到题干、选项、学生作答、答案等所有内容结束为止；不要只圈住文字行，要包含该题在图片中占据的整块矩形区域。
8. 如果某道题里包含图形，请在 question_payload.diagram.region 中补充图形的局部区域。
9. 如果图形是坐标系、网格图、函数图像、平移/旋转后的坐标图，请将 diagram.type 标记为 coordinate_graph，不要把它重建成普通几何图形。
10. 如果图片里明显有 2 题或 3 题，必须分开列出，不能合并成一道题。但如果同一题包含 (1)(2)(3) 小问，它们属于同一道题，不要拆成多个 problems。
11. 只要存在不确定，就用保守、谨慎的表述，不要写“全部正确”“没有错题”之类过度自信的总结。
12. question_region 的垂直边界要严格精确：上边界必须在题号上方（含题号本身，建议多留 2%-5% 余量），下边界必须在下一题题号之上结束或该题作答区域结束后结束，绝对不能包含下一题的题干或题号。上边界宁可偏大也不要裁掉题号。
13. 如果一道题有选择项，question_region 必须包含题干、选项和该题在图片中占据的全部纵向区域，但不要把下一题的任何内容包含进来。
14. 如果某道题的图形单独成块，question_payload.diagram.region 只标图形，不要用它替代整道题的 question_region。

区域坐标规则：
- 使用整张图片的相对坐标（0 到 1000 的整数 left、top、width、height）。
- 题目区域要从题号上方开始到该题完全结束，垂直方向宁可大 5% 也不要裁掉内容。
- 图形区域要尽量覆盖完整图形，不要裁掉边缘。
- 如果某题下方是空白或下一题题号，region 的下边界应在空白中间或下一题题号之上，绝对不能跨入下一题。

请严格返回 JSON：
{
  "text": "整张图片提取出的完整文字",
  "summary": "整体情况摘要",
  "latexBlocks": [],
  "confidence": 0.0,
 "problems": [
    {
      "question_text": "题目1题干",
      "latex_content": "题目1的数学标准化文本，公式用$...$或$$...$$包裹；没有则与question_text一致",
      "question_payload": {
        "stem_text": "题干纯净文本",
          "question_region": { "left": 42, "top": 120, "width": 900, "height": 220 },
        "options": [{"label":"A","text":"12°","latex":"$12^\\circ$"}],
        "diagram": {
          "type": "geometry_diagram",
          "scene": "图形场景摘要",
          "region": { "left": 620, "top": 180, "width": 260, "height": 210 },
          "points": ["A", "B", "C"],
          "segments": [["A","B"],["B","C"]],
          "relations": [{"kind":"angle","name":"CBD","value":"90^\\circ"}],
          "labels": [{"text":"∠1","at":"B"}]
        },
        // 如果是坐标系题，将 type 设为 coordinate_graph，且不要虚构线段三角形。
        "student_marks": {
          "selected_option": "B",
          "handwritten_notes": ["120", "30"]
        }
      },
      "student_answer": "学生作答，可为空",
      "is_correct": false,
      "error_type": "概念混淆",
      "knowledge_points": ["一元一次方程", "列方程解应用题"],
  "confidence": 0.86
  }
] 
}`;

  const raw = await generateVisionTextWithFallback(imageBase64, prompt, provider);

  const parsed = parseStructuredJson(raw);
  const repaired = parsed ? null : await repairStructuredOcrResponse(raw, provider).catch(() => null);
  const effectiveParsed = parsed ?? repaired;
  if (effectiveParsed) {
    const baseConfidence = toNumberValue(effectiveParsed.confidence, 0.5);
    const parsedProblems = Array.isArray(effectiveParsed.problems) ? (effectiveParsed.problems as unknown[]) : [];
    const warnings = toWarnings(effectiveParsed.warnings);
    let problems: OcrProblem[] = parsedProblems
      .map((item, index) => {
        const problem = item as Record<string, unknown>;
        return normalizeProblemRecord(problem, baseConfidence, index + 1);
      })
      .filter((problem): problem is OcrProblem => Boolean(problem?.question_text));

    const rootText = normalizeRawTextBlock(toStringValue(effectiveParsed.text, raw));
    if (
      problems.length <= 1 &&
      splitTopLevelProblems(rootText).length > 1
    ) {
      problems = buildFallbackProblemsFromText(rootText, baseConfidence);
      warnings.push("OCR 拆分结果可能不完整，已启用文本兜底拆分。");
    }

    return {
      text: rootText,
      summary: normalizeOcrSummary(toStringValue(effectiveParsed.summary), problems, {
        usedTextFallback: Boolean(repaired && !parsed),
      }),
      latexBlocks: toStringArray(effectiveParsed.latexBlocks),
      confidence: baseConfidence,
      warnings,
      problems,
    };
  }
  const fallbackText = normalizeRawTextBlock(raw);
  const fallbackProblems = buildFallbackProblemsFromText(fallbackText, 0.5);
  return {
    text: fallbackText,
    summary: normalizeOcrSummary("", fallbackProblems, {
      usedTextFallback: true,
    }),
    latexBlocks: [],
    confidence: 0.5,
    warnings: ["当前结果已切换为文本兜底，建议重点核对题号边界和作答内容。"],
    problems: fallbackProblems,
  };
}

// ─── Classification ────────────────────────────────────────────────────────

export async function classifyQuestion(
  questionText: string,
  knowledgeGraphJson: string
): Promise<{
  matched_section_id: string;
  confidence: number;
  reason: string;
}> {
  const provider = getProvider();
  const response = await createChatCompletionWithFallback(
    buildFallbackProviders(provider),
    "textModel",
    [{ role: "user", content: `给定以下题目和知识图谱JSON,请选择最匹配的section id。\n\n题目: ${questionText}\n\n知识图谱: ${knowledgeGraphJson}\n\n请返回JSON格式:\n{\n  "matched_section_id": "1.2",\n  "confidence": 0.85,\n  "reason": "题目涉及绝对值概念,与section 1.2 '有理数'匹配"\n}` }]
  );

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseJsonObjectFromText<{
    matched_section_id?: string;
    confidence?: number;
    reason?: string;
  }>(raw);
  if (parsed) {
    return {
      matched_section_id: typeof parsed.matched_section_id === "string" ? parsed.matched_section_id : "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reason: typeof parsed.reason === "string" ? parsed.reason : raw,
    };
  }
  return { matched_section_id: "", confidence: 0, reason: raw };
}

// ─── Reflection follow-up ──────────────────────────────────────────────────

const ERROR_TYPE_PROMPTS: Record<string, string> = {
  粗心: "你是在哪一步开始算错的?是从头还是中途?",
  概念混淆: "这道题考的是哪个知识点?你能用自己的话说一遍定义吗?",
  思路断链: "做到哪一步你卡住了?前面几步你是怎么想到的?",
  完全不会: "这道题涉及什么知识?你之前见过类似的吗?",
};

const FOUR_QUESTIONS = [
  "你在这道题的哪个步骤卡住了?",
  "当时你是怎么想的?",
  "你现在知道正确的思路是什么吗?",
  "下次遇到类似题你会怎么做?",
];

export async function generateReflectionQuestion(
  errorType: string,
  questionText: string,
  previousResponses: string[]
): Promise<{ question: string; followup_count: number }> {
  const provider = getProvider();
  const { textModel } = getModelConfig(provider);
  const client = createClient();
  const context = previousResponses.length
    ? `\n学生之前的回答:\n${previousResponses.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    : "";

  const response = await client.chat.completions.create({
    model: textModel,
    messages: [
      {
        role: "user",
        content: previousResponses.length === 0
          ? (ERROR_TYPE_PROMPTS[errorType] || "你在这道题哪里卡住了?能描述一下你的思考过程吗?")
          : `题目: ${questionText}\n错误类型: ${errorType}${context}\n\n请生成下一个追问:`,
      },
    ],
  });

  return {
    question: (response.choices[0]?.message?.content ?? "").trim(),
    followup_count: previousResponses.length + 1,
  };
}

export function getFallbackFourQuestions(): string[] {
  return FOUR_QUESTIONS;
}

// ─── Step grading ───────────────────────────────────────────────────────────

export async function gradeStepByStep(
  question: string,
  studentAnswer: string,
  solutionSteps: string[]
): Promise<{
  total_score: number;
  max_score: number;
  step_results: Array<{
    step: number;
    description: string;
    score: number;
    max: number;
    feedback: string;
  }>;
  overall_feedback: string;
}> {
  const provider = getProvider();
  const { textModel } = getModelConfig(provider);
  const client = createClient();
  const stepsText = solutionSteps
    .map((s, i) => `步骤${i + 1}: ${s}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: textModel,
    messages: [
      {
        role: "user",
        content: `请对以下初中数学解答题进行步骤级评分。\n\n题目: ${question}\n学生作答: ${studentAnswer}\n标准分步解答:\n${stepsText}\n\n评分标准:每个关键步骤分配分数,步骤正确得满分,步骤错误得0分,部分正确可给部分分。\n\n请返回JSON格式:\n{\n  "total_score": 8,\n  "max_score": 10,\n  "step_results": [\n    {"step": 1, "description": "去括号", "score": 3, "max": 3, "feedback": "正确"},\n    {"step": 2, "description": "移项", "score": 2, "max": 4, "feedback": "移项符号错误"},\n    {"step": 3, "description": "合并同类项", "score": 3, "max": 3, "feedback": "正确"}\n  ],\n  "overall_feedback": "在移项步骤出现问题,符号从正变负时漏写了负号。"\n}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseJsonObjectFromText<{
    total_score?: number;
    max_score?: number;
    step_results?: Array<{
      step?: number;
      description?: string;
      score?: number;
      max?: number;
      feedback?: string;
    }>;
    overall_feedback?: string;
  }>(raw);
  if (parsed) {
    return {
      total_score: typeof parsed.total_score === "number" ? parsed.total_score : 0,
      max_score: typeof parsed.max_score === "number" ? parsed.max_score : 0,
      step_results: Array.isArray(parsed.step_results)
        ? parsed.step_results
            .map((step) => ({
              step: typeof step.step === "number" ? step.step : 0,
              description: typeof step.description === "string" ? step.description : "",
              score: typeof step.score === "number" ? step.score : 0,
              max: typeof step.max === "number" ? step.max : 0,
              feedback: typeof step.feedback === "string" ? step.feedback : "",
            }))
            .filter((item) => item.description || item.step > 0)
        : [],
      overall_feedback: typeof parsed.overall_feedback === "string" ? parsed.overall_feedback : raw,
    };
  }
  return {
    total_score: 0,
    max_score: 0,
    step_results: [],
    overall_feedback: raw,
  };
}

// ─── Variation generation ──────────────────────────────────────────────────

export async function generateVariation(
  sectionId: string,
  sectionDescription: string,
  keyPoints: string[],
  originalQuestion: string
): Promise<{
  question: string;
  answer: string;
  solution_steps: string[];
  solution: string;
  difficulty: "简单" | "中等" | "困难";
}> {
  const provider = getProvider();
  const { textModel } = getModelConfig(provider);
  const client = createClient();
  const response = await client.chat.completions.create({
    model: textModel,
    messages: [
      {
        role: "user",
        content: `基于以下知识点,生成一道与原题相似但不完全相同的变式练习题。\n\n知识点章节: ${sectionId} - ${sectionDescription}\n关键点: ${keyPoints.join(", ")}\n原题: ${originalQuestion}\n\n要求:\n- 题目必须是解答题(非选择题),难度为"中等"\n- 题干中包含LaTeX公式时使用$...$包裹\n- 生成与原题考察同一知识点但数字或问法不同的变式题\n\n请返回JSON格式:\n{\n  "question": "题目内容(含LaTeX公式)",\n  "answer": "答案",\n  "solution_steps": ["步骤1", "步骤2", "步骤3"],\n  "solution": "详细解析",\n  "difficulty": "中等"\n}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseJsonObjectFromText<{
    question?: string;
    answer?: string;
    solution_steps?: string[];
    solution?: string;
    difficulty?: "简单" | "中等" | "困难";
  }>(raw);
  if (parsed) {
    return {
      question: typeof parsed.question === "string" ? parsed.question : raw,
      answer: typeof parsed.answer === "string" ? parsed.answer : "",
      solution_steps: Array.isArray(parsed.solution_steps) ? parsed.solution_steps.map((step) => String(step)) : [],
      solution: typeof parsed.solution === "string" ? parsed.solution : "",
      difficulty:
        parsed.difficulty === "简单" || parsed.difficulty === "中等" || parsed.difficulty === "困难"
          ? parsed.difficulty
          : "中等",
    };
  }
  return {
    question: raw,
    answer: "",
    solution_steps: [],
    solution: "",
    difficulty: "中等",
  };
}
