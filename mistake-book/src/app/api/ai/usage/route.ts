import { NextRequest, NextResponse } from "next/server";
import { getUsageForCurrentUser, toAiErrorResponse } from "@/lib/ai-guard";

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 20;
    const items = await getUsageForCurrentUser(limit);
    return NextResponse.json({ items });
  } catch (error: unknown) {
    return toAiErrorResponse(error);
  }
}
