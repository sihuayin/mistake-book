import { NextRequest, NextResponse } from "next/server";
import { filterKnowledgeGraphByGrade } from "@/lib/knowledge";

export async function GET(req: NextRequest) {
  const grade = req.nextUrl.searchParams.get("grade");
  const kg = filterKnowledgeGraphByGrade(grade);
  return NextResponse.json(kg);
}
