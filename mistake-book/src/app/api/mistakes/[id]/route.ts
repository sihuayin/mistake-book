import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSectionMeta } from "@/lib/knowledge";
import { getSession } from "@/lib/session";
import type { QuestionPayload } from "@/lib/types";

function parseKnowledgePoints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return value
      .split(/[，,、\n]/g)
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const question = db
    .prepare("SELECT * FROM questions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!question) return NextResponse.json({ error: "未找到" }, { status: 404 });

  const attempt = db
    .prepare("SELECT * FROM attempts WHERE question_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(id, user.id) as Record<string, unknown> | undefined;

  const reflections = db
    .prepare("SELECT * FROM reflections WHERE question_id = ? ORDER BY created_at ASC")
    .all(id) as Record<string, unknown>[];

  let parsedPayload: QuestionPayload | null = null;
  if (typeof question.question_payload === "string" && question.question_payload) {
    try {
      parsedPayload = JSON.parse(question.question_payload) as QuestionPayload;
    } catch {
      parsedPayload = null;
    }
  }

  const sectionMeta =
    typeof question.section_id === "string" ? getSectionMeta(question.section_id) : null;

  return NextResponse.json({
    question: {
      ...question,
      section_name: sectionMeta?.section.name ?? null,
      chapter_title: sectionMeta?.chapter_title ?? null,
      grade: sectionMeta?.grade ?? null,
      question_payload: parsedPayload,
      knowledge_points: parseKnowledgePoints(question.knowledge_points),
    },
    attempt,
    reflections,
  });
}
