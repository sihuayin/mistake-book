import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { QuestionPayload } from "@/lib/types";

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

  return NextResponse.json({
    question: {
      ...question,
      question_payload: parsedPayload,
    },
    attempt,
    reflections,
  });
}
