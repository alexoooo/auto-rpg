/**
 * **What a branch changes, for the minds that compete**: one entrant's own files, or the toolkit
 * every mind is built on, never both, so that one agent's change never moves another's Mind
 * unseen.
 *
 *   node scripts/entrant-check.mjs [--base main]
 *
 * It reads every file changed since the branch left `--base` (committed, staged, unstaged and
 * new) and names the change:
 * - **entrant `<name>`**: only that entrant's own files (`entrantOf`) and its line in the registry
 *   (`src/core/mind/controllers.ts`: the import of its folder and its name in `CONTROLLERS`);
 * - **toolkit**: no entrant's files; the fingerprint (`scripts/fingerprint.mjs`) names the minds
 *   it moves, a case each;
 * - **mixed**: anything else, refused with exit code 1, and what to split.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** The registry every mind is a line in. */
const REGISTRY = "src/core/mind/controllers.ts";

/**
 * The entrant `path` belongs to, or null: its folder (`src/core/entrants/<name>/`), its learned or
 * authored data (`assets/entrants/<name>/`) and its own test (`tests/entrant-<name>.test.mjs`).
 */
export function entrantOf(path) {
  const found = /^src\/core\/entrants\/([^/]+)\//.exec(path) ?? /^assets\/entrants\/([^/]+)\//.exec(path)
    ?? /^tests\/entrant-([^/]+)\.test\.mjs$/.exec(path);
  return found ? found[1] : null;
}

/** Whether `line`, added to or taken from the registry, is entrant `name`'s: its folder's import, or the list of minds. */
const registryLine = (line, name) => line.includes(`"../entrants/${name}/`) || /^export const CONTROLLERS\b/.test(line.trim());

/**
 * What `paths` change (`{ kind: "entrant", name }`, `{ kind: "toolkit" }` or `{ kind: "mixed",
 * why }`), given the registry's changed lines (`registry`, each added or taken line's text).
 */
export function changeOf(paths, registry = []) {
  const names = new Set(paths.map(entrantOf).filter((name) => name !== null));
  const rest = paths.filter((path) => entrantOf(path) === null);
  if (names.size === 0) return { kind: "toolkit" };
  if (names.size > 1) return { kind: "mixed", why: `entrants ${[...names].sort().join(", ")} in one change: one an entrant` };
  const [name] = names, toolkit = rest.filter((path) => path !== REGISTRY);
  if (toolkit.length > 0) return { kind: "mixed", why: `entrant ${name} with toolkit files (${toolkit.join(", ")}): land the toolkit change on its own first, `
    + "and where a toolkit change must edit an entrant to keep it building, land that on its own and name the entrant in its message" };
  const stray = registry.filter((line) => !registryLine(line, name));
  if (stray.length > 0) return { kind: "mixed", why: `entrant ${name} changes the registry beyond its own line: ${stray.join(" | ")}` };
  return { kind: "entrant", name };
}

function main() {
  const { values } = parseArgs({ options: { base: { type: "string", default: "main" } } });
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const from = git("merge-base", values.base, "HEAD").trim();
  const paths = [...new Set([...git("diff", "--name-only", from).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")]
    .map((path) => path.trim()).filter(Boolean))].sort();
  const registry = paths.includes(REGISTRY) ? git("diff", "--unified=0", from, "--", REGISTRY).split("\n")
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line)).map((line) => line.slice(1)) : [];
  const change = changeOf(paths, registry);
  console.log(`${paths.length} files changed since ${values.base} (${from.slice(0, 8)})`);
  switch (change.kind) {
    case "entrant": console.log(`entrant ${change.name}: its own files and its registry line`); break;
    case "toolkit": console.log("toolkit: read the fingerprint against the base to see which minds it moves"); break;
    case "mixed": console.log(`mixed: ${change.why}`); process.exitCode = 1; break;
    default: { const never = change; throw new Error(`unknown change ${never}`); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
