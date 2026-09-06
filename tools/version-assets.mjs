// Keep all local module and stylesheet URLs in a release on the same cache generation.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter((item) => item.name !== "vendor").map((item) => (
    item.isDirectory() ? files(path.join(directory, item.name)) : path.join(directory, item.name)
  )))).flat();
}
for (const filename of ["index.html", "tokens.css", "service-worker.js", ...await files(path.join(root, "js"))]) {
  const absolute = path.resolve(root, filename);
  let source = await readFile(absolute, "utf8");
  source = source.replace(/(["'])(\.{1,2}\/[^"'\s]+\.(?:js|css))(?:\?v=[^"']*)?\1/g, (match, quote, asset) => (
    asset.endsWith("/service-worker.js") ? match : `${quote}${asset}?v=${version}${quote}`
  ));
  if (absolute === path.join(root, "service-worker.js")) source = source.replace(/celestiframe-shell-[^"\s]+/, `celestiframe-shell-v${version}`);
  await writeFile(absolute, source);
}
console.log(`Local assets aligned to ${version}`);
