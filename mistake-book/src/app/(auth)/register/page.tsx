"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const gradeOptions = ["七年级", "八年级", "九年级"] as const;
  const router = useRouter();
  const [role, setRole] = useState<"student" | "parent">("student");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [currentGrade, setCurrentGrade] = useState<(typeof gradeOptions)[number]>("七年级");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        password,
        role,
        familyCode: familyCode || undefined,
        currentGrade: role === "student" ? currentGrade : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "注册失败");
      return;
    }

    if (role === "student") {
      // Show family code before redirecting
      alert(`注册成功！你的家庭码是：${data.family_code}\n请把家庭码告诉家长，让家长关联你的账号。`);
    }

    router.push(role === "parent" ? "/parent" : "/");
    router.refresh();
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">注册</h1>
        <p className="text-gray-500 text-sm text-center mb-6">初中数学智能错题本</p>

        {/* Role selector */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setRole("student")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              role === "student"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            学生
          </button>
          <button
            type="button"
            onClick={() => setRole("parent")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              role === "parent"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            家长
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">用户名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="设置用户名"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="设置密码（至少6位）"
              minLength={6}
              required
            />
          </div>

          {role === "student" && (
            <div>
              <label className="block text-sm font-medium mb-1">当前年级</label>
              <select
                value={currentGrade}
                onChange={(e) => setCurrentGrade(e.target.value as (typeof gradeOptions)[number])}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>
          )}

          {role === "parent" && (
            <div>
              <label className="block text-sm font-medium mb-1">家庭码</label>
              <input
                type="text"
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                placeholder="请输入孩子的家庭码"
                required
              />
              <p className="text-xs text-gray-400 mt-1">家庭码由学生注册后获得</p>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "注册中..." : "注册"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          已有账号？{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
