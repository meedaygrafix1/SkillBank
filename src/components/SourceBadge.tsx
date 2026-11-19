import type { Skill } from "../types";
import { FileIcon, GitHubIcon } from "./Icons";

export function SourceBadges({ skill }: { skill: Skill }) {
  const gh = !!skill.githubUrl;
  const md = !!skill.mdFileUrl;
  if (!gh && !md) return null;
  return (
    <span className="source-badges">
      {gh && (
        <span className="badge" title="Available on GitHub">
          <GitHubIcon size={12} /> GitHub
        </span>
      )}
      {md && (
        <span className="badge" title="Direct .md download">
          <FileIcon size={12} /> MD
        </span>
      )}
    </span>
  );
}
