import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /api/reviews — list review records for the current user
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = getDb();
  const now = Date.now();
  const sectionId = req.nextUrl.searchParams.get("section_id");

  const reviews = db
    .prepare(
      `SELECT 
         r.id, 
         r.question_id, 
         r.due_at, 
         r.reviewed_at, 
         r.status,
         q.section_id,
         q.question_text,
         q.latex_content,
         q.knowledge_points
       FROM review_records r
       JOIN questions q ON q.id = r.question_id
       WHERE r.student_id = ?
       ORDER BY r.status ASC, r.due_at ASC
       LIMIT 50`
    )
    .all(user.id) as Array<{
      id: string;
      question_id: string;
      due_at: number;
      reviewed_at: number | null;
      status: string;
      section_id: string;
      question_text: string;
      latex_content: string | null;
      knowledge_points: string | null;
    }>;

  const result = reviews.map((r) => ({
    ...r,
    is_overdue: r.status === "pending" && r.due_at <= now,
    knowledge_points: r.knowledge_points ? JSON.parse(r.knowledge_points) : [],
  }));

  return NextResponse.json(result);
}

// POST /api/reviews — create a manual review record (for debugging / admin)
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const { question_id, due_at } = body;
  if (!question_id || !due_at) {
    return NextResponse.json({ error: "question_id and due_at are required" }, { status: 400 });
  }

  const db = getDb();
  const { v4: uuidv4 } = await import("uuid");
  const id = uuidv4();

  db.prepare(
    `INSERT INTO review_records (id, question_id, student_id, due_at, status)
     VALUES (?, ?, ?, ?, 'pending')`
  ).run(id, question_id, user.id, due_at);

  return NextResponse.json({ id });
}
