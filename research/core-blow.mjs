/**
 * **One blow by a core human, scored by the rule a fight wounds by.** The body stands on its own
 * feet on the core stand with what it holds and throws the blow from there, through the strike
 * skill, as the game's body throws the recipe it becomes (`throwBlow`, `src/lab/blow.ts`). The
 * blow is thrown at a target body: a ball of the part a foe of the thrower's own build has at
 * the blow's band (`BANDS`, `dummySpec`), hung where the blow is thrown at, and the blows between
 * the two are read by `watchBlows` under the arena's rulebook (`watchBlow`). What the blow is
 * worth is what it does the target less what it costs the body that throws it, with the body
 * standing afterwards whether it lands or misses (`scoreOf`).
 *
 * The target's height is the band's: the thrower's own part of that band, its centre of mass
 * over the head's in the reference pose (`bandRise`), so a search chooses how far ahead the
 * target stands and nothing else of its place.
 *
 * A candidate is whatever its loadout's row decodes (`HELD`): the freedoms a blow with that in
 * the hand may push. An item added later adds a row.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { footStatesOf, soleMiddleToRef, withinSupport } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { SUPPORT_INSET } from "../src/core/control/stance-tuning.ts";
import { hypot } from "../src/core/math/real.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { placedReach } from "../src/core/skills/strike.ts";
import { FIST } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { bandRise, throwBlow, watchBlow } from "../src/lab/blow.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { CLUB_BLOW } from "./core-club-strike.mjs";
import { decodeBy, dimensionsBy, encodeBy, perturbed, STRAIGHT } from "./core-strike.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

export const CORE_BLOW_HARNESS = "Node core stand, Rapier, standing on its feet as built, ground on, no assist; "
  + "a blow thrown through the strike skill at a target body of its band's part hung at its place, read by the arena's rulebook";

/**
 * **What a hand may hold in a search**, by the core's name for it (`heldIn`): the item, and the
 * row its candidates are decoded by (`decodeBy`): the freedoms a blow with it may push and those
 * its chamber poses. `guard` says whether it may be thrown from the guard, with no chamber.
 */
export const HELD = Object.freeze({
  [FIST]: { item: null, row: STRAIGHT, guard: true },
  "wooden club": { item: woodenClub, row: CLUB_BLOW, guard: false },
});

const rowOf = (held) => {
  const known = HELD[held];
  if (!known) throw new Error(`no search holds ${JSON.stringify(held)}: one of ${Object.keys(HELD).join(", ")}`);
  return known;
};

/** The body of `model` with `held` in its `hand`. */
export function heldSpec(model, held, hand = "right") {
  const { item } = rowOf(held), spec = modelSpec(model);
  return item ? armed(spec, hand, item()) : spec;
}

/** The strike and the target's distance ahead that `unit` stands for, with `held` in the hand of `spec`. */
export const decodeHeld = (held, unit, spec, hand = "right", guard = false) => decodeBy(rowOf(held).row, unit, spec, hand, guard);
/** How many numbers a candidate with `held` in the hand takes. */
export const dimensionsHeld = (held, hand = "right", guard = false) => dimensionsBy(rowOf(held).row, hand, guard);
/** The numbers that stand for `strike` at a target `ahead`, with `held` in the hand of `spec`. */
export const encodeHeld = (held, strike, ahead, spec) => encodeBy(rowOf(held).row, strike, ahead, spec);

/** Seconds after a strike's pushes end in which the body must stay up, and by whose end it must stand on both feet. */
const RECOVER = 1;

/** Seconds a blow is given, from the body's being built to the end of `RECOVER`: over the longest stand, chamber and pushes a search tries, twice. */
const MOST = 8;

const RULES = rulebook("arena");

/**
 * One blow, thrown standing from the guard as the strike skill throws it (`throwBlow`), by
 * `model` with `held` in its `hand`, at a target body of `band` hung `ahead` of the head, or at
 * nothing (`dummy: false`). The blow is the one `unit` stands for, or a given `strike` at `ahead`;
 * a `strike` of null is the skill's placed blow, at the distance the skill stands for it unless
 * `ahead` is given. `perturbation` is `perturbed`'s; `off` moves the target from its place, m, as
 * a body stands off it (`StandOff`); `ground` is the ground's side, m; `recover` is how long
 * after the pushes end the body is watched, s, where it is not `RECOVER`. `trace` is called after
 * every step with the throwing body and the blow (`balanceTrace`'s `take`), and reads nothing
 * the score does.
 *
 * Returns what the rule read: `done`, the hit points the target lost; `cost`, those the thrower
 * lost; `nearest`, m, how near the striking hand, with what it holds, came to the target from
 * the beginning of the pushes, null with no target; `fell`; `stood`, whether it stood on both
 * feet at the end of that time; and `blows`, every blow between the two.
 */
