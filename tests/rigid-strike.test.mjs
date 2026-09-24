import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { attachPhysics } from "../src/physics.ts";
import { capsulePart } from "../src/rig.ts";
import { RigidStrike } from "../src/golem/effectors/striker.ts";
import { freshHavok } from "./harness/bout-runner.mjs";

/**
 * **A point's velocity is `linear + w x r` with `r` from the centre of mass**, because Havok's linear
 * velocity is the velocity of the centre of mass. A mace and a maul carry theirs toward the head,
 * and measured from the geometric centre a turning head read `w x 0.104 m` wrong (physical contact
 * session 05). The reference is a finite difference of a point fixed on the body over one substep.
 */
test("a_striker_reads_a_point_velocity_about_its_centre_of_mass", async () => {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const scene = new Scene(new NullEngine());
  attachPhysics(scene, await freshHavok());
  scene.getPhysicsEngine().setGravity(Vector3.Zero());
  try {
    for (const offset of [0.25, 0]) {
      const part = capsulePart(scene, { name: `haft${offset}`, position: new Vector3(0, 2, 0), rotation: Quaternion.Identity(),
        height: 0.8, radius: 0.03, mass: 3, layer: 1, collidesWith: 0, centerOfMass: new Vector3(0, offset, 0) });
      const striker = new RigidStrike(part, { kind: "club", effectorId: "haft", hand: null, tipAlong: 0.4, impactMassKg: 3 });
      part.body.setAngularVelocity(new Vector3(0, 0, 4));
      part.body.setLinearVelocity(Vector3.Zero());
      const local = new Vector3(0, 0.4, 0);
      const at = () => local.applyRotationQuaternion(part.mesh.rotationQuaternion).addInPlace(part.mesh.position);
      const before = at();
      const reported = striker.velocityAt(before).clone();
      const centre = striker.centreOfMass().clone();
      const dt = 1 / 240;
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 * dt);
      const moved = at().subtract(before).scale(1 / dt);
      // The head is 0.4 - offset from the centre of mass: 4 rad/s turns it at 4 x that.
      assert.ok(Math.abs(moved.length() - 4 * (0.4 - offset)) < 0.02, `offset ${offset}: the head moved at ${moved.length()} m/s`);
      assert.ok(Vector3.Distance(reported, moved) < 0.02, `offset ${offset}: reported ${reported} against ${moved}`);
      assert.ok(Vector3.Distance(striker.centreOfMass(), centre) < 1e-6, `offset ${offset}: the centre of mass stayed put`);
    }
  } finally { scene.dispose(); }
});
