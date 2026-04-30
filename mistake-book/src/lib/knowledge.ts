import type { KnowledgeGraph } from "./types";
import data from "../data/knowledge-graph.json";

let _kg: KnowledgeGraph | null = null;

export function getKnowledgeGraph(): KnowledgeGraph {
  if (!_kg) {
    _kg = data as KnowledgeGraph;
  }
  return _kg;
}

export function findSection(sectionId: string) {
  const kg = getKnowledgeGraph();
  for (const chapter of kg.chapters) {
    const section = chapter.sections.find((s) => s.id === sectionId);
    if (section) return { chapter, section };
  }
  return null;
}

export function findSectionsByKeyword(keyword: string) {
  const kg = getKnowledgeGraph();
  const results: { chapter: (typeof kg.chapters)[0]; section: (typeof kg.chapters)[0]["sections"][0] }[] = [];
  const kw = keyword.toLowerCase();

  for (const chapter of kg.chapters) {
    for (const section of chapter.sections) {
      const nameHit = section.name.toLowerCase().includes(kw);
      const descHit = section.description.toLowerCase().includes(kw);
      const keyHit = section.key_points.some((k) => k.toLowerCase().includes(kw));
      if (nameHit || descHit || keyHit) {
        results.push({ chapter, section });
      }
    }
  }
  return results;
}
