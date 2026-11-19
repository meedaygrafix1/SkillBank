import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const folder = path.resolve("public/fonts");
const url = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
const response = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
  signal: AbortSignal.timeout(25_000),
});
if (!response.ok) throw new Error(`Font stylesheet returned ${response.status}`);
const css = await response.text();
const faces = [...css.matchAll(/\/\* (latin(?:-ext)?) \*\/\s*(@font-face\s*\{[^}]+\})/g)];
if (!faces.length) throw new Error("No Latin font faces in the font stylesheet");
await fs.mkdir(folder, { recursive: true });
const files = new Map();
const styles = [];
for (const [, subset, face] of faces) {
  const source = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(face)?.[1];
  if (!source) throw new Error("Missing font URL");
  if (!files.has(source)) {
    const family = face.includes("JetBrains Mono") ? "jetbrains-mono" : "inter";
    const name = `${family}-${subset}-${crypto.createHash("sha256").update(source).digest("hex").slice(0, 8)}.woff2`;
    const font = await fetch(source, { signal: AbortSignal.timeout(25_000) });
    if (!font.ok) throw new Error(`Font file returned ${font.status}`);
    await fs.writeFile(path.join(folder, name), Buffer.from(await font.arrayBuffer()));
    files.set(source, name);
  }
  styles.push(`/* ${subset} */\n${face.replace(source, files.get(source))}`);
}
for (const family of ["inter", "jetbrainsmono"]) {
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`, {
    signal: AbortSignal.timeout(25_000),
  });
  if (!license.ok) throw new Error(`Font license returned ${license.status}`);
  await fs.writeFile(path.join(folder, `LICENSE-${family}.txt`), await license.text());
}
await fs.writeFile(path.join(folder, "fonts.css"), styles.join("\n\n") + "\n");
console.log(`Saved ${files.size} local font files, their stylesheet, and licenses.`);
