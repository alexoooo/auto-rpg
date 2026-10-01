/**
 * The tuned constants of a source file, and what each one's comment cites: the reading behind the
 * guard on them (`tests/constants.test.mjs`).
 *
 * A tuned constant is a module-scope `const` whose initializer writes a number that is not one of
 * `PLAIN`, anywhere in it: alone, in arithmetic, in a record or a list, or handed to a call. Two
 * places are not read: a function's body, which runs later and is not the constant's value, and a
 * `sourced()` or `derive()` call, whose number names its own source.
 */
import ts from "typescript";

/** The numbers that claim nothing: an empty count, a unit, a pair, a sign, a half. */
const PLAIN = new Set([0, 1, 2, -1, 0.5]);

/** The calls whose numbers carry their own source (`src/core/spec/quantity.ts`). */
const SOURCED = new Set(["sourced", "derive"]);

/** The numbers `node` writes, as the rule above reads an initializer. */
function numbersOf(node) {
  if (ts.isNumericLiteral(node)) return [Number(node.text)];
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return [-Number(node.operand.text)];
  }
  if (ts.isFunctionLike(node)) return [];
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && SOURCED.has(node.expression.text)) return [];
  const found = [];
  ts.forEachChild(node, (child) => { found.push(...numbersOf(child)); });
  return found;
}

/** `node` without what wraps a literal: `as`, parentheses, `Object.freeze`. */
const unwrapped = (node) =>
  ts.isAsExpression(node) || ts.isParenthesizedExpression(node) ? unwrapped(node.expression)
    : ts.isCallExpression(node) && node.expression.getText() === "Object.freeze" && node.arguments.length ? unwrapped(node.arguments[0])
      : node;

/** Whether `node` is a list of rows, each row a list of whole numbers and nothing else. */
const isIndexTable = (node) => {
  const table = unwrapped(node);
  const isRow = (row) => ts.isArrayLiteralExpression(row) && row.elements.length > 0
    && row.elements.every((element) => ts.isNumericLiteral(element) && Number.isInteger(Number(element.text)));
  return ts.isArrayLiteralExpression(table) && table.elements.length > 0 && table.elements.every((row) => isRow(unwrapped(row)));
};

/**
 * What is not a tuned constant though it writes a number, each a rule and not a name:
 * - a table of the units' definitions, typed as a record over `Unit`: a definition claims nothing;
 * - an index table, rows of whole numbers: it names places, not sizes. One row alone is a list of
 *   values, and is read.
 */
const EXEMPT = [
  (declaration) => /\bRecord<Unit,/.test(declaration.type?.getText() ?? ""),
  (declaration) => isIndexTable(declaration.initializer),
];

/** The comment block that sits directly on `statement`: every comment before it with no blank line between. */
function commentOn(statement, text) {
  const ranges = ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? [];
  const kept = [];
  let next = statement.getStart();
  for (const range of [...ranges].reverse()) {
    if ((text.slice(range.end, next).match(/\n/g) ?? []).length > 1) break;
    kept.unshift(text.slice(range.pos, range.end));
    next = range.pos;
  }
  return kept.join("\n");
}

/** Every tuned constant at the top of `text`, a TypeScript module, with the comment on its statement. */
export function tunedConstants(text, fileName = "file.ts") {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const found = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
      if (!numbersOf(declaration.initializer).some((n) => !PLAIN.has(n))) continue;
      if (EXEMPT.some((exempt) => exempt(declaration))) continue;
      found.push({ name: declaration.name.text, comment: commentOn(statement, text) });
    }
  }
  return found;
}

/** A record's section cited in a comment: a Markdown file under the references or the art, and an anchor. */
const CITED = /docs\/(?:reference|art)\/[\w-]+\.md#[\w-]+/g;
/** What a comment says of a number that is the solver's or the arithmetic's, and so has no source to cite. */
const NUMERIC = /numeric setting|solver conditioning/i;

/**
 * Why `constant`'s comment does not say where its value came from, or null when it does. It must
 * cite a section of a record that exists and names the constant in backticks, or a key of
 * `sources`, or say the number is a numeric setting or solver conditioning. `sectionOf(record)` is
 * the cited section's text, or undefined where the file or the anchor is missing.
 */
export function sourceFault({ name, comment }, { sources, sectionOf }) {
  if (NUMERIC.test(comment)) return null;
  if (sources.some((key) => new RegExp(`(?<![\\w-])${key}(?![\\w-])`).test(comment))) return null;
  const cited = comment.match(CITED) ?? [];
  if (!cited.length) return "names no source";
  const faults = [];
  for (const record of cited) {
    const section = sectionOf(record);
    if (section === undefined) faults.push(`cites ${record}, which does not exist`);
    else if (!new RegExp(`\`${name}[\`.\\[(]`).test(section)) faults.push(`cites ${record}, which does not name \`${name}\``);
    else return null;
  }
  return faults.join("; ");
}

/**
 * What is wrong between the constants that fail (`failing`, as `"path NAME"`) and the list of those
 * allowed to for now (`notYet`): a failure the list does not hold, and an entry that passes or names
 * no constant, so the list can only shrink.
 */
export function ledgerFaults(failing, notYet) {
  const listed = new Set(notYet);
  return [
    ...[...failing.keys()].filter((key) => !listed.has(key)).map((key) => `${key} ${failing.get(key)}`),
    ...notYet.filter((key) => !failing.has(key)).map((key) => `${key} is listed as not yet sourced, and it is sourced or gone`),
  ];
}
