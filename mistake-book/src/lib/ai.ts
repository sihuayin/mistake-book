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
import type { DiagramData, ErrorType, OcrProblem, OcrResult, QuestionPayload } from "./types";

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
    visionModel: "gemini-2.0-flash",
    textModel: "gemini-2.0-flash",
  },
};

function getProvider(): Provider {
  const val = (process.env.AI_PROVIDER ?? "kimi").toLowerCase().trim();
  if (val === "qwen") return "qwen";
  if (val === "gemini") return "gemini";
  return "kimi"; // default
}

function getVisionProvider(): Provider {
  if (process.env.DASHSCOPE_API_KEY) return "qwen";
  if (process.env.KIMI_API_KEY) return "kimi";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return getProvider();
}

function hasProviderKey(provider: Provider) {
  const envName = PROVIDER_CONFIG[provider].apiKeyEnv;
  return Boolean(process.env[envName]);
}

function createClient(providerOverride?: Provider): OpenAI {
  const provider = providerOverride ?? getProvider();
  const cfg = PROVIDER_CONFIG[provider];
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${cfg.apiKeyEnv} environment variable is not set (provider: ${provider})`);
  }

  const httpProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  const dispatcher = httpProxy ? new ProxyAgent(httpProxy) : undefined;

  return new OpenAI({
    baseURL: cfg.baseURL,
    apiKey,
    fetch: dispatcher
      ? (url, init) => undiciFetch(url as string, { ...(init as object), dispatcher }) as unknown as Promise<Response>
      : undefined,
  });
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

async function createChatCompletionWithFallback(
  providers: Provider[],
  modelType: "visionModel" | "textModel",
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
) {
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const client = createClient(provider);
      const model = getModelConfig(provider)[modelType];
      return await client.chat.completions.create({
        model,
        messages,
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

// ─── OCR ────────────────────────────────────────────────────────────────────

function normalizeErrorType(value: string | undefined): ErrorType | "" {
  if (value === "粗心" || value === "概念混淆" || value === "思路断链" || value === "完全不会") {
    return value;
  }
  return "";
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
  };
}

function normalizeQuestionPayload(value: unknown): QuestionPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  return {
    stem_text: typeof payload.stem_text === "string" ? payload.stem_text : undefined,
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

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0]?.trim() ?? null;
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

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumberValue(value: unknown, fallback = 0.5) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export async function ocrImage(imageBase64: string): Promise<OcrResult> {
  const provider = getVisionProvider();
  const response = await createChatCompletionWithFallback(buildFallbackProviders(provider), "visionModel", [
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
          text: `你是一个负责初中数学错题录入的识别助手。请分析这张试卷/练习照片，照片中可能同时包含多道题目、学生作答、批改痕迹。

请完成这些事情：
1. 尽可能拆分出图片中的每一道独立题目。
2. 提取每道题的题干；如果能看到学生作答，也提取 student_answer。
3. 判断学生是否做错；如果无法确定，is_correct 返回 null。
4. 给每道题总结 1 到 3 个知识点关键词 knowledge_points。
5. 如果能推断出错误原因，error_type 仅可使用：粗心、概念混淆、思路断链、完全不会；否则留空字符串。
6. 给出整张图片的 summary。

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
        "options": [{"label":"A","text":"12°","latex":"$12^\\circ$"}],
        "diagram": {
          "type": "geometry_diagram",
          "scene": "图形场景摘要",
          "points": ["A", "B", "C"],
          "segments": [["A","B"],["B","C"]],
          "relations": [{"kind":"angle","name":"CBD","value":"90^\\circ"}],
          "labels": [{"text":"∠1","at":"B"}]
        },
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
}`,
        },
      ],
    },
  ]);

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseStructuredJson(raw);
  if (parsed) {
    const baseConfidence = toNumberValue(parsed.confidence, 0.5);
    const parsedProblems = Array.isArray(parsed.problems) ? (parsed.problems as unknown[]) : [];
    const problems: OcrProblem[] = parsedProblems
      .map((item) => {
        const problem = item as Record<string, unknown>;
        return {
          question_text: toStringValue(problem.question_text).trim(),
          latex_content: toStringValue(problem.latex_content, toStringValue(problem.question_text)).trim(),
          question_payload: normalizeQuestionPayload(problem.question_payload),
          student_answer: toStringValue(problem.student_answer).trim(),
          is_correct: typeof problem.is_correct === "boolean" ? problem.is_correct : null,
          error_type: normalizeErrorType(
            typeof problem.error_type === "string" ? problem.error_type : undefined
          ),
          knowledge_points: toStringArray(problem.knowledge_points),
          confidence: toNumberValue(problem.confidence, baseConfidence),
        };
      })
      .filter((problem) => Boolean(problem.question_text));

    return {
      text: toStringValue(parsed.text, raw),
      summary: toStringValue(parsed.summary),
      latexBlocks: toStringArray(parsed.latexBlocks),
      confidence: baseConfidence,
      problems,
    };
  }
  return {
    text: raw,
    summary: "",
    latexBlocks: [],
    confidence: 0.5,
    problems: raw.trim() ? [{ question_text: raw.trim(), latex_content: raw.trim(), question_payload: undefined, student_answer: "", is_correct: null, error_type: "", knowledge_points: [], confidence: 0.5 }] : [],
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
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
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
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
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
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return {
    question: raw,
    answer: "",
    solution_steps: [],
    solution: "",
    difficulty: "中等",
  };
}
