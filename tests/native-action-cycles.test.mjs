import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createBody } from "../src/core/body.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { actionSkillSet } from "../src/core/skills/action-skill-set.ts";
import { kickExecutor } from "../src/core/skills/kick.ts";
import { wholeBodyExecutor } from "../src/core/skills/whole-body-strike.ts";
import { placedReach } from "../src/core/skills/strike.ts";

for (const kind of ["kick", "whole"]) test(`a native ${kind} prepares, commits and physically returns through the action compositor`, async () => {
  const spec = humanSpec("workshop-fighter");
  const stand = await coreStand(spec, { posture: guardPosture(spec) });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true });
  const executor = kind === "kick" ? kickExecutor(body, [kind]) : wholeBodyExecutor(body, stand.world, [kind], "timed");
  const effector = kind === "kick" ? "foot.right" : "hand.right";
  const skills = actionSkillSet(body, { legs: locomotion(body.envelope), guard: guardSkill(spec) }, [{ name: kind, executor }],
    [{ name: kind, executor: kind, effectors: [effector] }]);
  let request = null, admitted = false;
  const phases = new Set(), stages = new Set();
  body.drive((view, dt) => {
    if (!request && view.time >= 2) {
      const at = kind === "kick" ? [view.stance.centre.x + .1, .45, view.stance.soles.right.z + .45]
        : [view.head.x, view.head.y, view.head.z + placedReach(spec, "right", 0)];
      request = { id: skills.instance(), action: kind, effector, target: { kind: "point", at } };
    }
    const around = { heading: skills.report.heading, placed: true, support: null, walk: null, lower: .03 };
    if (request && !admitted && skills.readiness(view, kind, effector, request.target, around).kind === "ready") admitted = true;
    const command = skills.command(view, { face: 0, move: null, guard: { left: null, right: null }, actions: admitted ? [request] : [] }, dt);
    for (const action of skills.report.actions) { phases.add(action.phase); stages.add(action.stage); }
    return command;
  }, skills.release);
  try {
    for (let i = 0; i < stand.seconds(24) && !skills.report.ledger.length; i++) stand.step();
    assert.equal(admitted, true);
    assert.deepEqual([...phases], ["prepare", "commit", "release"], JSON.stringify({ stages: [...stages], ledger: skills.report.ledger }));
    assert.equal(skills.report.actions.length, 0);
    assert.equal(skills.report.ledger.length, 1);
    assert.deepEqual(skills.report.ledger[0].ending, { kind: "completed" });
    assert.equal(skills.report.ledger[0].committed, true);
    assert.equal(body.down, false);
  } finally { body.dispose(); stand.dispose(); }
});
