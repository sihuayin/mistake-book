import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { initDb } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/session";
import { getActiveProviderMetadata } from "@/lib/ai";

export type AiFeature = "ocr" | "classify" | "grade" | "variation" | "reflection";

type UsageStatus = "success" | "failed" | "cached" | "rejected";

type QuotaAccountRow = {
  id: string;
  scope_type: "family" | "user";
  scope_id: string;
  plan_name: string;
  monthly_credits: number;
  used_credits: number;
  reset_at: number;
  status: "active" | "inactive";
  created_at: number;
  updated_at: number;
};

type UsageLedgerInsert = {
  userId: string;
  familyCode: string;
  feature: AiFeature;
  creditsCharged: number;
  requestHash: string;
  status: UsageStatus;
  errorCode?: string;
  latencyMs?: number;
  meta?: Record<string, unknown>;
};

export type AiQuotaSummary = {
  planName: string;
  monthlyCredits: number;
  usedCredits: number;
  remainingCredits: number;
  resetAt: number;
  status: "active" | "inactive";
  scopeType: "family" | "user";
  scopeId: string;
};

export type UpdateQuotaInput = {
  monthlyCredits?: number;
  planName?: string;
  resetUsedCredits?: boolean;
};

export type AiUsageItem = {
  id: string;
  userId: string;
  familyCode: string;
  feature: AiFeature;
  provider: string | null;
  model: string | null;
  creditsCharged: number;
  status: UsageStatus;
  errorCode: string | null;
  latencyMs: number | null;
  createdAt: number;
};

export type AiUsageSummaryItem = {
  feature: AiFeature;
  totalCredits: number;
  totalCalls: number;
  successCalls: number;
  cachedCalls: number;
  failedCalls: number;
};

export type AiMemberUsageItem = {
  userId: string;
  userName: string;
  role: SessionUser["role"];
  totalCredits: number;
  totalCalls: number;
  successCalls: number;
  cachedCalls: number;
  failedCalls: number;
};

type UsageLedgerRow = {
  id: string;
  user_id: string;
  family_code: string;
  feature: AiFeature;
  provider: string | null;
  model: string | null;
  credits_charged: number;
  status: UsageStatus;
  error_code: string | null;
  latency_ms: number | null;
  created_at: number;
};

type UsageSummaryRow = {
  feature: AiFeature;
  total_credits: number;
  total_calls: number;
  success_calls: number;
  cached_calls: number;
  failed_calls: number;
};

type MemberUsageSummaryRow = {
  user_id: string;
  user_name: string;
  role: SessionUser["role"];
  total_credits: number;
  total_calls: number;
  success_calls: number;
  cached_calls: number;
  failed_calls: number;
};

export class AiGuardError extends Error {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NO_ACTIVE_QUOTA" | "INSUFFICIENT_CREDITS" | "RATE_LIMITED";
  status: number;

  constructor(
    code: "UNAUTHORIZED" | "FORBIDDEN" | "NO_ACTIVE_QUOTA" | "INSUFFICIENT_CREDITS" | "RATE_LIMITED",
    message: string,
    status: number
  ) {
    super(message);
    this.name = "AiGuardError";
    this.code = code;
    this.status = status;
  }
}

export function toAiErrorResponse(error: unknown) {
  if (error instanceof AiGuardError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: "AI_CALL_FAILED", message }, { status: 500 });
}

const FEATURE_CONFIG: Record<
  AiFeature,
  { credits: number; cacheTtlSec: number; windowMs: number; maxHits: number; allowRoles: SessionUser["role"][] }
> = {
  ocr: { credits: 3, cacheTtlSec: 24 * 60 * 60, windowMs: 20_000, maxHits: 1, allowRoles: ["student", "parent"] },
  classify: { credits: 1, cacheTtlSec: 7 * 24 * 60 * 60, windowMs: 60_000, maxHits: 10, allowRoles: ["student", "parent"] },
  grade: { credits: 1, cacheTtlSec: 7 * 24 * 60 * 60, windowMs: 60_000, maxHits: 5, allowRoles: ["student", "parent"] },
  variation: { credits: 2, cacheTtlSec: 7 * 24 * 60 * 60, windowMs: 60_000, maxHits: 3, allowRoles: ["student", "parent"] },
  reflection: { credits: 1, cacheTtlSec: 24 * 60 * 60, windowMs: 60_000, maxHits: 6, allowRoles: ["student", "parent"] },
};

