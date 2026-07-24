import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";

// PATCH /api/reviews/[id] — mark a review as done
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const now = Date.now();

  const existing = db.prepare("SELECT * FROM review_records WHERE id = ? AND student_id = ?").get(id, user.id) as Record<string, unknown> | undefined;
  if (!existing) {
    return NextResponse.json({ error: "复习记录不存在" }, { status: 404 });
  }

  db.prepare(
    "UPDATE review_records SET status = 'done', reviewed_at = ? WHERE id = ?"
  ).run(now, id);

  return NextResponse.json({ id, status: "done", reviewed_at: now });
}

// DELETE /api/reviews/[id] — mark as missed
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT * FROM review_records WHERE id = ? AND student_id = ?").get(id, user.id) as Record<string, unknown> | undefined;
  if (!existing) {
    return NextResponse.json({ error: "复习记录不存在" }, { status: 404 });
  }

  db.prepare(
    "UPDATE review_records SET status = 'missed', reviewed_at = ? WHERE id = ?"
  ).run(Date.now(), id);

  return NextResponse.json({ id, status: "missed" });
}
