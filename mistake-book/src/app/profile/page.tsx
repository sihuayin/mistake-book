"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StudentOverviewPanel from "@/components/StudentOverviewPanel";

interface User {
  id: string;
  name: string;
  role: "student" | "parent";
  current_grade?: string | null;
}

export default function ProfilePage() {
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
        if (sessionUser.role === "parent") {
          router.push("/parent");
          return;
        }
        setUser(sessionUser);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-gray-400">个人中心加载中...</div>;
  }

  return (
    <StudentOverviewPanel title="五维能力总览" />
  );
}
