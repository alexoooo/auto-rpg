import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBody } from "../core/build/build-body.ts";
import type { Hand } from "../core/control/motor.ts";
import { cos, sin } from "../core/math/real.ts";
import type { Sight } from "../core/mind/tactics.ts";
import { watchBlows, type BlowWatch, type Fighter, type LandedBlow } from "../core/rules/blows.ts";
import { createPool } from "../core/rules/pool.ts";
import type { Rulebook } from "../core/rules/rulebook.ts";
import type { BodySpec, ShapeSpec } from "../core/spec/body.ts";
import { ballMoment } from "../core/spec/geometry.ts";
import { derive, type Vec3 } from "../core/spec/quantity.ts";
import type { World } from "../core/world.ts";
import { mulberry32 } from "../rng.ts";
import type { Actor } from "./actor.ts";

/**
 * **The lab's targets**: bodies hung in the air and struck under the rule a fight wounds by
 * (`watchBlows`, `src/core/rules/blows.ts`). A target is drawn by seed in a box scaled to the body
 * that strikes at it (`drawTargets`); its body is a ball of that body's head (`dummySpec`), hung
 * as the strike at it begins and held up against its own weight and nothing else (`hangDummy`);
 * and what the strike did to it, or how near it passed, is one reading (`readTarget`). Whatever
 * the body is and whatever its hand holds, the reading is the same.
 * Record: `docs/reference/blows.md#targets`.
 */

/**
 * **Where the lab's targets are drawn**, in the attacker's statures: across and along the
 * heading about a place, and up from the ground by stratum. A target's stratum is its turn's:
 * high, middle, low, in that order. Set: `docs/reference/lab.md#targets`.
 */
export const TARGET_BOX = {
  across: [-0.2, 0.2], along: [-0.1, 0.1],
  up: { high: [0.75, 1], middle: [0.5, 0.75], low: [0.15, 0.5] },
} as const;

/** The strata a target is drawn in, in their turns' order. */
const STRATA = ["high", "middle", "low"] as const satisfies readonly (keyof typeof TARGET_BOX.up)[];

type Stratum = "control" | keyof typeof TARGET_BOX.up;

/** A target: where it hangs (world, m), and which stratum it was drawn in. */
export interface Target {
  readonly at: Vec3;
  readonly stratum: Stratum;
}

/**
 * `count` targets about `place` (world, on the ground) for a body of `stature` facing `heading`:
 * the first is the control, at `place` and `head` high, where today's recipes land; each one
 * after is drawn in the box from `seed`'s stream (`mulberry32`), three draws a target: across,
 * along, up.
 */
export function drawTargets(seed: number, count: number, frame: { readonly place: Vec3; readonly heading: number; readonly stature: number; readonly head: number }): Target[] {
  const { place, heading, stature, head } = frame, random = mulberry32(seed);
  const fx = sin(heading), fz = cos(heading);
  const within = ([low, high]: readonly [number, number]): number => (low + (high - low) * random()) * stature;
  const targets: Target[] = [];
  for (let k = 0; k < count; k++) {
    if (k === 0) { targets.push({ at: [place[0], head, place[2]], stratum: "control" }); continue; }
    const stratum = STRATA[(k - 1) % STRATA.length]!;
    const across = within(TARGET_BOX.across), along = within(TARGET_BOX.along), up = within(TARGET_BOX.up[stratum]);
    // Across the ground, forward is (fx, fz) and the right (fz, -fx).
    targets.push({ at: [place[0] + along * fx + across * fz, up, place[2] + along * fz - across * fx], stratum });
  }
  return targets;
}

/** A dummy's one segment, and its part in its pool. */
const DUMMY_PART = "head";

/**
 * **A target's body**: one ball, the attacker's head's mass and its head capsule's radius, named
 * `head`, with the attacker's hit points in it and never coming off. Every number is the
 * attacker's own, by a rule that names it. Its frame's origin is the ball's centre, so its node is
 * where it is.
 */
