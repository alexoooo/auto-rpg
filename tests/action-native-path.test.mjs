import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createBody } from "../src/core/body.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { actionSkillSet } from "../src/core/skills/action-skill-set.ts";
import { pathExecutor } from "../src/core/skills/combat.ts";
import { placedReach } from "../src/core/skills/strike.ts";
import { armedWith } from "../src/core/items/held.ts";

for (const side of ["left", "right"]) for (const held of ["empty", "club"]) test(`a ${side} native path action with ${held} keeps the other guard and returns through the composed body`, async () => {
  const spec = armedWith(armedWith(humanSpec("workshop-fighter"), "left", held), "right", held);
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const other = side === "right" ? "left" : "right", effector = `hand.${side}`;
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true });
  const executor = pathExecutor(body, [{ name: "jab", family: "straight" }]);
  const skills = actionSkillSet(body, { legs: locomotion(body.envelope), guard: guardSkill(spec) }, [{ name: "punch", executor }],
    [{ name: "jab", executor: "punch", effectors: [effector] }]);
  const at = [body.view.head.x, body.view.head.y, body.view.head.z + placedReach(spec, side, 0)];
  const request = { id: skills.instance(), action: "jab", effector, target: { kind: "point", at } };
  const intent = { face: 0, move: null, guard: { [other]: { guarded: [body.view.head.x, body.view.head.y, body.view.head.z], threat: at }, [side]: null }, actions: [] };
  const phases = new Set(), initial = body.view.effectors[effector].points.knuckles.clone();
  let motion = 0, committed = 0, started = false;
  body.drive((view, dt) => {
    if (!started && skills.readiness(view, request.action, request.effector, request.target,
      { heading: skills.report.heading, placed: true, support: null, walk: null, lower: .03 }).kind === "ready") {
      intent.actions = [request]; started = true;
    }
    const command = skills.command(view, intent, dt);
    for (const action of skills.report.actions) {
      phases.add(action.phase);
      if (action.phase === "commit") { committed++; intent.actions = []; }
    }
    motion = Math.max(motion, body.view.effectors[effector].points.knuckles.subtract(initial).length());
    assert.ok(command.effectors[`hand.${other}`], "the other hand keeps covering during the attack");
    return command;
  }, skills.release);
  try {
    for (let i = 0; i < 600 && !skills.report.ledger.length; i++) stand.step();
    assert.deepEqual([...phases], ["prepare", "commit", "release"], JSON.stringify(skills.report.ledger));
    assert.ok(committed >= 10, "withdrawal does not truncate the committed stroke");
    assert.ok(motion > .01, `the hand physically moves ${motion} m`);
    assert.equal(skills.report.actions.length, 0);
    assert.equal(skills.report.ledger.length, 1);
    assert.equal(skills.report.ledger[0].ending.kind, "completed", JSON.stringify(skills.report.ledger[0].ending));
    assert.equal(skills.report.ledger[0].committed, true);
    assert.equal(skills.report.holders[`effector:${effector}`], "default");
    assert.equal(skills.report.reservations[`effector:${effector}`], undefined);
  } finally { body.dispose(); stand.dispose(); }
});
