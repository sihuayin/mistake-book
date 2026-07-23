"use client";

import { useMemo } from "react";
import katex from "katex";

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeMathSource(input: string) {
  return input
    .replaceAll("\\\\qquad", " ")
    .replaceAll("\\\\quad", " ")
    .replaceAll("\\\\,", " ")
    .replaceAll("\\\\:", " ")
    .replaceAll("\\\\;", " ")
    .replaceAll("\\\\!", "")
    .replaceAll("\\\\dfrac", "\\frac")
    .replaceAll("\\\\tfrac", "\\frac")
    .replaceAll("\\\\boxed", "\\fbox")
    .replace(/\\\\(?=[a-zA-Z])/g, "\\");
}

function normalizeLooseMathText(input: string) {
  return input
    .replaceAll("\\pm", "±")
    .replaceAll("\\cdots", "⋯")
    .replaceAll("\\cdot", "·")
    .replaceAll("\\times", "×")
    .replaceAll("\\leq", "≤")
    .replaceAll("\\geq", "≥")
    .replaceAll("\\neq", "≠")
    .replaceAll("\\angle", "∠")
    .replaceAll("\\circ", "°")
    .replace(/\\sqrt\[(\d+)\]\{([^}]*)\}/g, "[$1]√$2")
    .replace(/\\sqrt\{([^}]*)\}/g, "√$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1/$2)")
    .replace(/\\dfrac\{([^}]*)\}\{([^}]*)\}/g, "($1/$2)")
    .replace(/\\tfrac\{([^}]*)\}\{([^}]*)\}/g, "($1/$2)")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replaceAll("\\left", "")
    .replaceAll("\\right", "");
}

function looksLikeMathFragment(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 120) return false;
  if (/[。！？；，,]/.test(trimmed)) return false;
  if (/[\u4e00-\u9fff]/.test(trimmed) && !/[\\^_{}=±×·÷√∠πθ≤≥≠]/.test(trimmed)) {
    return false;
  }
  return (
    /\\(?:frac|dfrac|tfrac|sqrt|times|cdot|leq|geq|neq|pm|angle|pi|theta|begin|end|text|boxed)/.test(trimmed) ||
    /[_^=+\-*/(){}\[\]<>]/.test(trimmed) ||
    /\d/.test(trimmed)
  );
}

function shouldRenderStandaloneMath(text: string) {
  return looksLikeMathFragment(text);
}

function renderStandaloneMath(text: string) {
  const normalized = normalizeMathSource(text).trim();
  if (!shouldRenderStandaloneMath(normalized)) {
    return null;
  }

  try {
    return katex.renderToString(normalized, {
      throwOnError: false,
      displayMode: false,
      strict: "ignore",
    });
  } catch {
    return null;
  }
}

function renderMathText(input: string) {
  const normalizedInput = normalizeMathSource(input);
  if (!normalizedInput.trim()) return "";

  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$)/g;
  const parts = normalizedInput.split(pattern).filter(Boolean);

  return parts
    .map((part) => {
      const normalizedPart =
        part.startsWith("\\[") && part.endsWith("\\]")
          ? { expr: part.slice(2, -2).trim(), displayMode: true }
          : part.startsWith("\\(") && part.endsWith("\\)")
            ? { expr: part.slice(2, -2).trim(), displayMode: false }
            : part.startsWith("$$") && part.endsWith("$$")
              ? { expr: part.slice(2, -2).trim(), displayMode: true }
              : part.startsWith("$") && part.endsWith("$")
                ? { expr: part.slice(1, -1).trim(), displayMode: false }
                : null;

      if (normalizedPart) {
        try {
          const rendered = katex.renderToString(normalizedPart.expr, {
            throwOnError: false,
            displayMode: normalizedPart.displayMode,
            strict: "ignore",
          });
          return normalizedPart.displayMode ? `<div class="math-block">${rendered}</div>` : rendered;
        } catch {
          return `<pre class="math-fallback">${escapeHtml(part)}</pre>`;
        }
      }

      const standaloneMath = renderStandaloneMath(part);
      if (standaloneMath) {
        return standaloneMath;
      }

      return escapeHtml(normalizeLooseMathText(part)).replaceAll("\n", "<br />");
    })
    .join("");
}

export default function MathContent({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const html = useMemo(() => renderMathText(content), [content]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
