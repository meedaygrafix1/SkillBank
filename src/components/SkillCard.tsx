import { useState } from "react";
import { Link } from "react-router-dom";
import type { Skill } from "../types";
import { downloadText, formatStars } from "../lib/format";
import { CheckIcon, DownloadIcon, StarIcon, XIcon } from "./Icons";
import { SourceBadges } from "./SourceBadge";

type DlState = "idle" | "loading" | "done" | "missing";

/** Downloads the skill's verified SKILL.md. Only shown when the importer confirmed the file exists. */
function CardDownload({ skill }: { skill: Skill }) {
  const url = skill.mdFileUrl;
  const [state, setState] = useState<DlState>("idle");
  if (!url) return null;

  const onClick = async () => {
    if (state === "loading") return;
    setState("loading");
    let next: DlState = "missing";
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) {
          downloadText(text, `${skill.slug}.md`);
          next = "done";
        }
      }
    } catch {
      /* network error: treat as missing */
    }
    setState(next);
    setTimeout(() => setState("idle"), 1800);
  };

  const label =
    state === "missing" ? "No SKILL.md found" : state === "done" ? "Downloaded" : `Download ${skill.name} SKILL.md`;

  return (
    <button
      type="button"
      className={`icon-btn small card-download${state === "missing" ? " is-missing" : ""}`}
      onClick={onClick}
      disabled={state === "loading"}
      aria-label={label}
      title={label}
    >
      {state === "done" ? <CheckIcon size={15} /> : state === "missing" ? <XIcon size={15} /> : <DownloadIcon size={15} />}
      <span className="sr-only" aria-live="polite">
        {state === "missing" ? "No SKILL.md found" : state === "done" ? "Downloaded" : ""}
      </span>
    </button>
  );
}

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article className="card isometric-card">
      <div className="card-top">
        <span className="category-tag">{skill.category}</span>
        {typeof skill.stars === "number" && (
          <span className="stars" aria-label={`${skill.stars} stars`}>
            <StarIcon size={13} /> {formatStars(skill.stars)}
          </span>
        )}
      </div>
      <h3 className="card-title">
        <Link to={`/skill/${skill.slug}`} className="card-link">{skill.name}</Link>
      </h3>
      {skill.summary && <p className="card-summary">{skill.summary}</p>}
      <div className="card-foot">
        {skill.author ? <span className="author">{skill.author}</span> : <span />}
        <div className="card-foot-end">
          <SourceBadges skill={skill} />
          <CardDownload skill={skill} />
        </div>
      </div>
    </article>
  );
}
