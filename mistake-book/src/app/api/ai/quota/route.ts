import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getQuotaSummaryForCurrentUser, toAiErrorResponse, updateQuotaForCurrentUser } from "@/lib/ai-guard";

export async function GET() {
  try {
    const quota = await getQuotaSummaryForCurrentUser();
    return NextResponse.json(quota);
  } catch (error: unknown) {
    return toAiErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      monthlyCredits?: number;
      planName?: string;
      resetUsedCredits?: boolean;
    };

    const quota = await updateQuotaForCurrentUser(body);
    return NextResponse.json(quota);
  } catch (error: unknown) {
    return toAiErrorResponse(error);
  }
}
