import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { validateCandidate } from "../src/golem/research-candidates.ts";
import { ROOT } from "./fingerprint.mjs";

/**
 * The real game document with its entry replaced by one that registers the candidates and then
 * imports the entry. Leaving the arena leaves the preview; its Main menu opens the real game,
 * whatever the address bar says.
 */
export function previewHtml(template, candidates) {
  for (const candidate of candidates) validateCandidate(candidate);
  const entry = '<script type="module" src="/src/app.ts"></script>';
  if (template.split(entry).length !== 2) throw new Error("arena template must have exactly one known module entry");
  const data = JSON.stringify(candidates).replaceAll("<", "\\u003c");
  return template.replace(entry, `<script type="module">
    import { POLICIES } from '/src/mind.ts';
    import { candidateMind } from '/src/golem/research-candidates.ts';
    import { GOLEM_CONTROL_SURFACE } from '/src/control-surfaces.ts';
    const candidates = ${data};
    for (const candidate of candidates) {
      if (!POLICIES.some(policy => policy.name === candidate.name)) POLICIES.push({
        name: candidate.name, label: candidate.label, surface: GOLEM_CONTROL_SURFACE,
        create: (seed = (Math.random() * 0x100000000) >>> 0) => candidateMind(candidate, seed),
      });
    }
    await import('/src/app.ts');
    document.title = 'AI candidate review — Golem Duel';
  </script>`);
}

export function writePreview(directory, manifest) {
  const relativeDirectory = relative(ROOT, directory).replaceAll("\\", "/");
  if (relativeDirectory.startsWith("..") || relativeDirectory.includes(":")) throw new Error("preview directory must be inside the repository");
  const confirmation = JSON.parse(readFileSync(join(directory, "confirmation.json"), "utf8"));
  if (confirmation.status !== "complete" || confirmation.fingerprint !== manifest.fingerprint) {
    throw new Error("preview requires current, completed confirmation");
  }
  if (!confirmation.eligible.length) throw new Error("no statistically eligible candidates to review");
  writeFileSync(join(directory, "preview.html"), previewHtml(readFileSync(join(ROOT, "index.html"), "utf8"), confirmation.eligible));
  return `http://localhost:5180/${relativeDirectory.split("/").map(encodeURIComponent).join("/")}/preview.html?play=arena`;
}
