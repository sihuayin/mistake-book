import { getDb } from "./db";
import { getSectionMeta } from "./knowledge";
import type { SessionUser } from "./session";

type DimensionKey =
  | "knowledge_mastery"
  | "calculation_stability"
  | "reflection_quality"
  | "review_execution"
  | "practice_engagement";

export interface AbilityDimension {
  key: DimensionKey;
  label: string;
  shortLabel: string;
  score: number;
  summary: string;
  trend: OverviewTrend;
}

export interface OverviewRecommendation {
  type: "dimension" | "section";
  title: string;
  detail: string;
  href: string;
}

export interface OverviewFocusItem {
  title: string;
  detail: string;
}

export interface OverviewConversationTip {
  audience: "student" | "parent" | "teacher";
  title: string;
  prompt: string;
}

export interface OverviewTrend {
  delta: number;
  direction: "up" | "down" | "flat";
  summary: string;
}

export interface OverviewStudentOption {
  id: string;
  name: string;
  current_grade: string | null;
}

export interface StudentOverviewPayload {
  student: {
    id: string;
    name: string;
    current_grade: string | null;
  };
  audience: "student" | "parent";
  dimensions: AbilityDimension[];
  overall_score: number;
  overall_trend: OverviewTrend;
  status_label: string;
  status_summary: string;
  weak_sections: Array<{
    section_id: string;
    section_name: string;
    chapter_title: string;
    grade: string | null;
    error_count: number;
  }>;
  recommendations: OverviewRecommendation[];
  weekly_focus: OverviewFocusItem[];
  conversation_tips: OverviewConversationTip[];
  student_options?: OverviewStudentOption[];
}

interface AttemptRow {
  id: string;
  question_id: string;
  section_id: string;
  is_correct: number | null;
  created_at: number;
  error_type: string | null;
  free_text: string | null;
}

interface ReviewRow {
  due_at: number;
  reviewed_at: number | null;
  status: string;
}

