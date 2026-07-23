import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { ReflectionPayload } from "@/lib/types";
import { getFallbackFourQuestions } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const body: ReflectionPayload = await req.json();
    const { questionId, errorType, currentResponse, previousResponses = [] } = body;

    if (!questionId || !errorType) {
      return NextResponse.json(
        { error: "questionId and errorType are required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if this question already has enough reflections
    const existingReflections = db
      .prepare("SELECT COUNT(*) as count FROM reflections WHERE question_id = ?")
      .get(questionId) as { count: number };

    if (existingReflections.count >= 3) {
      return NextResponse.json({
        question: "反思已完成,感谢你的回答!",
        followup_count: 99, // sentinel to stop
      });
    }

    const { generateReflectionQuestion } = await import("@/lib/ai");

    // Get question text for context
    const question = db
      .prepare("SELECT question_text FROM questions WHERE id = ?")
      .get(questionId) as { question_text: string } | undefined;

    // Save current response if provided
    if (currentResponse) {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO reflections (id, question_id, error_type, card_type, free_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, questionId, errorType, "ai_triggered", currentResponse, Date.now());
    }

    // Generate next question
    const result = await generateReflectionQuestion(
      errorType,
      question?.question_text ?? "",
      [...previousResponses, currentResponse].filter(Boolean)
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  // Return fallback four questions
  return NextResponse.json({ questions: getFallbackFourQuestions() });
}
