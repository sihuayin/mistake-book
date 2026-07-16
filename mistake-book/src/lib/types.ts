// ─── Knowledge Graph ────────────────────────────────────────────────────────

export interface KeyPoint {
  point: string;
}

export interface Section {
  id: string;
  name: string;
  description: string;
  key_points: string[];
  formulas?: string;
  tags: string[];
}

export interface Chapter {
  chapter_id: string;
  grade: string;
  title: string;
  sections: Section[];
}

export interface GradeGroup {
  grade: string;
  chapters: Chapter[];
}

export interface KnowledgeGraph {
  curriculum: string;
  grade: string;
  stage?: string;
  subject: string;
  chapters: Chapter[];
  grade_groups?: GradeGroup[];
}

// ─── User ───────────────────────────────────────────────────────────────────

export type UserRole = "student" | "parent";
export type ErrorType = "粗心" | "概念混淆" | "思路断链" | "完全不会";

export interface DiagramRelation {
  kind: string;
  at?: string;
  name?: string;
  value?: string;
  items?: Array<[string, string]>;
  between?: Array<[string, string]>;
}

export interface DiagramLabel {
  text: string;
  at?: string;
}

export interface DiagramData {
  type: "geometry_diagram" | "algebra_table" | "coordinate_graph" | "unknown";
  scene?: string;
  points?: string[];
  segments?: Array<[string, string]>;
  relations?: DiagramRelation[];
  labels?: DiagramLabel[];
}

export interface QuestionPayload {
  stem_text?: string;
  options?: Array<{
    label: string;
    text: string;
    latex?: string;
  }>;
  diagram?: DiagramData | null;
  student_marks?: {
    selected_option?: string;
    handwritten_notes?: string[];
    teacher_marks?: string[];
  };
}

// ─── Mastery ───────────────────────────────────────────────────────────────

export interface MasteryScore {
  student_id: string;
  section_id: string;
  accuracy_rate: number;
  review_compliance_rate: number;
  reflection_quality_score: number;
  composite_score: number;
  last_updated: number;
}

// ─── AI Responses ──────────────────────────────────────────────────────────

export interface ClassifyResult {
  matched_section_id: string;
  confidence: number;
  reason: string;
}

export interface ReflectionQuestion {
  question: string;
  followup_count: number;
}

export interface StepResult {
  step: number;
  description: string;
  score: number;
  max: number;
  feedback: string;
}

export interface GradeResult {
  total_score: number;
  max_score: number;
  step_results: StepResult[];
  overall_feedback: string;
}

export interface VariationResult {
  question: string;
  answer: string;
  solution_steps: string[];
  solution: string;
  difficulty: "简单" | "中等" | "困难";
}

// ─── API Payloads ───────────────────────────────────────────────────────────

export interface OcrPayload {
  imageBase64: string;
}

export interface OcrProblem {
  question_text: string;
  latex_content?: string;
  question_payload?: QuestionPayload;
  student_answer?: string;
  is_correct?: boolean | null;
  error_type?: ErrorType | "";
  knowledge_points?: string[];
  matched_section_id?: string;
  section_name?: string;
  confidence?: number;
}

export interface OcrResult {
  text: string;
  latexBlocks: string[];
  confidence: number;
  summary?: string;
  problems?: OcrProblem[];
}

export interface ClassifyPayload {
  questionText: string;
}

export interface ReflectionPayload {
  questionId: string;
  errorType: ErrorType;
  currentResponse: string;
  previousResponses?: string[];
}

export interface GradePayload {
  question: string;
  studentAnswer: string;
  solutionSteps: string[];
}

export interface VariationPayload {
  sectionId: string;
  originalQuestion: string;
}
