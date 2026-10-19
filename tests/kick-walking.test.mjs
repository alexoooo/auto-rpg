/**
 * **A kick from a walk** (`kickExecutor`, `src/core/skills/kick.ts`), on the Node stand at 120 Hz:
 * what any kick passes. Admitted while the default walks, it holds the gait while it runs, ends
 * (completed or cancelled), gives back what it reserved, and the walk still asked resumes, the body
 * on its feet. How its support settles and its phases run is measured in
 * `kick-walking-capability.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { coreStand } from "./harness/core-stand.mjs";
import { humanSpec } from "../src/core/human/spec.ts";
import { createBody } from "../src/core/body.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { skillSet } from "../src/core/skills/arbiter.ts";
import { kickExecutor, KICK_PATH } from "../src/core/skills/kick.ts";

test("a physically walking default yields to an admitted kick, which ends and gives the walk back", async () => {
  const spec = humanSpec("workshop-fighter"), stand = await coreStand(spec, { posture: guardPosture(spec) });
  const body = createBody(stand.built, stand.world, { servoSeconds: .1, feedback: true });
  const executor = kickExecutor(body, ["kick"]), walk = [.3, 0];
  const skills = skillSet(body, {}, { legs: locomotion(body.envelope), guard: guardSkill(spec),
    executors: [{ name: "kick", executor }], actions: [{ name: "kick", executor: "kick", effectors: ["foot.right"] }] });
  let request = null, admission = null, restored = null;
  body.drive((view, dt) => {
    const speed = Math.hypot(view.stance.velocity.x, view.stance.velocity.z);
    if (!request && view.time >= 3 && view.stance.phase !== "stand" && speed > KICK_PATH.transferSlow && speed < .45) {
      const target = { kind: "point", at: [view.stance.soles.right.x, .45, view.stance.soles.right.z + .45] };
      const around = { heading: skills.report.heading, placed: false, support: null, walk, lower: .03 };
      const readiness = skills.readiness(view, "kick", "foot.right", target, around);
      if (readiness.kind === "ready") {
        request = { id: skills.instance(), action: "kick", effector: "foot.right", target };
        admission = { speed, phase: view.stance.phase, time: view.time };
      }
    }
    const command = skills.command(view, { face: 0, move: view.time >= 2 ? walk : null,
      guard: { left: null, right: null }, actions: request ? [request] : [] }, dt);
    for (const action of skills.report.actions) assert.equal(command.stance.walk ?? null, null, "the admitted kick holds the gait despite the continuing walk intent");
    if (skills.report.ledger.length) restored = command.stance.walk;
    return command;
  }, skills.release);
  try {
    for (let i = 0; i < stand.seconds(26) && !skills.report.ledger.length; i++) stand.step();
    assert.ok(admission, "a real moving gait is admitted");
    assert.deepEqual(skills.report.ledger.map((record) => ["completed", "cancelled"].includes(record.ending.kind)), [true],
      `it ends: ${JSON.stringify(skills.report.ledger)}`);
    assert.deepEqual(restored, [0, walk[0]], "the still-requested default gait resumes when the action releases its resources");
    assert.deepEqual(skills.report.reservations, {});
    assert.equal(body.down, false);
  } finally { body.dispose(); stand.dispose(); }
});
