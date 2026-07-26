export type ClientAiQuota = {
  planName: string;
  monthlyCredits: number;
  usedCredits: number;
  remainingCredits: number;
  resetAt: number;
  status: "active" | "inactive";
  scopeType: "family" | "user";
  scopeId: string;
};

export type ClientAiUsageItem = {
  id: string;
  userId: string;
  familyCode: string;
  feature: "ocr" | "classify" | "grade" | "variation" | "reflection";
  provider: string | null;
  model: string | null;
  creditsCharged: number;
  status: "success" | "failed" | "cached" | "rejected";
  errorCode: string | null;
  latencyMs: number | null;
  createdAt: number;
};

export type ClientAiUsageSummaryItem = {
  feature: "ocr" | "classify" | "grade" | "variation" | "reflection";
  totalCredits: number;
  totalCalls: number;
  successCalls: number;
  cachedCalls: number;
  failedCalls: number;
};

export type ClientAiMemberUsageItem = {
  userId: string;
  userName: string;
  role: "student" | "parent";
  totalCredits: number;
  totalCalls: number;
  successCalls: number;
  cachedCalls: number;
  failedCalls: number;
};

type ErrorBody = {
  error?: string;
  message?: string;
};

const ERROR_MESSAGE_MAP: Record<string, string> = {
  UNAUTHORIZED: "请先登录后再使用 AI 功能。",
  FORBIDDEN: "当前账号暂时不能使用这个 AI 功能。",
  NO_ACTIVE_QUOTA: "当前 AI 套餐未启用，请联系家长或管理员。",
  INSUFFICIENT_CREDITS: "本月 AI 点数已用完，请下月再试或升级套餐。",
  RATE_LIMITED: "请求太频繁了，请稍等片刻再试。",
  AI_CALL_FAILED: "AI 服务暂时不可用，请稍后再试。",
};

export function getAiErrorMessage(payload: ErrorBody | null | undefined, fallback: string) {
  const code = typeof payload?.error === "string" ? payload.error : "";
  if (code && ERROR_MESSAGE_MAP[code]) {
    return ERROR_MESSAGE_MAP[code];
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
}

export async function fetchAiJson<T>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T & ErrorBody | null;
  if (!response.ok) {
    throw new Error(getAiErrorMessage(payload, fallback));
  }
  return payload as T;
}

export async function fetchAiQuota() {
  return fetchAiJson<ClientAiQuota>("/api/ai/quota", undefined, "额度信息加载失败");
}

export async function updateAiQuota(input: {
  monthlyCredits?: number;
  planName?: string;
  resetUsedCredits?: boolean;
}) {
  return fetchAiJson<ClientAiQuota>(
    "/api/ai/quota",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "额度更新失败"
  );
}

export async function fetchAiUsage(limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  const payload = await fetchAiJson<{ items: ClientAiUsageItem[] }>(`/api/ai/usage?${params}`, undefined, "使用记录加载失败");
  return payload.items;
}

export async function fetchAiUsageSummary() {
  const payload = await fetchAiJson<{ items: ClientAiUsageSummaryItem[] }>("/api/ai/usage-summary", undefined, "汇总数据加载失败");
  return payload.items;
}

export async function fetchAiMemberUsage() {
  const payload = await fetchAiJson<{ items: ClientAiMemberUsageItem[] }>("/api/ai/member-usage", undefined, "成员汇总加载失败");
  return payload.items;
}
