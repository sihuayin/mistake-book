import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildStudentOverview, resolveOverviewStudent } from "@/lib/overview";
import { initDb } from "@/db/schema";

let initialized = false;
function ensureDb() {
  if (!initialized) {
    initDb();
    initialized = true;
  }
}

export async function GET(req: NextRequest) {
  ensureDb();
  const sessionUser = await getSession();
  if (!sessionUser) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const studentId = req.nextUrl.searchParams.get("student_id");
  const resolved = resolveOverviewStudent(sessionUser, studentId);
  if (!resolved) {
    return NextResponse.json({ error: "未找到可查看的学生" }, { status: 404 });
  }

  const overview = buildStudentOverview(
    resolved.studentId,
    resolved.audience,
    resolved.studentOptions
  );

  if (!overview) {
    return NextResponse.json({ error: "未找到学生概览" }, { status: 404 });
  }

  return NextResponse.json(overview);
}
