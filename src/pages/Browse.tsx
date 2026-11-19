import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { categories, hasDates, hasStars, skills } from "../lib/data";
import { searchSkills, sortSkills } from "../lib/search";
import { SkillCard } from "../components/SkillCard";
import { HairlineArchive } from "../components/HairlineArchive";
import { HeroHeadline } from "../components/HeroHeadline";
import { HairlineFigure } from "../components/HairlineFigure";
import { SearchIcon, XIcon } from "../components/Icons";
import type { SortKey } from "../types";

const PAGE_SIZE = 24;

const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Best match",
  newest: "Newest",
  popular: "Popular",
  az: "A to Z",
};

export function Browse() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const selected = useMemo(
    () => new Set((params.get("cat") ?? "").split(",").map((c) => c.trim()).filter(Boolean)),
    [params],
  );

  const sortOptions: SortKey[] = [
    ...(q ? (["relevance"] as SortKey[]) : []),
    ...(hasDates ? (["newest"] as SortKey[]) : []),
    ...(hasStars ? (["popular"] as SortKey[]) : []),
    "az",
  ];
  const defaultSort: SortKey = q ? "relevance" : hasStars ? "popular" : hasDates ? "newest" : "az";
  const sortParam = params.get("sort") as SortKey | null;
  const sort: SortKey = sortParam && sortOptions.includes(sortParam) ? sortParam : defaultSort;

  // ---- local input state, debounced into the URL
  const [input, setInput] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setInput(q), [q]); // back/forward navigation
  useEffect(() => {
    if (input === q) return;
    const t = setTimeout(() => update({ q: input || null, page: null }), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function update(next: Record<string, string | null>, replace = true) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v === null || v === "") p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace },
    );
  }

  const toggleCategory = (name: string) => {
    const s = new Set(selected);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    update({ cat: [...s].join(",") || null, page: null }, false);
  };

  // ---- derive results
  const matched = useMemo(() => searchSkills(q), [q]);
  const facetCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of matched) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return m;
  }, [matched]);
  const filtered = useMemo(
    () => (selected.size ? matched.filter((s) => selected.has(s.category)) : matched),
    [matched, selected],
  );
  const sorted = useMemo(() => sortSkills(filtered, sort), [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1), pageCount);
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resultsRef = useRef<HTMLDivElement>(null);
  const goToPage = (p: number) => {
    update({ page: p > 1 ? String(p) : null }, false);
    resultsRef.current?.scrollIntoView({ block: "start" });
    resultsRef.current?.focus({ preventScroll: true });
  };

  const clearAll = () => {
    setInput("");
    setParams({}, { replace: false });
  };

  useEffect(() => {
    document.title = q ? `“${q}” · Skill Bank` : "Skill Bank · AI agent skills";
  }, [q]);

  const hasFilters = !!q || selected.size > 0;

  return (
    <>
      <section className="hero">
        <div className="container hero-layout">
          <div className="hero-copy">
          <p className="hero-eyebrow">The skill archive / Open for discovery</p>
          <HeroHeadline />
          <p className="hero-sub">
            {skills.length > 0 ? (
              <>
                <strong>{skills.length.toLocaleString()}</strong> skills across {categories.length}{" "}
                {categories.length === 1 ? "category" : "categories"}, sourced from GitHub.
              </>
            ) : (
              "No skills imported yet."
            )}
          </p>
          <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="search" className="sr-only">Search skills</label>
            <SearchIcon size={20} />
            <input
              ref={inputRef}
              id="search"
              type="search"
              placeholder="Search by name, tag, author…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setInput("")}
              autoComplete="off"
              spellCheck={false}
            />
            {input ? (
              <button type="button" className="icon-btn small" onClick={() => { setInput(""); inputRef.current?.focus(); }} aria-label="Clear search">
                <XIcon size={16} />
              </button>
            ) : (
              <kbd aria-hidden>/</kbd>
            )}
          </form>
          <p className="hero-note">One good skill can change how you work.</p>
          </div>
          <HairlineArchive />
        </div>
      </section>

      <div className="container browse">
        {categories.length > 0 && (
          <nav className="chips" aria-label="Filter by category">
            <button
              type="button"
              className="chip"
              aria-pressed={selected.size === 0}
              onClick={() => update({ cat: null, page: null }, false)}
            >
              All <span className="chip-count">{matched.length}</span>
            </button>
            {categories.map((c) => {
              const n = facetCounts.get(c.name) ?? 0;
              return (
                <button
                  key={c.name}
                  type="button"
                  className="chip"
                  aria-pressed={selected.has(c.name)}
                  onClick={() => toggleCategory(c.name)}
                  data-empty={n === 0 && !selected.has(c.name) ? "" : undefined}
                >
                  {c.name} <span className="chip-count">{n}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="toolbar" ref={resultsRef} tabIndex={-1}>
          <p className="result-count" aria-live="polite">
            {sorted.length.toLocaleString()} {sorted.length === 1 ? "skill" : "skills"}
            {hasFilters && (
              <button type="button" className="link-btn" onClick={clearAll}>Clear filters</button>
            )}
          </p>
          {sortOptions.length > 1 && (
            <label className="sort">
              <span>Sort</span>
              <select value={sort} onChange={(e) => update({ sort: e.target.value === defaultSort ? null : e.target.value, page: null })}>
                {sortOptions.map((k) => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {visible.length > 0 ? (
          <div className="grid">
            {visible.map((s) => (
              <SkillCard key={s.id} skill={s} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="empty">
            <HairlineFigure name="empty-tray" className="empty-tray hairline-quiet-stage" label="An empty skill tray" />
            <h2>No skills yet</h2>
            <p>
              Add your CSV at <code>data/skills.csv</code>, then run <code>npm run import</code>.
            </p>
          </div>
        ) : (
          <div className="empty">
            <HairlineFigure name="empty-tray" className="empty-tray hairline-quiet-stage" label="An empty skill tray" />
            <h2>No skills match{q ? ` “${q}”` : ""}</h2>
            <p>Try a shorter search, a different spelling, or fewer categories.</p>
            <button type="button" className="btn" onClick={clearAll}>Clear search and filters</button>
          </div>
        )}

        {pageCount > 1 && <Pagination page={page} count={pageCount} onChange={goToPage} />}
      </div>
    </>
  );
}

function pageList(page: number, count: number): (number | "…")[] {
  const set = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

function Pagination({ page, count, onChange }: { page: number; count: number; onChange: (p: number) => void }) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <ol>
        {pageList(page, count).map((p, i) =>
          p === "…" ? (
            <li key={`e${i}`} className="ellipsis" aria-hidden>…</li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className="page-btn"
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ol>
      <button type="button" className="btn" disabled={page >= count} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
