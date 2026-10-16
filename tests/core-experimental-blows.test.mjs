/**
 * **The research blows as parts** (`driven-strike`, `whole-body-strike`): each is experimental and
 * offered wherever a blow goes, and on the punch stand (`punchStand`, Node, core world, vendored
 * Rapier, 120 Hz) each takes a blow at the pad, lands it or misses, and gives the body back
 * standing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { kindsFor, partOf, PARTS } from "../src/core/mind/catalog.ts";
import { modelSpec } from "../src/core/models.ts";
import { blowConfig } from "../research/competencies.mjs";
import { punchStand } from "../research/punch-calibration.mjs";

const EXPERIMENTAL = ["driven-strike", "whole-body-strike"];
/** The skills holding the body between blows: the tactics' walk the legs, the guard the rest. */
const GUARDING = { legs: "tactics", trunk: "guard", left: "guard", right: "guard" };

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

/**
 * The first blow of `blow` with the Warrior's right hand at the pad 0.55 m ahead, 1.55 m up and
 * 0.1 m to the right: whether it was thrown and landed, whether the steps under way drove the body
 * whole (the stance left out and every channel pushed: all, none or some of them), who held the
 * body once it was over, and whether the body went down.
 */
async function firstBlow(blow) {
  const s = await punchStand({ model: "workshop-fighter", hand: "right", family: "cross", hz: 120, seconds: 8, ahead: 0.55, height: 1.55,
    armExtension: 0.5, pad: { face: "compliant" }, matchedFeedback: true, blow });
  try {
    let began = false, ended = false, steps = 0, whole = 0;
    for (let i = 0; i < 6 * 120 && !ended; i++) {
      s.step(1);
      const under = s.skills.report.actions.length > 0, command = s.skills.state.command;
      if (under) { steps++; if (command.stance === null && command.pushes.length === s.body.muscles.channels.length) whole++; }
      began ||= under;
      ended = began && !under;
    }
    return { ended, thrown: s.cycles.reading().thrown.right, landed: s.state.impacts.length + (s.state.active ? 1 : 0),
      whole: whole === 0 ? "none" : whole === steps ? "all" : "some", holders: [...new Set(Object.values(s.skills.report.holders))], fell: s.state.fell };
  } finally { s.dispose(); }
}

test("each research blow on the stand takes a blow, lands it or misses, and gives the body back standing", {
  todo: "the legs are the run's (`owner-run-body`: hip x2.49, knee x1.58, calf x2.75, leg speed x1.98), and the timed whole-body strike's return folds the body forward and fells it",
}, async () => {
  // The driven strike's stroke ends where its bearing support fails, before the fist reaches the pad.
  assert.deepEqual(await firstBlow(blowConfig("driven-strike")), { ended: true, thrown: 1, landed: 0, whole: "none", holders: ["default"], fell: false });
  assert.deepEqual(await firstBlow(blowConfig("whole-body-strike")), { ended: true, thrown: 1, landed: 1, whole: "all", holders: ["default"], fell: false });
  assert.deepEqual(await firstBlow(blowConfig("whole-body-strike", "drive=flat-out")), { ended: true, thrown: 1, landed: 1, whole: "all", holders: ["default"], fell: false });
});
