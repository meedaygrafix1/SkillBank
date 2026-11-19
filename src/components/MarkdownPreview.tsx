import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; html: string; meta: [string, string][] };

/** Split YAML frontmatter into simple key/value pairs (enough for SKILL.md's name/description). */
function splitFrontmatter(src: string): { meta: [string, string][]; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: [], body: src };
  const meta: [string, string][] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv && kv[2].trim()) meta.push([kv[1], kv[2].trim().replace(/^["']|["']$/g, "")]);
  }
  return { meta, body: src.slice(m[0].length) };
}

function render(md: string, fileUrl: string): string {
  const html = marked.parse(md, { async: false, gfm: true }) as string;
  const base = fileUrl.replace(/[^/]*$/, ""); // directory of the .md file
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    for (const attr of ["src", "href"]) {
      const v = node.getAttribute(attr);
      if (v && !/^(https?:|mailto:|#|data:)/i.test(v)) {
        try {
          node.setAttribute(attr, new URL(v, base).toString());
        } catch {
          node.removeAttribute(attr);
        }
      }
    }
    if (node.tagName === "A" && !node.getAttribute("href")?.startsWith("#")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
  });
  const clean = DOMPurify.sanitize(html);
  DOMPurify.removeHook("afterSanitizeAttributes");
  return clean;
}

export function MarkdownPreview({
  url,
  githubUrl,
  onLoaded,
}: {
  url: string;
  githubUrl?: string;
  /** Called with the raw file text once it has loaded and looks like a real file. */
  onLoaded?: (text: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((text) => {
        const { meta, body } = splitFrontmatter(text);
        if (!body.trim() && !meta.length) throw new Error("empty");
        setState({ status: "ok", html: render(body, url), meta });
        onLoadedRef.current?.(text);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [url]);

  if (state.status === "loading")
    return (
      <div className="md-skeleton" aria-busy="true" aria-label="Loading SKILL.md preview">
        <span />
        <span />
        <span />
        <span />
      </div>
    );

  if (state.status === "error")
    return (
      <p className="muted-box">
        Couldn't load a preview of this file.{" "}
        {githubUrl && (
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            View it on GitHub instead.
          </a>
        )}
      </p>
    );

  return (
    <div className="md-frame">
      {state.meta.length > 0 && (
        <dl className="frontmatter">
          {state.meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="markdown" dangerouslySetInnerHTML={{ __html: state.html }} />
    </div>
  );
}
