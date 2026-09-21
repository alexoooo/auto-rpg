import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { digest } from "./schedule.mjs";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
// Cache parsing, never source contents used for identity. Every call still reads every
// dependency and resolves imports again, so same-size edits and restored timestamps count.
const parsedImports = new Map();
/** Follow runtime imports after stripping types: cosmetic UI changes do not stale a league. */
export function fingerprint(root = ROOT) {
  const files = new Map();
  function visit(path) {
    const key = relative(root, path).replaceAll("\\", "/");
    if (files.has(key)) return;
    const source = readFileSync(path, "utf8");
    // Published parameters have their own per-policy version. Adding a policy must not
    // invalidate measurements of unchanged policies or the simulator they all share.
    files.set(key, ["src/golem/researched-variants.json", "src/golem/researched-lab.json"].includes(key) ? "per-policy-versioned" : source);
    if (!/\.(ts|mjs|js)$/.test(path)) return;
    let parsed = parsedImports.get(path);
    if (parsed?.source !== source) {
      const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext } }).outputText;
      parsed = { source, imports: ts.preProcessFile(code).importedFiles };
      parsedImports.set(path, parsed);
    }
    for (const { fileName } of parsed.imports) {
      if (!fileName.startsWith(".")) continue;
      const base = resolve(dirname(path), fileName.split("?")[0]);
      const resolved = [base, `${base}.ts`, `${base}.mjs`, `${base}.json`].find(existsSync);
      if (!resolved) throw new Error(`unresolved fingerprint dependency ${fileName} from ${key}`);
      visit(resolved);
    }
  }
  for (const entry of ["tests/harness/bout-runner.mjs", "src/golem/roster.ts", "src/golem/research-candidates.ts",
    "research/worker.mjs", "package-lock.json"]) visit(resolve(root, entry));
  return { hash: digest(Object.fromEntries([...files.entries()].sort())), files: [...files.keys()].sort() };
}
