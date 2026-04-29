# PRD: 初一数学智能错题本 — 学习行为改变系统

> **Issue Status**: Not yet submitted to tracker (git repo not initialized)
> **Generated from**: Design interview (23 decision points) + PRD_v2.md + ROADMAP.md
> **Version**: 1.0

---

## Problem Statement

初一学生（12-13岁）在数学学习中面临三个根本性问题：

1. **错而不改**：学生记录错题后只记答案，不记思维过程，下次遇到同类型题仍会犯错
2. **薄弱点不清晰**：学生和家长只知道"数学不好"，不知道具体哪里薄弱，练习缺乏针对性，浪费大量时间在已掌握的内容上
3. **复习无节奏**：复习依赖记忆而非科学间隔，导致边学边忘，薄弱点反复回滚

现有工具（纸质错题本、Anki、Notion）只能解决"记录"问题，无法解决"改变学习行为"的问题。本系统的目标不是做一个更好的错题本，而是做一个改变学习行为的产品。

---

## Solution

**初一数学智能错题本** 是一个基于元认知训练的学习行为改变系统，核心机制为：

- **错题录入 → 元认知反思**：学生每次错题后，通过分类触发追问 + 文字补充，强制记录"当时怎么想的"
- **薄弱点精准诊断**：多因子掌握度模型（正确率40% + 复习间隔达标率30% + 反思质量30%），精确定位章节薄弱点并归因错误类型（粗心/概念混淆/思路断链/完全不会）
- **针对性智能练习**：题库优先 + AI 生成变式题 + 解答题步骤级 AI 评分
- **遗忘驱动复习**：基于艾宾浩斯遗忘曲线，在临界点前推送复习唤醒，避免机械重复

双角色设计：学生端（手机为主）做练习和反思，家长端（仪表盘）只观察不干预。

---

## User Stories

### 冷启动 & 账号

1. As a 新用户（学生），I want 在首次打开时完成能力自测，so that 系统能为我建立初始掌握度基线，避免从零开始的漫长冷启动
2. As a 新用户（学生），I want 创建学生账号并设置密码，so that 我的错题数据独立存储不丢失
3. As a 新用户（家长），I want 创建家长账号并通过家庭码关联孩子的账号，so that 我能看到孩子的学习数据
4. As a 学生，I want 在忘记密码时重置密码，so that 不因账号问题中断学习
5. As a 家长，I want 在关联孩子账号时使用家庭码快速关联，so that 不需要复杂的配置过程

### 错题录入

6. As a 学生，I want 拍照上传作业本中的一道数学题，so that 不需要手动打字输入题目
7. As a 学生，I want 在 OCR 识别后确认并修正识别结果，so that 识别错误不会导致题目内容错误
8. As a 学生，I want 在 OCR 识别时同时识别 LaTeX 数学公式，so that 公式能正确渲染而非乱码
9. As a 学生，I want 从知识图谱中选择这道题对应的章节，so that 错题能被正确归类
10. As a 学生，I want AI 自动推荐最匹配的章节，so that 我不需要手动翻找知识图谱
11. As a 学生，I want 手动调整章节分类，so that AI 分类错误时我能修正
12. As a 学生，I want 用公式卡片点击插入常用数学结构（根号、分式、绝对值、平行符号），so that 编辑公式不需要学 LaTeX 语法
13. As a 学生，I want 在公式卡片之外使用 LaTeX 语法直接编辑公式，so that 覆盖卡片没有覆盖的特殊公式
14. As a 学生，I want 实时预览我输入的公式渲染结果，so that 我知道最终显示是什么样

### 元认知反思（做错后）

