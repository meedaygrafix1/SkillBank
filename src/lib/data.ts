import raw from "../data/skills.json";
import type { Skill } from "../types";

export const skills: Skill[] = (raw as Skill[]).map((s) => ({ ...s, tags: s.tags ?? [] }));

export const bySlug = new Map(skills.map((s) => [s.slug, s]));

/** Categories derived from data, sorted by count desc then name. "Other" always last. */
export const categories: { name: string; count: number }[] = (() => {
  const counts = new Map<string, number>();
  for (const s of skills) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) =>
      a.name === "Other" ? 1 : b.name === "Other" ? -1 : b.count - a.count || a.name.localeCompare(b.name),
    );
})();

export const hasStars = skills.some((s) => typeof s.stars === "number");
export const hasDates = skills.some((s) => !!s.updatedAt);

export function relatedSkills(skill: Skill, limit = 6): Skill[] {
  const tagSet = new Set(skill.tags);
  return skills
    .filter((s) => s.category === skill.category && s.id !== skill.id)
    .map((s) => ({ s, score: s.tags.filter((t) => tagSet.has(t)).length }))
    .sort((a, b) => b.score - a.score || (b.s.stars ?? 0) - (a.s.stars ?? 0) || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s);
}
