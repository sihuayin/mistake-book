import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "初中数学错题本",
  description: "智能数学错题本 — 学习行为改变系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
