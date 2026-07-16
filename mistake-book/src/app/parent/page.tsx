"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StudentOverviewPanel from "@/components/StudentOverviewPanel";

interface User {
  id: string;
  name: string;
  role: "student" | "parent";
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

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

      <StudentOverviewPanel title={`${user?.name ?? "家长"}视角下的学生能力图谱`} />
    </div>
  );
}
