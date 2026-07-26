"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StudentOverviewPanel from "@/components/StudentOverviewPanel";
import { fetchAiQuota, fetchAiUsage, fetchAiUsageSummary, fetchAiMemberUsage, updateAiQuota, type ClientAiQuota, type ClientAiUsageItem, type ClientAiUsageSummaryItem, type ClientAiMemberUsageItem } from "@/lib/client-ai";

interface User {
  id: string;
  name: string;
  role: "student" | "parent";
}

function getBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0) return "0%";
  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<ClientAiQuota | null>(null);
  const [usageItems, setUsageItems] = useState<ClientAiUsageItem[]>([]);
  const [usageSummary, setUsageSummary] = useState<ClientAiUsageSummaryItem[]>([]);
  const [memberUsage, setMemberUsage] = useState<ClientAiMemberUsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotaPlanName, setQuotaPlanName] = useState("free");
  const [quotaMonthlyCredits, setQuotaMonthlyCredits] = useState("20");
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((sessionUser: User | null) => {
        if (!sessionUser) {
          router.push("/login");
          return;
        }
        if (sessionUser.role !== "parent") {
          router.push("/");
          return;
        }
        setUser(sessionUser);
        fetchAiQuota().then((data) => {
          setQuota(data);
          setQuotaPlanName(data.planName);
          setQuotaMonthlyCredits(String(data.monthlyCredits));
        }).catch(() => setQuota(null));
        fetchAiUsage(12).then(setUsageItems).catch(() => setUsageItems([]));
        fetchAiUsageSummary().then(setUsageSummary).catch(() => setUsageSummary([]));
        fetchAiMemberUsage().then(setMemberUsage).catch(() => setMemberUsage([]));
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const featureLabel: Record<ClientAiUsageItem["feature"], string> = {
    ocr: "OCR 识别",
    classify: "知识点分类",
    grade: "AI 评分",
    variation: "变式题",
    reflection: "反思追问",
  };

  const statusLabel: Record<ClientAiUsageItem["status"], string> = {
    success: "成功",
    failed: "失败",
    cached: "缓存命中",
    rejected: "已拒绝",
  };

  const roleLabel: Record<ClientAiMemberUsageItem["role"], string> = {
    student: "学生",
    parent: "家长",
  };

  const maxFeatureCredits = usageSummary.length ? Math.max(...usageSummary.map((item) => item.totalCredits)) : 0;
  const maxMemberCredits = memberUsage.length ? Math.max(...memberUsage.map((item) => item.totalCredits)) : 0;

  async function saveQuotaSettings(resetUsedCredits = false) {
    setQuotaSaving(true);
    setQuotaMessage("");
    try {
      const nextQuota = await updateAiQuota({
        planName: quotaPlanName,
        monthlyCredits: Number(quotaMonthlyCredits),
        resetUsedCredits,
      });
      setQuota(nextQuota);
      setQuotaPlanName(nextQuota.planName);
      setQuotaMonthlyCredits(String(nextQuota.monthlyCredits));
      setQuotaMessage(resetUsedCredits ? "额度已更新，并已清空本月已用点数。" : "额度已更新。");
    } catch (error: unknown) {
      setQuotaMessage(error instanceof Error ? error.message : "额度更新失败");
    } finally {
      setQuotaSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">家长视图加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-stone-400">Parent Dashboard</div>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">学习状态总览</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          从知识掌握、计算稳定、反思质量、复习执行、练习投入五个维度看孩子当下状态，
          帮你快速判断现在该鼓励什么、该补哪里；老师做家校沟通时也可以直接参考这套视图。
        </p>
      </div>

      {quota ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-violet-500">AI 点数</div>
            <div className="mt-2 text-2xl font-semibold text-violet-900">{quota.remainingCredits}</div>
            <div className="mt-1 text-sm text-violet-700">本月剩余 / 共 {quota.monthlyCredits} 点</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">已使用</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{quota.usedCredits}</div>
            <div className="mt-1 text-sm text-slate-500">当前套餐：{quota.planName}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">重置时间</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {new Date(quota.resetAt).toLocaleDateString("zh-CN")}
            </div>
            <div className="mt-1 text-sm text-slate-500">下次月度额度重置日</div>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">AI 套餐与额度</h2>
            <p className="mt-1 text-sm text-slate-500">家长可直接调整当前家庭的套餐名与月额度。</p>
          </div>
          {quotaMessage ? (
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{quotaMessage}</div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_auto_auto] md:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">套餐名称</span>
            <input
              value={quotaPlanName}
              onChange={(e) => setQuotaPlanName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              placeholder="free / standard / family"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">月额度</span>
            <input
              value={quotaMonthlyCredits}
              onChange={(e) => setQuotaMonthlyCredits(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              inputMode="numeric"
            />
          </label>
          <button
            onClick={() => void saveQuotaSettings(false)}
            disabled={quotaSaving}
            className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {quotaSaving ? "保存中..." : "保存额度"}
          </button>
          <button
            onClick={() => void saveQuotaSettings(true)}
            disabled={quotaSaving}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            清空已用
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">本月 AI 功能消耗</h2>
            <p className="mt-1 text-sm text-slate-500">按功能看本月用了多少点、调了多少次。</p>
          </div>
        </div>

        {usageSummary.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {usageSummary.map((item) => (
              <div key={item.feature} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{featureLabel[item.feature]}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{item.totalCredits}</div>
                <div className="mt-1 text-sm text-slate-500">{item.totalCalls} 次调用</div>
                <div className="mt-3">
                  <div className="h-2.5 rounded-full bg-slate-200">
                    <div
                      className="h-2.5 rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#38bdf8_100%)] transition-all"
                      style={{ width: getBarWidth(item.totalCredits, maxFeatureCredits) }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    占本月功能消耗峰值的 {maxFeatureCredits ? Math.round((item.totalCredits / maxFeatureCredits) * 100) : 0}%
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">成功 {item.successCalls}</span>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">缓存 {item.cachedCalls}</span>
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">失败 {item.failedCalls}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">本月还没有 AI 消耗汇总数据。</div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">家庭成员 AI 消耗</h2>
            <p className="mt-1 text-sm text-slate-500">看出是谁在用点数，以及各自消耗了多少。</p>
          </div>
        </div>

        {memberUsage.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {memberUsage.map((item) => (
              <div key={item.userId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {item.userName || item.userId}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="text-2xl font-semibold text-slate-900">{item.totalCredits}</div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">{roleLabel[item.role]}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">{item.totalCalls} 次调用</div>
                <div className="mt-3">
                  <div className="h-2.5 rounded-full bg-slate-200">
                    <div
                      className="h-2.5 rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#14b8a6_100%)] transition-all"
                      style={{ width: getBarWidth(item.totalCredits, maxMemberCredits) }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    占家庭成员消耗峰值的 {maxMemberCredits ? Math.round((item.totalCredits / maxMemberCredits) * 100) : 0}%
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">成功 {item.successCalls}</span>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">缓存 {item.cachedCalls}</span>
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">失败 {item.failedCalls}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">本月还没有成员级 AI 消耗记录。</div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">最近 AI 使用记录</h2>
            <p className="mt-1 text-sm text-slate-500">查看最近家庭成员的 AI 消耗情况与调用结果。</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            最近 {usageItems.length} 条
          </div>
        </div>

        {usageItems.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="py-3 pr-4 font-medium">时间</th>
                  <th className="py-3 pr-4 font-medium">功能</th>
                  <th className="py-3 pr-4 font-medium">状态</th>
                  <th className="py-3 pr-4 font-medium">点数</th>
                  <th className="py-3 pr-4 font-medium">Provider</th>
                  <th className="py-3 font-medium">耗时</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {usageItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 whitespace-nowrap">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="py-3 pr-4">{featureLabel[item.feature]}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "success" ? "bg-emerald-50 text-emerald-700" : item.status === "cached" ? "bg-sky-50 text-sky-700" : "bg-rose-50 text-rose-700"}`}>
                        {statusLabel[item.status]}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{item.creditsCharged}</td>
                    <td className="py-3 pr-4">{item.provider ?? "-"}</td>
                    <td className="py-3">{item.latencyMs ? `${item.latencyMs} ms` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">最近还没有 AI 使用记录。</div>
        )}
      </section>

      <StudentOverviewPanel title={`${user?.name ?? "家长"}视角下的学生能力图谱`} />
    </div>
  );
}
