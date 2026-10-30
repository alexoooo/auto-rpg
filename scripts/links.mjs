/**
 * **Every static import of a script names what exists** (`brokenLinks`): a relative module that is
 * there, and, for each name it takes, an export of that module (followed through `export *`). Read
 * from the syntax alone, so it is fast over every research script and every script; `npm run check`
 * reads only `src/`, so nothing else holds research and scripts to the code they run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

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
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const bound = (name) => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bound(element.name);
  };
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    const exported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isExportAssignment(statement)) names.add("default");
    else if (ts.isExportDeclaration(statement)) {
      const from = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? target(file, statement.moduleSpecifier.text) : null;
      if (!statement.exportClause) { if (from) for (const name of exportsOf(from, read, seen)) names.add(name); }
      else if (ts.isNamespaceExport(statement.exportClause)) names.add(statement.exportClause.name.text);
      else for (const element of statement.exportClause.elements) names.add(element.name.text);
    } else if (exported && isDefault) names.add("default");
    else if (exported && ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bound(declaration.name);
    else if (exported && "name" in statement && statement.name && ts.isIdentifier(statement.name)) names.add(statement.name.text);
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
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
    for (const statement of source.statements) {
      const isImport = ts.isImportDeclaration(statement), isReexport = ts.isExportDeclaration(statement);
      if ((!isImport && !isReexport) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const module = target(file, statement.moduleSpecifier.text);
      if (module === null) continue;
      if (read(module) === null) { broken.push(`${file} imports ${module}, which does not exist`); continue; }
      if (!CODE.test(module)) continue;
      const wanted = [];
      if (isImport && statement.importClause) {
        if (statement.importClause.name) wanted.push("default");
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) wanted.push((element.propertyName ?? element.name).text);
      }
      if (isReexport && statement.exportClause && ts.isNamedExports(statement.exportClause))
        for (const element of statement.exportClause.elements) wanted.push((element.propertyName ?? element.name).text);
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
