/**
 * Which exports nothing imports, read through the checker (`program.mjs`): the guard's reading,
 * apart from the test that asserts it so that a script can list what the test would refuse.
 */
import ts from "typescript";
import { sourcesUnder } from "./program.mjs";

/** The run outputs are not the repository's (`.gitignore`), so what they import keeps nothing exported. */
const notRuns = (file) => file === "research/runs";

/** Every file that may import from `src/`, and `src/` itself. */
export const repositoryFiles = () => [
  ...sourcesUnder("src", ".ts"), ...sourcesUnder("tests", ".mjs"), ...sourcesUnder("research", ".mjs", notRuns),
  ...sourcesUnder("scripts", ".mjs"), "vite.config.ts",
];

/**
 * The exports of the modules `judged` picks that nothing in the program imports, as `"file name"`.
 * An import marks the export it names and, through a re-export, every export on the way to the
 * declaration; a re-export alone marks nothing, so one that nobody imports is reported with what it
 * carries. The shapes it reads:
 * - `import { a } from` and `import a from`;
 * - a property of a module's namespace, however the namespace was come by: `import * as m`,
 *   `await import()`, or the argument of a `.then` on one;
 * - an object pattern over a module's namespace: `const { a } = await import()`, alone or inside
 *   the array pattern of a `Promise.all`;
 * - `import("./m").A` in a type.
 */
export function unusedExports({ checker, sources }, judged) {
  const used = new Set();
  /** Mark `symbol`'s declarations, and those of everything it is an alias for. */
  const mark = (symbol) => {
    for (let at = symbol, hops = 0; at && hops < 16; hops++) {
      for (const declaration of at.declarations ?? []) used.add(declaration);
      at = at.flags & ts.SymbolFlags.Alias ? checker.getImmediateAliasedSymbol(at) : undefined;
    }
  };
  /** The module whose namespace `node`'s type is, or undefined. */
  const namespaceOf = (node) => {
    const symbol = checker.getTypeAtLocation(node).symbol;
    return symbol && symbol.flags & ts.SymbolFlags.ValueModule && symbol.declarations?.some(ts.isSourceFile) ? symbol : undefined;
  };
  const member = (module, name) => { const symbol = checker.tryGetMemberInModuleExports(name, module); if (symbol) mark(symbol); };
  const visit = (node) => {
    if (ts.isImportSpecifier(node)) {
      mark(checker.getSymbolAtLocation(node.name));
    } else if (ts.isImportClause(node) && node.name) {
      mark(checker.getSymbolAtLocation(node.name));
    } else if (ts.isPropertyAccessExpression(node)) {
      const module = namespaceOf(node.expression);
      if (module) member(module, node.name.text);
    } else if (ts.isObjectBindingPattern(node)) {
      const module = namespaceOf(node);
      if (module) for (const element of node.elements) {
        const name = element.propertyName ?? element.name;
        if (ts.isIdentifier(name)) member(module, name.text);
      }
    } else if (ts.isImportTypeNode(node) && node.qualifier) {
      let first = node.qualifier;
      while (ts.isQualifiedName(first)) first = first.left;
      mark(checker.getSymbolAtLocation(first));
    }
    ts.forEachChild(node, visit);
  };
  const all = sources();
  for (const { source } of all) visit(source);

  const unused = [];
  for (const { source, file } of all) {
    if (!judged(file)) continue;
    const module = checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const exported of checker.getExportsOfModule(module)) {
      if (!(exported.declarations ?? []).some((declaration) => used.has(declaration))) unused.push(`${file} ${exported.name}`);
    }
  }
  return unused.sort();
}
