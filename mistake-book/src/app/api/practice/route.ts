import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getKnowledgeGraph } from "@/lib/knowledge";
import { getPracticeQuestionsForSection } from "@/lib/practice";
import { v4 as uuidv4 } from "uuid";

// GET /api/practice?section_id=1.1  — get questions for a section (from bank or AI)
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const sectionId = req.nextUrl.searchParams.get("section_id");
  const grade = req.nextUrl.searchParams.get("grade");
  if (!sectionId) {
    // Return weak sections list
    const db = getDb();
    const kg = getKnowledgeGraph();

    const weakSections = [];
    for (const chapter of kg.chapters) {
      if (grade && chapter.grade !== grade) continue;
      for (const section of chapter.sections) {
        const errorCount = (db
          .prepare(`SELECT COUNT(*) as cnt FROM questions q
                    JOIN attempts a ON a.question_id = q.id
                    WHERE q.section_id = ? AND a.student_id = ? AND a.is_correct = 0`)
          .get(section.id, user.id) as { cnt: number }).cnt;

        weakSections.push({
          section_id: section.id,
          section_name: section.name,
          grade: chapter.grade,
          chapter_title: chapter.title,
          error_count: errorCount,
        });
      }
    }

    weakSections.sort((a, b) => b.error_count - a.error_count);
    return NextResponse.json(weakSections);
  }

  try {
    const result = await getPracticeQuestionsForSection(sectionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "题目生成失败" },
      { status: 404 }
    );
  }
}

// POST /api/practice — create a practice session
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { section_id } = await req.json();
  const db = getDb();
  const sessionId = uuidv4();

  db.prepare(
    `INSERT INTO practice_sessions (id, student_id, target_sections, started_at)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, user.id, JSON.stringify(section_id ? [section_id] : []), Date.now());

  return NextResponse.json({ session_id: sessionId });
}