const DEFAULT_MONTHLY_CREDITS = 20;
let initialized = false;

function ensureDb() {
  if (!initialized) {
    initDb();
    initialized = true;
  }
}

function getNextResetAt(from = new Date()) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1, 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function getMonthWindowStart(resetAt: number) {
  const resetDate = new Date(resetAt);
  const start = new Date(resetDate);
  start.setMonth(start.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const normalized = stableNormalize((value as Record<string, unknown>)[key]);
        acc[key] = normalized;
        return acc;
      }, {});
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return value;
}

function buildRequestHash(feature: AiFeature, payload: unknown) {
  const normalized = stableNormalize(payload);
  return crypto.createHash("sha256").update(`${feature}:${JSON.stringify(normalized)}`).digest("hex");
}

function getScopeKey(user: SessionUser, feature: AiFeature) {
  return `${user.family_code}:${user.id}:${feature}`;
}

function toQuotaSummary(row: QuotaAccountRow): AiQuotaSummary {
  return {
    planName: row.plan_name,
    monthlyCredits: row.monthly_credits,
    usedCredits: row.used_credits,
    remainingCredits: Math.max(0, row.monthly_credits - row.used_credits),
    resetAt: row.reset_at,
    status: row.status,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
  };
}

function ensureQuotaAccount(user: SessionUser) {
  ensureDb();
  const db = getDb();
  const now = Date.now();
  let row = db
    .prepare("SELECT * FROM ai_quota_accounts WHERE scope_type = ? AND scope_id = ?")
    .get("family", user.family_code) as QuotaAccountRow | undefined;

  if (!row) {
    const newRow: QuotaAccountRow = {
      id: uuidv4(),
      scope_type: "family",
      scope_id: user.family_code,
      plan_name: "free",
      monthly_credits: DEFAULT_MONTHLY_CREDITS,
      used_credits: 0,
      reset_at: getNextResetAt(new Date(now)),
      status: "active",
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      `INSERT INTO ai_quota_accounts (
        id, scope_type, scope_id, plan_name, monthly_credits, used_credits, reset_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newRow.id,
      newRow.scope_type,
      newRow.scope_id,
      newRow.plan_name,
      newRow.monthly_credits,
      newRow.used_credits,
      newRow.reset_at,
      newRow.status,
      newRow.created_at,
      newRow.updated_at
    );
    row = newRow;
  }

  if (row.reset_at <= now) {
    const nextResetAt = getNextResetAt(new Date(now));
    db.prepare(
      "UPDATE ai_quota_accounts SET used_credits = 0, reset_at = ?, updated_at = ? WHERE id = ?"
    ).run(nextResetAt, now, row.id);
    row = { ...row, used_credits: 0, reset_at: nextResetAt, updated_at: now };
  }

  return row;
}

function assertAllowedRole(user: SessionUser, feature: AiFeature) {
  if (!FEATURE_CONFIG[feature].allowRoles.includes(user.role)) {
    throw new AiGuardError("FORBIDDEN", "当前身份无权使用该 AI 功能", 403);
  }
}

function assertQuotaAvailable(account: QuotaAccountRow, feature: AiFeature, costOverride?: number) {
  if (account.status !== "active") {
    throw new AiGuardError("NO_ACTIVE_QUOTA", "当前 AI 套餐未启用", 403);
  }
  const cost = costOverride ?? FEATURE_CONFIG[feature].credits;
  const remaining = account.monthly_credits - account.used_credits;
  if (remaining < cost) {
    throw new AiGuardError("INSUFFICIENT_CREDITS", "本月 AI 点数已用完", 403);
  }
}

function assertRateLimit(user: SessionUser, feature: AiFeature) {
  const db = getDb();
  const config = FEATURE_CONFIG[feature];
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const scopeKey = getScopeKey(user, feature);

  db.prepare("DELETE FROM ai_rate_limit_events WHERE created_at < ?").run(windowStart - 60_000);

  const result = db
    .prepare(
      "SELECT COUNT(*) as count FROM ai_rate_limit_events WHERE scope_key = ? AND feature = ? AND created_at >= ?"
    )
    .get(scopeKey, feature, windowStart) as { count: number };

  if (result.count >= config.maxHits) {
    throw new AiGuardError("RATE_LIMITED", "请求过快，请稍后再试", 429);
  }

  db.prepare("INSERT INTO ai_rate_limit_events (id, scope_key, feature, created_at) VALUES (?, ?, ?, ?)").run(
    uuidv4(),
    scopeKey,
    feature,
    now
  );
}

function getCachedResponse<T>(feature: AiFeature, requestHash: string) {
  const db = getDb();
  const now = Date.now();
  const row = db
    .prepare("SELECT response_json FROM ai_request_cache WHERE request_hash = ? AND feature = ? AND expires_at > ?")
    .get(requestHash, feature, now) as { response_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.response_json) as T;
}

function saveCachedResponse(feature: AiFeature, requestHash: string, response: unknown, ttlSec: number) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO ai_request_cache (request_hash, feature, response_json, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(requestHash, feature, JSON.stringify(response), now + ttlSec * 1000, now);
}

function recordUsage(entry: UsageLedgerInsert) {
  const db = getDb();
  const providerMeta = getActiveProviderMetadata(entry.feature === "ocr");
  db.prepare(
    `INSERT INTO ai_usage_ledger (
      id, user_id, family_code, feature, provider, model, credits_charged, request_hash,
      status, error_code, latency_ms, meta_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(),
    entry.userId,
    entry.familyCode,
    entry.feature,
    providerMeta.provider,
    providerMeta.model,
    entry.creditsCharged,
    entry.requestHash,
    entry.status,
    entry.errorCode ?? null,
    entry.latencyMs ?? null,
    entry.meta ? JSON.stringify(entry.meta) : null,
    Date.now()
  );
}

function consumeCredits(accountId: string, credits: number) {
  const db = getDb();
  db.prepare("UPDATE ai_quota_accounts SET used_credits = used_credits + ?, updated_at = ? WHERE id = ?").run(
    credits,
    Date.now(),
    accountId
  );
}

export async function getQuotaSummaryForCurrentUser() {
  ensureDb();
  const user = await getSession();
  if (!user) {
    throw new AiGuardError("UNAUTHORIZED", "未登录", 401);
  }
  return toQuotaSummary(ensureQuotaAccount(user));
}

export async function updateQuotaForCurrentUser(input: UpdateQuotaInput) {
  ensureDb();
  const user = await getSession();
  if (!user) {
    throw new AiGuardError("UNAUTHORIZED", "未登录", 401);
  }
  if (user.role !== "parent") {
    throw new AiGuardError("FORBIDDEN", "只有家长可以调整 AI 额度", 403);
  }

  const db = getDb();
  const account = ensureQuotaAccount(user);
  const nextMonthlyCredits =
    typeof input.monthlyCredits === "number"
      ? Math.max(0, Math.min(100_000, Math.floor(input.monthlyCredits)))
      : account.monthly_credits;
  const nextPlanName =
    typeof input.planName === "string" && input.planName.trim()
      ? input.planName.trim().slice(0, 40)
      : account.plan_name;
  const nextUsedCredits = input.resetUsedCredits ? 0 : Math.min(account.used_credits, nextMonthlyCredits);
  const now = Date.now();

  db.prepare(
    `UPDATE ai_quota_accounts
     SET monthly_credits = ?, plan_name = ?, used_credits = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextMonthlyCredits, nextPlanName, nextUsedCredits, now, account.id);

  const updated = db.prepare("SELECT * FROM ai_quota_accounts WHERE id = ?").get(account.id) as QuotaAccountRow;
  return toQuotaSummary(updated);
}

export async function getUsageForCurrentUser(limit = 20) {
  ensureDb();
  const user = await getSession();
  if (!user) {
    throw new AiGuardError("UNAUTHORIZED", "未登录", 401);
  }

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = getDb()
    .prepare(
      `SELECT id, user_id, family_code, feature, provider, model, credits_charged, status, error_code, latency_ms, created_at
       FROM ai_usage_ledger
       WHERE family_code = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(user.family_code, safeLimit) as UsageLedgerRow[];

  return rows.map<AiUsageItem>((row) => ({
    id: row.id,
    userId: row.user_id,
    familyCode: row.family_code,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    creditsCharged: row.credits_charged,
    status: row.status,
    errorCode: row.error_code,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }));
}

export async function getUsageSummaryForCurrentUser() {
  ensureDb();
  const user = await getSession();
  if (!user) {
    throw new AiGuardError("UNAUTHORIZED", "未登录", 401);
  }

  const account = ensureQuotaAccount(user);
  const rows = getDb()
    .prepare(
      `SELECT
         feature,
         COALESCE(SUM(credits_charged), 0) as total_credits,
         COUNT(*) as total_calls,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_calls,
         SUM(CASE WHEN status = 'cached' THEN 1 ELSE 0 END) as cached_calls,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_calls
       FROM ai_usage_ledger
       WHERE family_code = ? AND created_at >= ?
       GROUP BY feature
       ORDER BY total_credits DESC, total_calls DESC`
    )
    .all(user.family_code, account.reset_at > Date.now() ? getMonthWindowStart(account.reset_at) : 0) as UsageSummaryRow[];

  return rows.map<AiUsageSummaryItem>((row) => ({
    feature: row.feature,
    totalCredits: Number(row.total_credits ?? 0),
    totalCalls: Number(row.total_calls ?? 0),
    successCalls: Number(row.success_calls ?? 0),
    cachedCalls: Number(row.cached_calls ?? 0),
    failedCalls: Number(row.failed_calls ?? 0),
  }));
}

export async function getMemberUsageSummaryForCurrentUser() {
  ensureDb();
  const user = await getSession();
  if (!user) {
    throw new AiGuardError("UNAUTHORIZED", "未登录", 401);
  }

  const account = ensureQuotaAccount(user);
  const startAt = getMonthWindowStart(account.reset_at);
  const rows = getDb()
    .prepare(
      `SELECT
         l.user_id,
         COALESCE(u.name, '') as user_name,
         COALESCE(u.role, 'student') as role,
         COALESCE(SUM(l.credits_charged), 0) as total_credits,
         COUNT(*) as total_calls,
         SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) as success_calls,
         SUM(CASE WHEN l.status = 'cached' THEN 1 ELSE 0 END) as cached_calls,
         SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END) as failed_calls
       FROM ai_usage_ledger l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.family_code = ? AND l.created_at >= ?
       GROUP BY l.user_id
       ORDER BY total_credits DESC, total_calls DESC, user_name ASC`
    )
    .all(user.family_code, startAt) as MemberUsageSummaryRow[];

  return rows.map<AiMemberUsageItem>((row) => ({
    userId: row.user_id,
    userName: row.user_name || row.user_id,
    role: row.role,
    totalCredits: Number(row.total_credits ?? 0),
    totalCalls: Number(row.total_calls ?? 0),
    successCalls: Number(row.success_calls ?? 0),
    cachedCalls: Number(row.cached_calls ?? 0),
    failedCalls: Number(row.failed_calls ?? 0),
  }));
}

export async function guardedAiCall<T>({
  feature,
  payloadForHash,
  run,
  cacheTtlSec,
  cost,
  skipCharge = false,
}: {
  feature: AiFeature;
  payloadForHash: unknown;
  run: () => Promise<T>;
  cacheTtlSec?: number;
  cost?: number;
  skipCharge?: boolean;
}): Promise<T> {
  ensureDb();
  const user = await getSession();
  if (!user) {
    throw new AiGuardError("UNAUTHORIZED", "未登录", 401);
  }

  assertAllowedRole(user, feature);
  assertRateLimit(user, feature);

  const requestHash = buildRequestHash(feature, payloadForHash);
  const cached = getCachedResponse<T>(feature, requestHash);
  if (cached) {
    recordUsage({
      userId: user.id,
      familyCode: user.family_code,
      feature,
      creditsCharged: 0,
      requestHash,
      status: "cached",
    });
    return cached;
  }

  const account = ensureQuotaAccount(user);
  if (!skipCharge) {
    assertQuotaAvailable(account, feature, cost);
  }

  const startedAt = Date.now();
  try {
    const result = await run();
    saveCachedResponse(feature, requestHash, result, cacheTtlSec ?? FEATURE_CONFIG[feature].cacheTtlSec);
    if (!skipCharge) {
      consumeCredits(account.id, cost ?? FEATURE_CONFIG[feature].credits);
    }
    recordUsage({
      userId: user.id,
      familyCode: user.family_code,
      feature,
      creditsCharged: skipCharge ? 0 : cost ?? FEATURE_CONFIG[feature].credits,
      requestHash,
      status: "success",
      latencyMs: Date.now() - startedAt,
    });
    return result;
  } catch (error: unknown) {
    recordUsage({
      userId: user.id,
      familyCode: user.family_code,
      feature,
      creditsCharged: 0,
      requestHash,
      status: "failed",
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      latencyMs: Date.now() - startedAt,
      meta: error instanceof Error ? { message: error.message } : undefined,
    });
    throw error;
  }
}
