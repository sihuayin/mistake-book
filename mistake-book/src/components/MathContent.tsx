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

function renderMathText(input: string) {
  if (!input.trim()) return "";

  const pattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g;
  const parts = input.split(pattern).filter(Boolean);

  return parts
    .map((part) => {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        const expr = part.slice(2, -2).trim();
        try {
          return `<div class="math-block">${katex.renderToString(expr, {
            throwOnError: false,
            displayMode: true,
            strict: "ignore",
          })}</div>`;
        } catch {
          return `<pre class="math-fallback">${escapeHtml(part)}</pre>`;
        }
      }

      if (part.startsWith("$") && part.endsWith("$")) {
        const expr = part.slice(1, -1).trim();
        try {
          return katex.renderToString(expr, {
            throwOnError: false,
            displayMode: false,
            strict: "ignore",
          });
        } catch {
          return escapeHtml(part);
        }
      }

      return escapeHtml(part).replaceAll("\n", "<br />");
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
