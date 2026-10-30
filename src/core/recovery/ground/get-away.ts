import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../../body.ts";
import { hypot } from "../../math/real.ts";
import { LEAVING } from "../../skills/locomotion/move.ts";
import type { Side } from "../../spec/body.ts";
import type { OwnBody } from "../../mind/mind.ts";
import type { Senses } from "../../mind/senses.ts";
import type { SubMind } from "../../mind/sub-mind.ts";
import { nearestFoe } from "../../intent/targets.ts";
import { rollToFront } from "./roll.ts";
import { rollBack } from "./roll-back.ts";
import { poseDrive, type TechniqueEnd } from "./technique.ts";

/** Roll away from a nearby foe before handing over. */
export interface GetAwayConfig { readonly kind: "get-away"; readonly metres: number }

/** Distance hysteresis applies between complete rolls; every technique yield remains a handover. */
export function getAway(own: OwnBody, view: BodyView, config: GetAwayConfig): SubMind {
  const runs = { front: rollToFront(own, view), back: rollBack(own, view) }, drive = poseDrive(own.muscles), right = new Vector3();
  const state = { active: false, running: null as "front" | "back" | null, side: "right" as Side, holding: false,
    metres: Infinity, completed: 0, failed: 0, last: null as TechniqueEnd | null, front: runs.front.state, back: runs.back.state };
  const lying = () => view.ground && ["back", "front", "left", "right"].includes(view.ground.position);
  const distance = (senses: Senses) => {
    const foe = nearestFoe(senses, view.stance.centre, "standing");
    state.metres = foe ? hypot(foe.centre.x - view.stance.centre.x, foe.centre.z - view.stance.centre.z) : Infinity;
    return foe;
  };
  return { name: "Get away", state,
    wants(senses) { distance(senses); return state.holding || (!!lying() || state.active && view.down) && state.metres < config.metres + (state.active ? LEAVING : 0); },
    holds() { state.holding = state.running !== null && !runs[state.running].yields; return state.holding; },
    begin() { state.active = true; state.running = null; state.holding = false; },
    end() { if (state.running) runs[state.running].end(); state.running = null; state.holding = false; state.active = false; },
    step(senses, dt) {
      const g = view.ground;
      if (!g) { own.muscles.activation.fill(0); own.muscles.velocity.fill(0); return; }
      if (!state.running) {
        const foe = distance(senses);
        right.set(1, 0, 0).applyRotationQuaternionToRef(view.root.rotation, right);
        const toward = foe ? (foe.centre.x - g.centre.x) * right.x + (foe.centre.z - g.centre.z) * right.z : 0;
        state.side = toward > 0 ? "left" : "right";
        const next = g.lie === "front" ? "back" : "front";
        if (!runs[next].admits(g, state.side)) { drive({}, .3, 2, .3); return; }
        runs[next].begin(state.side); state.running = next;
      }
      const ended = runs[state.running].step(g, senses, dt);
      if (!ended) state.holding = true;
      if (ended) { state.last = ended; if (ended === "done") state.completed++; else state.failed++; state.running = null; state.holding = false; }
    },
  };
}