import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { bySlug, relatedSkills } from "../lib/data";
import { downloadFile, formatDate, formatStars, relativeDate } from "../lib/format";
import { ArrowLeftIcon, DownloadIcon, GitHubIcon, StarIcon } from "../components/Icons";
import { CopyButton } from "../components/CopyButton";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { SkillCard } from "../components/SkillCard";
import { NotFound } from "./NotFound";

export function SkillDetail() {
  const { slug = "" } = useParams();
  const skill = bySlug.get(slug);
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    document.title = skill ? `${skill.name} · Skill Bank` : "Not found · Skill Bank";
  }, [skill]);

  if (!skill) return <NotFound />;

  const related = relatedSkills(skill);
  const previewUrl = skill.mdFileUrl ?? skill.previewUrl;
  const showDescription = !!skill.description && skill.description.trim() !== (skill.summary ?? "").trim();

  const goBack = () => {
    // Return to the browse page with its filters intact if we came from inside the app.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/");
  };

  const onDownload = async () => {
    setDownloading(true);
    await downloadFile(skill.mdFileUrl!, `${skill.slug}.md`);
    setDownloading(false);
  };

  return (
    <div className="container detail">
      <button type="button" className="back-link" onClick={goBack}>
        <ArrowLeftIcon size={16} /> All skills
      </button>

      <header className="detail-head">
        <div className="detail-titles">
          <Link to={`/?cat=${encodeURIComponent(skill.category)}`} className="category-tag">
            {skill.category}
          </Link>
          <h1>{skill.name}</h1>
          {skill.summary && <p className="lead">{skill.summary}</p>}
          <ul className="meta">
            {skill.author && (
              <li>
                by <Link to={`/?q=${encodeURIComponent(skill.author)}`}>{skill.author}</Link>
                {skill.repoName && <span className="muted"> / {skill.repoName}</span>}
              </li>
            )}
            {typeof skill.stars === "number" && (
              <li aria-label={`${skill.stars} GitHub stars`}>
                <StarIcon size={14} /> {formatStars(skill.stars)}
              </li>
            )}
            {skill.updatedAt && (
              <li>
                Updated{" "}
                <time dateTime={skill.updatedAt} title={formatDate(skill.updatedAt)}>
                  {relativeDate(skill.updatedAt)}
                </time>
              </li>
            )}
          </ul>
        </div>

        {(skill.githubUrl || skill.mdFileUrl) && (
          <div className="actions">
            {skill.githubUrl && (
              <a className="btn primary" href={skill.githubUrl} target="_blank" rel="noopener noreferrer">
                <GitHubIcon size={16} /> View on GitHub
              </a>
            )}
            {skill.mdFileUrl && (
              <button type="button" className="btn" disabled={downloading} onClick={onDownload}>
                <DownloadIcon size={16} /> {downloading ? "Downloading…" : "Download .md"}
              </button>
            )}
          </div>
        )}
      </header>

      {skill.installCommand && (
        <section className="section" aria-labelledby="install-h">
          <h2 id="install-h" className="section-title">Install</h2>
          <div className="snippet">
            <code>{skill.installCommand}</code>
            <CopyButton text={skill.installCommand} label="Copy install command" />
          </div>
        </section>
      )}

      {showDescription && (
        <section className="section" aria-labelledby="desc-h">
          <h2 id="desc-h" className="section-title">Description</h2>
          <div className="prose">
            {skill.description!.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}

      {skill.tags.length > 0 && (
        <section className="section" aria-labelledby="tags-h">
          <h2 id="tags-h" className="section-title">Tags</h2>
          <ul className="tags">
            {skill.tags.map((t) => (
              <li key={t}>
                <Link to={`/?q=${encodeURIComponent(t)}`} className="tag">
                  #{t}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {previewUrl && (
        <section className="section" aria-labelledby="preview-h">
          <h2 id="preview-h" className="section-title">SKILL.md</h2>
          <MarkdownPreview url={previewUrl} githubUrl={skill.githubUrl} />
        </section>
      )}

      {related.length > 0 && (
        <section className="section" aria-labelledby="related-h">
          <div className="section-row">
            <h2 id="related-h" className="section-title">More in {skill.category}</h2>
            <Link to={`/?cat=${encodeURIComponent(skill.category)}`} className="link-btn">
              See all
            </Link>
          </div>
          <div className="grid">
            {related.map((s) => (
              <SkillCard key={s.id} skill={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