interface MetricScores {
  knowledgeMastery: number;
  calculationStability: number;
  reflectionQuality: number;
  reviewExecution: number;
  practiceEngagement: number;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreReflectionText(text: string | null) {
  if (!text || text.trim().length < 10) return 0;
  if (text.trim().length < 30) return 60;
  return Math.min(100, 70 + Math.round(text.trim().length / 3));
}

function describeScore(score: number, strong: string, mid: string, weak: string) {
  if (score >= 80) return strong;
  if (score >= 60) return mid;
  return weak;
}

function buildTrend(current: number, previous: number): OverviewTrend {
  const delta = Math.round(current - previous);
  const direction = delta >= 4 ? "up" : delta <= -4 ? "down" : "flat";
  const summary =
    direction === "up"
      ? "最近一周在上升"
      : direction === "down"
      ? "最近一周有回落"
      : "最近一周整体平稳";
  return { delta, direction, summary };
}

function calculateMetricScores(
  attempts: AttemptRow[],
  reviews: ReviewRow[],
  now: number
): MetricScores {
  const recent14 = attempts.filter((attempt) => now - attempt.created_at <= 14 * 24 * 60 * 60 * 1000);
  const recent30 = attempts.filter((attempt) => now - attempt.created_at <= 30 * 24 * 60 * 60 * 1000);
  const correctAttempts = attempts.filter((attempt) => attempt.is_correct === 1).length;
  const mistakeAttempts = attempts.filter((attempt) => attempt.is_correct === 0);
  const carelessMistakes = mistakeAttempts.filter((attempt) => attempt.error_type === "粗心").length;
  const reflectionScores = mistakeAttempts
    .filter((attempt) => attempt.free_text)
    .map((attempt) => scoreReflectionText(attempt.free_text));

  const knowledgeMastery = attempts.length
    ? clampScore((correctAttempts / attempts.length) * 100)
    : 58;

  const recentAccuracy = recent30.length
    ? (recent30.filter((attempt) => attempt.is_correct === 1).length / recent30.length) * 100
    : knowledgeMastery;
  const carelessRate = mistakeAttempts.length ? (carelessMistakes / mistakeAttempts.length) * 100 : 0;
  const calculationStability = attempts.length
    ? clampScore(recentAccuracy * 0.65 + (100 - carelessRate) * 0.35)
    : 62;

  const reflectionQuality = reflectionScores.length
    ? clampScore(reflectionScores.reduce((sum, score) => sum + score, 0) / reflectionScores.length)
    : 45;

  const dueReviews = reviews.filter((review) => review.due_at <= now);
  const completedDueReviews = dueReviews.filter(
    (review) => review.status === "done" || !!review.reviewed_at
  );
  const reviewExecution = dueReviews.length
    ? clampScore((completedDueReviews.length / dueReviews.length) * 100)
    : 82;

  const uniqueRecentSections = new Set(recent14.map((attempt) => attempt.section_id)).size;
  const attemptVolumeScore = Math.min(100, (recent14.length / 10) * 100);
  const breadthScore = Math.min(100, (uniqueRecentSections / 4) * 100);
  const recencyScore = recent14.length > 0 ? 100 : recent30.length > 0 ? 72 : 38;
  const practiceEngagement = attempts.length
    ? clampScore(attemptVolumeScore * 0.45 + breadthScore * 0.25 + recencyScore * 0.3)
    : 50;

  return {
    knowledgeMastery,
    calculationStability,
    reflectionQuality,
    reviewExecution,
    practiceEngagement,
  };
}

export function getParentLinkedStudents(parentId: string): OverviewStudentOption[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.id, u.name, u.current_grade
       FROM family_links fl
       JOIN users u ON u.id = fl.student_id
       WHERE fl.parent_id = ?
       ORDER BY u.created_at ASC`
    )
    .all(parentId) as OverviewStudentOption[];
}

export function resolveOverviewStudent(
  sessionUser: SessionUser,
  requestedStudentId?: string | null
): { studentId: string; audience: "student" | "parent"; studentOptions?: OverviewStudentOption[] } | null {
  if (sessionUser.role === "student") {
    return { studentId: sessionUser.id, audience: "student" };
  }

  const studentOptions = getParentLinkedStudents(sessionUser.id);
  if (studentOptions.length === 0) return null;

  const target =
    (requestedStudentId && studentOptions.find((student) => student.id === requestedStudentId)) ||
    studentOptions[0];

  return {
    studentId: target.id,
    audience: "parent",
    studentOptions,
  };
}

export function buildStudentOverview(
  studentId: string,
  audience: "student" | "parent",
  studentOptions?: OverviewStudentOption[]
): StudentOverviewPayload | null {
  const db = getDb();
  const student = db
    .prepare("SELECT id, name, current_grade FROM users WHERE id = ?")
    .get(studentId) as { id: string; name: string; current_grade: string | null } | undefined;

  if (!student) return null;

  const attempts = db
    .prepare(
      `SELECT
         a.id,
         a.question_id,
         q.section_id,
         a.is_correct,
         a.created_at,
         (
           SELECT r.error_type
           FROM reflections r
           WHERE r.question_id = q.id
           ORDER BY r.created_at DESC
           LIMIT 1
         ) AS error_type,
         (
           SELECT r.free_text
           FROM reflections r
           WHERE r.question_id = q.id
           ORDER BY r.created_at DESC
           LIMIT 1
         ) AS free_text
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
       WHERE a.student_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(studentId) as AttemptRow[];

  const reviews = db
    .prepare(
      `SELECT due_at, reviewed_at, status
       FROM review_records
       WHERE student_id = ?`
    )
    .all(studentId) as ReviewRow[];

  const now = Date.now();
  const mistakeAttempts = attempts.filter((attempt) => attempt.is_correct === 0);
  const metrics = calculateMetricScores(attempts, reviews, now);
  const trendWindowMs = 7 * 24 * 60 * 60 * 1000;
  const currentAttempts = attempts.filter((attempt) => now - attempt.created_at <= trendWindowMs);
  const previousAttempts = attempts.filter(
    (attempt) =>
      now - attempt.created_at > trendWindowMs &&
      now - attempt.created_at <= trendWindowMs * 2
  );
  const currentReviews = reviews.filter(
    (review) => review.due_at <= now && now - review.due_at <= trendWindowMs
  );
  const previousReviews = reviews.filter(
    (review) =>
      review.due_at <= now &&
      now - review.due_at > trendWindowMs &&
      now - review.due_at <= trendWindowMs * 2
  );
  const currentMetrics = calculateMetricScores(currentAttempts, currentReviews, now);
  const previousMetrics = calculateMetricScores(previousAttempts, previousReviews, now - trendWindowMs);

  const knowledgeMastery = metrics.knowledgeMastery;
  const calculationStability = metrics.calculationStability;
  const reflectionQuality = metrics.reflectionQuality;
  const reviewExecution = metrics.reviewExecution;
  const practiceEngagement = metrics.practiceEngagement;

  const dimensions: AbilityDimension[] = [
    {
      key: "knowledge_mastery",
      label: "知识掌握",
      shortLabel: "知识",
      score: knowledgeMastery,
      trend: buildTrend(currentMetrics.knowledgeMastery, previousMetrics.knowledgeMastery),
      summary: describeScore(
        knowledgeMastery,
        "基础知识掌握比较稳，已经能支撑更高层练习。",
        "知识点掌握中等，建议围绕错题频发章节做针对性巩固。",
        "核心知识点还不牢，先回到高频错题章节打基础。"
      ),
    },
    {
      key: "calculation_stability",
      label: "计算稳定",
      shortLabel: "计算",
      score: calculationStability,
      trend: buildTrend(currentMetrics.calculationStability, previousMetrics.calculationStability),
      summary: describeScore(
        calculationStability,
        "计算与书写稳定，粗心型失误控制得不错。",
        "计算稳定性一般，容易在过程细节上丢分。",
        "当前失分更多来自过程不稳，建议先做短链路基础题。"
      ),
    },
    {
      key: "reflection_quality",
      label: "反思质量",
      shortLabel: "反思",
      score: reflectionQuality,
      trend: buildTrend(currentMetrics.reflectionQuality, previousMetrics.reflectionQuality),
      summary: describeScore(
        reflectionQuality,
        "反思比较具体，能看出学生在主动复盘。",
        "有反思意识，但总结还偏浅，可以继续追问原因与改法。",
        "反思记录偏少或过于笼统，错题没有真正沉淀下来。"
      ),
    },
    {
      key: "review_execution",
      label: "复习执行",
      shortLabel: "复习",
      score: reviewExecution,
      trend: buildTrend(currentMetrics.reviewExecution, previousMetrics.reviewExecution),
      summary: describeScore(
        reviewExecution,
        "复习执行到位，记忆巩固节奏整体稳定。",
        "复习节奏有波动，需要把到期复习真正做完。",
        "到期复习执行偏弱，很多知识点没在遗忘前回看。"
      ),
    },
    {
      key: "practice_engagement",
      label: "练习投入",
      shortLabel: "投入",
      score: practiceEngagement,
      trend: buildTrend(currentMetrics.practiceEngagement, previousMetrics.practiceEngagement),
      summary: describeScore(
        practiceEngagement,
        "最近练习比较主动，节奏和覆盖面都不错。",
        "练习有在进行，但频率和覆盖范围还可以更均衡。",
        "练习频率偏低，建议先恢复连续练习节奏。"
      ),
    },
  ];

  const overallScore = clampScore(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length
  );

  const weakSectionMap = new Map<string, number>();
  for (const attempt of mistakeAttempts) {
    weakSectionMap.set(attempt.section_id, (weakSectionMap.get(attempt.section_id) ?? 0) + 1);
  }

  const weakSections = Array.from(weakSectionMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([sectionId, errorCount]) => {
      const meta = getSectionMeta(sectionId);
      return {
        section_id: sectionId,
        section_name: meta?.section.name ?? sectionId,
        chapter_title: meta?.chapter_title ?? "",
        grade: meta?.grade ?? null,
        error_count: errorCount,
      };
    });

  const dimensionRecommendations = [...dimensions]
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map<OverviewRecommendation>((dimension) => {
      const recommendationMap: Record<DimensionKey, { title: string; detail: string; href: string }> = {
        knowledge_mastery: {
          title: "先补知识漏洞，再拉高正确率",
          detail: "建议优先回到高频错题章节，先做同知识点的基础题，降低题型跳跃。",
          href: "/practice",
        },
        calculation_stability: {
          title: "把训练重点放在过程稳定性",
          detail: "建议集中做步骤短、反馈快的计算题，盯住符号、抄写和移项这类过程错误。",
          href: "/practice",
        },
        reflection_quality: {
          title: "每道错题都要说清错因和改法",
          detail: "建议把反思从“我不会”升级成“我错在第几步、下次怎么避免”。",
          href: "/mistakes",
        },
        review_execution: {
          title: "优先清理到期未复习的内容",
          detail: "建议先把已经录入的错题复盘完，再继续新增练习，避免旧问题反复出现。",
          href: "/mistakes",
        },
        practice_engagement: {
          title: "恢复连续练习节奏",
          detail: "建议先固定每天一个短时练习窗口，优先覆盖当前年级的薄弱章节。",
          href: "/practice",
        },
      };
      return { type: "dimension", ...recommendationMap[dimension.key] };
    });

  const sectionRecommendations = weakSections.slice(0, 2).map<OverviewRecommendation>((section) => ({
    type: "section",
    title: `优先练 ${section.section_name}`,
    detail: `${[section.grade, section.chapter_title].filter(Boolean).join(" · ")} 中的错题最多，适合作为下一轮专项突破口。`,
    href: `/practice?section_id=${section.section_id}${section.grade ? `&grade=${encodeURIComponent(section.grade)}` : ""}`,
  }));

  const weakestDimensions = [...dimensions].sort((a, b) => a.score - b.score).slice(0, 2);
  const weeklyFocus: OverviewFocusItem[] = [
    weakestDimensions[0]
      ? {
          title: `先补 ${weakestDimensions[0].label}`,
          detail: `这一项是当前最短板，先把相关动作做连续 3 到 5 天，比同时摊开很多任务更有效。`,
        }
      : null,
    weakSections[0]
      ? {
          title: `专项突破 ${weakSections[0].section_name}`,
          detail: `建议从这个知识点开始做 2 到 3 组同类题，目标不是刷量，而是把错误模式改掉。`,
        }
      : null,
    reviewExecution < 70
      ? {
          title: "清理到期复习",
          detail: "先把已经到期的错题复盘掉，再继续新增练习，能更快提升整体稳定性。",
        }
      : {
          title: "保持稳定节奏",
          detail: "把练习和复盘固定在每天同一时间，优先维持节奏，不要忽快忽慢。",
        },
  ].filter(Boolean) as OverviewFocusItem[];

  const weakestLabel = weakestDimensions[0]?.label ?? "当前短板";
  const topSection = weakSections[0]?.section_name ?? "最近错题";
  const conversationTips: OverviewConversationTip[] = [
    {
      audience: "student",
      title: "学生自我提醒",
      prompt: `这周我先盯住“${weakestLabel}”，每次做完题都要回答：我错在第几步，下次怎么避免？`,
    },
    {
      audience: "parent",
      title: "家长沟通建议",
      prompt: `先别问“怎么又错了”，改成问“这周我们先一起解决 ${topSection}，你觉得最容易卡在哪一步？”`,
    },
    {
      audience: "teacher",
      title: "教师反馈建议",
      prompt: `课堂或课后反馈时，可优先追问 ${weakestLabel} 相关表现，再给一组低负荷同类题确认是否真正改正。`,
    },
  ];

  return {
    student,
    audience,
    dimensions,
    overall_score: overallScore,
    overall_trend: buildTrend(
      clampScore(
        (currentMetrics.knowledgeMastery +
          currentMetrics.calculationStability +
          currentMetrics.reflectionQuality +
          currentMetrics.reviewExecution +
          currentMetrics.practiceEngagement) /
          5
      ),
      clampScore(
        (previousMetrics.knowledgeMastery +
          previousMetrics.calculationStability +
          previousMetrics.reflectionQuality +
          previousMetrics.reviewExecution +
          previousMetrics.practiceEngagement) /
          5
      )
    ),
    status_label:
      overallScore >= 80 ? "状态稳定" : overallScore >= 60 ? "持续补强中" : "需要集中突破",
    status_summary:
      overallScore >= 80
        ? "当前整体状态较稳，可以把训练重点放在提速和综合题。"
        : overallScore >= 60
        ? "基础和习惯都有一定积累，但还有几项能力需要刻意补强。"
        : "整体能力结构还不均衡，建议先抓最薄弱的两项，形成小闭环。",
    weak_sections: weakSections,
    recommendations: [...dimensionRecommendations, ...sectionRecommendations].slice(0, 4),
    weekly_focus: weeklyFocus,
    conversation_tips: conversationTips,
    student_options: studentOptions,
  };
}
