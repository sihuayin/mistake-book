import { NextRequest, NextResponse } from "next/server";
import type { GradePayload } from "@/lib/types";
import { guardedAiCall, toAiErrorResponse } from "@/lib/ai-guard";

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
    const result = await guardedAiCall({
      feature: "grade",
      payloadForHash: { question, studentAnswer, solutionSteps },
      run: () => gradeStepByStep(question, studentAnswer, solutionSteps),
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return toAiErrorResponse(err);
  }
}
