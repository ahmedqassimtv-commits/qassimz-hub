/**
 * Remove obsolete hashed bundles from app/ui/assets after a Vite build.
 *
 * The build keeps `emptyOutDir: false` on purpose (the folder also holds hand
 * written assets), so every build used to leave the previous index-*.js/css
 * behind forever. This prunes only files that match the bundle naming pattern
 * and are not referenced by the freshly written index.html.
 */
import { readFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = join(here, "..", "..", "app", "ui");
const assetsDir = join(uiDir, "assets");
const indexHtml = join(uiDir, "index.html");

if (!existsSync(assetsDir) || !existsSync(indexHtml)) {
  console.log("[prune-ui] nothing to do");
  process.exit(0);
}

// Assets can be referenced from index.html *or* from a JS bundle (lazy chunks
// and CSS-only dynamic imports such as the tour driver), so every JS file in
// the assets folder counts as a reference source.
let html = readFileSync(indexHtml, "utf8");
for (const name of readdirSync(assetsDir)) {
  if (name.endsWith(".js")) {
    try {
      html += readFileSync(join(assetsDir, name), "utf8");
    } catch {
      /* ignore unreadable chunk */
    }
  }
}
const pattern = /^(index|driver)(\.js)?-[A-Za-z0-9_-]+\.(js|css)$/;
let removed = 0;

for (const name of readdirSync(assetsDir)) {
  if (!pattern.test(name)) continue;
  if (html.includes(name)) continue;
  try {
    unlinkSync(join(assetsDir, name));
    removed += 1;
    console.log(`[prune-ui] removed ${name}`);
  } catch (err) {
    console.warn(`[prune-ui] could not remove ${name}: ${err.message}`);
  }
}
console.log(`[prune-ui] ${removed} obsolete bundle(s) removed`);
