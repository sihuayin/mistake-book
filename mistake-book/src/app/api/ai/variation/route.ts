import { NextRequest, NextResponse } from "next/server";
import type { VariationPayload } from "@/lib/types";
import { findSection } from "@/lib/knowledge";

export async function POST(req: NextRequest) {
  try {
    const body: VariationPayload = await req.json();
    const { sectionId, originalQuestion } = body;

    if (!sectionId || !originalQuestion) {
      return NextResponse.json(
        { error: "sectionId and originalQuestion are required" },
        { status: 400 }
      );
    }

    const sectionData = findSection(sectionId);
    if (!sectionData) {
      return NextResponse.json(
        { error: `Section ${sectionId} not found in knowledge graph` },
        { status: 404 }
      );
    }

    const { section } = sectionData;

    const { generateVariation } = await import("@/lib/ai");
    const result = await generateVariation(
      sectionId,
      section.description,
      section.key_points,
      originalQuestion
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
