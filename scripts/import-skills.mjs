#!/usr/bin/env node
/**
 * Skill Bank CSV importer — the ONLY place CSV parsing/normalisation happens.
 *
 * Usage:
 *   npm run import                       # reads data/skills.csv -> src/data/skills.json
 *   npm run import -- path/to/other.csv  # custom input
 *   npm run import -- --verify           # also probe GitHub for SKILL.md files on repo/folder URLs
 *   npm run import:descriptions          # fetch GitHub About descriptions and save them to the CSV
 *   npm run import -- --out some.json    # custom output path
 *
 * Drop an updated CSV in data/skills.csv and re-run. The app reads the JSON output.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { fetchGithubDescriptions } from "./github-descriptions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- CLI args
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !["--out"].includes(args[i - 1]));
const INPUT = path.resolve(ROOT, positional[0] ?? "data/skills.csv");
const OUTPUT = path.resolve(ROOT, opt("--out") ?? "src/data/skills.json");
const VERIFY = flag("--verify");
const DESCRIPTIONS = flag("--descriptions");

// ---------------------------------------------------------------- column mapping
// Each field lists accepted header names. Headers are compared after lowercasing and
// stripping everything except letters/digits, so "Stars", "star_count", "Star Count" all match.
const FIELD_ALIASES = {
  name: ["name", "title", "skill", "skillname", "skill_name"],
  summary: ["summary", "shortdescription", "tagline", "oneliner", "subtitle", "excerpt"],
  description: ["description", "desc", "about", "details", "body", "content", "readme", "longdescription"],
  category: ["category", "categories", "group", "section", "type", "skillcategory"],
  tags: ["tags", "topics", "keywords", "labels", "tag"],
  author: ["author", "owner", "creator", "user", "username", "maintainer", "repoowner", "ownerlogin"],
  repoName: ["reponame", "repo", "repository", "repositoryname", "project", "projectname"],
  githubUrl: ["githuburl", "github", "repourl", "repositoryurl", "url", "link", "htmlurl", "sourceurl", "source", "githublink"],
  mdFileUrl: ["mdfileurl", "mdurl", "rawurl", "skillmdurl", "skillmd", "fileurl", "downloadurl", "rawmdurl", "markdownurl", "mdfile"],
  installCommand: ["installcommand", "install", "installcmd", "command", "installation", "installsnippet"],
  stars: ["stars", "stargazers", "stargazerscount", "starcount", "githubstars", "stargazercount"],
  updatedAt: ["updatedat", "updated", "lastupdated", "pushedat", "lastcommit", "modified", "modifiedat", "date", "lastmodified"],
};

const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function buildColumnMap(headers) {
  const map = {};
  const used = new Set();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const normAliases = aliases.map(norm);
    // Prefer the earliest alias in the list (most specific), not the earliest column.
    for (const a of normAliases) {
      const h = headers.find((hd) => norm(hd) === a && !used.has(hd));
      if (h) {
        map[field] = h;
        used.add(h);
        break;
      }
    }
  }
  // Repository-only exports use Repo as both the display name and repository name.
  if (!map.name && map.repoName) map.name = map.repoName;
  const unmapped = headers.filter((h) => !used.has(h));
  return { map, unmapped };
}

// ---------------------------------------------------------------- helpers
const clean = (v) => {
  if (v === undefined || v === null) return "";
  const s = String(v).replace(/ /g, " ").trim();
  return /^(null|undefined|n\/a|na|none|-|\[\])$/i.test(s) ? "" : s;
};

function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function parseGithub(url) {
  // Returns { owner, repo, kind: 'repo'|'blob'|'tree'|'raw', ref, path } or null
  if (!url) return null;
  let u;
  try {
    u = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponentSafe);
  if (u.hostname === "raw.githubusercontent.com" && parts.length >= 3) {
    const [owner, repo, ...rest] = parts;
    // raw URLs: /owner/repo/<ref>/<path> (ref may also be refs/heads/x — handle simple case)
    const [ref, ...p] = rest;
    return { owner, repo, kind: "raw", ref, path: p.join("/") };
  }
  if (!/(^|\.)github\.com$/.test(u.hostname) || parts.length < 2) return null;
  const [owner, repoRaw, kind, ref, ...p] = parts;
  const repo = repoRaw.replace(/\.git$/, "");
  if (kind === "blob" || kind === "tree") return { owner, repo, kind, ref, path: p.join("/") };
  return { owner, repo, kind: "repo", ref: undefined, path: "" };
}

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");
const rawUrl = (owner, repo, ref, p) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${encPath(p)}`;

function canonicalGithubUrl(url) {
  // Used for dedupe: lowercased, no protocol/query/hash/trailing slash/.git
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[?#].*$/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

/** Raw .md URL when it can be derived with certainty from an explicit .md link. */
function rawMdFrom(url) {
  if (!url) return undefined;
  const gh = parseGithub(url);
  if (gh?.kind === "raw" && /\.md$/i.test(gh.path)) return url;
  if (gh?.kind === "blob" && /\.md$/i.test(gh.path)) return rawUrl(gh.owner, gh.repo, gh.ref, gh.path);
  // Any other direct link to a .md file (gist raw, etc.)
  if (/^https?:\/\/.+\.md(\?.*)?$/i.test(url) && !/github\.com\/[^/]+\/[^/]+\/?$/.test(url)) return url;
  return undefined;
}

