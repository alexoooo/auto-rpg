/**
 * **Every static import of a script names what exists** (`brokenLinks`): a relative module that is
 * there, and, for each name it takes, an export of that module (followed through `export *`). Read
 * from the syntax alone, so it is fast over every research script and every script; `npm run check`
 * reads only `src/`, so nothing else holds research and scripts to the code they run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { bindingNames, parseSource } from "./syntax.mjs";

const ROOT = path.resolve(import.meta.dirname, "..").replaceAll("\\", "/");
const CODE = /\.(?:ts|mts|mjs|js)$/;

/** The relative module `specifier` names from `file`, repository-relative; null for a package. */
function target(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.replace(/\?.*$/, "")));
}

/** Every name `file`'s syntax exports, `export *` followed; `read` gives a file's text, or null where there is none. */
function exportsOf(file, read, seen = new Map()) {
  if (seen.has(file)) return seen.get(file);
  const names = new Set();
  seen.set(file, names);
  const text = read(file);
  if (text === null || !CODE.test(file)) return names;
  const source = parseSource(file, text);
  for (const statement of source.body) {
    if (statement.type === "ExportDefaultDeclaration" || statement.type === "TSExportAssignment") names.add("default");
    else if (statement.type === "ExportAllDeclaration") {
      const from = target(file, statement.source.value);
      if (from) for (const name of exportsOf(from, read, seen)) names.add(name);
    } else if (statement.type === "ExportNamedDeclaration") {
      for (const element of statement.specifiers) names.add(element.exported.name ?? element.exported.value);
      const declaration = statement.declaration;
      if (declaration?.type === "VariableDeclaration") {
        for (const variable of declaration.declarations) for (const name of bindingNames(variable.id)) names.add(name);
      } else if (declaration?.id?.type === "Identifier") names.add(declaration.id.name);
    }
  }
  return names;
}

/**
 * **What `files` import that is not there**: each a sentence naming the importing file, the module,
 * and the missing module or name. `read` gives a repository-relative file's text, or null where
 * there is none.
 */
export function brokenLinks(files, read) {
  const broken = [];
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    const source = parseSource(file, text);
    for (const statement of source.body) {
      const isImport = statement.type === "ImportDeclaration", isReexport = ["ExportNamedDeclaration", "ExportAllDeclaration"].includes(statement.type);
      if ((!isImport && !isReexport) || !statement.source) continue;
      const module = target(file, statement.source.value);
      if (module === null) continue;
      if (read(module) === null) { broken.push(`${file} imports ${module}, which does not exist`); continue; }
      if (!CODE.test(module)) continue;
      const wanted = [];
      for (const element of statement.specifiers ?? []) {
        if (isImport && element.type === "ImportDefaultSpecifier") wanted.push("default");
        else if (isImport && element.type === "ImportSpecifier") wanted.push(element.imported.name ?? element.imported.value);
        else if (isReexport && element.type === "ExportSpecifier") wanted.push(element.local.name ?? element.local.value);
      }
      const has = exportsOf(module, read);
      for (const name of wanted) if (!has.has(name)) broken.push(`${file} imports ${name} from ${module}, which does not export it`);
    }
  }
  return broken;
}

/** The repository's research scripts and scripts, tracked or new, and its files as they are on disk. */
export function repositoryLinks() {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "research", "scripts"], { cwd: ROOT, encoding: "utf8" });
  const files = listed.split("\n").filter((file) => CODE.test(file));
  const read = (file) => statSync(`${ROOT}/${file}`, { throwIfNoEntry: false })?.isFile() ? readFileSync(`${ROOT}/${file}`, "utf8") : null;
  return brokenLinks(files, read);
}
