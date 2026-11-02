import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { SubMind } from "../mind/sub-mind.ts";
import type { effectorTracker } from "../control/effector-tracker.ts";
import type { supportedMotor } from "../control/supported-motor.ts";
import { servo } from "../control/servo.ts";
import { turnOfToRef } from "../read-motion.ts";
import type { QuadrupedView } from "./crawl.ts";
import { deepFreeze } from "../state.ts";
import ratRighting from "../../../assets/rat/righting.json" with { type: "json" };

/**
 * One pose of a righting recipe: each freedom's angle by its channel's name, the rest at their
 * reference angle. It gives way to the next once the trunk is up to `up`, or after `hold` s.
 */
export interface RightingFrame { readonly targets: Readonly<Record<string, number>>; readonly hold: number; readonly up: number }

/**
 * **A body's righting recipe**: the poses its freedoms are servoed through to bring it from lying
 * to its paws, found for the body offline (`scripts/quadruped/righting.mjs`). `side`'s poses are
 * for the body on its right side; on its left they are mirrored.
 */
export interface RightingRecipe {
  /** Seconds at the reference pose before it reads how it lies. */
  readonly settle: number;
  /** The servo's time to a pose, s. */
  readonly servo: number;
  /** The trunk's up (the cosine of its tilt) and the centre of mass's speed, m/s, that the last pose holds for `still` s to hand the body back. */
  readonly upright: number;
  readonly calm: number;
  readonly still: number;
  /** Seconds of poses after which it settles and starts again. */
  readonly limit: number;
  /** A trunk whose up stays under `tilt` for `wait` s is righted though the body is not down: a crouch the gaits cannot lift. */
  readonly tilt: number;
  readonly wait: number;
  readonly side: readonly RightingFrame[];
  /** On its back, the trunk's up under -.5; without them, `side`'s. */
  readonly back?: readonly RightingFrame[];
}

/**
 * **Each body's own recipe** by its model, found by `scripts/quadruped/righting.mjs`
 * (`docs/reference/reptile.md#righting`); a mind's `tuning.righting` overrides it, and a body with
 * none rights itself by routes (`recover`).
 */
export const RIGHTING: Readonly<Record<string, RightingRecipe>> = deepFreeze({ rat: ratRighting });

/** A recipe's faults: none where it can be played. */
export function rightingFaults(recipe: RightingRecipe): readonly string[] {
  const frames = [...recipe.side, ...recipe.back ?? []];
  const numbers = [recipe.settle, recipe.servo, recipe.upright, recipe.calm, recipe.still, recipe.limit, recipe.tilt, recipe.wait, ...frames.flatMap(f => [f.hold, f.up, ...Object.values(f.targets)])];
  return recipe.side.length && recipe.back?.length !== 0 && numbers.every(Number.isFinite) && recipe.servo > 0 ? [] : ["invalid righting recipe"];
}

/**
 * **Righting by recipe**: the body held at its reference pose for `settle` s, then servoed through
 * its recipe's poses for how it lies, and handed back once its last pose has held the trunk upright
 * and calm for `still` s.
 * Lying on its left, each freedom takes its mirror image's angle: the freedom of the same name on
 * the other side, its sense kept about the body's x axis and turned about y and z, as a mirror in
 * the body's x turns a rotation.
 */
export function rightingByRecipe(own: OwnBody, motor: ReturnType<typeof supportedMotor>, tracker: ReturnType<typeof effectorTracker>, view: QuadrupedView, recipe: RightingRecipe): SubMind {
  const channels = own.muscles.channels, names = channels.map(c => c.name);
  const mirror = channels.map((c, i) => {
    const other = names.indexOf(names[i]!.replace(/\.left\b/, ".@").replace(/\.right\b/, ".left").replace(".@", ".right"));
    const a = c.joint.spec.dofs[c.index]!.axis.value;
    return { other: other < 0 ? i : other, sense: a[0] * a[0] - a[1] * a[1] - a[2] * a[2] };
  });
  const state = { phase: "idle" as "idle" | "settle" | "play", time: 0, sequence: 0, retries: 0, frame: 0, since: 0, mirrored: false, lie: "side" as "side" | "back", tilted: -1, still: -1 };
  const turn = new Quaternion(), up = new Vector3(), side = new Vector3();
  const readTurn = () => { turnOfToRef(motor.root, turn); up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up); side.set(1, 0, 0).applyRotationQuaternionToRef(turn, side); };
  const begin = () => { tracker.reset(); motor.resume(); state.phase = "settle"; state.time = 0; state.frame = 0; state.tilted = -1; state.still = -1; state.sequence++; };
  /** Whether the trunk has stayed tilted past the recipe's mark for its wait, at `time`. */
  const tilted = (time: number) => {
    readTurn();
    if (up.y >= recipe.tilt) { state.tilted = -1; return false; }
    if (state.tilted < 0) state.tilted = time;
    return time - state.tilted >= recipe.wait;
  };
  return { name: "righting", state, wants: (senses) => view.down || state.phase !== "idle" || tilted(senses.time), begin,
    end() { state.phase = "idle"; tracker.reset(); motor.resume(); },
    step(_senses, dt) {
      state.time += dt;
      readTurn();
      if (state.phase === "settle") {
        servo(own.muscles, () => 0, recipe.servo, dt);
        if (state.time < recipe.settle) return;
        // How it lies: on its back, or on a side, its right where the body's +x points down.
        state.lie = up.y < -.5 && recipe.back ? "back" : "side"; state.mirrored = side.y > 0;
        state.phase = "play"; state.time = 0; state.frame = 0; state.since = 0;
      }
      const frames = recipe[state.lie] ?? recipe.side, last = frames.length - 1;
      if (state.frame < last && (state.time - state.since >= frames[state.frame]!.hold || up.y >= frames[state.frame]!.up)) { state.frame++; state.since = state.time; }
      const calm = state.frame === last && state.time - state.since >= frames[last]!.hold && up.y >= recipe.upright && view.velocity.lengthSquared() <= recipe.calm * recipe.calm;
      if (!calm) state.still = -1;
      else if (state.still < 0) state.still = state.time;
      if (calm && state.time - state.still >= recipe.still) { state.phase = "idle"; return; }
      if (state.time >= recipe.limit) { state.retries++; begin(); return; }
      const targets = frames[state.frame]!.targets;
      servo(own.muscles, i => {
        if (!state.mirrored) return targets[names[i]!] ?? 0;
        const m = mirror[i]!;
        return (targets[names[m.other]!] ?? 0) * m.sense;
      }, recipe.servo, dt);
    } };
}
