import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../core/body.ts";
import { groundReading, standReady, type GroundReading } from "../../core/control/ground-reading.ts";
import { motorControl } from "../../core/control/motor.ts";
import { atan2 } from "../../core/math/real.ts";
import type { OwnBody } from "../../core/mind/mind.ts";
import { turnOfToRef } from "../../core/read-motion.ts";
import { recoverySettings } from "./settings.ts";

export type RecoveryMove = "right" | "gather" | "plant" | "extend";

/** The next contact task, selected from measured support rather than a sequence's elapsed time. */
export function recoveryMove(view: Pick<BodyView, "down" | "ground">): RecoveryMove | null {
  const g = view.ground;
  if (!g) return view.down ? "right" : null;
  if (standReady(view)) return null;
  if (!view.down && g.raw === "standing") return null;
  if (g.flat[0] && g.flat[1] && g.footLoad[0]! + g.footLoad[1]! >= .9 && g.height > .4) return "extend";
  if (g.settled && (g.position === "fours" || g.position === "kneeling" || g.position === "half-kneel")) return "plant";
  return g.lie === "front" ? "gather" : "right";
}

/** Muscle-only recovery: joint feedback for new contacts, supported extension once both feet bear. */
export function recoveryControl(own: OwnBody, view: BodyView, dt: number) {
  const m = own.muscles, ground = groundReading(own.built, dt), motor = motorControl(own.built, .15, {}, undefined, null);
  const settings = recoverySettings(own.spec);
  const targets = Object.fromEntries(Object.entries(settings.postures).map(([move, pose]) => [move, Float64Array.from(m.channels, c => {
    const key = `${c.joint.spec.name.split(".")[0]} ${c.dof.spec.positive}`;
    const anatomical = (pose as Readonly<Record<string, number>>)[key] ?? c.dof.spec.bind.value;
    return Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, anatomical - c.dof.spec.bind.value));
  })])) as Record<Exclude<RecoveryMove, "extend">, Float64Array>;
  const state = { move: "right" as RecoveryMove, elapsed: 0, quiet: 0, height: 0, pitch: 0, heading: 0,
    initial: new Float64Array(m.channels.length), rates: new Float64Array(m.channels.length), ground: ground.state, motor: motor.state };
  const work = { turn: new Quaternion(), across: new Vector3(), up: new Vector3(), forward: new Vector3(), rates: new Float64Array(m.channels.length) };
  const reading = (): GroundReading => ground.read();
  return {
    state,
    begin(move: RecoveryMove) {
      state.move = move; state.elapsed = 0; state.quiet = 0;
      for (let i = 0; i < m.channels.length; i++) { state.initial[i] = m.angle(i); state.rates[i] = m.rate(i); }
      motor.reset(); ground.reset();
      const g = reading(), turn = turnOfToRef(m.dynamics.root.segment, work.turn);
      work.across.set(1, 0, 0).applyRotationQuaternionToRef(turn, work.across);
      work.up.set(0, 1, 0).applyRotationQuaternionToRef(turn, work.up);
      work.forward.set(0, 0, 1).applyRotationQuaternionToRef(turn, work.forward);
      state.heading = atan2(-work.across.z, work.across.x);
      state.pitch = atan2(-work.forward.y, work.up.y);
      state.height = g.height * view.standing;
    },
    step(seconds: number) {
      state.elapsed += seconds;
      const g = reading();
      state.quiet = standReady({ down: view.down, ground: g }) ? state.quiet + seconds : 0;
      switch (state.move) {
        case "extend": {
          // Keep the measured crouch while its pitch and height approach standing gradually.
          const pitch = Math.sign(state.pitch) * Math.max(0, Math.abs(state.pitch) - state.elapsed * .3);
          motor.stance.read();
          motor.setStance({ feet: ["left", "right"], centre: null, height: Math.min(view.standing - .03, state.height + state.elapsed * view.standing * .06),
            heading: state.heading, walk: null, pose: { pitch, seconds: .3 } });
          motor.control(m, seconds);
          break;
        }
        case "right": case "gather": case "plant": {
          const target = targets[state.move], blend = Math.min(1, state.elapsed / settings.blendSeconds);
          for (let i = 0; i < m.channels.length; i++) {
            const c = m.channels[i]!, goal = state.initial[i]! + blend * (target[i]! - state.initial[i]!);
            let asked = Math.max(-settings.rate, Math.min(settings.rate, (goal - m.angle(i)) / settings.response));
            // A folded body turns through unequal legs; the contact task ends as its lie changes.
            if (state.move === "right" && c.name === "hip.right flexion") asked = Math.max(-settings.rate, Math.min(settings.rate, (goal - .6 - m.angle(i)) / settings.response));
            // Bound changes of joint rate, including across contact-task handoffs.
            const change = Math.max(-settings.acceleration * seconds, Math.min(settings.acceleration * seconds, asked - state.rates[i]!));
            state.rates[i] += change; work.rates[i] = state.rates[i]!;
          }
          for (let i = 0; i < m.channels.length; i++) {
            const c = m.channels[i]!, first = i - c.index;
            let speed = 0;
            for (let k = 0; k < c.joint.dofs.length; k++) speed += m.turning(i, k) * work.rates[first + k]!;
            m.activation[i] = 1; m.velocity[i] = Math.max(-settings.motorSpeed, Math.min(settings.motorSpeed, speed));
          }
          break;
        }
        default: { const never: never = state.move; throw new Error(`unknown recovery movement ${never}`); }
      }
      return state.quiet >= .5;
    },
  };
}
