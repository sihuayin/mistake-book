import type { KnowledgeGraph } from "./types";
import data from "../data/knowledge-graph.json";

let _kg: KnowledgeGraph | null = null;

export function getKnowledgeGraph(): KnowledgeGraph {
  if (!_kg) {
    const raw = data as KnowledgeGraph;
    const gradeGroups = raw.grade_groups ?? [];
    const chapters =
      raw.chapters?.length
        ? raw.chapters
        : gradeGroups.flatMap((group) =>
            group.chapters.map((chapter) => ({
              ...chapter,
              grade: chapter.grade || group.grade,
            }))
          );

    _kg = {
      ...raw,
      chapters,
      grade_groups:
        gradeGroups.length > 0
          ? gradeGroups.map((group) => ({
              ...group,
              chapters: group.chapters.map((chapter) => ({
                ...chapter,
                grade: chapter.grade || group.grade,
              })),
            }))
          : undefined,
    };
  }
  return _kg;
}

export function getGradeOptions(): string[] {
  const kg = getKnowledgeGraph();
  if (kg.grade_groups?.length) {
    return kg.grade_groups.map((group) => group.grade);
  }
  return Array.from(new Set(kg.chapters.map((chapter) => chapter.grade).filter(Boolean)));
}

export function filterKnowledgeGraphByGrade(grade?: string | null): KnowledgeGraph {
  const kg = getKnowledgeGraph();
  if (!grade) return kg;

  const gradeGroups = (kg.grade_groups ?? []).filter((group) => group.grade === grade);
  const chapters = kg.chapters.filter((chapter) => chapter.grade === grade);

  return {
    ...kg,
    grade: grade,
    chapters,
    grade_groups: gradeGroups,
  };
}

export function findSection(sectionId: string) {
  const kg = getKnowledgeGraph();
  for (const chapter of kg.chapters) {
    const section = chapter.sections.find((s) => s.id === sectionId);
    if (section) return { chapter, section };
  }
  return null;
}

export function getSectionMeta(sectionId: string) {
  const found = findSection(sectionId);
  if (!found) return null;
  return {
    grade: found.chapter.grade,
    chapter_id: found.chapter.chapter_id,
    chapter_title: found.chapter.title,
    section: found.section,
  };
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
