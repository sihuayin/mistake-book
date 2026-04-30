# mistake-book

初一数学智能错题本 — 学习行为改变系统

## 技术栈
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- better-sqlite3 (本地存储)
- KaTeX (公式渲染)
- qwen API (DashScope/通义千问, AI 能力)
- pnpm workspaces

## 目录结构
```
src/
  app/           # Next.js App Router 页面和 API 路由
    api/          # API 端点 (ocr, classify, mastery, ai/*)
    poc/          # Phase 0 技术验证页面
  lib/            # 核心库 (ai.ts, db.ts, knowledge.ts, types.ts)
  db/             # SQLite schema
  data/           # 知识图谱 (knowledge-graph.json)
```

## 环境变量
- `DASHSCOPE_API_KEY` — 阿里云 DashScope API Key (通义千问)
- 在 `.env.local` 中设置(不要提交到 git)

## 开发
```bash
pnpm dev       # 开发服务器
pnpm build     # 生产构建
pnpm lint      # 代码检查
```

## Phase 0 验证
访问 `/poc` 页面进行:
- 手写体 OCR 验证 (上传数学作业照片)
- AI 步骤评分验证 (测试解答题评分一致性)
