import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { coreStand } from "../harness/core-stand.mjs";
import { modelSpec } from "../../src/core/models.ts";
import { guardPosture } from "../../src/core/skills/guard.ts";
import { LAB_PRESETS } from "../../src/lab/scenarios.ts";
import { labActor } from "../../src/lab/actor.ts";
import { startStance } from "../../src/lab/stance-mode.ts";
import { embody } from "../../src/core/mind/mind.ts";
import { applyAction } from "../../src/core/mind/actions.ts";
import { wholeBodyTracking } from "../../src/core/control/whole-body.ts";
import { observeBody } from "../../src/core/observation.ts";
import { clockSenses } from "../../src/core/mind/senses.ts";

/** Joint-limit prediction settings for the physical support fixtures. */
export const SUPPORT_JOINT_STOPS = Object.freeze({ margin: .001, forceTolerance: 1e-5, accelerationTolerance: 1e-4,
  iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 });

/**
 * The body on all fours: built face down, its hips, knees and shoulders flexed a right angle or so,
 * hands and shins on the ground, as a fall leaves it there (`FOURS`).
 */
export const FOURS = Object.freeze({
  position: [0, .47, 0], rotation: Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2).asArray(),
  joints: { "hip.left": [1.45, 0, 0], "hip.right": [1.45, 0, 0], "knee.left": [1.6], "knee.right": [1.6],
    "shoulder.left": [1.6, 0, 0], "shoulder.right": [1.6, 0, 0], "elbow.left": [.1], "elbow.right": [.1],
    "ankle.left": [.3, 0], "ankle.right": [.3, 0] },
});

/** The body placed on all fours (`FOURS`), its first step under the Lab's script, handed to a bounded knee-weight shift. */
export async function foursSupport(supportBand) {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
    { engine: "rapier-coordinate", groundSize: 40, ...FOURS });
  const mind = { ...LAB_PRESETS.script.config, subs: [] };
  const stance = startStance(labActor(stand.built, stand.world, { mind }));
  let body;
  try {
    stand.world.step();
    const o = stance.body.observe(), parts = [...stand.built.segments.values()], mass = parts.reduce((sum, part) => sum + part.rigid.mass, 0);
    const root = stand.built.segments.get("lowerTrunk"), zero = Object.freeze([0, 0, 0]);
    const from = parts.reduce((sum, part) => sum.addInPlace(new Vector3(...part.body.massProperties.centre)
      .applyRotationQuaternionToRef(part.node.rotationQuaternion, new Vector3()).addInPlace(part.node.position)
      .scale(part.rigid.mass / mass)), new Vector3()).asArray();
    const names = ["hand.left", "hand.right", "shank.left", "shank.right"];
    const anchors = names.map(name => {
      const part = stand.built.segments.get(name), contact = o.contacts.find(c => c.segment === name && c.fixed !== null && c.impulse > 0);
      if (!contact) throw new Error(`the placed fours lack ${name}`);
      return { id: name, frame: { kind: "segment", name }, at: new Vector3(...contact.point).subtractInPlace(part.node.position)
        .applyRotationQuaternionToRef(Quaternion.Inverse(part.node.rotationQuaternion), new Vector3()).asArray(),
      translation: { target: [...contact.point], velocity: zero, acceleration: zero, seconds: .2, weight: 1 } };
    });
    const knees = anchors.filter(a => a.id.startsWith("shank")), target = [
      knees.reduce((sum, a) => sum + a.translation.target[0], 0) / 2, from[1],
      knees.reduce((sum, a) => sum + a.translation.target[2], 0) / 2];
    const goal = { joints: o.joints.map(j => {
      const c = stance.body.muscles.channels.find(c => c.name === j.name);
      return { channel: j.name, angle: Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, j.angle)),
        rate: 0, acceleration: 0, seconds: .4, weight: .02 };
    }), frames: [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: zero,
      orientation: { target: root.node.rotationQuaternion.asArray(), velocity: zero, acceleration: zero, seconds: .3, weight: 3 } }, ...anchors],
    centres: [{ id: "centre", frames: parts.map(part => ({ kind: "segment", name: part.spec.name })),
      translation: { target: [...from], velocity: zero, acceleration: zero, seconds: .25, weight: 3 } }], supports: [], grips: [] };
    stance.dispose();
    body = embody(stand.built, stand.world, own => {
      const tracker = wholeBodyTracking(stand.built, own.muscles, stand.world.physics.gravity, [], [], {
        capacity: 8, effortCost: 1e-6, contact: { physics: stand.world.physics, dt: stand.world.dt,
          settings: { normalResponseSeconds: .2, maxPoints: 64, gap: .005, minUpNormal: .9, pointSeparation: .001,
            forceTolerance: 1e-5, redistributionCost: 1e-6, iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6,
            liftOff: { accelerationTolerance: .1 } } }, jointStops: { dt: stand.world.dt, settings: SUPPORT_JOINT_STOPS } });
      const state = { time: 0, from, target, goal, tracking: tracker.state };
      return { name: "supported knee-weight shift", state, step() {
        const u = Math.min(1, state.time), p = u * u * (3 - 2 * u), v = u < 1 ? 6 * u * (1 - u) : 0, a = u < 1 ? 6 - 12 * u : 0;
        state.goal.centres[0].translation = { ...state.goal.centres[0].translation,
          target: state.target.map((x, k) => state.from[k] + (x - state.from[k]) * p),
          velocity: state.target.map((x, k) => (x - state.from[k]) * v), acceleration: state.target.map((x, k) => (x - state.from[k]) * a) };
        applyAction(own.muscles, { kind: "torque", torque: Array.from(tracker.track(state.goal, supportBand)) });
        own.assist.ask(new Vector3(), new Vector3()); state.time += stand.world.dt;
      } };
    });
    const observe = observeBody(stand.built, body.own.muscles, stand.world, clockSenses(stand.world));
    return { stand, body, observe, up: () => Vector3.UpReadOnly.applyRotationQuaternionToRef(
      root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)), new Vector3()).y,
    dispose() { body.dispose(); stand.dispose(); } };
  } catch (error) { body?.dispose(); stance.dispose(); stand.dispose(); throw error; }
}
