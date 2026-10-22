/** Hash the actual runtime source graph, its data and the locked/vendored engine for a search stage. */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

export async function risingImplementation(entries = ["src/evaluation/rising.ts", "research/rising-search-worker.mjs"]) {
  const files = new Map();
  const collect = async file => {
    const path = resolve(file); if (files.has(path)) return;
    const bytes = await readFile(path); files.set(path, bytes);
    if (!/\.(ts|mjs|js)$/.test(path)) return;
    const source = path.endsWith(".ts") ? ts.transpileModule(bytes.toString(), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext } }).outputText : bytes.toString();
    const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), imports = [];
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(syntax);
    for (const imported of imports) if (imported.startsWith(".")) await collect(resolve(dirname(path), imported));
  };
  for (const file of ["package-lock.json", ...entries]) await collect(file);
  const vendor = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await vendor(path);
      else if (/\.(tgz|wasm)$/.test(path)) await collect(path);
    }
  };
  await vendor("vendor/rapier");
  return Object.fromEntries([...files].map(([file, bytes]) => [relative(process.cwd(), file).replaceAll("\\", "/"), createHash("sha256").update(bytes).digest("hex")]).sort(([a], [b]) => a.localeCompare(b)));
}
