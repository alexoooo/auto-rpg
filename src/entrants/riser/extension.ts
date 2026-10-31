import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../core/body.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../core/control/bearing.ts";
import type { Row } from "../../core/control/bearing.ts";
import { turnToRef } from "../../core/control/approach.ts";
import { servoAsk, servoSolve } from "../../core/control/servo.ts";
import { atan2 } from "../../core/math/real.ts";
import { turnAboutToRef } from "../../core/math/turn.ts";
import type { OwnBody } from "../../core/mind/mind.ts";
import { turnOfToRef } from "../../core/read-motion.ts";
import { riseLimbs } from "../../core/recovery/rise/limbs.ts";

// A toe contact holds its point; the foot remains free to turn until its heel lands.
const POINT_ROWS: readonly Row[] = [0, 1, 2].map(axis => [[3 + axis, 1]]);

/** Lift on the feet's actual bearing edges; the heels become supports as they meet the floor. */
export function footExtension(own: OwnBody) {
  const m = own.muscles, limbs = riseLimbs(own), ends = own.spec.ends!, root = m.dynamics.root.segment;
  const state = { elapsed: 0, from: new Vector3(), heading: 0, pitch: 0, height: 0, initial: new Float64Array(m.channels.length),
    tasks: limbs.tasks, memory: limbs.limbs.map(limb => limb.memory), root: new Float64Array(6),
    helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [] as number[], z0: [] as number[], Z: [] as number[][] },
    shortfall: { force: new Vector3(), moment: new Vector3() } };
  const solve = makeBearing(null, limbs.limbs, state, { effort: true });
  const work = { turn: new Quaternion(), yaw: new Quaternion(), pitch: new Quaternion(), target: new Quaternion(),
    across: new Vector3(), up: new Vector3(), forward: new Vector3(), spin: new Vector3(), place: new Vector3(),
    goals: new Float64Array(m.channels.length), moved: new Uint8Array(m.channels.length), aim: { centre: new Vector3(), spin: new Vector3() } };
  const partIndices = ends.map(end => own.spec.segments.findIndex(segment => segment.name === end.segment));
  const patches = limbs.limbs.map(limb => ({ kind: "point" as const, at: limb.work.at }));
  return {
    state,
    begin(view: BodyView) {
      state.elapsed = 0; state.from.copyFrom(view.stance.centre); state.height = (view.ground?.height ?? 1) * view.standing;
      const turn = turnOfToRef(root, work.turn);
      work.across.set(1, 0, 0).applyRotationQuaternionToRef(turn, work.across);
      work.up.set(0, 1, 0).applyRotationQuaternionToRef(turn, work.up);
      work.forward.set(0, 0, 1).applyRotationQuaternionToRef(turn, work.forward);
      state.heading = atan2(-work.across.z, work.across.x); state.pitch = atan2(-work.forward.y, work.up.y);
      for (let i = 0; i < m.channels.length; i++) state.initial[i] = m.angle(i);
    },
    step(view: BodyView, dt: number) {
      state.elapsed += dt;
      const g = view.ground;
      if (!g) return;
      const level = g.centre.y - g.height * view.standing, n = 2.5, amount = Math.min(1, state.elapsed / 4);
      for (let i = 0; i < m.channels.length; i++) {
        const c = m.channels[i]!, key = `${c.joint.spec.name.split(".")[0]} ${c.dof.spec.positive}`;
        const target = key === "knee flexion" ? .7 - c.dof.spec.bind.value : key === "ankle dorsiflexion" ? .8 - c.dof.spec.bind.value : state.initial[i]!;
        work.goals[i] = state.initial[i]! + amount * (target - state.initial[i]!);
      }
      limbs.read(level, false); work.place.setAll(0); let feet = 0;
      for (let i = 0; i < limbs.limbs.length; i++) {
        const end = ends[i]!, limb = limbs.limbs[i]!, foot = end.name.startsWith("foot.");
        if (foot) {
          const contacts = own.built.physics.contactsOf(limb.segment.body, other => other === null);
          let load = 0;
          for (const contact of contacts) if (contact.normal[1] < -.7 && contact.impulse > 0) {
            if (load === 0) limb.work.at.setAll(0);
            limb.work.at.addInPlaceFromFloats(contact.point[0] * contact.impulse, contact.point[1] * contact.impulse, contact.point[2] * contact.impulse);
            load += contact.impulse;
          }
          if (load > 0) limb.work.at.scaleInPlace(1 / load);
        }
        const keep = foot || end.name.startsWith("hand.") && g.footLoad[0]! + g.footLoad[1]! < .85 && g.load[partIndices[i]!]! >= .03;
        if (keep) {
          limbs.bear(i, work.goals, n, level, foot ? 1 : .2, true);
          if (foot) { limb.work.rows = POINT_ROWS; limb.work.patch = patches[i]!; }
        } else limbs.rest(i);
        if (foot) { work.place.addInPlace(limbs.over[i]!); feet++; }
      }
      if (feet) work.place.scaleInPlace(1 / feet); else work.place.copyFrom(g.centre);
      const shift = 0, height = state.height + amount * (view.standing * .65 - state.height);
      work.aim.centre.set(n * n * (state.from.x + shift * (work.place.x - state.from.x) - g.centre.x) - 2 * n * g.velocity.x,
        n * n * (level + height - g.centre.y) - 2 * n * g.velocity.y,
        n * n * (state.from.z + shift * (work.place.z - state.from.z) - g.centre.z) - 2 * n * g.velocity.z);
      turnAboutToRef(Vector3.UpReadOnly, state.heading, work.yaw);
      turnAboutToRef(work.across.set(1, 0, 0), state.pitch, work.pitch);
      work.yaw.multiplyToRef(work.pitch, work.target).multiplyInPlace(root.rest);
      root.body.angularVelocityToRef(work.spin); turnToRef(root.node.rotationQuaternion!, work.target, 1 / n, work.spin, work.aim.spin);
      const asked = servoAsk(m, i => work.goals[i], .4, dt), lever = m.dynamics.root.centre[1]! - level;
      for (let l = 0; l < limbs.limbs.length; l++) if (ends[l]!.kind === "foot") {
        const limb = limbs.limbs[l]!;
        for (let k = 0; k < limb.memory.channels.length; k++) {
          const i = limb.memory.channels[k]!;
          if (m.channels[i]!.joint.spec.name.startsWith("ankle.")) limb.work.ahead[k] = asked.accel[i]!;
        }
      }
      const carried = carryRoot(solve, m, asked, work.aim, lever);
      limbMotion(solve, asked, work.moved); servoSolve(m, asked, carried, work.moved); bearLimbs(solve, m, asked, lever, true);
    },
  };
}
