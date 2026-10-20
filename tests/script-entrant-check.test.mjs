import { test } from "node:test";
import assert from "node:assert/strict";
import { changeOf, entrantOf } from "../scripts/entrant-check.mjs";

const IMPORT = 'import { GREEDY_MIND } from "../entrants/greedy/mind.ts";';
const LIST = "export const CONTROLLERS: Readonly<Record<string, Controller>> = registry([OPTIONS_MIND, FIGHTER_MIND, QUADRUPED_MIND, DIRECT_MIND, GREEDY_MIND]);";

test("an entrant's own files are its folder, its assets and its own test", () => {
  assert.deepEqual(["src/core/entrants/greedy/mind.ts", "assets/entrants/greedy/weights.json", "tests/entrant-greedy.test.mjs",
    "src/core/entrants.ts", "src/core/mind/controllers.ts", "tests/mind-contract.test.mjs"].map(entrantOf), ["greedy", "greedy", "greedy", null, null, null]);
});

test("an entrant's change is its own files and its line in the registry, and no other", () => {
  const own = ["src/core/entrants/greedy/mind.ts", "assets/entrants/greedy/weights.json"];
  assert.deepEqual(changeOf(own), { kind: "entrant", name: "greedy" });
  assert.deepEqual(changeOf([...own, "src/core/mind/controllers.ts"], [IMPORT, LIST]), { kind: "entrant", name: "greedy" });
  assert.deepEqual(changeOf(["src/core/mind/stance.ts", "docs/architecture.md"]), { kind: "toolkit" });
  // Each way a change is two changes: a toolkit file, another entrant, another line in the registry.
  const mixed = [changeOf([...own, "src/core/control/ground.ts"]), changeOf([...own, "src/core/entrants/direct/mind.ts"]),
    changeOf([...own, "src/core/mind/controllers.ts"], [IMPORT, LIST, 'import { DIRECT_MIND } from "../entrants/direct/mind.ts";'])];
  assert.deepEqual(mixed.map((change) => change.kind), ["mixed", "mixed", "mixed"]);
  assert.match(mixed[0].why, /ground\.ts/);
  assert.match(mixed[1].why, /direct, greedy/);
  assert.match(mixed[2].why, /DIRECT_MIND/);
});