export function dummySpec(attacker: BodySpec): BodySpec {
  const head = attacker.segments.find((segment) => segment.name === "head");
  if (!head || (head.shape.kind !== "capsule" && head.shape.kind !== "sphere")) throw new Error(`${attacker.model} has no head a ball is made of`);
  const mass = derive("kg", "the attacker's head's mass", [head.mass], (m) => m);
  const radius = derive("m", "the attacker's head capsule's radius", [head.shape.radius], (r) => r);
  const centre = derive("m", "the ball's centre, its frame's origin", [], (): Vec3 => [0, 0, 0]);
  return {
    family: "dummy", model: `${attacker.model}.dummy`, mass,
    stature: derive("m", "the ball's height, twice its radius", [radius], (r) => 2 * r),
    segments: [{
      name: DUMMY_PART, proximal: centre, mass, centreOfMass: centre,
      distal: derive("m", "the ball's top, its radius over its centre", [radius], (r): Vec3 => [0, r, 0]),
      inertia: derive("kg m2", "a solid ball's moment about each axis", [mass, radius], (m, r): Vec3 => [ballMoment(m, r), ballMoment(m, r), ballMoment(m, r)]),
      shape: { kind: "sphere", centre, radius },
    }],
    joints: [],
    wounds: { hp: derive("HP", "the attacker's hit points", [attacker.wounds.hp], (hp) => hp), vital: [], whole: [DUMMY_PART] },
    attributes: { balance: derive("%", "the attacker's balance", [attacker.attributes.balance], (percent) => percent) },
  };
}

/** A dummy's ball, from its spec. */
function ballOf(spec: BodySpec): Extract<ShapeSpec, { readonly kind: "sphere" }> {
  const shape = spec.segments.find((segment) => segment.name === DUMMY_PART)?.shape;
  if (spec.segments.length !== 1 || shape?.kind !== "sphere") throw new Error(`${spec.model} is no dummy`);
  return shape;
}

/** A hung dummy. */
interface Dummy {
  /** What a blow watch takes, on a side of its own. */
  readonly fighter: Fighter;
  /** The ball's centre, world: its node's own place, as the last step left it. */
  readonly centre: Vector3;
  readonly radius: number;
  dispose(): void;
}

/**
 * Hang a dummy at `at` in `world`: held up by a force equal to its weight through each step and
 * nothing else, so it stays where it hangs and gives way to a blow as a head on no neck does.
 * A force lasts one step, and a hook added while the world steps first runs in the next: the step
 * the dummy is hung in or before has its force from here, and the hook leaves that step alone.
 * `fighter` is what a blow watch takes (`Fighter`), on a side of its own.
 */
export function hangDummy(world: World, spec: BodySpec, at: Vec3, rules: Rulebook): Dummy {
  const radius = ballOf(spec).radius.value, built = buildBody(spec, world, { position: at });
  const { body, node, rigid } = built.segments.get(DUMMY_PART)!, g = world.physics.gravity;
  const weight = new Vector3(-g[0] * rigid.mass, -g[1] * rigid.mass, -g[2] * rigid.mass);
  const hold = (): void => body.applyForce(weight, node.position), hung = world.steps;
  hold();
  const held = world.beforeStep(() => {
    if (world.steps !== hung) hold();
  });
  return {
    fighter: { id: "dummy", side: "dummy", built, pool: createPool(spec, rules) },
    centre: node.position, radius,
    dispose() {
      held.dispose();
      built.dispose();
    },
  };
}

/** The strike thrown at a target. */
interface ThrownStrike {
  readonly name: string;
  /** Peak speed of the striking fist in the world, m/s, from the strike's beginning to the end of its pushes. */
  readonly peak: number;
  /**
   * Where the head stood as the strike began, from the recipe's place, m: along the heading
   * (positive, the target was beyond the recipe's distance) and across it (positive, to the right).
   */
  readonly off: { readonly along: number; readonly across: number };
}

/** What one target read. */
export interface TargetReading {
  readonly target: Target;
  readonly hand: Hand;
  /** The strike thrown at it; null if none began. */
  readonly strike: ThrownStrike | null;
  /** Seconds from the attack being asked to the end of the watch. */
  readonly seconds: number;
  /**
   * Whether its dummy was hung. A dummy is hung as its strike begins, or as soon after as its
   * place is clear of the body (`TARGET_CLEAR`): one whose place the body filled to the end of the
   * strike's pushes was not, and the strike was read at nothing.
   */
  readonly hung: boolean;
  /**
   * The nearest any shape of the hand's body came to the dummy's surface, or to where it would
   * hang while it does not, from the strike's beginning to the watch's end, m: 0 where they
   * touched; null if no strike began.
   */
  readonly nearest: number | null;
  /** The first blow on the dummy, or null. */
  readonly blow: LandedBlow | null;
  /** Whether the body went down before the watch's end: the reading closed there. */
  readonly fell: boolean;
}

