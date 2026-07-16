"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface User {
  id: string;
  name: string;
  role: "student" | "parent";
  family_code: string;
  current_grade: string | null;
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = loading, null = not logged in, User = logged in
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function logout() {
    setDropdownOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  const studentLinks = [
    { href: "/", label: "首页" },
    { href: "/profile", label: "个人中心" },
    { href: "/mistakes", label: "错题本" },
    { href: "/practice", label: "练习" },
    { href: "/knowledge-base", label: "知识图谱" },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-blue-600 text-lg">📐 错题本</span>
          {user?.role === "student" &&
            studentLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium transition-colors ${
                  pathname === l.href
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          {user?.role === "parent" && (
            <Link href="/parent" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              仪表盘
            </Link>
          )}
        </div>

        <div className="flex items-center">
          {/* Loading: render nothing to avoid flash */}
          {user === undefined && <div className="w-20 h-5" />}

          {/* Not logged in */}
          {user === null && (
            <Link href="/login" className="text-sm text-blue-600 hover:underline">
              登录
            </Link>
          )}

          {/* Logged in: avatar dropdown */}
          {user && (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
                  {user.name[0].toUpperCase()}
                </span>
                <span className="text-sm text-gray-700 max-w-[120px] truncate">{user.name}</span>
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-50">
                    <p className="text-xs font-medium text-gray-800 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {user.role === "student"
                        ? `学生${user.current_grade ? ` · ${user.current_grade}` : ""} · ${user.family_code}`
                        : `家长 · ${user.family_code}`}
                    </p>
                  </div>
                  {user.role === "student" && (
                    <Link
                      href="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      进入个人中心
                    </Link>
                  )}
                  <button
                    onClick={logout}
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
