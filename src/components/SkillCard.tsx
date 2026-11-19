import { Link } from "react-router-dom";
import type { Skill } from "../types";
import { formatStars } from "../lib/format";
import { StarIcon } from "./Icons";
import { SourceBadges } from "./SourceBadge";

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
        <SourceBadges skill={skill} />
      </div>
    </article>
  );
}