15. As a 学生，I want 在提交错题后看到错误类型选择卡片（粗心/概念混淆/思路断链/完全不会），so that 我能定位自己的思维卡点类型
16. As a 学生，I want 在选择错误类型后看到 AI 针对该类型生成的个性化追问，so that 我不需要自己想反思问题
17. As a 学生，I want 用选择卡片 + 补充文字的方式回答追问，so that 反思过程既快速又有深度
18. As a 学生，I want 当 AI 追问超过3轮后系统自动停止，so that 反思不会变成无限对话
19. As a 学生，I want 如果 AI 分类失败看到标准四问法作为兜底，so that 无论什么情况都能完成反思
20. As a 学生，I want 在标准四问法中逐题回答，so that 我被迫主动复盘整个思维过程

### 元认知唤醒（复习前）

21. As a 学生，I want 在遗忘临界点前收到系统推送的复习提醒，so that 我知道什么时候该复习什么内容
22. As a 学生，I want 点击复习提醒后看到这道题的历史记录，so that 我能重新面对这道曾经做错的题
23. As a 学生，I want 在复习前看到唤醒追问（"你现在能独立做出来吗？还记得当时为什么错吗？"），so that 复习不是机械重看而是主动回忆
24. As a 学生，I want 复习完成后标记"已掌握"，so that 掌握度能反映真实的复习效果

### 薄弱点诊断

25. As a 学生，I want 在首页看到按分数排序的薄弱章节列表，so that 我知道最该练习什么
26. As a 学生，I want 在知识地图上看到每个章节的热力着色（绿/黄/红），so that 一眼看出哪里强哪里弱
27. As a 学生，I want 点击知识地图上的薄弱章节直接进入练习，so that 不用多次跳转
28. As a 学生，I want 看到自己的错误类型分布统计，so that 知道自己主要是粗心还是概念不清
29. As a 学生，I want 每个薄弱章节有"典型反思案例"展示，so that 我能看到自己之前为什么会在这里犯错
30. As a 家长，I want 在仪表盘首页看到最关键的1-2个指标，so that 每天看一眼就能了解孩子状态
31. As a 家长，I want 在仪表盘首页点击展开看到章节掌握度列表，so that 我知道孩子具体哪个章节差
32. As a 家长，I want 看到错误类型分布柱状图，so that 我能判断孩子的问题是粗心还是概念不清
33. As a 家长，I want 看到复习完成率趋势图，so that 我知道孩子有没有偷懒不复习
34. As a 家长，I want 所有数据都是只读的，so that 我不会因为不擅长数学而误导孩子

### 智能练习

35. As a 学生，I want 接受系统推送的薄弱章节练习，so that 我的练习时间用在最需要的地方
36. As a 学生，I want 在练习前看到该章节的知识点简介和关键公式，so that 我能带着上下文做题
37. As a 学生，I want 做解答题并在多行文本框中分步写出推导过程，so that 训练数学思维而非只写答案
38. As a 学生，I want 在作答时使用公式编辑器插入 LaTeX 公式，so that 数学推导完整呈现
39. As a 学生，I want 提交作答后看到分步得分，so that 我知道哪几步对了哪几步错了
40. As a 学生，I want 看到 AI 逐行分析反馈，so that 知道具体哪一步思路有问题
41. As a 学生，I want 在做下一道题之前看到这道题的完整变式题，so that 学到一道题后立即验证是否真正理解
42. As a 学生，I want 变式题是异步生成的，so that 我不需要等待生成完成才能继续练习
43. As a 学生，I want 在题库有题目时优先使用题库题，so that 做的是经过验证的高质量题目
44. As a 学生，I want 当题库没有合适题目时使用 AI 生成的题目，so that 薄弱章节总有练习可做

### 游戏化与可视化

45. As a 学生，I want 在知识地图上看到技能树热力图，so that 我对自己的知识掌握有全局感
46. As a 学生，I want 在每个章节看到完成度进度条，so that 我能感受到自己的进步
47. As a 学生，I want 在达成特定里程碑时获得徽章，so that 学习有成就感和动力
48. As a 学生，I want 看到每个徽章的获取条件，so that 我知道如何努力获得下一个徽章
49. As a 学生，I want 首批包含"首次及格"、"连续3天复习"、"薄弱章节减少1个"等徽章，so that 徽章目标可触及

### 提醒与驱动

