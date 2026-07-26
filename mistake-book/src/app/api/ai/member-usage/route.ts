import { NextResponse } from "next/server";
import { getMemberUsageSummaryForCurrentUser, toAiErrorResponse } from "@/lib/ai-guard";

export async function GET() {
  try {
    const items = await getMemberUsageSummaryForCurrentUser();
    return NextResponse.json({ items });
  } catch (error: unknown) {
    return toAiErrorResponse(error);
  }
}
