import test from "node:test";
import assert from "node:assert/strict";
import { allParts, partLookup } from "../src/entrants/game.ts";
import { modelSpec } from "../src/core/models.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { EXECUTORS } from "../src/core/skills/framework/executors.ts";

/**
 * Every skill's settings are its body's record (`SkillRecord`, `src/core/skills/framework/records.ts`):
 * a body with none does not use the skill and says so, its executor's fit a returned refusal; a
 * body with one is not refused for want of it. The unrecorded body is the Warrior under another
 * model's name, so nothing but its key differs.
 */
test("every executor refuses a body with no record of its skill, and says so", () => {
  const warrior = modelSpec("workshop-fighter"), unrecorded = { ...warrior, model: "unrecorded" };
  const executors = Object.entries(allParts()).filter(([, part]) => part.role === "executor");
  const reached = executors.map(([kind]) => kind);
  assert.ok(Object.keys(EXECUTORS).every((kind) => reached.includes(kind)), `the catalog's executors reached: ${reached.join(", ")}`);
  for (const [kind, part] of executors) {
    assert.equal(part.fits(warrior, part.defaults, partLookup), null, `${kind} fits the Warrior, which has its record`);
    assert.match(part.fits(unrecorded, part.defaults, partLookup) ?? "", new RegExp(`not tuned for ${bodyKey(unrecorded).replace("+", "\\+")}`),
      `${kind} refuses a body with no record of it`);
  }
});
