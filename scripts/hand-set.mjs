/**
 * **The scan that holds the registry of numbers set by hand** (`handSet`, `src/core/hand-set.ts`).
 * The code that prices a fight may write a number of its own only as a registry entry, or as a
 * field a player sets (`number`, `src/parts/fields.ts`). This reads the parsed source of that
 * code and names every number written any other way.
 *
 * What it lets through, because code cannot be written without them:
 *
 * - 0, 1 and 2, which count, halve and double. But never as a constant of their own: a line
 *   such as `const RATE = 1` gives a number a name, and a named number is one set by hand.
 * - a position in a list, such as the 3 in `x[3]`, and a table that numbers such positions:
 *   one whose values count up from 0 by one, such as `{ range: 0, closing: 1, across: 2, ahead: 3 }`.
 * - a number in a type, such as the 3 in `0 | 1 | 3`.
 *
 * What it cannot see: a guess of 0, 1 or 2 written into an expression with no name, and a guess
 * that is not a number literal (`Infinity`, a posture's name). Those are found by reading the code.
 */
import fs from "node:fs";
import path from "node:path";
import { parseSource, visitSyntax } from "./syntax.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The folders and the file the Mind prices a fight in: the code the scan reads. */
export const PRICING = Object.freeze(["src/minds/option/", "src/skills/framework/profile/", "src/skills/framework/form.ts"]);

/** The numbers code may write anywhere but as a constant of their own. */
const PLAIN = new Set([0, 1, 2]);

/** The calls a number may be written inside: a registry entry, and a field a player sets. */
const DECLARING = new Set(["handSet", "number"]);

/** Every TypeScript file of the pricing code under `root`, each as its path from the root and its source. */
export function pricingSources(root = ROOT) {
  const files = [];
  const walk = (at) => {
    const full = path.join(root, at);
    if (!fs.statSync(full).isDirectory()) { if (at.endsWith(".ts")) files.push([at, fs.readFileSync(full, "utf8")]); return; }
    for (const name of fs.readdirSync(full).sort()) walk(path.posix.join(at, name));
  };
  for (const one of PRICING) walk(one.replace(/\/$/, ""));
  return files;
}

/** Whether `node` is a number literal, or one with a minus sign before it. */
const isNumber = (node) => node?.type === "NumericLiteral" || node?.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "NumericLiteral";

/**
 * **What the scan finds in `files`** (each a path and its source): the registry entries the
 * source declares (`entries`, each with its file and its name), and what breaks the rule
 * (`faults`, each a sentence naming the file and the line).
 */
export function handSetScan(files) {
  const entries = [], faults = [];
  for (const [file, source] of files) {
    const program = parseSource(file, source);
    // First the places a number may be written: inside a declaring call, as a position in a list, or in a type.
    const allowed = [];
    visitSyntax(program, (node, parent) => {
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && DECLARING.has(node.callee.name)) allowed.push(node);
      if ((node.type === "MemberExpression" || node.type === "OptionalMemberExpression") && node.computed) allowed.push(node.property);
      if (node.type === "TSLiteralType") allowed.push(node);
      if (node.type === "ObjectExpression" && node.properties.length > 0 && node.properties.every((one, at) => one.type === "ObjectProperty" && one.value.type === "NumericLiteral" && one.value.value === at)) allowed.push(node);
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "handSet") {
        const named = node.arguments[0]?.properties?.find((one) => one.key?.name === "name")?.value;
        const constant = parent?.type === "VariableDeclarator" && parent.id.type === "Identifier" ? parent.id.name : null;
        if (named?.type !== "StringLiteral" || named.value !== constant) faults.push(`${file}:${node.loc.start.line} a registry entry is named as the constant it makes`);
        else entries.push({ file, name: constant });
      }
    });
    const inside = (node) => allowed.some((one) => node.start >= one.start && node.end <= one.end);
    visitSyntax(program, (node, parent) => {
      if (node.type === "VariableDeclarator" && parent.kind === "const" && isNumber(node.init)) {
        faults.push(`${file}:${node.loc.start.line} ${node.id.name ?? "a constant"} is a number set by hand, outside the registry`);
        // The constant is named once: its number is not named again below.
        allowed.push(node.init);
      } else if (node.type === "NumericLiteral" && !PLAIN.has(node.value) && !inside(node))
        faults.push(`${file}:${node.loc.start.line} ${node.extra.raw} is written outside the registry`);
    });
  }
  const met = new Set();
  for (const { file, name } of entries) {
    if (met.has(name)) faults.push(`${file} ${name} is a registry entry's name twice`);
    met.add(name);
  }
  return { entries, faults };
}
