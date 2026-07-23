import { getDb } from "@/lib/db";
import { findSection } from "@/lib/knowledge";
import { v4 as uuidv4 } from "uuid";

export interface PracticeSectionMeta {
  section_id: string;
  section_name: string;
  grade: string;
  chapter_title: string;
}

export interface PracticeQuestionResult {
  source: "bank" | "ai";
  questions: Record<string, unknown>[];
  section?: PracticeSectionMeta;
}

export interface PracticeSessionQuestionResult {
  source: "bank" | "ai";
  question: Record<string, unknown> | null;
  section?: PracticeSectionMeta;
  current_question_id?: string;
  question_count: number;
}

function buildSectionMeta(sectionId: string): PracticeSectionMeta | undefined {
  const meta = findSection(sectionId);
  return meta
    ? {
        section_id: sectionId,
        section_name: meta.section.name,
        grade: meta.chapter.grade,
        chapter_title: meta.chapter.title,
      }
    : undefined;
}

function createQuestionRecord(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  sectionId: string,
  rawQuestion: Record<string, unknown>,
  source: string
) {
  const questionId = typeof rawQuestion.id === "string" && rawQuestion.id.trim() ? rawQuestion.id : uuidv4();
  db.prepare(
    `INSERT INTO questions (id, session_id, section_id, question_text, latex_content, question_payload, knowledge_points, source, question_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    questionId,
    sessionId,
    sectionId,
    typeof rawQuestion.question_text === "string"
      ? rawQuestion.question_text
      : typeof rawQuestion.question === "string"
        ? rawQuestion.question
        : "",
    typeof rawQuestion.latex_content === "string" ? rawQuestion.latex_content : null,
    rawQuestion.question_payload ? JSON.stringify(rawQuestion.question_payload) : null,
    rawQuestion.knowledge_points ? JSON.stringify(rawQuestion.knowledge_points) : null,
    source,
    typeof rawQuestion.question_type === "string" ? rawQuestion.question_type : "解答"
  );

  return {
    ...rawQuestion,
    id: questionId,
    session_id: sessionId,
    section_id: sectionId,
    source,
    question_type: typeof rawQuestion.question_type === "string" ? rawQuestion.question_type : "解答",
  };
}

export async function getPracticeQuestionsForSection(sectionId: string): Promise<PracticeQuestionResult> {
  const db = getDb();

  const bankQuestions = db
    .prepare("SELECT * FROM question_bank WHERE section_id = ? ORDER BY RANDOM() LIMIT 3")
    .all(sectionId) as Record<string, unknown>[];

  if (bankQuestions.length > 0) {
    return {
      source: "bank",
      questions: bankQuestions,
      section: buildSectionMeta(sectionId),
    };
  }

  const found = findSection(sectionId);
  if (!found) {
    throw new Error("章节不存在");
  }

  const { generateVariation } = await import("@/lib/ai");
  const generated = await generateVariation(
    sectionId,
    found.section.description,
    found.section.key_points,
    `关于${found.section.name}的解答题`
  );

  return {
    source: "ai",
    questions: [generated as Record<string, unknown>],
    section: buildSectionMeta(sectionId),
  };
}

export async function getNextPracticeQuestionForSession(
  sessionId: string,
  sectionId: string
): Promise<PracticeSessionQuestionResult> {
  const db = getDb();
  const latest = db
    .prepare(
      `SELECT q.*, EXISTS(SELECT 1 FROM attempts a WHERE a.question_id = q.id) AS has_attempt
       FROM questions q
       WHERE q.session_id = ?
       ORDER BY q.rowid DESC
       LIMIT 1`
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (latest && !Number(latest.has_attempt ?? 0)) {
    const section = buildSectionMeta(sectionId);
    return {
      source: String(latest.source) === "ai_generated" ? "ai" : "bank",
      question: latest,
      section,
      current_question_id: typeof latest.id === "string" ? latest.id : undefined,
      question_count: (db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt,
    };
  }

  const practice = await getPracticeQuestionsForSection(sectionId);
  const rawQuestion = practice.questions[0] ?? null;
  if (!rawQuestion) {
    return {
      source: practice.source,
      question: null,
      section: practice.section,
      question_count: (db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt,
    };
  }

  const inserted = createQuestionRecord(db, sessionId, sectionId, rawQuestion, practice.source === "bank" ? "bank" : "ai_generated");
  return {
    source: practice.source,
    question: inserted,
    section: practice.section,
    current_question_id: String(inserted.id ?? ""),
    question_count: (db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt,
  };
}
