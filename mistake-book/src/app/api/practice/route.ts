import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getKnowledgeGraph, findSection } from "@/lib/knowledge";
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

  const db = getDb();

  // Try question bank first
  const bankQuestions = db
    .prepare("SELECT * FROM question_bank WHERE section_id = ? ORDER BY RANDOM() LIMIT 3")
    .all(sectionId) as Record<string, unknown>[];

  if (bankQuestions.length > 0) {
    return NextResponse.json({ source: "bank", questions: bankQuestions });
  }

  // Fall back to AI generation
  const found = findSection(sectionId);
  if (!found) return NextResponse.json({ error: "章节不存在" }, { status: 404 });

  const { generateVariation } = await import("@/lib/ai");
  const generated = await generateVariation(
    sectionId,
    found.section.description,
    found.section.key_points,
    `关于${found.section.name}的解答题`
  );

  return NextResponse.json({ source: "ai", questions: [generated] });
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
