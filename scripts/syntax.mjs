/** Syntax shared by source boundaries, module links and build identity. */
import { createRequire } from "node:module";

let parser;

/** Parse JavaScript or TypeScript without loading a compiler or resolving its imports. */
export function parseSource(file, text) {
  parser ??= createRequire(import.meta.url)("@babel/parser");
  return parser.parse(text, { sourceFilename: file, sourceType: "module", attachComment: false,
    allowUndeclaredExports: true, plugins: /\.m?ts$/.test(file) ? [["typescript", { dts: /\.d\.m?ts$/.test(file) }]] : [] }).program;
}

/** Visit syntax nodes in source order, stopping at the first non-undefined result. */
export function visitSyntax(node, visitor, parent = null) {
  const result = visitor(node, parent);
  if (result !== undefined) return result;
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(key)) continue;
    for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child.type === "string") {
      const found = visitSyntax(child, visitor, node);
      if (found !== undefined) return found;
    }
  }
}

/** Names introduced by a declaration's identifier or destructuring pattern. */
export function bindingNames(pattern) {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier": return [pattern.name];
    case "ObjectPattern": return pattern.properties.flatMap(property => bindingNames(property.type === "RestElement" ? property.argument : property.value));
    case "ArrayPattern": return pattern.elements.flatMap(bindingNames);
    case "AssignmentPattern": return bindingNames(pattern.left);
    case "RestElement": return bindingNames(pattern.argument);
    case "TSParameterProperty": return bindingNames(pattern.parameter);
    default: return [];
  }
}

/** Every literal module reference, including type imports, dynamic imports and require calls. */
export function moduleImports(file, text) {
  const imports = [];
  visitSyntax(parseSource(file, text), node => {
    const source = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression", "TSImportType"].includes(node.type) ? node.source
      : node.type === "TSExternalModuleReference" ? node.expression
      : node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require" ? node.arguments[0] : null;
    if (source?.type === "StringLiteral") imports.push(source.value);
  });
  return imports;
}
