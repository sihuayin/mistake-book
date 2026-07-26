import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeGraph } from "@/lib/knowledge";
import { guardedAiCall, toAiErrorResponse } from "@/lib/ai-guard";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionText } = body as { questionText: string };

    if (!questionText) {
      return NextResponse.json({ error: "questionText is required" }, { status: 400 });
    }

    const { classifyQuestion } = await import("@/lib/ai");
    const kg = getKnowledgeGraph();
    const result = await guardedAiCall({
      feature: "classify",
      payloadForHash: { questionText },
      run: () => classifyQuestion(questionText, JSON.stringify(kg)),
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return toAiErrorResponse(err);
  }
}
