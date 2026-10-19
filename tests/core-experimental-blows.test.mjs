/**
 * **The research blows as parts** (`driven-strike`, `whole-body-strike`): each is experimental and
 * offered wherever a blow goes, and on the punch stand (`punchStand`, Node, core world, vendored
 * Rapier, 120 Hz) each takes one blow at the pad and gives the body back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { kindsFor, partOf, PARTS } from "../src/core/mind/catalog.ts";
import { modelSpec } from "../src/core/models.ts";
import { blowConfig } from "../research/competencies.mjs";
import { firstBlow } from "./fixtures/stand-blow.mjs";

const EXPERIMENTAL = ["driven-strike", "whole-body-strike"];

test("each research blow is an experimental part offered wherever a blow goes", () => {
  for (const spec of [modelSpec("workshop-fighter"), modelSpec("workshop-rogue")]) {
    const offered = new Map(kindsFor("executor", spec).map(({ kind, reason }) => [kind, reason]));
    for (const kind of EXPERIMENTAL) {
      assert.equal(PARTS[kind].stage, "experimental", kind);
      assert.equal(PARTS[kind].role, "executor", kind);
      assert.equal(offered.get(kind), null, `${kind} on ${spec.model}`);
    }
  }
  assert.equal(partOf(PARTS["whole-body-strike"].defaults).fields[1].key, "drive");
  assert.deepEqual(PARTS["driven-strike"].fields.map((field) => field.key), ["name", "drive", "torso", "windup", "contact"]);
});

test("each research blow on the stand is thrown, ends and gives the body back to the skills that held it", async () => {
  // Whether a blow lands or keeps its feet is `core-experimental-blows-capability`'s; here, what it
  // is: one blow, ended, driven whole or not as its part drives, and the body handed back.
  const read = async (config) => { const { ended, thrown, whole, holders } = await firstBlow(config); return { ended, thrown, whole, holders }; };
  assert.deepEqual(await read(blowConfig("driven-strike")), { ended: true, thrown: 1, whole: "none", holders: ["default"] });
  assert.deepEqual(await read(blowConfig("whole-body-strike")), { ended: true, thrown: 1, whole: "all", holders: ["default"] });
  assert.deepEqual(await read(blowConfig("whole-body-strike", "drive=flat-out")), { ended: true, thrown: 1, whole: "all", holders: ["default"] });
});
