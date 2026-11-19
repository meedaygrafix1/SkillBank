import fs from "node:fs";
import path from "node:path";
import { lexer } from "marked";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read GitHub's full About description rather than its truncated social preview. */
export function descriptionFromGithubHtml(html) {
  const match = /"sidebarAbout(?:Data)?":\s*\{/.exec(html);
  if (match) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < html.length; index++) {
      const char = html[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        const about = JSON.parse(html.slice(start, index + 1));
        return typeof about.description === "string" ? about.description.trim() : "";
      }
    }
    throw new Error("GitHub's About data was incomplete");
  }
  if (/No description(?:, website, or topics| or website)? provided\./.test(html)) return "";
  throw new Error("GitHub's About description was not found in the page data");
}

function plainInline(tokens = []) {
  return tokens.map((token) => {
    if (token.type === "image" || token.type === "html") return "";
    if (token.tokens) return plainInline(token.tokens);
    return token.type === "text" ? token.raw : token.text ?? token.raw ?? "";
  }).join("");
}

async function readmeDescription(repoUrl) {
  const repoPath = new URL(repoUrl).pathname.replace(/\/$/, "");
  const sourceUrl = `https://github.com${repoPath}/blob/HEAD/README.md`;
  const response = await fetch(`https://raw.githubusercontent.com${repoPath}/HEAD/README.md`, {
    signal: AbortSignal.timeout(25_000),
  });
  if (response.status === 404) return { description: "", sourceUrl };
  if (!response.ok) throw new Error(`README returned HTTP ${response.status}`);
  const paragraphs = lexer(await response.text()).filter((token) => token.type === "paragraph");
  const description = paragraphs.map((token) => plainInline(token.tokens).replace(/\s+/g, " ").trim())
    .find((text) => text.length >= 40) ?? "";
  return { description, sourceUrl };
}

async function fetchDescription(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com" || parsed.pathname.split("/").filter(Boolean).length !== 2) {
    return { url, status: "error", error: "Expected a GitHub repository URL" };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "SkillBank-description-importer", Accept: "text/html" },
        signal: AbortSignal.timeout(25_000),
        redirect: "follow",
      });
      if (response.status === 404) return { url, status: "not_found", fetchedAt: new Date().toISOString() };
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
      let about;
      let aboutSource = response.url;
      try {
        about = descriptionFromGithubHtml(await response.text());
      } catch {
        // Empty repositories omit the usual About page data but still have API metadata.
        const apiUrl = `https://api.github.com/repos${new URL(response.url).pathname.replace(/\/$/, "")}`;
        const metadataResponse = await fetch(apiUrl, {
          headers: { "User-Agent": "SkillBank-description-importer", Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(25_000),
        });
        if (!metadataResponse.ok) throw new Error(`GitHub metadata returned HTTP ${metadataResponse.status}`);
        const metadata = await metadataResponse.json();
        if (!("description" in metadata)) throw new Error("GitHub metadata omitted the description field");
        about = metadata.description?.trim() || "";
        aboutSource = apiUrl;
      }
      const fallback = about ? undefined : await readmeDescription(response.url);
      const description = about || fallback?.description || "";
      return {
        url,
        resolvedUrl: response.url,
        fetchedAt: new Date().toISOString(),
        status: description ? "ok" : "no_description",
        sourceField: about ? "about" : "readme",
        sourceUrl: about ? aboutSource : fallback.sourceUrl,
        description,
      };
    } catch (error) {
      if (attempt === 2) return { url, status: "error", fetchedAt: new Date().toISOString(), error: error.message };
      await pause(2000 * (attempt + 1));
    }
  }
}

export async function fetchGithubDescriptions(urls, reportPath, { resume = false } = {}) {
  const previous = resume && fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8")).repositories : [];
  const cached = new Map(previous.filter((result) => result.status === "ok").map((result) => [result.url, {
    ...result,
    sourceField: result.sourceField ?? "about",
    sourceUrl: result.sourceUrl ?? result.resolvedUrl ?? result.url,
  }]));
  const results = urls.map((url) => cached.get(url));
  let next = 0;
  let completed = 0;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const saveReport = async () => {
    fs.writeFileSync(reportPath + ".tmp", JSON.stringify({
      source: "GitHub repository About descriptions, with introductory README paragraphs when About is empty",
      repositories: results.filter(Boolean),
    }, null, 2) + "\n");
    // Windows can briefly lock a file while an editor or indexer reads it.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(reportPath + ".tmp", reportPath);
        break;
      } catch (error) {
        if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
        await pause(100 * (attempt + 1));
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, urls.length) }, async () => {
    while (next < urls.length) {
      const index = next++;
      if (!results[index]) results[index] = await fetchDescription(urls[index]);
      completed++;
      if (completed % 10 === 0 || completed === urls.length) console.log(`  descriptions: checked ${completed}/${urls.length}`);
      await pause(200);
    }
  }));
  await saveReport();
  return results;
}
