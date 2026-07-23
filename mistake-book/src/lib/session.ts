import { cookies } from "next/headers";
import { getDb } from "./db";

export interface SessionUser {
  id: string;
  name: string;
  role: "student" | "parent";
  family_code: string;
  current_grade: string | null;
}

const SESSION_COOKIE = "mb_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  try {
    const db = getDb();
    const session = db
      .prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?")
      .get(sessionId) as { user_id: string; expires_at: number } | undefined;

    if (!session || session.expires_at < Date.now()) return null;

    const user = db
      .prepare("SELECT id, name, role, family_code, current_grade FROM users WHERE id = ?")
      .get(session.user_id) as SessionUser | undefined;

    return user ?? null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<string> {
  const { v4: uuidv4 } = await import("uuid");
  const sessionId = uuidv4();
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;

  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(sessionId, userId, expiresAt);

  return sessionId;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    const db = getDb();
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    cookieStore.delete(SESSION_COOKIE);
  }
}
