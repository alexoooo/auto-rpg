/**
 * **Every static import of a research script or a script names what exists** (`brokenLinks`,
 * `scripts/links.mjs`). On a planted tree the broken links are exactly the missing module and the
 * missing name, a name reached through `export *`, a destructured export and a renamed re-export
 * passing; on this repository there are none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { brokenLinks, repositoryLinks } from "../scripts/links.mjs";

test("broken_links_are_the_missing_module_and_the_missing_name_and_nothing_present", () => {
  const tree = {
    "research/a.mjs": [
      'import { gone, here, deep, picked, renamed } from "../src/m.ts";',
      'import whole from "../src/m.ts";',
      'import { anything } from "./missing.mjs";',
      'import { readFileSync } from "node:fs";',
      'import data from "../assets/d.json" with { type: "json" };',
    ].join("\n"),
    "src/m.ts": 'export const here = 1;\nexport * from "./n.ts";\nexport const { picked } = { picked: 2 };\nexport { here as renamed };\nexport default here;',
    "src/n.ts": "export function deep() {}",
    "assets/d.json": "{}",
  };
  const read = (file) => Object.hasOwn(tree, file) ? tree[file] : null;
  assert.deepEqual(brokenLinks(["research/a.mjs"], read), [
    "research/a.mjs imports gone from src/m.ts, which does not export it",
    "research/a.mjs imports research/missing.mjs, which does not exist",
  ]);
});

test("every_research_script_and_script_imports_what_exists", () => {
  const broken = repositoryLinks();
  assert.deepEqual(broken, [], `${broken.length} broken imports:\n${broken.join("\n")}`);
});