export async function evaluateBlow({ model = "workshop-fighter", held = FIST, hand = "right", band = "high", unit, guard = false,
  strike, ahead, hz = 120, ground = 20, dummy = true, perturbation, off, recover = RECOVER, trace }) {
  const spec = heldSpec(model, held, hand), up = bandRise(spec, band);
  const given = unit ? decodeHeld(held, unit, spec, hand, guard)
    : strike === null ? { strike: null, distance: ahead ?? placedReach(spec, hand, up) } : { strike, distance: ahead };
  if (given.strike === undefined || !(given.distance > 0)) throw new Error("a blow is a unit, or a strike and how far ahead its target stands");
  const thrown = given.strike && perturbation ? perturbed(given.strike, perturbation) : given.strike;
  const stand = await coreStand(spec, { ground: true, groundSize: ground, hz });
  const actor = labActor(stand.built, stand.world);
  const blow = throwBlow(actor, { hand, strike: thrown, place: { ahead: given.distance, up }, band });
  const watch = watchBlow(actor, blow, RULES, { dummy, off });
  const { view } = blow.body;
  let fell = false, ended = null;
  try {
    for (let i = 0; i < stand.seconds(MOST); i++) {
      stand.step(1);
      trace?.(blow.body, blow);
      if (view.down) { fell = true; break; }
      if (ended === null && blow.report.strike.thrown[hand] > 0) ended = blow.time;
      if (ended !== null && blow.time - ended >= recover) break;
    }
    const { done, cost, nearest, blows } = watch.reading;
    return { done, cost, nearest, fell, stood: !fell && view.stance.phase === "stand", blows };
  } finally { watch.dispose(); blow.dispose(); stand.dispose(); }
}

/**
 * **How a blow's body keeps its feet**, read after each step it is handed (`evaluateBlow`'s
 * `trace`). The capture point is the centre of mass's place over the ground plus its velocity over
 * the pendulum's rate, the square root of gravity over the centre's height above the soles
 * (Pratt et al. 2006, "Capture point: a step toward humanoid push recovery"): where a foot must be
 * to stop the body. It is read against two outlines of both soles' corners: as they stand, where
 * past it no stance on these feet holds the body (`out`, m outside, 0 inside), and drawn in by
 * `SUPPORT_INSET`, where past it by the recovery's margin the stance steps to catch the body
 * (`inner`; `recoveryStep`, `src/core/control/gait.ts`). `ahead` and `aside` are the capture
 * point's least and most from the soles' middle as they stood before the pushes, along the
 * heading the body was built facing (+z) and to its right (+x), m. The shortfall is what the
 * stance asked of the ground that the soles could not give (`StanceReading.shortfall`), the force
 * in the body's weights.
 *
 * The reading: the most of each over the blow; the first time, s from the pushes' beginning
 * (`report.strike.since`), that the capture point left the inner outline, null if it never did
 * after them; the stance's own steps to catch the body (`StanceReading.recoveries`); and whether
 * it ever lifted a foot.
 */
export function balanceTrace(body) {
  const feet = footStatesOf(body.built), soles = feet.map((foot) => ({ corners: foot.corners })), scratch = new Vector3();
  const g = -body.built.physics.gravity[1], weight = g * [...body.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0);
  const reading = { out: 0, inner: 0, force: 0, moment: 0, ahead: [0, 0], aside: [0, 0], left: null, recoveries: 0, stepped: false };
  /** When the pushes began, on the blow's clock (`blow.time`); null before. */
  let began = null;
  /** The soles' middle as the body stood when the pushes began, world (x, z). */
  const home = [0, 0];
  const outside = (x, z, inset) => {
    const [px, pz] = withinSupport(soles, x, z, inset);
    return hypot(x - px, z - pz);
  };
  return {
    reading,
    take(_, blow) {
      const { stance } = body.view;
      for (const foot of feet) soleMiddleToRef(foot, scratch);
      const { centre, velocity, support } = stance, rate = Math.sqrt(g / (centre.y - support.y));
      const x = centre.x + velocity.x / rate, z = centre.z + velocity.z / rate, { since } = blow.report.strike;
      if (began === null && since >= 0) { began = blow.time - since; home[0] = support.x; home[1] = support.z; }
      if (began === null) return;
      const inner = outside(x, z, SUPPORT_INSET);
      reading.out = Math.max(reading.out, outside(x, z, 0));
      reading.inner = Math.max(reading.inner, inner);
      reading.ahead = [Math.min(reading.ahead[0], z - home[1]), Math.max(reading.ahead[1], z - home[1])];
      reading.aside = [Math.min(reading.aside[0], x - home[0]), Math.max(reading.aside[1], x - home[0])];
      reading.force = Math.max(reading.force, stance.shortfall.force.length() / weight);
      reading.moment = Math.max(reading.moment, stance.shortfall.moment.length());
      if (inner > 0 && reading.left === null) reading.left = blow.time - began;
      reading.recoveries = stance.recoveries;
      reading.stepped ||= stance.phase !== "stand";
    },
  };
}

/** The score of a blow that leaves the body down, or not standing: under any miss. */
export const FELL = -100;
/** What a miss scores at the target's surface, and how far a blow whose pushes never began is taken to have passed, m: under any hit, a body having fewer hit points than this to lose. */
const MISS = -50, FAR = 10;

/**
 * A candidate's score from one evaluation: for a hit, the hit points it did less those it cost;
 * for a miss, under any hit, by how near it passed; `FELL` for a fall or for not standing after.
 */
export function scoreOf({ done, cost, nearest, fell, stood }) {
  if (fell || !stood) return FELL;
  if (done > 0) return done - cost;
  return MISS - Math.min(FAR, nearest ?? FAR);
}

/**
 * A candidate's score from its trials' readings and the one thrown at nothing: its mean over the
 * trials; `FELL` where the blow thrown at nothing left the body down or not standing, whatever it
 * does when it lands.
 */
export function candidateScore(trials, atNothing) {
  if (scoreOf(atNothing) === FELL) return FELL;
  return trials.reduce((sum, reading) => sum + scoreOf(reading), 0) / trials.length;
}
