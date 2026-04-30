"use client";

import { useState, useRef, useCallback } from "react";

interface OcrResult {
  text: string;
  latexBlocks: string[];
  confidence: number;
}

interface ClassifyResult {
  matched_section_id: string;
  confidence: number;
  reason: string;
}

interface GradeResult {
  total_score: number;
  max_score: number;
  step_results: Array<{
    step: number;
    description: string;
    score: number;
    max: number;
    feedback: string;
  }>;
  overall_feedback: string;
}

export default function PocTestPage() {
  const [activeTab, setActiveTab] = useState<"ocr" | "grading">("ocr");

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Phase 0: 技术验证
        </h1>
        <p className="text-gray-500 mb-6">
          验证手写体 OCR 准确率和 AI 步骤评分一致性
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("ocr")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "ocr"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-200"
            }`}
          >
            手写体 OCR 验证
          </button>
          <button
            onClick={() => setActiveTab("grading")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "grading"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-200"
            }`}
          >
            AI 步骤评分验证
          </button>
        </div>

        {activeTab === "ocr" ? <OcrTestPanel /> : <GradingTestPanel />}
      </div>
    </div>
  );
}

// ─── OCR Test Panel ──────────────────────────────────────────────────────────

function OcrTestPanel() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        setPreview(ev.target?.result as string);
        setResult(null);
        setClassifyResult(null);
        setError(null);

        setLoading(true);
        fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.error) throw new Error(data.error);
            setResult(data);

            // Auto-classify
            return fetch("/api/classify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionText: data.text }),
            });
          })
          .then((r) => r.json())
          .then((d) => {
            if (!d.error) setClassifyResult(d);
          })
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false));
      };
      reader.readAsDataURL(file);
    },
    []
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">上传作业照片</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <img src={preview} alt="Preview" className="max-w-full rounded-lg" />
        </div>
      )}

      {loading && (
        <div className="bg-blue-50 rounded-xl p-4 text-blue-700 text-center">
          <span className="animate-pulse">识别中...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-xl p-4 text-red-700">
          错误: {error}
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">识别置信度</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    result.confidence >= 0.8
                      ? "bg-green-500"
                      : result.confidence >= 0.5
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${result.confidence * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {(result.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">识别文字</h3>
            <p className="text-gray-900 bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">
              {result.text}
            </p>
          </div>

          {result.latexBlocks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">LaTeX 公式</h3>
              <div className="space-y-2">
                {result.latexBlocks.map((block, i) => (
                  <code key={i} className="block bg-gray-900 text-green-400 rounded p-3 text-sm font-mono overflow-x-auto">
                    {block}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() =>
                fetch("/api/classify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ questionText: result.text }),
                })
                  .then((r) => r.json())
                  .then((d) => setClassifyResult(d))
              }
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              重新分类
            </button>
          </div>

          {classifyResult && (
            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-800 mb-1">知识点分类</h3>
              <p className="text-green-900 font-semibold">{classifyResult.matched_section_id}</p>
              <p className="text-green-700 text-sm">置信度: {(classifyResult.confidence * 100).toFixed(0)}%</p>
              <p className="text-green-700 text-sm">{classifyResult.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Grading Test Panel ───────────────────────────────────────────────────────

function GradingTestPanel() {
  const [question] = useState(
    "解方程: $2x + 3 = 11$"
  );
  const [answer, setAnswer] = useState(
    "2x + 3 = 11\n2x = 8\nx = 4"
  );
  const [solutionSteps] = useState([
    "移项: 2x = 11 - 3",
    "计算右边: 2x = 8",
    "两边除以2: x = 4",
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = () => {
    setLoading(true);
    setResult(null);
    setError(null);
    fetch("/api/ai/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, studentAnswer: answer, solutionSteps }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setResult(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">题目</h3>
          <p className="text-gray-900 font-medium">{question}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">
            学生作答
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-gray-200 p-3 text-sm font-mono"
            placeholder="在此输入学生作答..."
          />
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">标准分步解答</h3>
          <div className="space-y-1">
            {solutionSteps.map((s, i) => (
              <p key={i} className="text-sm text-gray-600 font-mono">
                {i + 1}. {s}
              </p>
            ))}
          </div>
        </div>

        <button
          onClick={runTest}
          disabled={loading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "评分中..." : "开始 AI 评分"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 rounded-xl p-4 text-red-700">
          错误: {error}
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">评分结果</h3>
            <div className="px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-bold">
              {(result as GradeResult).total_score} /{" "}
              {(result as GradeResult).max_score}
            </div>
          </div>

          <div className="space-y-3">
            {result.step_results.map((s, i) => {
                const pct = s.max > 0 ? (s.score / s.max) * 100 : 0;
                return (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        步骤{s.step}: {s.description}
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          pct >= 80
                            ? "text-green-600"
                            : pct >= 40
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {s.score}/{s.max}
                      </span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full ${
                          pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600">{s.feedback}</p>
                  </div>
                );
              }
            )}
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-800 mb-1">总体反馈</h4>
            <p className="text-blue-900 text-sm">
              {result.overall_feedback}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
