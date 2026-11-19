import Fuse from "fuse.js";
import { skills } from "./data";
import type { Skill, SortKey } from "../types";

let fuse: Fuse<Skill> | null = null;
function getFuse() {
  fuse ??= new Fuse(skills, {
    keys: [
      { name: "name", weight: 0.4 },
      { name: "tags", weight: 0.2 },
      { name: "summary", weight: 0.15 },
      { name: "author", weight: 0.1 },
      { name: "description", weight: 0.1 },
      { name: "category", weight: 0.05 },
    ],
    threshold: 0.34,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return fuse;
}

/** Text search only (in relevance order). Category filtering happens afterwards so facet counts work. */
export function searchSkills(query: string): Skill[] {
  const q = query.trim();
  if (!q) return skills;
  return getFuse()
    .search(q)
    .map((r) => r.item);
}

const time = (s: Skill) => (s.updatedAt ? Date.parse(s.updatedAt) : -Infinity);

export function sortSkills(list: Skill[], sort: SortKey): Skill[] {
  if (sort === "relevance") return list;
  const out = [...list];
  if (sort === "az") out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (sort === "popular") out.sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1) || a.name.localeCompare(b.name));
  if (sort === "newest") out.sort((a, b) => time(b) - time(a) || a.name.localeCompare(b.name));
  return out;
}
