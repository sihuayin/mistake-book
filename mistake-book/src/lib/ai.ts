/**
 * AI integration module — qwen (通义千问) API wrapper
 *
 * All AI capabilities are routed through this module:
 * - OCR (vision model with base64 image input)
 * - Classification (match question text to knowledge graph section)
 * - Reflection follow-up generation
 * - Step-level grading
 * - Variation question generation
 */

import OpenAI from "openai";

/** Extract plain text from an OpenAI Responses API output array */
function extractText(output: unknown[]): string {
  for (const item of output) {
    if (item && typeof item === "object" && "content" in item) {
      const content = (item as { content: unknown[] }).content;
      for (const part of content) {
        if (part && typeof part === "object" && "text" in part) {
          return (part as { text: string }).text;
        }
      }
    }
  }
  return "";
}

const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL_VISION = "qwen-vl-max";
const MODEL_TEXT = "qwen-plus";

function createClient() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY environment variable is not set");
  }
  return new OpenAI({
    baseURL: QWEN_BASE_URL,
    apiKey,
  });
}

// ─── OCR ────────────────────────────────────────────────────────────────────

export async function ocrImage(imageBase64: string): Promise<{
  text: string;
  latexBlocks: string[];
  confidence: number;
}> {
  const client = createClient();
  const response = await client.responses.create({
    model: MODEL_VISION,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_image",
            input_image: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "input_text",
            input_text:
              "请识别这张图片中的数学题目文字内容,并提取所有LaTeX公式(如使用$...$或\\(...\\)包裹)。以JSON格式返回: {\"text\": \"识别到的文字\", \"latexBlocks\": [\"latex公式列表\"], \"confidence\": 0-1数字}。如果无法识别某部分文字,使用[?]标注。",
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any[],
      },
    ],
  });

  const raw = extractText(response.output);
  // Try to parse JSON from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      text: parsed.text ?? raw,
      latexBlocks: parsed.latexBlocks ?? [],
      confidence: parsed.confidence ?? 0.5,
    };
  }
  return { text: raw, latexBlocks: [], confidence: 0.5 };
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
  const client = createClient();
  const response = await client.responses.create({
    model: MODEL_TEXT,
    input: [
      {
        role: "user",
        content: `给定以下题目和知识图谱JSON,请选择最匹配的section id。

题目: ${questionText}

知识图谱: ${knowledgeGraphJson}

请返回JSON格式:
{
  "matched_section_id": "1.2",
  "confidence": 0.85,
  "reason": "题目涉及绝对值概念,与section 1.2 '有理数'匹配"
}`,
      },
    ],
  });

  const raw = extractText(response.output);
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
  const client = createClient();
  const context = previousResponses.length
    ? `\n学生之前的回答:\n${previousResponses.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    : "";

  const prompt =
    previousResponses.length === 0
      ? ERROR_TYPE_PROMPTS[errorType] ||
        "你在这道题哪里卡住了?能描述一下你的思考过程吗?"
      : `基于学生的以上回答,生成下一个追问(限1个问题)。要求:追问要具体,引导深度思考,语言适合12-13岁初中生,不要重复之前的问题。直接输出问题,不要解释。`;

  const response = await client.responses.create({
    model: MODEL_TEXT,
    input: [
      {
        role: "user",
        content: `题目: ${questionText}\n错误类型: ${errorType}${context}\n\n请生成下一个追问:`,
      },
    ],
  });

  return {
    question: extractText(response.output).trim(),
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
  const client = createClient();
  const stepsText = solutionSteps
    .map((s, i) => `步骤${i + 1}: ${s}`)
    .join("\n");

  const response = await client.responses.create({
    model: MODEL_TEXT,
    input: [
      {
        role: "user",
        content: `请对以下初一数学解答题进行步骤级评分。

题目: ${question}
学生作答: ${studentAnswer}
标准分步解答:
${stepsText}

评分标准:每个关键步骤分配分数,步骤正确得满分,步骤错误得0分,部分正确可给部分分。

请返回JSON格式:
{
  "total_score": 8,
  "max_score": 10,
  "step_results": [
    {"step": 1, "description": "去括号", "score": 3, "max": 3, "feedback": "正确"},
    {"step": 2, "description": "移项", "score": 2, "max": 4, "feedback": "移项符号错误"},
    {"step": 3, "description": "合并同类项", "score": 3, "max": 3, "feedback": "正确"}
  ],
  "overall_feedback": "在移项步骤出现问题,符号从正变负时漏写了负号。"
}`,
      },
    ],
  });

  const raw = extractText(response.output);
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
  const client = createClient();
  const response = await client.responses.create({
    model: MODEL_TEXT,
    input: [
      {
        role: "user",
        content: `基于以下知识点,生成一道与原题相似但不完全相同的变式练习题。

知识点章节: ${sectionId} - ${sectionDescription}
关键点: ${keyPoints.join(", ")}
原题: ${originalQuestion}

要求:
- 题目必须是解答题(非选择题),难度为"中等"
- 题干中包含LaTeX公式时使用$...$包裹
- 生成与原题考察同一知识点但数字或问法不同的变式题

请返回JSON格式:
{
  "question": "题目内容(含LaTeX公式)",
  "answer": "答案",
  "solution_steps": ["步骤1", "步骤2", "步骤3"],
  "solution": "详细解析",
  "difficulty": "中等"
}`,
      },
    ],
  });

  const raw = extractText(response.output);
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
