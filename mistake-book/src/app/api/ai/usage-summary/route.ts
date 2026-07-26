import { NextResponse } from "next/server";
import { getUsageSummaryForCurrentUser, toAiErrorResponse } from "@/lib/ai-guard";

export async function GET() {
  try {
    const items = await getUsageSummaryForCurrentUser();
    return NextResponse.json({ items });
  } catch (error: unknown) {
    return toAiErrorResponse(error);
  }
}
