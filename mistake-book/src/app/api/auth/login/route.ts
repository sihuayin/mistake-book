import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { initDb } from "@/db/schema";
import { createSession } from "@/lib/session";
import crypto from "crypto";

let initialized = false;
function ensureDb() {
  if (!initialized) { initDb(); initialized = true; }
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  ensureDb();
  try {
    const { name, password } = await req.json();

    if (!name || !password) {
      return NextResponse.json({ error: "name 和 password 必填" }, { status: 400 });
    }

    const db = getDb();
    const user = db
      .prepare("SELECT id, name, role, family_code, current_grade FROM users WHERE name = ? AND password_hash = ?")
      .get(name, hashPassword(password)) as
      | { id: string; name: string; role: string; family_code: string; current_grade: string | null }
      | undefined;

    if (!user) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    await createSession(user.id);
    return NextResponse.json(user);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
