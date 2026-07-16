import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { initDb } from "@/db/schema";
import { createSession } from "@/lib/session";
import { v4 as uuidv4 } from "uuid";
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
    const { name, password, role, familyCode, currentGrade } = await req.json();

    if (!name || !password || !role) {
      return NextResponse.json({ error: "name, password, role 必填" }, { status: 400 });
    }
    if (!["student", "parent"].includes(role)) {
      return NextResponse.json({ error: "role 必须是 student 或 parent" }, { status: 400 });
    }
    if (role === "student" && currentGrade && !["七年级", "八年级", "九年级"].includes(currentGrade)) {
      return NextResponse.json({ error: "currentGrade 必须是七年级、八年级或九年级" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();

    // For students: generate a family code. For parents: require an existing student's family code.
    let resolvedFamilyCode: string;
    if (role === "student") {
      resolvedFamilyCode = familyCode || Math.random().toString(36).slice(2, 8).toUpperCase();
    } else {
      if (!familyCode) {
        return NextResponse.json({ error: "家长注册必须填写家庭码" }, { status: 400 });
      }
      // Verify family code exists
      const student = db
        .prepare("SELECT id FROM users WHERE family_code = ? AND role = 'student'")
        .get(familyCode) as { id: string } | undefined;
      if (!student) {
        return NextResponse.json({ error: "家庭码不存在，请确认学生已注册" }, { status: 400 });
      }
      resolvedFamilyCode = familyCode;
    }

    db.prepare(
      `INSERT INTO users (id, name, role, family_code, current_grade, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      role,
      resolvedFamilyCode,
      role === "student" ? (currentGrade ?? "七年级") : null,
      hashPassword(password),
      Date.now()
    );

    // Link parent to student
    if (role === "parent") {
      const students = db
        .prepare("SELECT id FROM users WHERE family_code = ? AND role = 'student'")
        .all(resolvedFamilyCode) as { id: string }[];
      for (const s of students) {
        db.prepare(
          `INSERT OR IGNORE INTO family_links (parent_id, student_id, family_code, linked_at)
           VALUES (?, ?, ?, ?)`
        ).run(id, s.id, resolvedFamilyCode, Date.now());
      }
    }

    await createSession(id);
    return NextResponse.json({
      id,
      name,
      role,
      family_code: resolvedFamilyCode,
      current_grade: role === "student" ? (currentGrade ?? "七年级") : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
