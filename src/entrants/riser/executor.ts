import { bodyEffectors } from "../../core/control/effectors.ts";
import { groundRefusal } from "../../core/control/ground-reading.ts";
import { heldBody } from "../../core/mind/held-body.ts";
import type { ActionClaim, Executor } from "../../core/skills/framework/action.ts";
import type { ExecutorPart } from "../../core/skills/framework/executor-part.ts";
import { deepFreeze } from "../../core/state.ts";
import { recoveryControl, recoveryMove, type RecoveryMove } from "./control.ts";
import { recoveryRecordFault } from "./settings.ts";

/** Each movement has its own action identity and lifecycle in the ordinary action arbiter. */
export const RECOVERY_ACTIONS = deepFreeze({ right: "riser-right", gather: "riser-gather", plant: "riser-plant", extend: "riser-extend" });
const MOVES = Object.freeze(Object.keys(RECOVERY_ACTIONS) as RecoveryMove[]);
const moveOf = (action: string): RecoveryMove | undefined => MOVES.find(move => RECOVERY_ACTIONS[move] === action);

/** A complete body claim prevents the standing controller and a recovery from driving the same leg. */
export const RECOVERY_EXECUTOR: ExecutorPart<{ readonly kind: "riser:recovery"; readonly name: string }> = deepFreeze({
  role: "executor", label: "Contact recovery", stage: "experimental", fields: [], slots: [],
  defaults: { kind: "riser:recovery", name: "recovery" }, keys: { kind: true, name: true },
  fits: (spec) => groundRefusal(spec) ?? recoveryRecordFault(spec, {}), faults: () => [], effectors: ["foot.left"], aims: false, actionKeys: [], actionFaults: () => [],
  make({ body, clock }) {
    const n = body.muscles.channels.length, activation = new Float64Array(n), velocity = new Float64Array(n);
    const own = heldBody(body, activation, velocity), movement = recoveryControl(own);
    const holds = Object.freeze([...bodyEffectors(body.built).map(e => e.model.segment), "legs", "trunk"]);
    const state = { live: null as { id: number; move: RecoveryMove; done: boolean; stalled: boolean } | null,
      movement: movement.state, activation, velocity };
    const pushes = own.muscles.channels.map(c => ({ channel: c.name, sense: 1 as 1 | -1, level: 0, speed: 0 }));
    const claim: ActionClaim = { legs: null, pushes };
    const executor: Executor = {
      state, needs: () => holds,
      readiness(view, action) {
        const move = moveOf(action);
        return move && recoveryMove(view) === move ? { kind: "ready" } : { kind: "blocked", reason: "the contact task is not available" };
      },
      start(view, request) {
        const move = moveOf(request.action);
        if (!move || state.live) throw new Error("invalid recovery admission");
        state.live = { id: request.id, move, done: false, stalled: false }; movement.begin(move, view); movement.step(view, clock.dt);
      },
      update(view, continued, _around, dt) {
        const live = state.live;
        if (!live) return [];
        if (!continued.some(request => request.id === live.id)) {
          state.live = null;
          return [{ id: live.id, ending: { kind: live.stalled ? "stalled" : live.done ? "completed" : "cancelled" } }];
        }
        if (!live.done) {
          live.done = movement.step(view, dt);
          if (!live.done && movement.state.elapsed >= 12) { live.done = true; live.stalled = true; }
        }
        // Completion keeps the claim until the arbiter replaces it, with no standing-control gap.
        const side = movement.state.leadLoaded ? "right" : "left", clearance = movement.state.landingClearance[movement.state.leadLoaded ? 1 : 0]!;
        const stage = live.move === "plant" ? `plant ${side} (${clearance.toFixed(3)} m clear)` : live.move;
        return [{ id: live.id, phase: live.done ? "release" : "commit", stage: live.stalled ? `stalled:${live.move}` : stage, holds }];
      },
      command() {
        for (let i = 0; i < n; i++) { const push = pushes[i]!; push.sense = velocity[i]! < 0 ? -1 : 1; push.level = activation[i]!; push.speed = velocity[i]!; }
        return claim;
      },
      interrupt(_view, id) { if (state.live?.id === id) state.live = null; },
      resume() { state.live = null; },
    };
    return executor;
  },
});
