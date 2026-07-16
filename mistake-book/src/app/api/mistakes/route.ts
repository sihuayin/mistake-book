import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { initDb } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getKnowledgeGraph, getSectionMeta } from "@/lib/knowledge";
import type { QuestionPayload } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

let initialized = false;
function ensureDb() {
  if (!initialized) { initDb(); initialized = true; }
}

type MistakeDraft = {
  question_text: string;
  section_id?: string;
  question_type?: string;
  source?: string;
  latex_content?: string | null;
  question_payload?: QuestionPayload;
  is_correct?: number | boolean | null;
  error_type?: string;
  reflection_text?: string;
  answer?: string;
};

type NormalizedMistakeDraft = {
  question_text: string;
  section_id: string;
  question_type: string;
  source: string;
  latex_content: string | null;
  question_payload?: QuestionPayload;
  is_correct: number | boolean | null;
  error_type: string;
  reflection_text: string;
  answer: string;
};

function createMistakeRecord(db: ReturnType<typeof getDb>, userId: string, payload: NormalizedMistakeDraft) {
  const questionId = uuidv4();
  const attemptId = uuidv4();

  db.prepare(
    `INSERT INTO questions (id, section_id, question_text, latex_content, question_payload, source, question_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    questionId,
    payload.section_id,
    payload.question_text,
    payload.latex_content ?? null,
    payload.question_payload ? JSON.stringify(payload.question_payload) : null,
    payload.source,
    payload.question_type
  );

  db.prepare(
    `INSERT INTO attempts (id, question_id, student_id, answer, is_correct, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(attemptId, questionId, userId, payload.answer ?? "", payload.is_correct ? 1 : 0, Date.now());

  if (payload.error_type) {
    const reflectionId = uuidv4();
    db.prepare(
      `INSERT INTO reflections (id, question_id, error_type, card_type, free_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(reflectionId, questionId, payload.error_type, "initial", payload.reflection_text ?? null, Date.now());
  }

  const intervals = [1, 3, 7, 14, 30];
  const now = Date.now();
  for (const day of intervals) {
    const reviewId = uuidv4();
    db.prepare(
      `INSERT INTO review_records (id, question_id, student_id, due_at, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).run(reviewId, questionId, userId, now + day * 24 * 60 * 60 * 1000);
  }

  return { id: questionId, attempt_id: attemptId };
}

export async function GET(req: NextRequest) {
  ensureDb();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const db = getDb();
  const sectionId = req.nextUrl.searchParams.get("section_id");
  const errorType = req.nextUrl.searchParams.get("error_type");
  const grade = req.nextUrl.searchParams.get("grade");

  let sql = `
    SELECT q.id, q.section_id, q.question_text, q.latex_content, q.question_payload, q.source, q.question_type,
           a.is_correct, a.ai_feedback, a.created_at,
           r.error_type, r.free_text
    FROM questions q
    JOIN attempts a ON a.question_id = q.id
    LEFT JOIN reflections r ON r.question_id = q.id
    WHERE a.student_id = ?
  `;
  const params: (string | number)[] = [user.id];

  if (sectionId) { sql += " AND q.section_id = ?"; params.push(sectionId); }
  if (errorType) { sql += " AND r.error_type = ?"; params.push(errorType); }

  sql += " ORDER BY a.created_at DESC";

  const mistakes = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const enriched = mistakes.map((mistake) => ({
    ...mistake,
    grade: getSectionMeta(String(mistake.section_id))?.grade ?? null,
  }));

  const filtered = grade
    ? enriched.filter((mistake) => mistake.grade === grade)
    : enriched;

  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  ensureDb();
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const body = await req.json();
    const drafts = Array.isArray(body.items)
      ? (body.items as MistakeDraft[])
      : ([body] as MistakeDraft[]);

    if (!drafts.length) {
      return NextResponse.json({ error: "至少需要一条错题记录" }, { status: 400 });
    }

    const db = getDb();
    const { classifyQuestion } = await import("@/lib/ai");
    const knowledgeGraphJson = JSON.stringify(getKnowledgeGraph());
    const saved = [];

    for (const draft of drafts) {
      if (!draft.question_text?.trim()) {
        continue;
      }

      let sectionId = draft.section_id ?? "";
      if (!sectionId) {
        const classify = await classifyQuestion(draft.question_text, knowledgeGraphJson);
        sectionId = classify.matched_section_id;
      }

      if (!sectionId) {
        return NextResponse.json(
          { error: `无法自动关联知识点：${draft.question_text.slice(0, 24)}...` },
          { status: 400 }
        );
      }

      const savedItem = createMistakeRecord(db, user.id, {
        question_text: draft.question_text.trim(),
        section_id: sectionId,
        question_type: draft.question_type ?? "解答",
        source: draft.source ?? "ocr",
        latex_content: draft.latex_content ?? null,
        question_payload: draft.question_payload,
        is_correct: typeof draft.is_correct === "boolean" ? draft.is_correct : Number(draft.is_correct ?? 0),
        error_type: draft.error_type ?? "",
        reflection_text: draft.reflection_text ?? "",
        answer: draft.answer ?? "",
      });

      const sectionMeta = getSectionMeta(sectionId);
      saved.push({
        ...savedItem,
        section_id: sectionId,
        section_name: sectionMeta?.section.name ?? sectionId,
      });
    }

    return NextResponse.json({
      count: saved.length,
      items: saved,
      id: saved[0]?.id,
      attempt_id: saved[0]?.attempt_id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
