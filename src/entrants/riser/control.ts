import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../core/body.ts";
import { standReady, type GroundReading } from "../../core/control/ground-reading.ts";
import { atan2 } from "../../core/math/real.ts";
import type { OwnBody } from "../../core/mind/mind.ts";
import { turnOfToRef } from "../../core/read-motion.ts";
import { recoverySettings } from "./settings.ts";
import { footExtension } from "./extension.ts";
import { footLanding } from "./foot-landing.ts";

export type RecoveryMove = "right" | "gather" | "plant" | "extend";

/** A lifted hands-and-knees support, beyond merely touching all four ends. */
const gathered = (g: GroundReading | null): boolean => Boolean(g?.settled
  && (g.position === "fours" || g.position === "kneeling" || g.position === "half-kneel"));
/** Toe support may begin extension; measured flat soles and quiet still govern its completion. */
const plantedFeet = (g: GroundReading | null): boolean => Boolean(g && g.footLoad[0]! >= .1 && g.footLoad[1]! >= .1
  && g.sole[0]! >= .2 && g.sole[1]! >= .2);

/** The next contact task, selected from measured support rather than a sequence's elapsed time. */
export function recoveryMove(view: Pick<BodyView, "down" | "ground">): RecoveryMove | null {
  const g = view.ground;
  if (!g) return view.down ? "right" : null;
  if (standReady(view)) return null;
  if (!view.down && g.raw === "standing") return null;
  if (plantedFeet(g)) return "extend";
  if (gathered(g)) return "plant";
  return g.lie === "front" ? "gather" : "right";
}

/** Muscle-only recovery: joint feedback for new contacts, supported extension once both feet bear. */
export function recoveryControl(own: OwnBody) {
  const m = own.muscles, extension = footExtension(own);
  const settings = recoverySettings(own.spec);
  const landFoot = footLanding(own);
  const targets = Object.fromEntries(Object.entries(settings.postures).map(([move, pose]) => [move, Float64Array.from(m.channels, c => {
    const key = `${c.joint.spec.name.split(".")[0]} ${c.dof.spec.positive}`;
    const named = pose as Readonly<Record<string, number>>;
    const anatomical = named[c.name] ?? named[key] ?? c.dof.spec.bind.value;
    return Math.max(c.dof.spec.min.value, Math.min(c.dof.spec.max.value, anatomical - c.dof.spec.bind.value));
  })])) as Record<Exclude<RecoveryMove, "extend">, Float64Array>;
  const lead = targets.plant.slice();
  const state = { move: "right" as RecoveryMove, elapsed: 0, quiet: 0, reached: 0, height: 0, pitch: 0, heading: 0,
    leadLoaded: false, leadQuiet: 0, phaseSince: 0, initial: new Float64Array(m.channels.length), rates: new Float64Array(m.channels.length),
    goals: new Float64Array(m.channels.length), landingClearance: new Float64Array(2), landing: landFoot.state, extension: extension.state };
  const work = { turn: new Quaternion(), across: new Vector3(), up: new Vector3(), forward: new Vector3(), rates: new Float64Array(m.channels.length) };
  const capture = () => { for (let i = 0; i < m.channels.length; i++) state.initial[i] = m.angle(i); };
  return {
    state,
    begin(move: RecoveryMove, view: BodyView) {
      state.move = move; state.elapsed = 0; state.quiet = 0; state.reached = 0; state.leadQuiet = 0; state.leadLoaded = false; state.phaseSince = 0;
      capture();
      for (let i = 0; i < m.channels.length; i++) state.rates[i] = m.rate(i);
      if (move === "extend") extension.begin(view);
      landFoot.reset();
      const turn = turnOfToRef(m.dynamics.root.segment, work.turn);
      work.across.set(1, 0, 0).applyRotationQuaternionToRef(turn, work.across);
      work.up.set(0, 1, 0).applyRotationQuaternionToRef(turn, work.up);
      work.forward.set(0, 0, 1).applyRotationQuaternionToRef(turn, work.forward);
      state.heading = atan2(-work.across.z, work.across.x);
      state.pitch = atan2(-work.forward.y, work.up.y);
      state.height = (view.ground?.height ?? 1) * view.standing;
    },
    step(view: BodyView, seconds: number) {
      state.elapsed += seconds;
      const g = view.ground;
      state.quiet = standReady(view) ? state.quiet + seconds : 0;
      let reached = false;
      switch (state.move) {
        case "right": reached = g?.lie === "front"; break;
        case "gather": reached = gathered(g) && g!.height >= .35 && g!.upright >= .1; break;
        case "plant": reached = plantedFeet(g); break;
        case "extend": reached = state.quiet >= .5; break;
        default: { const never: never = state.move; throw new Error(`unknown recovery movement ${never}`); }
      }
      state.reached = reached ? state.reached + seconds : 0;
      switch (state.move) {
        case "extend": {
          extension.step(view, seconds);
          break;
        }
        case "right": case "gather": case "plant": {
          if (state.move === "plant" && !state.leadLoaded) {
            state.leadQuiet = g && g.footLoad[0]! >= .15 && g.sole[0]! >= .2 ? state.leadQuiet + seconds : 0;
            if (state.leadQuiet >= .15) { state.leadLoaded = true; state.phaseSince = state.elapsed; capture(); }
          }
          const target = state.move === "plant" && !state.leadLoaded ? lead : targets[state.move];
          const blend = Math.min(1, (state.elapsed - state.phaseSince) / settings.blendSeconds);
          state.goals.set(target);
          if (state.move === "plant") {
            state.landingClearance[0] = landFoot.step(view, "left", state.goals, seconds);
            state.landingClearance[1] = landFoot.step(view, "right", state.goals, seconds);
          }
          for (let i = 0; i < m.channels.length; i++) {
            const goal = state.initial[i]! + blend * (state.goals[i]! - state.initial[i]!);
            const pushing = m.channels[i]!.name.startsWith("elbow.");
            const rate = pushing ? 6 : settings.rate, response = pushing ? .2 : settings.response;
            const asked = Math.max(-rate, Math.min(rate, (goal - m.angle(i)) / response));
            // Bound changes of joint rate, including across contact-task handoffs.
            const change = Math.max(-settings.acceleration * seconds, Math.min(settings.acceleration * seconds, asked - state.rates[i]!));
            state.rates[i] += change; work.rates[i] = state.rates[i]!;
          }
          for (let i = 0; i < m.channels.length; i++) {
            const c = m.channels[i]!, first = i - c.index;
            let speed = 0;
            for (let k = 0; k < c.joint.dofs.length; k++) speed += m.turning(i, k) * work.rates[first + k]!;
            const limit = c.name.startsWith("elbow.") ? 6 : settings.motorSpeed;
            m.activation[i] = 1; m.velocity[i] = Math.max(-limit, Math.min(limit, speed));
          }
          break;
        }
        default: { const never: never = state.move; throw new Error(`unknown recovery movement ${never}`); }
      }
      return state.move === "extend" ? reached : state.reached >= .2;
    },
  };
}