50. As a 学生，I want 在遗忘临界点到达前收到推送通知，so that 我不会因为忘记而错过最佳复习时机
51. As a 学生，I want 当某章节错题积累到3道以上时收到提醒，so that 薄弱积累能被及时处理
52. As a 学生，I want 在仪表盘看到小红点标记的待处理事项，so that 没有通知权限时也能看到复习需求

### 家长端知识图谱维护

53. As a 家长，I want 提交知识点补充建议，so that 当我发现知识图谱有遗漏时可以反馈
54. As a 家长，I want 提交时说明建议的章节归属和内容描述，so that 开发者能快速审核

---

## Implementation Decisions

### 架构决策

- **技术栈**: Next.js (App Router) + pnpm workspaces monorepo + Tailwind CSS + KaTeX + SQLite (本地) + qwen API (AI能力)
- **存储策略**: SQLite 本地存储，单设备使用，不支持多端同步
- **用户体系**: 学生和家长独立账号，通过家庭码关联，家长端为只读观察者
- **离线支持**: SQLite 本地优先，AI 能力需联网

### 核心模块设计

#### 1. 知识图谱模块 (`/knowledge-base`)

- 加载 `data.json`，渲染章节树形结构
- 每个 section 关联该学生的 `mastery_scores` 记录
- 热力着色逻辑: `composite_score >= 70` → 绿; `40-70` → 黄; `< 40` → 红
- 点击薄弱章节 → 跳转 `/practice?section=<id>`

#### 2. OCR 录入模块 (`/mistakes/add`)

- 阶段一:单题拍照，`POST /api/ocr` 调用 qwen 视觉模型，识别文字 + LaTeX 公式
- 学生确认界面:展示识别结果，字段可编辑
- `POST /api/classify` 根据识别文本 + `data.json` 返回最匹配 section，confidence 展示，学生可手动调整
- 录入完成 → 触发反思流程

#### 3. 元认知反思引擎 (`/api/reflection`)

- 接收: `question_id`, `error_type`, `current_response`
- 错误类型 → 追问方向映射:

| 错误类型 | 追问方向 Prompt 模板 |
|---|---|
| 粗心 | "你是在哪一步开始算错的？是从头还是中途？" |
| 概念混淆 | "这道题考的是哪个知识点？你能用自己的话说一遍定义吗？" |
| 思路断链 | "做到哪一步你卡住了？前面几步你是怎么想到的？" |
| 完全不会 | "这道题涉及什么知识？你之前见过类似的吗？" |

- 追问链:每次 `POST /api/reflection/followup`，AI 根据上下文生成下一条追问，最多3轮
- 兜底:若 `confidence < 0.5`，返回标准四问法模板
- 反思存储:写入 `reflections` 表，`free_text` 存储学生文字，`card_type` 存储追问类型

#### 4. 薄弱点诊断引擎 (`/api/mastery`)

- 多因子综合评分: `composite_score = accuracy_rate × 0.4 + review_compliance_rate × 0.3 + reflection_quality × 0.3`
- `accuracy_rate`: 该 section 最近20题的作答正确率
- `review_compliance_rate`: 遗忘临界点前完成复习的比例（临界点: 1/3/7/14/30天）
- `reflection_quality`: 仅选卡片不填文字→60分; 有具体描述(>20字)→80-100分; 空着→0分
- 每完成一个 session 或复习后重新计算，批量后台更新

#### 5. 智能练习生成 (`/api/practice/generate`)

- `GET /api/question-bank?section_id=<id>&limit=5` 优先从题库取题
- 题库无匹配: `POST /api/ai/generate` 调用 qwen，传入 section 的 description 和 key_points，生成解答题
- 输出结构: `{ question, answer, solution_steps[], solution, difficulty }`
- 变式题: `POST /api/ai/variation` 基于同一 section 的上一题生成变式题

#### 6. AI 步骤评分 (`/api/ai/grade`)

