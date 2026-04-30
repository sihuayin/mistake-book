import { NextRequest, NextResponse } from "next/server";
import type { GradePayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body: GradePayload = await req.json();
    const { question, studentAnswer, solutionSteps } = body;

    if (!question || !studentAnswer || !solutionSteps) {
      return NextResponse.json(
        { error: "question, studentAnswer and solutionSteps are required" },
        { status: 400 }
      );
    }

    const { gradeStepByStep } = await import("@/lib/ai");
    const result = await gradeStepByStep(question, studentAnswer, solutionSteps);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
