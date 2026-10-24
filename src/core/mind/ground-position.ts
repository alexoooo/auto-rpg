import type { BodyView } from "../body.ts";
import type { ActionStatus } from "../skills/action.ts";
import type { SupportReport } from "../skills/support-fold.ts";
import type { Side, BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { beside, highestOpening, type GroundPhase } from "./ground-approach.ts";
import { groundNear } from "./ground-near.ts";
import { groundWide } from "./ground-wide.ts";
import { highestSurface } from "./openings.ts";
import { lowOpponent, sensedFootClearance } from "./sensed-bounds.ts";
import type { BodySense } from "./senses.ts";
import { lyingAxis } from "./targets.ts";

/** Protocol facts used by continuous ground positioning. */
export interface GroundReading {
  readonly heading: number;
  readonly actions: readonly ActionStatus[];
  readonly support?: SupportReport;
}

/** Positioning permits admission only after the physical route has settled. */
export interface GroundIntent {
  readonly move: readonly [number, number] | null;
  readonly face: number;
  readonly allow: boolean;
}

/** Observed motion and footprint admission cells: `docs/reference/ground-combat.md#motion-and-route-admission`. */
const GROUND_ADMISSION = Object.freeze({ quiet: .1, spin: .2, steady: .5, outside: .7, ahead: .04, footRadius: .12 });

/** Whether the foe's middle and base segments all move slower than `quiet` and spin slower than `spin`; a segment not sensed counts as still. */
function still(foe: BodySense): boolean {
  return [...foe.spec.marks.middle, foe.spec.marks.base].every(name => {
    const p = foe.segments.get(name);
    return !p || (p.velocity.lengthSquared() <= GROUND_ADMISSION.quiet * GROUND_ADMISSION.quiet && p.spin.lengthSquared() <= GROUND_ADMISSION.spin * GROUND_ADMISSION.spin);
  });
}

/**
 * The hand the close approach may take: of either hand's waypoint `outside` beside `target` across the foe's lying
 * `axis`, the nearer one both soles reach in a straight sweep clear of the foe; the right of equals; null if neither.
 */
function admissibleHand(view: BodyView, foe: BodySense, target: Vec3, axis: number): Side | null {
  const clear = sensedFootClearance(foe), c = view.stance.centre, soles = [view.stance.soles.left, view.stance.soles.right];
  let chosen: Side | null = null, best = Infinity;
  for (const hand of ["right", "left"] as const) {
    const [x, z] = beside(target, axis, hand === "right" ? 1 : -1, GROUND_ADMISSION.outside, GROUND_ADMISSION.ahead);
    const dx = x - c.x, dz = z - c.z;
    if (!soles.every(sole => clear([sole.x, sole.y, sole.z], [sole.x + dx, sole.y, sole.z + dz], GROUND_ADMISSION.footRadius))) continue;
    const distance = dx * dx + dz * dz;
    if (distance < best) {
      best = distance;
      chosen = hand;
    }
  }
  return chosen;
}

/**
 * Choose a close or wider approach from detached motion and foot clearance, retaining the active hand: the close one
 * once the foe has been still for `steady` and a hand is admissible. It takes over while the wider one is still
 * approaching, the wider one only once the close episode has ended, either only while the body stands free; the close
 * one is withdrawn when the foe moves while it is lowered.
 */
export function groundPosition(spec: BodySpec, clearMove: Parameters<typeof groundNear>[0]) {
  const near = groundNear(clearMove), wide = groundWide(spec, clearMove);
  const state = { mode: "wide" as "near" | "wide", steady: 0, phase: "guard" as GroundPhase, surface: null as string | null, near: near.state, wide: wide.state };
  const reset = () => {
    near.reset();
    wide.reset();
    state.mode = "wide";
    state.steady = 0;
    state.phase = "guard";
  };
  return { state, reset, decide(view: BodyView, report: GroundReading, foe: BodySense, hand: Side, dt: number) {
    if (!lowOpponent(view, foe) && !near.state.active && !wide.state.active) {
      reset();
      return null;
    }
    const quiet = still(foe);
    state.steady = quiet ? state.steady + dt : 0;
    let selected = state.mode === "near" ? near : wide;
    const axis = lyingAxis(foe), target = highestOpening(foe, segment => highestSurface(foe, segment))?.target ?? null;
    const closeHand = target && admissibleHand(view, foe, target, axis);
    const mode = state.steady >= GROUND_ADMISSION.steady && closeHand ? "near" : "wide";
    if (mode === "near") hand = closeHand!;
    if (state.mode === "near" && !quiet && selected.state.stage !== "approach") selected.withdraw();
    const free = report.support?.stage === "stand" && !report.actions.length && view.stance.phase === "stand";
    if (mode !== state.mode && (mode === "near" || !selected.state.active) && selected.state.stage === "approach" && free) {
      selected.reset();
      state.mode = mode;
      selected = state.mode === "near" ? near : wide;
    }
    const intent = selected.decide(view, report, foe, hand, dt);
    state.phase = selected.state.phase;
    state.surface = selected.state.surface;
    return intent ? { ...intent, hand: selected.state.hand ?? hand } : null;
  } };
}