- 异步端点，学生提交后立即返回 `status: pending`，3-10秒后通过轮询或 WebSocket 返回结果
- prompt 注入: 传入 `question_text`, `student_answer`, `solution_steps[]`
- 输出: `{ step_results: [{ step, description, score, max, feedback }], total_score, max_score, overall_feedback }`
- 阶段一降级: 题库参考答案精确匹配 (exact match)

#### 7. 复习唤醒队列 (`/api/review/pending`)

- 定时任务: 每天凌晨计算所有学生的遗忘临界点到达情况
- 临界点触发条件: 当前时间 >= 临界时间 且 未完成复习
- 复习完成后: 学生标记已掌握或再做一遍 → 更新 `review_compliance_rate`

#### 8. 家长仪表盘 (`/parent`)

- 数据来源: `GET /api/parent/dashboard?student_id=<id>`
- 聚合:章节掌握度列表 + 错误类型分布 + 复习完成率趋势
- 渐进式披露:首页只展示 `weak_section_count` 和 `review_completion_rate`，点击展开详情

### Schema 变更 (SQLite)

```sql
-- 新增表:练习会话
CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_sections TEXT, -- JSON array
  started_at INTEGER,
  finished_at INTEGER
);

-- 新增表:掌握度派生表
CREATE TABLE mastery_scores (
  student_id TEXT,
  section_id TEXT,
  accuracy_rate REAL DEFAULT 0,
  review_compliance_rate REAL DEFAULT 0,
  reflection_quality_score REAL DEFAULT 0,
  composite_score REAL DEFAULT 0,
  last_updated INTEGER,
  PRIMARY KEY (student_id, section_id)
);

-- 新增表:家庭关联
CREATE TABLE family_links (
  parent_id TEXT,
  student_id TEXT,
  family_code TEXT,
  PRIMARY KEY (parent_id, student_id)
);
```

### AI Prompt 规范（关键接口）

#### 知识点分类 (`POST /api/classify`)
输入: `{ question_text, knowledge_graph: data.json }`
输出: `{ matched_section_id, confidence, reason }`

#### 反思追问 (`POST /api/reflection`)
输入: `{ error_type, question_text, previous_responses[] }`
输出: `{ question: string, followup_count: number }`

#### 步骤评分 (`POST /api/ai/grade`)
输入: `{ question, student_answer, solution_steps[] }`
输出: `{ step_results[], total_score, max_score, overall_feedback }`

#### 变式题生成 (`POST /api/ai/variation`)
输入: `{ section_id, original_question }`
输出: `{ question, answer, solution_steps[], solution, difficulty }`

### 路由清单

| 路由 | 角色 | 功能 |
|---|---|---|
| `/` | 学生 | 仪表盘:薄弱章节预警、错题统计徽章 |
| `/onboarding` | 学生 | 冷启动:能力自测 + 知识地图确认 |
| `/auth/login` | 共用 | 登录 |
| `/auth/register` | 共用 | 注册(选学生/家长角色) |
| `/mistakes` | 学生 | 错题列表:按章节/错误类型过滤 |
| `/mistakes/add` | 学生 | 拍照录入:OCR→分类→确认 |
| `/mistakes/[id]` | 学生 | 错题详情:题目+反思+AI反馈 |
| `/practice` | 学生 | 练习首页:薄弱章节列表 |
| `/practice/[sessionId]` | 学生 | 练习会话:做题→AI评分→变式题 |
| `/knowledge-base` | 学生 | 知识地图:技能树热力图 |
| `/profile` | 学生 | 个人画像:徽章+进度条 |
| `/parent` | 家长 | 仪表盘:三维度数据报告 |

---

## Testing Decisions

### 测试原则

- **只测外部行为，不测实现细节**: 不测试"AI prompt 是否正确"，而是测试"给定学生作答，系统返回的分数是否符合预期"
- **AI 评分测试**: AI 评分模块是最大技术风险，必须有端到端测试覆盖

### 必须测试的模块

#### 1. 掌握度计算 (`mastery.test.ts`)