/** Likely SKILL.md location for a repo/folder URL (needs --verify before it's trusted). */
function guessSkillMd(url) {
  const gh = parseGithub(url);
  if (!gh) return undefined;
  if (gh.kind === "tree") return rawUrl(gh.owner, gh.repo, gh.ref, gh.path ? `${gh.path}/SKILL.md` : "SKILL.md");
  if (gh.kind === "repo") return rawUrl(gh.owner, gh.repo, "HEAD", "SKILL.md");
  return undefined;
}

function parseStars(v) {
  const s = clean(v).toLowerCase().replace(/,/g, "").replace(/\s/g, "");
  if (!s) return undefined;
  const m = s.match(/^([\d.]+)([km])?$/);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m") n *= 1_000_000;
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function parseDate(v) {
  const s = clean(v);
  if (!s) return undefined;
  const n = Number(s);
  const d = Number.isFinite(n) && /^\d{10,13}$/.test(s) ? new Date(s.length === 10 ? n * 1000 : n) : new Date(s);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return undefined;
  return d.toISOString();
}

function parseTags(v) {
  const s = clean(v).replace(/^\[|\]$/g, "");
  if (!s) return [];
  const seen = new Set();
  return s
    .split(/[,;|]/)
    .map((t) => t.replace(/^["'#\s]+|["'\s]+$/g, "").toLowerCase().replace(/\s+/g, "-"))
    .filter((t) => t && t.length <= 40 && !seen.has(t) && seen.add(t));
}

function stripMarkdown(s) {
  return s
    .replace(/^---[\s\S]*?---\s*/, "") // frontmatter
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text, max = 140) {
  const t = stripMarkdown(text);
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  let s = (m ? m[1] : t).trim();
  if (s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}

function humanizeName(s) {
  return s
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------- category handling
// Canonical spellings so "frontend", "Front-End", "front end" collapse to one chip.
const CATEGORY_CANON = {
  design: "Design", uiux: "Design", ux: "Design", ui: "Design",
  frontend: "Frontend", front: "Frontend",
  backend: "Backend", back: "Backend",
  marketing: "Marketing", growth: "Marketing", seo: "Marketing",
  data: "Data", dataanalysis: "Data", datascience: "Data", analytics: "Data",
  devops: "DevOps", infrastructure: "DevOps", infra: "DevOps",
  writing: "Writing", content: "Writing", docs: "Writing", documentation: "Writing",
  productivity: "Productivity",
  security: "Security", testing: "Testing", qa: "Testing",
  ai: "AI & ML", ml: "AI & ML", aiml: "AI & ML", machinelearning: "AI & ML", aiandml: "AI & ML",
  other: "Other", misc: "Other", miscellaneous: "Other", general: "Other",
};

function canonCategory(raw) {
  // A slash can be part of one category, such as "Design system / UI library".
  const s = clean(raw).split(/[,;|>]/)[0].trim(); // first category if several
  if (!s) return "";
  const key = norm(s);
  if (CATEGORY_CANON[key]) return CATEGORY_CANON[key];
  // Preserve CSV-defined category names, including their casing.
  return s.replace(/\s+/g, " ");
}

// Keyword rules for inference. Scored: name hits count triple, tags double, description once.
const CATEGORY_RULES = [
  ["Design", ["design", "ui", "ux", "figma", "brand", "logo", "typography", "color", "palette", "icon", "illustration", "layout", "wireframe", "prototype", "visual", "portfolio", "accessibility", "a11y", "motion", "animation"]],
  ["Frontend", ["frontend", "front-end", "react", "vue", "svelte", "angular", "nextjs", "next.js", "tailwind", "css", "html", "component", "browser", "dom", "web app", "javascript", "typescript", "vite", "shadcn"]],
  ["Backend", ["backend", "back-end", "api", "server", "database", "sql", "postgres", "mysql", "mongodb", "redis", "graphql", "rest", "node", "express", "django", "flask", "fastapi", "rails", "golang", "rust", "microservice", "auth", "supabase", "prisma"]],
  ["DevOps", ["devops", "docker", "kubernetes", "k8s", "ci/cd", "ci", "deploy", "deployment", "terraform", "aws", "gcp", "azure", "infrastructure", "pipeline", "github actions", "monitoring", "observability", "linux", "shell", "bash", "helm", "cloud"]],
  ["Data", ["data", "analytics", "analysis", "csv", "excel", "spreadsheet", "pandas", "chart", "visualization", "dashboard", "etl", "scraping", "scrape", "statistics", "notebook", "jupyter", "bigquery", "dataset"]],
  ["Marketing", ["marketing", "seo", "ads", "advertising", "campaign", "social media", "newsletter", "email marketing", "growth", "conversion", "landing page", "copywriting", "brand voice", "audience", "funnel", "sales", "outreach", "lead"]],
  ["Writing", ["writing", "writer", "blog", "article", "copy", "content", "documentation", "docs", "readme", "editing", "proofread", "grammar", "story", "essay", "summarize", "summary", "technical writing", "voice"]],
  ["Productivity", ["productivity", "workflow", "automation", "automate", "task", "todo", "calendar", "notes", "notion", "obsidian", "meeting", "email", "organize", "planning", "project management", "time", "focus", "pdf", "docx", "pptx", "slides"]],
  ["Testing", ["test", "testing", "qa", "unit test", "e2e", "playwright", "cypress", "jest", "vitest", "tdd", "coverage"]],
  ["Security", ["security", "vulnerability", "pentest", "audit", "owasp", "secrets", "encryption", "cve", "threat"]],
  ["AI & ML", ["llm", "machine learning", "ml", "model", "prompt", "agent", "rag", "embedding", "fine-tune", "openai", "anthropic", "claude", "mcp", "neural", "pytorch", "tensorflow"]],
];

function countHits(text, kw) {
  if (!text) return 0;
  const re = new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z0-9]|$)`, "gi");
  return (text.match(re) || []).length;
}

function inferCategory({ name, description, summary, tags }) {
  const n = name.toLowerCase().replace(/[-_]/g, " ");
  const t = tags.join(" ").replace(/-/g, " ");
  const d = `${summary} ${description}`.toLowerCase();
  let best = { cat: "Other", score: 0 };
  for (const [cat, kws] of CATEGORY_RULES) {
    let score = 0;
    for (const kw of kws) score += countHits(n, kw) * 3 + countHits(t, kw) * 2 + Math.min(countHits(d, kw), 3);
    if (score > best.score) best = { cat, score };
  }
  // Require a minimum signal; otherwise "Other" is more honest than a guess.
  return best.score >= 2 ? best.cat : "Other";
}

// ---------------------------------------------------------------- verify (optional network)
async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- main
async function main() {
  const outDir = path.dirname(OUTPUT);
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(INPUT)) {
    console.warn(`\n⚠  No CSV found at ${path.relative(ROOT, INPUT)}.`);
    console.warn("   Put your skills CSV there (or pass a path) and run `npm run import` again.");
    if (!fs.existsSync(OUTPUT)) {
      fs.writeFileSync(OUTPUT, "[]\n");
      console.warn(`   Wrote an empty ${path.relative(ROOT, OUTPUT)} so the app still builds.\n`);
    }
    process.exitCode = 1;
    return;
  }

  const text = fs.readFileSync(INPUT, "utf8").replace(/^﻿/, "");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  if (parsed.errors.length) {
    const sample = parsed.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join("\n   ");
    console.warn(`⚠  CSV parse warnings (${parsed.errors.length}):\n   ${sample}`);
  }
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const { map, unmapped } = buildColumnMap(headers);

  if (DESCRIPTIONS) {
    if (!map.githubUrl) throw new Error("A GitHub URL column is required to fetch descriptions");
    if (parsed.errors.length) throw new Error("Fix the CSV parse warnings before updating its descriptions");
    const urls = [...new Set(parsed.data.map((row) => clean(row[map.githubUrl])).filter(Boolean))];
    console.log(`\nFetching About descriptions for ${urls.length} GitHub repositories…`);
    const reportPath = path.join(ROOT, "data", "github-descriptions.json");
    const results = await fetchGithubDescriptions(urls, reportPath, { resume: flag("--resume") });
    const byUrl = new Map(results.map((result) => [result.url, result]));
    if (!map.description) {
      map.description = "description";
      headers.push(map.description);
    }
    for (const row of parsed.data) {
      const result = byUrl.get(clean(row[map.githubUrl]));
      if (result?.status === "ok") row[map.description] = result.description;
    }
    fs.writeFileSync(INPUT, Papa.unparse(parsed.data, { columns: headers, newline: "\r\n" }) + "\r\n");
    const counts = {};
    for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
    console.log("  results: " + Object.entries(counts).map(([status, count]) => `${status} (${count})`).join(", "));
    for (const result of results.filter((result) => result.status !== "ok")) {
      console.log(`  ${result.status}: ${result.url}${result.error ? ` — ${result.error}` : ""}`);
    }
    console.log(`  source CSV updated; fetch report: ${path.relative(ROOT, reportPath)}`);
  }

  console.log(`\nInput: ${path.relative(ROOT, INPUT)} (${parsed.data.length} rows)`);
  console.log("\nColumn mapping (field  ←  CSV column):");
  for (const field of Object.keys(FIELD_ALIASES)) {
    console.log(`  ${field.padEnd(15)} ← ${map[field] ? `"${map[field]}"` : "(none — derived or hidden)"}`);
  }
  if (unmapped.length) console.log(`  ignored columns: ${unmapped.map((h) => `"${h}"`).join(", ")}`);

  const get = (row, field) => (map[field] ? clean(row[map[field]]) : "");
  const stats = { empty: 0, duplicate: 0, noUrl: 0, inferredCategory: 0, derivedSummary: 0, derivedMd: 0 };
  const seen = new Set();
  const skills = [];

  for (const row of parsed.data) {
    const values = Object.values(row).map(clean).filter(Boolean);
    if (!values.length) {
      stats.empty++;
      continue;
    }

    let githubUrl = get(row, "githubUrl");
    let mdSource = get(row, "mdFileUrl");
    const mdGiven = !!mdSource && !!rawMdFrom(mdSource) && /raw\.githubusercontent\.com/.test(mdSource);
    // If the "url" column actually points to a raw file, treat it as the md source too.
    if (githubUrl && !mdSource && rawMdFrom(githubUrl)) mdSource = githubUrl;
    // If no GitHub URL but the md URL is on GitHub, rebuild a GitHub link from it.
    const ghFromMd = parseGithub(mdSource);
    if (!githubUrl && ghFromMd) {
      githubUrl =
        ghFromMd.kind === "raw"
          ? `https://github.com/${ghFromMd.owner}/${ghFromMd.repo}/blob/${ghFromMd.ref}/${encPath(ghFromMd.path)}`
          : mdSource;
    }
    if (githubUrl && !/^https?:\/\//i.test(githubUrl)) githubUrl = `https://${githubUrl.replace(/^\/+/, "")}`;
    if (githubUrl && githubUrl.includes("raw.githubusercontent.com")) {
      const g = parseGithub(githubUrl);
      if (g) githubUrl = `https://github.com/${g.owner}/${g.repo}/blob/${g.ref}/${encPath(g.path)}`;
    }

    const dedupeKey = githubUrl ? canonicalGithubUrl(githubUrl) : mdSource ? canonicalGithubUrl(mdSource) : "";
    if (!dedupeKey) {
      stats.noUrl++;
      continue;
    }
    if (seen.has(dedupeKey)) {
      stats.duplicate++;
      continue;
    }
    seen.add(dedupeKey);

    const gh = parseGithub(githubUrl);
    const author = get(row, "author") || gh?.owner || "";
    let repoName = get(row, "repoName") || gh?.repo || "";
    if (repoName.includes("/")) repoName = repoName.split("/").pop();

    let name = get(row, "name");
    if (!name) {
      const lastSeg = gh?.path ? gh.path.split("/").filter((s) => !/^skill\.md$/i.test(s)).pop() : gh?.repo;
      name = lastSeg ? humanizeName(lastSeg) : "";
    }
    if (!name) {
      stats.empty++;
      continue;
    }

    const description = get(row, "description");
    let summary = get(row, "summary");
    if (!summary && description) {
      summary = firstSentence(description);
      stats.derivedSummary++;
    }
    if (summary.length > 160) summary = firstSentence(summary, 140);

    const tags = parseTags(get(row, "tags"));
    let category = canonCategory(get(row, "category"));
    if (!category) {
      category = inferCategory({ name, description, summary, tags });
      stats.inferredCategory++;
    }

    let mdFileUrl = rawMdFrom(mdSource) || rawMdFrom(githubUrl);
    if (mdFileUrl && !mdGiven) stats.derivedMd++;
    const mdCandidate = mdFileUrl ? undefined : guessSkillMd(githubUrl);

    const skill = {
      id: crypto.createHash("sha1").update(dedupeKey).digest("hex").slice(0, 10),
      slug: "",
      name,
      summary,
      description,
      category,
      tags,
      author,
      repoName,
      githubUrl: gh || /github\.com/.test(githubUrl) ? githubUrl : "",
      mdFileUrl,
      installCommand: get(row, "installCommand") || undefined,
      stars: parseStars(get(row, "stars")),
      updatedAt: parseDate(get(row, "updatedAt")),
      _mdCandidate: mdCandidate,
    };
    skills.push(skill);
  }

  // ---- slugs: clash → append owner → then a counter as last resort
  const baseCounts = new Map();
  for (const s of skills) {
    const base = slugify(s.name) || s.id;
    s.slug = base;
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }
  const taken = new Set();
  // Keep published detail URLs stable when a later CSV adds the same skill name.
  const previous = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, "utf8")) : [];
  const previousSlugs = new Map(previous.map((s) => [s.id, s.slug]));
  const reserved = new Set(skills.map((s) => previousSlugs.get(s.id)).filter(Boolean));
  for (const s of skills) {
    const previousSlug = previousSlugs.get(s.id);
    if (previousSlug && !taken.has(previousSlug)) {
      s.slug = previousSlug;
      taken.add(previousSlug);
      continue;
    }
    let slug = s.slug;
    if (baseCounts.get(slug) > 1 && s.author) slug = `${slug}-${slugify(s.author)}`;
    let candidate = slug;
    for (let n = 2; taken.has(candidate) || reserved.has(candidate); n++) candidate = `${slug}-${n}`;
    s.slug = candidate;
    taken.add(candidate);
  }

  // ---- optional network verification of guessed SKILL.md locations
  if (VERIFY) {
    const toCheck = skills.filter((s) => s._mdCandidate);
    console.log(`\nVerifying ${toCheck.length} guessed SKILL.md locations on GitHub…`);
    let found = 0;
    await mapLimit(toCheck, 12, async (s) => {
      if (await urlExists(s._mdCandidate)) {
        s.mdFileUrl = s._mdCandidate;
        found++;
      }
    });
    stats.derivedMd += found;
    console.log(`  found ${found}/${toCheck.length}`);
  }

  // ---- strip empty optional fields so the UI never sees blanks
  const out = skills.map(({ _mdCandidate, ...s }) => {
    const o = {};
    for (const [k, v] of Object.entries(s)) {
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length && k !== "tags")) continue;
      o[k] = v;
    }
    // Unverified guess lets the detail page *try* a preview, but never powers the Download button.
    if (!o.mdFileUrl && _mdCandidate) o.previewUrl = _mdCandidate;
    return o;
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 0) + "\n");

  const cats = {};
  for (const s of out) cats[s.category] = (cats[s.category] ?? 0) + 1;
  console.log(`\nWrote ${out.length} skills → ${path.relative(ROOT, OUTPUT)}`);
  console.log(
    `  dropped: ${stats.empty} empty, ${stats.duplicate} duplicate URL, ${stats.noUrl} without any URL`,
  );
  console.log(
    `  derived: ${stats.inferredCategory} categories, ${stats.derivedSummary} summaries, ${stats.derivedMd} raw .md links`,
  );
  console.log(`  with Download .md: ${out.filter((s) => s.mdFileUrl).length}`);
  console.log("  categories: " + Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join(", "));
  if (!VERIFY && out.some((s) => s.previewUrl))
    console.log("\n  Tip: `npm run import:verify` checks repo/folder URLs for a SKILL.md and enables Download for those found.");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
