/**
 * Seed script: initialize parent + student accounts and link them.
 * Run: node scripts/seed-users.mjs
 */

import Database from "better-sqlite3";
import crypto from "crypto";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "../data/mistake-book.db");

// Ensure data dir exists
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Init schema ────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('student', 'parent')),
  family_code TEXT NOT NULL,
  current_grade TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS family_links (
  parent_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  family_code TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (parent_id, student_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_sections TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  section_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  latex_content TEXT,
  source TEXT NOT NULL CHECK(source IN ('ocr', 'bank', 'ai_generated')),
  question_type TEXT NOT NULL CHECK(question_type IN ('选择', '解答'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_correct INTEGER,
  step_scores TEXT,
  ai_feedback TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  error_type TEXT NOT NULL CHECK(error_type IN ('粗心', '概念混淆', '思路断链', '完全不会')),
  card_type TEXT NOT NULL,
  free_text TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS mastery_scores (
  student_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  accuracy_rate REAL DEFAULT 0,
  review_compliance_rate REAL DEFAULT 0,
  reflection_quality_score REAL DEFAULT 0,
  composite_score REAL DEFAULT 0,
  last_updated INTEGER,
  PRIMARY KEY (student_id, section_id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS review_records (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'missed')),
  FOREIGN KEY (question_id) REFERENCES questions(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer TEXT NOT NULL,
  solution_steps TEXT NOT NULL,
  solution TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT '中等',
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_reflections_question ON reflections(question_id);
CREATE INDEX IF NOT EXISTS idx_mastery_student ON mastery_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_review_due ON review_records(due_at, status);
CREATE INDEX IF NOT EXISTS idx_users_family_code ON users(family_code);
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "current_grade")) {
  db.exec("ALTER TABLE users ADD COLUMN current_grade TEXT");
}

const hash = (pwd) => crypto.createHash("sha256").update(pwd).digest("hex");

// ── Create student first (generates family code) ───────────────────────────────
const FAMILY_CODE = "SHY001";
const studentId = randomUUID();
const parentId = randomUUID();
const now = Date.now();

// Upsert student
const existingStudent = db.prepare("SELECT id FROM users WHERE name = ?").get("shy@admin.cn");
if (existingStudent) {
  console.log("学生账号已存在，跳过");
} else {
  db.prepare(
    "INSERT INTO users (id, name, role, family_code, current_grade, password_hash, created_at) VALUES (?, ?, 'student', ?, ?, ?, ?)"
  ).run(studentId, "shy@admin.cn", FAMILY_CODE, "七年级", hash("admin"), now);
  console.log(`✓ 学生账号创建: shy@admin.cn  家庭码: ${FAMILY_CODE}`);
}

// Upsert parent
const existingParent = db.prepare("SELECT id FROM users WHERE name = ?").get("admin@admin.cn");
if (existingParent) {
  console.log("家长账号已存在，跳过");
} else {
  db.prepare(
    "INSERT INTO users (id, name, role, family_code, current_grade, password_hash, created_at) VALUES (?, ?, 'parent', ?, ?, ?, ?)"
  ).run(parentId, "admin@admin.cn", FAMILY_CODE, null, hash("admin"), now);
  console.log(`✓ 家长账号创建: admin@admin.cn  家庭码: ${FAMILY_CODE}`);

  // Link
  const resolvedStudentId = (db.prepare("SELECT id FROM users WHERE name = ?").get("shy@admin.cn"))?.id;
  if (resolvedStudentId) {
    db.prepare(
      "INSERT OR IGNORE INTO family_links (parent_id, student_id, family_code, linked_at) VALUES (?, ?, ?, ?)"
    ).run(parentId, resolvedStudentId, FAMILY_CODE, now);
    console.log(`✓ 家庭关联完成: admin@admin.cn ↔ shy@admin.cn`);
  }
}

db.close();
console.log("\n初始化完成！");
console.log("  学生登录: shy@admin.cn / admin");
console.log("  家长登录: admin@admin.cn / admin");
