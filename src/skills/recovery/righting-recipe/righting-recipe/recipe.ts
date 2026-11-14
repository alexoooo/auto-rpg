import { Quaternion, Vector3 } from "../../../../core/math/vector.ts";
import { servo } from "../../../../control/servo.ts";
import type { OwnBody } from "../../../../core/bodies/own-body.ts";
import { turnOfToRef } from "../../../../core/bodies/read-motion.ts";
import type { TechniqueEnd, TechniqueRun } from "../../shared/technique.ts";

/**
 * One pose of a righting recipe: each freedom's angle by its channel's name, the rest at their
 * reference angle. It gives way to the next once the trunk is up to `up`, or after `hold` s.
 */
export interface RightingFrame { readonly targets: Readonly<Record<string, number>>; readonly hold: number; readonly up: number }

/**
 * **A body's righting recipe**: the poses its freedoms are servoed through to bring it from lying
 * to its paws, found for the body offline (`scripts/skills/recovery/righting/righting.mjs`). `side`'s poses are
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
  /** Seconds of poses after which it has timed out. */
  readonly limit: number;
  readonly side: readonly RightingFrame[];
  /** On its back, the trunk's up under -.5; without them, `side`'s. */
  readonly back?: readonly RightingFrame[];
}

/** Whether `recipe` can be played: poses on its side, none or some on its back, every number finite, and its servo's time positive. */
export function wholeRecipe(recipe: Partial<RightingRecipe>): boolean {
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return false;
  const side = recipe.side, back = recipe.back;
  if (!Array.isArray(side) || side.length === 0 || back !== undefined && (!Array.isArray(back) || back.length === 0)) return false;
  const frames = [...side, ...back ?? []];
  if (!frames.every(f => f && typeof f === "object" && f.targets && typeof f.targets === "object" && !Array.isArray(f.targets))) return false;
  const numbers = [recipe.settle, recipe.servo, recipe.upright, recipe.calm, recipe.still, recipe.limit, ...frames.flatMap((f) => [f.hold, f.up, ...Object.values(f.targets)])];
  return numbers.every((n) => typeof n === "number" && Number.isFinite(n)) && recipe.servo! > 0;
}

/**
 * **Righting by recipe**: the body held at its reference pose for `settle` s, then servoed through
 * its recipe's poses for how it lies, and done once its last pose has held the trunk upright and
 * calm for `still` s; timed out after `limit` s of poses. Lying on its left, each freedom takes its
 * mirror image's angle: the freedom of the same name on the other side, its sense kept about the
 * body's x axis and turned about y and z, as a mirror in the body's x turns a rotation. It yields
 * while it settles.
 */
export function rightingByRecipe(own: OwnBody, recipe: RightingRecipe): TechniqueRun {
  const channels = own.muscles.channels, names = channels.map((c) => c.name), root = own.muscles.dynamics.root.segment;
  const mirror = channels.map((c, i) => {
    const other = names.indexOf(names[i]!.replace(/\.left\b/, ".@").replace(/\.right\b/, ".left").replace(".@", ".right"));
    const a = c.joint.spec.dofs[c.index]!.axis.value;
    return { other: other < 0 ? i : other, sense: a[0] * a[0] - a[1] * a[1] - a[2] * a[2] };
  });
  const state = { phase: "idle" as "idle" | "settle" | "play", time: 0, frame: 0, since: 0, mirrored: false, lie: "side" as "side" | "back", still: -1 };
  const turn = new Quaternion(), up = new Vector3(), side = new Vector3();
  const readTurn = () => { turnOfToRef(root, turn); up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up); side.set(1, 0, 0).applyRotationQuaternionToRef(turn, side); };
  return {
    state, get phase() { return state.phase; }, get stage() { return state.phase === "play" ? `play ${state.frame}` : state.phase; },
    get yields() { return state.phase === "settle"; },
    admits: () => true,
    reached: (g, to) => g.position === to,
    begin() { state.phase = "settle"; state.time = 0; state.frame = 0; state.since = 0; state.still = -1; },
    end() { state.phase = "idle"; },
    step(g, _senses, control, dt): TechniqueEnd | null {
      state.time += dt;
      readTurn();
      if (state.phase === "settle") {
        servo(own.muscles, control.muscles, () => 0, recipe.servo, dt);
        if (state.time < recipe.settle) return null;
        // How it lies: on its back, or on a side, its right where the body's +x points down.
        state.lie = up.y < -.5 && recipe.back ? "back" : "side"; state.mirrored = side.y > 0;
        state.phase = "play"; state.time = 0; state.frame = 0; state.since = 0;
      }
      const frames = recipe[state.lie] ?? recipe.side, last = frames.length - 1;
      if (state.frame < last && (state.time - state.since >= frames[state.frame]!.hold || up.y >= frames[state.frame]!.up)) { state.frame++; state.since = state.time; }
      const calm = state.frame === last && state.time - state.since >= frames[last]!.hold && up.y >= recipe.upright && g.velocity.lengthSquared() <= recipe.calm * recipe.calm;
      if (!calm) state.still = -1;
      else if (state.still < 0) state.still = state.time;
      if (calm && state.time - state.still >= recipe.still) { state.phase = "idle"; return "done"; }
      if (state.time >= recipe.limit) { state.phase = "idle"; return "timed-out"; }
      const targets = frames[state.frame]!.targets;
      servo(own.muscles, control.muscles, (i) => {
        if (!state.mirrored) return targets[names[i]!] ?? 0;
        const m = mirror[i]!;
        return (targets[names[m.other]!] ?? 0) * m.sense;
      }, recipe.servo, dt);
      return null;
    },
  };
}
