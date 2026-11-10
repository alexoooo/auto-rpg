/**
 * **What a branch changes, for the minds that compete**: one entrant's own files, or the toolkit
 * every mind is built on, never both, so that one agent's change never moves another's Mind
 * unseen.
 *
 *   node scripts/entrant-check.mjs [--base main]
 *
 * It reads every file changed since the branch left `--base` (committed, staged, unstaged and
 * new) and names the change:
 * - **entrant `<name>`**: only that entrant's own files (`entrantOf`) and its lines in the registries
 *   (`REGISTRIES`: the import of its manifest and its name in `ENTRANTS`);
 * - **toolkit**: no entrant's files; the fingerprint (`scripts/fingerprint.mjs`) names the minds
 *   it moves, a case each;
 * - **mixed**: anything else, refused with exit code 1, and what to split.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { generate } from "@babel/generator";
import { parseSource } from "./syntax.mjs";

/** The registry an entrant is a line in, with its list's line: the game's entrants. */
const REGISTRIES = Object.freeze({ "src/app/entrants.ts": /^export const ENTRANTS\b/ });

/**
 * The entrant `path` belongs to, or null: its folder (`src/entrants/<name>/`), its learned or
 * authored data (`assets/entrants/<name>/`) and its own test, if it has one
 * (`tests/entrants/<name>/`, `research/entrants/<name>/` and `scripts/entrants/<name>/`).
 */
export function entrantOf(path) {
  const found = /^src\/entrants\/([^/]+)\//.exec(path) ?? /^assets\/entrants\/([^/]+)\//.exec(path)
    ?? /^(?:tests|research|scripts)\/entrants\/([^/]+)\//.exec(path);
  return found ? found[1] : null;
}

/** The registry with just this entrant removed; every other registration and statement must agree. */
function otherRegistrations(text, name) {
  const source = parseSource("entrants.ts", text), own = new Set();
  for (const statement of source.body) if (statement.type === "ImportDeclaration" && statement.source.value === `../entrants/${name}/index.ts`) {
    for (const binding of statement.specifiers) if (binding.type === "ImportSpecifier") own.add(binding.local.name);
  }
  const rest = [];
  for (const statement of source.body) {
    if (statement.type === "ImportDeclaration" && statement.source.value === `../entrants/${name}/index.ts`) continue;
    const variable = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (variable?.type === "VariableDeclaration" && variable.declarations.some(d => d.id.type === "Identifier" && d.id.name === "ENTRANTS")) {
      if (variable.declarations.length !== 1) return null;
      const array = variable.declarations[0].init;
      if (array?.type !== "ArrayExpression") return null;
      if (array.elements.filter(e => e?.type === "Identifier" && own.has(e.name)).length > 1) return null;
      array.elements = array.elements.filter(e => e?.type !== "Identifier" || !own.has(e.name));
    }
    rest.push(generate(statement, { comments: false }).code);
  }
  return rest.join("\n");
}

/**
 * What `paths` change (`{ kind: "entrant", name }`, `{ kind: "toolkit" }` or `{ kind: "mixed",
 * why }`), given the registries' changed lines (`registry`, each added or taken line's text).
 */
export function changeOf(paths, registry = { before: "", after: "" }) {
  const names = new Set(paths.map(entrantOf).filter((name) => name !== null));
  const rest = paths.filter((path) => entrantOf(path) === null);
  if (names.size === 0) return { kind: "toolkit" };
  if (names.size > 1) return { kind: "mixed", why: `entrants ${[...names].sort().join(", ")} in one change: one an entrant` };
  const [name] = names, toolkit = rest.filter((path) => !Object.hasOwn(REGISTRIES, path));
  if (toolkit.length > 0) return { kind: "mixed", why: `entrant ${name} with toolkit files (${toolkit.join(", ")}): land the toolkit change on its own first, `
    + "and where a toolkit change must edit an entrant to keep it building, land that on its own and name the entrant in its message" };
  const before = otherRegistrations(registry.before, name), after = otherRegistrations(registry.after, name);
  if (before === null || after === null || before !== after) return { kind: "mixed", why: `entrant ${name} changes another registry entry or statement` };
  return { kind: "entrant", name };
}

function main() {
  const { values } = parseArgs({ options: { base: { type: "string", default: "main" } } });
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const from = git("merge-base", values.base, "HEAD").trim();
  const paths = [...new Set([...git("diff", "--name-only", from).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")]
    .map((path) => path.trim()).filter(Boolean))].sort();
  const registryFile = Object.keys(REGISTRIES).find(file => paths.includes(file));
  const registry = registryFile ? { before: git("show", `${from}:${registryFile}`), after: readFileSync(registryFile, "utf8") } : undefined;
  const change = changeOf(paths, registry);
  console.log(`${paths.length} files changed since ${values.base} (${from.slice(0, 8)})`);
  switch (change.kind) {
    case "entrant": console.log(`entrant ${change.name}: its own files and its registry lines`); break;
    case "toolkit": console.log("toolkit: read the fingerprint against the base to see which minds it moves"); break;
    case "mixed": console.log(`mixed: ${change.why}`); process.exitCode = 1; break;
    default: { const never = change; throw new Error(`unknown change ${never}`); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
