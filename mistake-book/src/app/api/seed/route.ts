import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findSection, getKnowledgeGraph } from "@/lib/knowledge";
import { v4 as uuidv4 } from "uuid";

// POST /api/seed — generate and store questions for a section
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (user.role !== "student") {
    return NextResponse.json({ error: "仅学生可操作" }, { status: 403 });
  }

  const body = await req.json();
  const sectionId: string = body.section_id;
  const count: number = body.count || 3;

  if (!sectionId) {
    return NextResponse.json({ error: "section_id is required" }, { status: 400 });
  }

  const meta = findSection(sectionId);
  if (!meta) {
    return NextResponse.json({ error: "章节不存在" }, { status: 404 });
  }

  const db = getDb();

  // Check if bank already has questions for this section
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM question_bank WHERE section_id = ?").get(sectionId) as { cnt: number };
  if (existing.cnt > 0) {
    return NextResponse.json({ message: `已有 ${existing.cnt} 道题`, count: existing.cnt });
  }

  const { generateVariation } = await import("@/lib/ai");
  const inserted: string[] = [];

  // Generate questions one by one
  for (let i = 0; i < count; i++) {
    try {
      const raw = await generateVariation(
        sectionId,
        meta.section.description,
        meta.section.key_points,
        `关于${meta.section.name}的初中数学题`
      );

      const questionText = typeof raw.question === "string" ? raw.question : `关于${meta.section.name}的练习题`;

      const answer = typeof raw.answer === "string" ? raw.answer : "";
      const solutionSteps = Array.isArray(raw.solution_steps) ? JSON.stringify(raw.solution_steps)
        : typeof raw.solution_steps === "string" ? raw.solution_steps
        : JSON.stringify([]);
      const solution = typeof raw.solution === "string" ? raw.solution : "";
      const difficulty = typeof raw.difficulty === "string" ? raw.difficulty : "中等";

      const id = uuidv4();
      db.prepare(
        `INSERT INTO question_bank (id, section_id, question_text, answer, solution_steps, solution, difficulty, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, sectionId, questionText, answer, solutionSteps, solution, difficulty, "ai_generated");
      inserted.push(id);
    } catch {
      // skip failed generation
    }
  }

  return NextResponse.json({
    message: `已生成 ${inserted.length} 道题`,
    count: inserted.length,
    section_name: meta.section.name,
  });
}

// GET /api/seed?section_id=xxx — check seed status
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const sectionId = req.nextUrl.searchParams.get("section_id");
  if (!sectionId) {
    // Return stats for all sections
    const db = getDb();
    const kg = getKnowledgeGraph();
    const stats: Array<{ section_id: string; section_name: string; question_count: number }> = [];
    for (const chapter of kg.chapters) {
      for (const section of chapter.sections) {
        const row = db.prepare("SELECT COUNT(*) as cnt FROM question_bank WHERE section_id = ?").get(section.id) as { cnt: number };
        stats.push({ section_id: section.id, section_name: section.name, question_count: row.cnt });
      }
    }
    return NextResponse.json(stats);
  }

  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) as cnt FROM question_bank WHERE section_id = ?").get(sectionId) as { cnt: number }).cnt;
  return NextResponse.json({ section_id: sectionId, question_count: count });
}
