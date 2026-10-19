import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { modelSpec } from "../../src/core/models.ts";
import { embody } from "../../src/core/mind/mind.ts";
import { applyAction } from "../../src/core/mind/actions.ts";
import { wholeBodyTracking } from "../../src/core/control/whole-body.ts";
import { observeBody } from "../../src/core/observation.ts";
import { clockSenses } from "../../src/core/mind/senses.ts";
import { coreStand } from "../harness/core-stand.mjs";
import { FOURS } from "./fours-support.mjs";

const zero = [0, 0, 0], names = ["hand.right", "shank.left", "foot.left", "foot.right"];

/**
 * A kneel on the left shin and the right hand, the right foot planted under the body and the left
 * on its toes behind: all fours (`FOURS`) with the right knee drawn up and the left hand lifted.
 */
const KNEEL = Object.freeze({ ...FOURS, joints: { ...FOURS.joints, "hip.right": [2.1, 0, 0], "knee.right": [2.2],
  "ankle.right": [0, 0], "ankle.left": [-.9, 0], "shoulder.left": [0, 0, 0] } });

/** The body placed in a kneel (`KNEEL`), its first step taken limp, handed to a supported hold. */
export async function toeSupport({ transfer = false, stabilize = true } = {}) {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec,
    { engine: "rapier-coordinate", groundSize: 40, ...KNEEL });
  stand.world.step();
  const parts = [...stand.built.segments.values()], mass = parts.reduce((sum, p) => sum + p.rigid.mass, 0);
  const root = stand.built.segments.get("lowerTrunk"), hand = stand.built.segments.get("hand.left").node.position.asArray();
  const load = (name) => stand.world.physics.contactsOf(stand.built.segments.get(name).body, other => other === null)
    .reduce((sum, contact) => sum + contact.impulse / stand.world.dt, 0);
  const centre = () => parts.reduce((sum, p) => sum.addInPlace(new Vector3(...p.body.massProperties.centre)
    .applyRotationQuaternionToRef(p.node.rotationQuaternion, new Vector3()).addInPlace(p.node.position)
    .scale(p.rigid.mass / mass)), new Vector3()).asArray();
  const goal = { joints: [], frames: [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: zero,
    orientation: { target: root.node.rotationQuaternion.asArray(), velocity: zero, acceleration: zero, seconds: .3, weight: 3 } },
    ...names.map(name => {
      const part = stand.built.segments.get(name), contact = stand.world.physics.contactsOf(part.body, other => other === null)
        .find(c => c.impulse > 0);
      return { id: name, frame: { kind: "segment", name },
        at: new Vector3(...contact.point).subtractInPlace(part.node.position)
          .applyRotationQuaternionToRef(Quaternion.Inverse(part.node.rotationQuaternion), new Vector3()).asArray(),
        translation: { target: contact.point, velocity: zero, acceleration: zero, seconds: .2, weight: 1 },
        ...(name === "foot.right" ? { orientation: { target: part.node.rotationQuaternion.asArray(),
          velocity: zero, acceleration: zero, seconds: .3, weight: 2 } } : {}) };
    }), { id: "hand.left", frame: { kind: "segment", name: "hand.left" }, at: zero,
      translation: { target: [...hand], velocity: zero, acceleration: zero, seconds: .15, weight: 2 } }],
    centres: [{ id: "centre", frames: parts.map(p => ({ kind: "segment", name: p.spec.name })),
      translation: { target: centre(), velocity: zero, acceleration: zero, seconds: .25, weight: 3 } }],
    supports: [{ frame: { kind: "segment", name: "hand.left" }, mode: "auto" },
      ...(stabilize ? [{ frame: { kind: "segment", name: "foot.left" }, mode: "auto", normalLoad: { pointMin: 1 } }] : [])], grips: [] };
  const body = embody(stand.built, stand.world, own => {
    const tracker = wholeBodyTracking(stand.built, own.muscles, stand.world.physics.gravity, [], [], {
      capacity: 8, effortCost: 1e-6, contact: { physics: stand.world.physics, dt: stand.world.dt,
        settings: { maxPoints: 64, gap: .005, minUpNormal: .9, pointSeparation: .001, forceTolerance: 1e-5,
          redistributionCost: 1e-6, iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6,
          liftOff: { accelerationTolerance: .1 }, ...(stabilize ? { normalResponseSeconds: .2 } : {}) } },
      jointStops: { dt: stand.world.dt, settings: { margin: .001, forceTolerance: 1e-5, accelerationTolerance: 1e-4,
        iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 } } });
    const state = { goal, tracking: tracker.state, phase: "hold", time: 0, quiet: 0, initialLoad: 0, finished: false };
    return { name: "toe-support-load-transfer", state, step() {
      const g = state.goal;
      if (!g.joints.length) g.joints = own.muscles.channels.map((c, i) => ({ channel: c.name, angle: own.muscles.angle(i),
        rate: 0, acceleration: 0, seconds: .4, weight: .02 }));
      if (transfer && state.phase === "hold" && state.time >= 1) {
        state.phase = "transfer"; state.time = 0; state.initialLoad = load("hand.left");
      }
      if (state.phase === "transfer") {
        const u = Math.min(1, state.time / 1.5), p = u * u * (3 - 2 * u);
        g.supports[0].normalLoad = { max: Math.max(0, state.initialLoad * (1 - p)) };
        state.quiet = u === 1 && load("hand.left") < 2 && names.every(n => load(n) > 0) ? state.quiet + stand.world.dt : 0;
        if (state.quiet >= .1) { state.phase = "lift"; state.time = 0; delete g.supports[0].normalLoad; g.supports[0].mode = "free"; }
      }
      if (state.phase === "lift") {
        const u = Math.min(1, state.time / 1.2), p = u * u * (3 - 2 * u), v = u < 1 ? 6 * u * (1 - u) / 1.2 : 0,
          a = u < 1 ? (6 - 12 * u) / (1.2 * 1.2) : 0;
        Object.assign(g.frames.find(f => f.id === "hand.left").translation, { target: [hand[0], hand[1] + .35 * p, hand[2]],
          velocity: [0, .35 * v, 0], acceleration: [0, .35 * a, 0] });
        state.finished = u === 1;
      }
      tracker.check(g); applyAction(own.muscles, { kind: "torque", torque: Array.from(tracker.track(g)) });
      own.assist.ask(new Vector3(), new Vector3()); state.time += stand.world.dt;
    } };
  });
  const observe = observeBody(stand.built, body.own.muscles, stand.world, clockSenses(stand.world));
  return { stand, body, load, observe, sample() {
    return { loads: Object.fromEntries(["hand.left", ...names].map(name => [name, load(name)])),
      up: new Vector3(0, 1, 0).applyRotationQuaternionToRef(root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)), new Vector3()).y,
      speed: parts.reduce((sum, p) => sum.addInPlace(p.body.linearVelocityToRef(new Vector3()).scale(p.rigid.mass / mass)), new Vector3()).length(),
      bodyFloor: parts.filter(p => /Trunk|head/.test(p.spec.name) && load(p.spec.name) > 0).map(p => p.spec.name),
      effortExcess: Math.max(0, ...Array.from(body.own.muscles.pulled, (v, i) =>
        Math.max(v - body.own.muscles.bounds.positive[i], -v - body.own.muscles.bounds.negative[i]))),
      assist: { force: body.own.assist.meter.force, moment: body.own.assist.meter.moment } };
  }, dispose() { body.dispose(); stand.dispose(); } };
}
