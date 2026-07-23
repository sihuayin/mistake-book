import { getDb } from "../lib/db";

const SCHEMA = `
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('student', 'parent')),
  family_code TEXT NOT NULL,
  current_grade TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 家庭关联表
CREATE TABLE IF NOT EXISTS family_links (
  parent_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  family_code TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (parent_id, student_id)
);

-- 练习会话表
CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_sections TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY (student_id) REFERENCES users(id)
);

-- 题目记录表
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  section_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  latex_content TEXT,
  question_payload TEXT,
  knowledge_points TEXT,
  source TEXT NOT NULL CHECK(source IN ('ocr', 'bank', 'ai_generated')),
  question_type TEXT NOT NULL CHECK(question_type IN ('选择', '解答'))
);

-- 作答记录表
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

-- 反思记录表
CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  error_type TEXT NOT NULL CHECK(error_type IN ('粗心', '概念混淆', '思路断链', '完全不会')),
  card_type TEXT NOT NULL,
  free_text TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- 掌握度表
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

-- 复习记录表 (艾宾浩斯)
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

-- 徽章表
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES users(id)
);

-- Session 表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 题库表
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_reflections_question ON reflections(question_id);
CREATE INDEX IF NOT EXISTS idx_mastery_student ON mastery_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_review_due ON review_records(due_at, status);
CREATE INDEX IF NOT EXISTS idx_users_family_code ON users(family_code);
`;

export function initDb() {
  const db = getDb();
  db.exec(SCHEMA);

  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasCurrentGrade = columns.some((column) => column.name === "current_grade");
  if (!hasCurrentGrade) {
    db.exec("ALTER TABLE users ADD COLUMN current_grade TEXT");
  }

  const questionColumns = db.prepare("PRAGMA table_info(questions)").all() as Array<{ name: string }>;
  const hasQuestionPayload = questionColumns.some((column) => column.name === "question_payload");
  if (!hasQuestionPayload) {
    db.exec("ALTER TABLE questions ADD COLUMN question_payload TEXT");
  }
  const hasKnowledgePoints = questionColumns.some((column) => column.name === "knowledge_points");
  if (!hasKnowledgePoints) {
    db.exec("ALTER TABLE questions ADD COLUMN knowledge_points TEXT");
  }
}
