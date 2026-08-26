// Visual results have to be visible.
//
// `.review/` is ignored, so anything written only there cannot be seen by anyone
// reading the repository. A screen or spike that reports a visual finding but
// leaves its images in an ignored directory is an unreported result. This check
// walks the tracked Markdown and fails when an image link is broken or points
// somewhere nobody else can read.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_ROOTS = [".review", ".metric-cache", "node_modules", "dist", ".vinext"];
const IMAGE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const LINKED_IMAGE = /(?<!!)\[[^\]]*\]\(([^)\s]+\.(?:png|jpg|jpeg|gif|webp|svg))\)/gi;

function trackedMarkdown() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: root, encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

const errors = [];
for (const file of trackedMarkdown()) {
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) continue;
  const markdown = readFileSync(absolute, "utf8");
  const references = new Set();
  for (const pattern of [IMAGE, LINKED_IMAGE]) {
    pattern.lastIndex = 0;
    for (const match of markdown.matchAll(pattern)) references.add(match[1]);
  }
  for (const reference of references) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("#")) continue;
    const target = resolve(dirname(absolute), decodeURIComponent(reference));
    const fromRoot = posix.normalize(relative(root, target).split("\\").join("/"));
    const ignored = IGNORED_ROOTS.find((value) =>
      fromRoot === value || fromRoot.startsWith(`${value}/`));
    if (ignored !== undefined) {
      errors.push(`${file}: image ${reference} lives under ignored ${ignored}/, `
        + "so no reader can see it -- publish it to experiments/progress/screens/");
      continue;
    }
    if (!existsSync(target)) {
      errors.push(`${file}: image ${reference} does not exist`);
      continue;
    }
    if (statSync(target).size === 0) errors.push(`${file}: image ${reference} is empty`);
  }
}

if (errors.length > 0) {
  console.error(`visual evidence check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`visual evidence: every image link in ${trackedMarkdown().length} tracked documents resolves to a readable file`);
