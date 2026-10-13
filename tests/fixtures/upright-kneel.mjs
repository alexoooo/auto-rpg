import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { foursSupport, SUPPORT_JOINT_STOPS } from "./fours-support.mjs";
import { embody } from "../../src/core/mind/mind.ts";
import { applyAction } from "../../src/core/mind/actions.ts";
import { stagedRise } from "../../src/core/mind/rise/staged.ts";
import { RISE } from "../../src/core/mind/rise/stages.ts";
import { wholeBodyTracking } from "../../src/core/control/whole-body.ts";
import { lowsOf, uprightness } from "../../src/core/control/ground.ts";
import { centreOfToRef } from "../../src/core/control/support.ts";
import { observeBody } from "../../src/core/observation.ts";
import { clockSenses } from "../../src/core/mind/senses.ts";

/** Ordinary muscle boot contact acquisition and a supported bearing handoff after a real two-shove Lab fall. */
export async function uprightKneel({ bearingSeconds = .2 } = {}) {
  const f = await foursSupport(.0001), { stand } = f;
  let body;
  try {
    stand.step(600);
    const parts = [...stand.built.segments.values()], mass = parts.reduce((sum, part) => sum + part.rigid.mass, 0);
    const root = stand.built.segments.get("lowerTrunk"), upright = uprightness(stand.built), zero = Object.freeze([0, 0, 0]);
    const centre = new Vector3(), velocity = new Vector3(), at = new Vector3(), speed = new Vector3();
    const readCentre = () => {
      centre.setAll(0); velocity.setAll(0);
      for (const part of parts) {
        centre.addInPlace(centreOfToRef(part, at).scaleInPlace(part.rigid.mass / mass));
        part.body.linearVelocityToRef(speed); velocity.addInPlace(speed.scaleInPlace(part.rigid.mass / mass));
      }
    };
    const load = name => stand.world.physics.contactsOf(stand.built.segments.get(name).body, other => other === null)
      .reduce((sum, contact) => sum + contact.impulse / stand.world.dt, 0);
    const up = () => Vector3.UpReadOnly.applyRotationQuaternionToRef(
      root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)), new Vector3()).y;
    readCentre();
    const names = ["shank.left", "shank.right", "hand.right"];
    const anchors = names.map(name => {
      const part = stand.built.segments.get(name), contact = stand.world.physics.contactsOf(part.body, other => other === null)
        .find(contact => contact.impulse > 0);
      if (!contact) throw new Error(`actual knee-weight shift lacks ${name}`);
      return { id: name, frame: { kind: "segment", name }, at: new Vector3(...contact.point).subtractInPlace(part.node.position)
        .applyRotationQuaternionToRef(Quaternion.Inverse(part.node.rotationQuaternion), new Vector3()).asArray(),
      translation: { target: [...contact.point], velocity: zero, acceleration: zero, seconds: .2, weight: 1 } };
    });
    anchors[2].at = zero; anchors[2].translation.target = stand.built.segments.get("hand.right").node.position.asArray();
    const boots = ["foot.left", "foot.right"].map(name => {
      const part = stand.built.segments.get(name);
      const candidates = part.rigid.shapes.flatMap(shape => lowsOf(shape, part.frame)).map(low => {
        const local = new Vector3(...low.at).subtractInPlace(new Vector3(...part.frame.origin))
          .applyRotationQuaternionToRef(Quaternion.Inverse(part.rest), new Vector3());
        const point = local.applyRotationQuaternionToRef(part.node.rotationQuaternion, new Vector3()).addInPlace(part.node.position);
        return { local, point, radius: low.radius };
      }).sort((a, b) => a.point.y - a.radius - b.point.y + b.radius);
      const low = candidates[0];
      if (low.radius !== 0) throw new Error("boot contact acquisition requires a polyhedral boot");
      return { name, at: low.local.asArray(), from: low.point.asArray() };
    });
    const goal = { joints: [], frames: [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: zero,
      orientation: { target: root.node.rotationQuaternion.asArray(), velocity: zero, acceleration: zero, seconds: .3, weight: 3 } },
    ...anchors, ...boots.map(boot => ({ id: boot.name, frame: { kind: "segment", name: boot.name }, at: boot.at,
      translation: { target: [...boot.from], velocity: zero, acceleration: zero, seconds: .25, weight: 2 } }))],
    centres: [{ id: "centre", frames: parts.map(part => ({ kind: "segment", name: part.spec.name })),
      translation: { target: centre.asArray(), velocity: zero, acceleration: zero, seconds: .25, weight: 3 } }],
    supports: names.map(name => ({ frame: { kind: "segment", name }, mode: "auto", normalLoad: { min: 20, pointMin: 1 } })), grips: [] };
    f.body.dispose();
    const recipe = { ...RISE, rise: [{ kind: "bear", name: "supported upright kneel",
      on: [{ limb: "shin.left", share: .5 }, { limb: "shin.right", share: .5 }], leave: ["hand.left", "hand.right"],
      overProp: false, height: null, pitch: .2, posture: RISE.rise.find(stage => stage.name === "tall").posture, seconds: bearingSeconds, limit: 8 }] };
    const view = { get down() { return upright.down(); }, stance: { centre, velocity } };
    body = embody(stand.built, stand.world, own => {
      const bearing = stagedRise(own, view, recipe);
      const tracker = wholeBodyTracking(stand.built, own.muscles, stand.world.physics.gravity, [], [], {
        capacity: 12, effortCost: 1e-6, contact: { physics: stand.world.physics, dt: stand.world.dt,
          settings: { normalResponseSeconds: .2, maxPoints: 64, gap: .005, minUpNormal: .9, pointSeparation: .001,
            forceTolerance: 1e-5, redistributionCost: 1e-6, iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6,
            liftOff: { accelerationTolerance: .1 } } }, jointStops: { dt: stand.world.dt, settings: SUPPORT_JOINT_STOPS } });
      const observe = observeBody(stand.built, own.muscles, stand.world, clockSenses(stand.world), undefined, () => upright.down(), true);
      const state = { phase: "toes", time: 0, boots, goal, bearing: bearing.state,
        tracking: tracker.state, captured: null, rejected: 0 };
      return { name: "actual upright knee support", state, step(senses, dt) {
        readCentre();
        if (state.phase === "toes" && state.time >= 5) { bearing.beginSupported(); state.phase = "bearing"; state.time = 0; }
        if (state.phase === "bearing" && up() > .9 && load("shank.left") > 100 && load("shank.right") > 100
          && load("foot.left") > 1 && load("foot.right") > 1) {
          const o = observe(), loaded = ["shank.left", "shank.right", "foot.left", "foot.right", "hand.left", "hand.right"]
            .filter(name => load(name) > 0);
          state.goal = { joints: own.muscles.channels.map((channel, i) => ({ channel: channel.name,
            angle: Math.max(channel.dof.spec.min.value, Math.min(channel.dof.spec.max.value, own.muscles.angle(i))),
            rate: 0, acceleration: 0, seconds: .4, weight: .02 })),
          frames: [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: zero,
            orientation: { target: root.node.rotationQuaternion.asArray(), velocity: zero, acceleration: zero, seconds: .3, weight: 3 } },
          ...loaded.map(name => {
            const part = stand.built.segments.get(name), contact = o.contacts.find(contact => contact.segment === name && contact.fixed !== null && contact.impulse > 0);
            return { id: name, frame: { kind: "segment", name }, at: new Vector3(...contact.point).subtractInPlace(part.node.position)
              .applyRotationQuaternionToRef(Quaternion.Inverse(part.node.rotationQuaternion), new Vector3()).asArray(),
            translation: { target: [...contact.point], velocity: zero, acceleration: zero, seconds: .2, weight: 1 } };
          })], centres: [{ id: "centre", frames: parts.map(part => ({ kind: "segment", name: part.spec.name })),
            translation: { target: centre.asArray(), velocity: zero, acceleration: zero, seconds: .25, weight: 3 } }],
          supports: loaded.map(name => ({ frame: { kind: "segment", name }, mode: "auto", normalLoad: { min: 20, pointMin: 1 } })), grips: [] };
          state.phase = "handoff"; state.captured = { time: stand.world.time, up: up(), centre: centre.asArray(), velocity: velocity.asArray() };
        }
        if (state.phase === "bearing") bearing.step(senses, dt);
        else {
          let command = state.goal;
          if (state.phase === "toes") {
            if (!command.joints.length) command.joints = own.muscles.channels.map((channel, i) => ({ channel: channel.name,
              angle: Math.max(channel.dof.spec.min.value, Math.min(channel.dof.spec.max.value, own.muscles.angle(i))),
              rate: 0, acceleration: 0, seconds: .4, weight: .02 }));
            const touching = name => stand.world.physics.contactManifoldsOf(stand.built.segments.get(name).body, other => other === null)
              .some(manifold => manifold.points.some(point => point.distance <= .005));
            for (const support of command.supports) if (support.normalLoad.min && !touching(support.frame.name)) support.normalLoad = { pointMin: 1 };
            const u = Math.min(1, state.time / 1.5), p = u * u * (3 - 2 * u), v = u < 1 ? 6 * u * (1 - u) / 1.5 : 0,
              a = u < 1 ? (6 - 12 * u) / (1.5 * 1.5) : 0;
            for (const boot of state.boots) {
              const distance = -.003 - boot.from[1], translation = command.frames.find(frame => frame.id === boot.name).translation;
              Object.assign(translation, { target: [boot.from[0], boot.from[1] + distance * p, boot.from[2]],
                velocity: [0, distance * v, 0], acceleration: [0, distance * a, 0] });
              if (u === 1 && touching(boot.name) && !command.supports.some(support => support.frame.name === boot.name))
                command.supports.push({ frame: { kind: "segment", name: boot.name }, mode: "auto", normalLoad: { min: 15 } });
            }
          } else {
            command.centres[0].translation.target[1] = centre.y;
            for (const support of command.supports) if (support.normalLoad.min && !stand.world.physics
              .contactManifoldsOf(stand.built.segments.get(support.frame.name).body, other => other === null)
              .some(manifold => manifold.points.some(point => point.distance <= .005))) support.normalLoad = { pointMin: 1 };
          }
          const torque = tracker.track(command, .0001);
          if (tracker.state.contact.status === "rejected" || tracker.state.stops.status === "rejected") state.rejected++;
          applyAction(own.muscles, { kind: "torque", torque: Array.from(torque) }); own.assist.ask(new Vector3(), new Vector3());
        }
        state.time += dt;
      } };
    });
    const observe = observeBody(stand.built, body.own.muscles, stand.world, clockSenses(stand.world));
    const sample = () => ({ phase: body.mind.state.phase, up: up(), down: upright.down(),
      loads: Object.fromEntries(["hand.left", "hand.right", "shank.left", "shank.right", "foot.left", "foot.right"].map(name => [name, load(name)])),
      bodyFloor: parts.filter(part => /Trunk|head/.test(part.spec.name) && load(part.spec.name) > 0).map(part => part.spec.name),
      effortExcess: Math.max(0, ...Array.from(body.own.muscles.pulled, (torque, i) => Math.max(torque - body.own.muscles.bounds.positive[i],
        -torque - body.own.muscles.bounds.negative[i]))), assist: { force: body.own.assist.meter.force, moment: body.own.assist.meter.moment } });
    return { stand, body, observe, sample, recipe, dispose() { body.dispose(); stand.dispose(); } };
  } catch (error) { body?.dispose(); f.dispose(); throw error; }
}