- 测试场景: 无数据 → 综合分=0; 全对 → 正确率满分; 补做复习 → 复习达标率上升
- 测试输入: 构造 `attempts` 和 `reflections` 表数据，调用 `calculateMastery(studentId, sectionId)`
- 验收: 返回的 composite_score 在 [0, 100] 范围内，三因子权重正确

#### 2. OCR → 分类管道 (`ocr-pipeline.test.ts`)

- 测试场景: 传入标准印刷体图片 → 文字识别准确率; 传入含 LaTeX 的图片 → 公式识别
- 使用预设的测试图片 fixture，验证分类结果 section_id 与预期匹配

#### 3. AI 步骤评分 (`grading.test.ts`)

- 测试场景: 正确作答→满分; 关键步骤错误→0分该步; 部分正确→部分分
- 使用预设的学生作答样本，与预设的标准答案对比
- 验收: 总分在 [0, max_score] 范围内，step level 分数与预期一致

#### 4. 艾宾浩斯复习达标率 (`ebbinghaus.test.ts`)

- 测试场景: 在临界点前复习→达标; 遗忘后复习→不达标; 未复习→不达标
- 构造不同时间差的复习记录，验证 `review_compliance_rate` 计算正确

#### 5. 端到端练习闭环 (`practice-flow.e2e.test.ts`)

- Playwright: 学生完成一次完整流程:录入错题→做练习→看到 AI 评分→看到变式题
- 验收: 所有页面状态正确跳转，无报错

### 不测试的内容

- AI 模型内部推理质量（不可控）
- KaTeX 渲染正确性（第三方库，已测试）
- OCR 识别率（依赖第三方 API，Phase 0 POC 验证）

---

## Out of Scope

以下功能在本 PRD 中**明确不做**，不得在 Phase 1-2 实现：

1. **多端同步**: SQLite 本地存储，仅支持单设备，禁止做云同步
2. **家长干预操作**: 家长端仅限只读仪表盘，不得布置任务或修改学生数据
3. **题库手动录入界面**: 题库内容在开发阶段通过数据迁移脚本批量录入，不做 CMS
4. **AI 步骤评分作为唯一评分标准**: AI 评分作为辅助参考，答案精确匹配作为降级方案
5. **整页拍照切分**: Phase 1 仅支持单题拍照，整页拍照在 Phase 3 实现
6. **第三方登录(OAuth)**: 仅支持本地账号注册登录
7. **学习路径强制解锁**: 学生可自由浏览和练习所有章节，不做线性解锁
8. **音频/语音输入**: 反思以文字为主，不做语音转文字

---

## Further Notes

### 技术风险提醒

| 风险 | 缓解方案 |
|---|---|
| 手写体 OCR 准确率 < 80% | Phase 0 必须做 POC 验证，未通过则先只做印刷体 |
| AI 步骤评分与人工评分一致率 < 85% | Phase 1 降级为参考答案匹配，Phase 2 再引入 AI |
| 反思数据不足导致掌握度不准 | Phase 1 强制要求每次错题必须完成反思，否则无法提交 |

### 相依文档

- `prd/PRD_v2.md` — 完整需求规格说明书（含 AI Prompt 详细模板、掌握度算法、反思追问映射表）
- `prd/ROADMAP.md` — 实现路线图（Phase 0 技术验证 → Phase 1 MVP → Phase 2 差异化功能）
- `prd/data.json` — 知识图谱源数据（人教版初一数学章节、知识点、公式）

### 发布说明

本 PRD 基于23轮设计访谈生成，所有关键决策均已与用户确认。由于项目尚未初始化 git 仓库，暂无法提交至 issue tracker。初始化 git 仓库后，需:

1. 创建 GitHub 仓库并设置 remote
2. 将本 PRD 提交为 GitHub Issue，Label: `needs-triage`
3. 将 Phase 0 两个验证任务拆分为独立 Issue

### 版权说明

PRD_v2.md 和 ROADMAP.md 由设计访谈生成，本文档为统一格式输出，三份文档内容保持一致。
