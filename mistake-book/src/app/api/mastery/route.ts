import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getKnowledgeGraph } from "@/lib/knowledge";
import type { MasteryScore } from "@/lib/types";

// Ebbinghaus critical intervals in milliseconds
const CRITICAL_INTERVALS_MS = [
  1 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

function calculateReflectionQuality(reflections: { free_text: string | null }[]): number {
  if (reflections.length === 0) return 0;
  const scores = reflections.map((r) => {
    if (!r.free_text || r.free_text.trim().length < 10) return 0;
    if (r.free_text.length < 30) return 60;
    return Math.min(100, 70 + Math.min(30, r.free_text.length / 3));
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function calculateReviewCompliance(
  reviews: { due_at: number; status: string; reviewed_at: number | null }[]
): number {
  const now = Date.now();
  const overdue = reviews.filter(
    (r) => r.due_at <= now && (r.status === "done" || r.reviewed_at)
  );
  return reviews.length > 0 ? (overdue.length / reviews.length) * 100 : 100;
}

export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("student_id");
    if (!studentId) {
      return NextResponse.json({ error: "student_id is required" }, { status: 400 });
    }

    const db = getDb();
    const kg = getKnowledgeGraph();

    const results: MasteryScore[] = [];

    for (const chapter of kg.chapters) {
      for (const section of chapter.sections) {
        // Accuracy rate (last 20 attempts)
        const attempts = db
          .prepare(
            `SELECT is_correct FROM attempts a
             JOIN questions q ON a.question_id = q.id
             WHERE a.student_id = ? AND q.section_id = ?
             ORDER BY a.created_at DESC LIMIT 20`
          )
          .all(studentId, section.id) as { is_correct: number }[];

        const accuracyRate =
          attempts.length > 0
            ? (attempts.filter((a) => a.is_correct === 1).length / attempts.length) * 100
            : 100; // no data → full score

        // Review compliance
        const reviews = db
          .prepare(
            `SELECT due_at, status, reviewed_at FROM review_records
             WHERE student_id = ?`
          )
          .all(studentId) as { due_at: number; status: string; reviewed_at: number | null }[];

        const sectionReviews = reviews.filter((r) => {
          // Filter reviews for this section
          return true; // Simplified for now
        });

        const reviewCompliance = calculateReviewCompliance(sectionReviews);

        // Reflection quality
        const reflections = db
          .prepare(
            `SELECT r.free_text FROM reflections r
             JOIN questions q ON r.question_id = q.id
             WHERE q.section_id = ? AND q.id IN (
               SELECT question_id FROM attempts WHERE student_id = ?
             )`
          )
          .all(section.id, studentId) as { free_text: string | null }[];

        const reflectionQuality = calculateReflectionQuality(reflections);

        // Composite score
        const compositeScore =
          accuracyRate * 0.4 + reviewCompliance * 0.3 + reflectionQuality * 0.3;

        results.push({
          student_id: studentId,
          section_id: section.id,
          accuracy_rate: Math.round(accuracyRate * 10) / 10,
          review_compliance_rate: Math.round(reviewCompliance * 10) / 10,
          reflection_quality_score: Math.round(reflectionQuality * 10) / 10,
          composite_score: Math.round(compositeScore * 10) / 10,
          last_updated: Date.now(),
        });
      }
    }

    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
