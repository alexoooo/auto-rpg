/**
 * No module under `src/` exports a name that no other file imports. An export is a promise that
 * something outside reads it; one nothing reads is either dead or private, and a comment citing it
 * points at nothing a reader can follow. Tests, research and scripts are readers: a test that reads
 * a module's table is why the table is exported.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { repositoryFiles, unusedExports } from "./harness/exports.mjs";
import { programOver, ROOT } from "./harness/program.mjs";

const inSrc = (file) => file.startsWith("src/") && file.endsWith(".ts");

test("the_guard_reads_every_shape_of_import_and_reports_only_the_exports_nobody_reads", () => {
  // A tree that exists nowhere: one module per shape of import, one export left over, and one that
  // only a re-export nobody imports carries.
  const tree = {
    "src/named.ts": "export const named = 1;\nexport const orphan = 2;\n",
    "src/defaulted.ts": "export default function defaulted(): number { return 1; }\n",
    "src/origin.ts": "export const carried = 1;\n",
    "src/idle.ts": "export const idle = 1;\n",
    "src/barrel.ts": "export { carried } from \"./origin.ts\";\nexport { idle } from \"./idle.ts\";\n",
    "src/spaced.ts": "export const spaced = 1;\n",
    "src/awaited.ts": "export const awaited = 1;\nexport const renamed = 2;\n",
    "src/together.ts": "export const together = 1;\n",
    "src/then.ts": "export const loadThen = (): number => 1;\n",
    "src/held.ts": "export const held = 1;\n",
    "src/typed.ts": "export interface Typed { readonly n: number }\n",
    "src/reader.ts": [
      "import { named } from \"./named.ts\";",
      "import defaulted from \"./defaulted.ts\";",
      "import { carried } from \"./barrel.ts\";",
      "import * as space from \"./spaced.ts\";",
      "const { awaited, renamed: other } = await import(\"./awaited.ts\");",
      "const [{ together }] = await Promise.all([import(\"./together.ts\")]);",
      "const then = import(\"./then.ts\").then((m) => m.loadThen());",
      "const module = await import(\"./held.ts\");",
      "const typed: import(\"./typed.ts\").Typed = { n: module.held };",
      "console.log(named, defaulted, carried, space.spaced, awaited, other, together, then, typed);",
      "",
    ].join("\n"),
  };
  const built = programOver(Object.keys(tree), tree, "C:/no-such-tree");
  assert.deepEqual(unusedExports(built, inSrc), ["src/barrel.ts idle", "src/idle.ts idle", "src/named.ts orphan"]);
});

test("no_module_under_src_exports_a_name_that_nothing_imports", () => {
  const files = repositoryFiles();
  assert.deepEqual(unusedExports(programOver(files), inSrc), []);
  // The same tree with one export nobody reads: the guard that passed on the tree sees it.
  const dom = "src/dom.ts", probe = `${fs.readFileSync(`${ROOT}/${dom}`, "utf8")}\nexport const probe = 1;\n`;
  assert.deepEqual(unusedExports(programOver(files, { [dom]: probe }), inSrc), ["src/dom.ts probe"]);
});