/** Seconds a target is watched after its strike's pushes end. */
export const TARGET_WATCH = 0.5;

/**
 * How far every shape of the body is from a dummy's surface as the dummy is hung, m: a body
 * made inside another is thrown out of it by the solver, which is no blow. Set:
 * `docs/reference/lab.md#targets`.
 */
const TARGET_CLEAR = 0.02;

/** One target's reading under way. */
interface TargetRead {
  /** The target's ball, for whatever draws it: where its dummy is (world, m), or where it will hang, and its radius, m. */
  readonly ball: { readonly centre: Vec3; readonly radius: number };
  /** Called from the actor's watch each control step; returns the reading once, when it closes. */
  step(sight: Sight): TargetReading | null;
  /** Close the reading as it stands, the body down. */
  fall(): TargetReading;
  dispose(): void;
}

/**
 * Read one target on `actor`'s body: hang its dummy as the strike skill first holds `hand`'s
 * chamber or pushes, or as soon after as its place is clear of the body; watch the blows between
 * the two under `rules` with a fresh pool for the attacker; and close the reading `TARGET_WATCH`
 * after the strike's pushes end. Until its strike begins a target is a place and no body: nothing
 * stands in the way of the walk to it. `step(sight)` is called from the actor's watch each
 * control step, and returns the reading once, when it closes. A body that goes down is no longer
 * stepped by its tactics, so whatever steps the world closes the reading then (`fall`).
 */
export function readTarget(actor: Actor, target: Target, hand: Hand, rules: Rulebook): TargetRead {
  const { world, body } = actor, built = body.built;
  const spec = dummySpec(built.spec), radius = ballOf(spec).radius.value;
  const striking = built.segments.get(`hand.${hand}`);
  if (!striking) throw new Error(`${built.spec.model} has no ${hand} hand`);
  const segments = [...built.segments.values()];
  const asked = world.time;
  let up: { readonly dummy: Dummy; readonly watch: BlowWatch } | null = null;
  const fist = body.view.fists[hand];
  let strike: { name: string; peak: number; readonly off: ThrownStrike["off"] } | null = null, nearest: number | null = null;
  /** The hand's strikes thrown before this one, once it has begun; and when its pushes ended. */
  let thrown: number | null = null, ended: number | null = null;
  const reading = (fell: boolean): TargetReading => {
    const blow = up?.watch.blows.find((b) => b.target === up!.dummy.fighter.id) ?? null;
    return { target, hand, strike: strike && { ...strike }, seconds: world.time - asked, hung: up !== null, nearest, blow, fell };
  };
  /** Where the ball is: its dummy's centre, or its place while none hangs. */
  const centre = (): Vec3 => up ? [up.dummy.centre.x, up.dummy.centre.y, up.dummy.centre.z] : target.at;
  return {
    get ball() { return { centre: centre(), radius }; },
    step({ view, report }) {
      if (thrown === null || !strike) {
        if (report.strike.hand !== hand || (report.strike.phase !== "chamber" && report.strike.phase !== "swing")) return null;
        thrown = report.strike.thrown[hand];
        const chosen = report.strike.chosen!, h = report.heading, dx = target.at[0] - view.head.x, dz = target.at[2] - view.head.z;
        strike = {
          name: chosen.strike.name, peak: 0,
          off: { along: dx * sin(h) + dz * cos(h) - chosen.recipe.distance, across: dx * cos(h) - dz * sin(h) },
        };
      }
      if (ended === null) {
        strike.peak = Math.max(strike.peak, fist.velocity.length());
        if (!up && segments.every((segment) => segment.body.gapTo(target.at) - radius > TARGET_CLEAR)) {
          const dummy = hangDummy(world, spec, target.at, rules);
          const attacker: Fighter = { id: "attacker", side: "attacker", built, pool: createPool(built.spec, rules) };
          up = { dummy, watch: watchBlows(world, [attacker, dummy.fighter], rules) };
        }
      }
      const gap = Math.max(0, striking.body.gapTo(centre()) - radius);
      nearest = nearest === null ? gap : Math.min(nearest, gap);
      if (ended === null && report.strike.thrown[hand] > thrown) ended = world.time;
      return ended !== null && world.time - ended >= TARGET_WATCH ? reading(false) : null;
    },
    fall: () => reading(true),
    dispose() {
      up?.watch.dispose();
      up?.dummy.dispose();
    },
  };
}
