import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/db/schema";
import { getKnowledgeGraph, getSectionMeta } from "@/lib/knowledge";

let initialized = false;

function ensureDb() {
  if (!initialized) {
    initDb();
    initialized = true;
  }
}

export async function GET() {
  ensureDb();
  return NextResponse.json({ status: "ok", timestamp: Date.now() });
}

export async function POST(req: NextRequest) {
  ensureDb();
  try {
    const body = await req.json();
    const { imageBase64 } = body as { imageBase64: string };

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const { classifyQuestion, ocrImage } = await import("@/lib/ai");
    const result = await ocrImage(imageBase64);
    const kg = getKnowledgeGraph();
    const kgJson = JSON.stringify(kg);
    const problems = await Promise.all(
      (result.problems ?? []).map(async (problem) => {
        const classify = await classifyQuestion(problem.question_text, kgJson).catch(() => ({
          matched_section_id: "",
          confidence: 0,
          reason: "",
        }));
        const meta = classify.matched_section_id ? getSectionMeta(classify.matched_section_id) : null;

        return {
          ...problem,
          matched_section_id: classify.matched_section_id,
          section_name: meta?.section.name ?? "",
          confidence: Math.max(problem.confidence ?? 0, classify.confidence ?? 0),
        };
      })
    );

    return NextResponse.json({
      ...result,
      problems,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error in OCR route:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
