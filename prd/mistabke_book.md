需求规格说明书 (PRD): 初一数学智能错题本 (Next.js 版)
1. 项目背景
针对初一学生（人教版教材），建立一个课外之余使用的智能错题本系统。系统不仅记录错题，还能通过 AI 自动关联知识图谱，实现薄弱环节分析和针对性练习。

2. 核心技术栈
框架: Next.js (App Router), pnpm workspaces

样式: Tailwind CSS

数学渲染: KaTeX (用于渲染数据中的 LaTeX 公式)

数据存储:

静态知识图谱：data.json

用户数据：sqlite

AI 能力: qwen

3. 静态数据结构 (data.json)
此文件作为系统的“大脑”，存储人教版初一数学的官方知识图谱。

JSON
{
  "curriculum": "人教版",
  "grade": "7",
  "knowledge_map": [
    {
      "id": "kp_001",
      "semester": "上册",
      "chapter": "第一章 有理数",
      "section": "1.2.4 绝对值",
      "description": "数轴上表示数a的点与原点的距离叫做数a的绝对值。非负数的绝对值是它本身，负数的绝对值是它的相反数。",
      "tags": ["计算", "基础概念"]
    },
    {
      "id": "kp_002",
      "semester": "下册",
      "chapter": "第五章 相交线与平行线",
      "section": "5.3.1 平行线的性质",
      "description": "两直线平行，同位角相等；内错角相等；同旁内角互补。",
      "tags": ["几何", "逻辑推理"]
    }
  ]
}
4. 功能模块详细说明
4.1 错题录入模块 (Mistake Input)
OCR 识别: 用户上传题目图片，系统提取文字和 LaTeX 公式。

自动分类: AI 读取题目内容，并将其与 data.json 中的 id 进行匹配。

手动修正: 允许学生手动微调 AI 识别出的 LaTeX 文本或知识点标签。

4.2 个人知识画像 (Knowledge Profiling)
掌握度计算: 根据错题数量和复习频率计算每个 id 的掌握分（0-100）。

可视化图表: 使用雷达图展示“数与代数”、“几何与图形”、“统计与概率”三大模块的覆盖情况。

4.3 智能练习生成 (Smart Quiz)
逻辑: 基于 data.json 中标记为“薄弱”的 section，调用 AI 生成变式题。

反馈: 题目必须包含“知识点简介”（从 data.json 的 description 字段读取）。

5. 页面路由设计 (Sitemap)
/ - 仪表盘：展示学习进度、薄弱环节预警、错题统计。

/mistakes - 错题列表：支持按章节、错误原因过滤。

/mistakes/add - 录入页：上传图片、OCR 结果确认、知识点挂载。

/practice - 智能练习：AI 生成的针对性推题界面。

/knowledge-base - 静态知识图谱浏览页：展示 data.json 中的内容。

6. AI 提示词规范 (For Claude Code Implementation)
在编写 API 路由时，请使用以下逻辑：

分类 Prompt: "根据提供的题目文本，从提供的 JSON 知识图谱中选择最匹配的 section id，并给出理由。"

生成 Prompt: "参考 data.json 中该知识点的定义，生成一道难度级别为‘中等’的初一数学练习题，要求输出 JSON 格式，包含题干、选项和详细解析。"

7. 验收标准 (Acceptance Criteria)
公式准确性: 所有包含 $ 的 LaTeX 公式必须能通过 KaTeX 正常渲染，无乱码。

闭环性: 用户点击某个薄弱知识点后，系统能准确跳转到该知识点的简介并生成相应题目。

响应式: 系统需适配手机端（拍照上传）和平板电脑（做题训练）。