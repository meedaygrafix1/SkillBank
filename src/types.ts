export interface Skill {
  id: string;
  slug: string;
  name: string;
  summary?: string;
  description?: string;
  category: string;
  tags: string[];
  author?: string;
  repoName?: string;
  githubUrl?: string;
  /** Confirmed raw .md file — powers the Download button. */
  mdFileUrl?: string;
  /** Unverified guess (repo/folder URL + SKILL.md) — used only to attempt a preview. */
  previewUrl?: string;
  installCommand?: string;
  stars?: number;
  updatedAt?: string;
}

export type SortKey = "relevance" | "newest" | "popular" | "az";
