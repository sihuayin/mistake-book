import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getNextPracticeQuestionForSession } from "@/lib/practice";

function parseTargetSections(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { sessionId } = await context.params;
  const db = getDb();

  const session = db
    .prepare("SELECT * FROM practice_sessions WHERE id = ? AND student_id = ?")
    .get(sessionId, user.id) as
    | { id: string; student_id: string; target_sections: string | null; started_at: number; finished_at: number | null }
    | undefined;

  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  const targetSections = parseTargetSections(session.target_sections);
  const sectionId = req.nextUrl.searchParams.get("section_id") ?? targetSections[0] ?? "";

  if (!sectionId) {
    return NextResponse.json({ error: "会话未配置章节" }, { status: 400 });
  }

  try {
    const practice = await getNextPracticeQuestionForSession(session.id, sectionId);
    return NextResponse.json({
      session_id: session.id,
      target_sections: targetSections,
      started_at: session.started_at,
      finished_at: session.finished_at,
      current_section_id: sectionId,
      section: practice.section,
      source: practice.source,
      current_question_id: practice.current_question_id,
      question_count: practice.question_count,
      question: practice.question,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "题目加载失败" },
      { status: 404 }
    );
  }
}
