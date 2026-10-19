/**
 * **What the trials of the staged rise read** (`stagedRise`, `src/core/mind/rise/staged.ts`): the
 * game's recipe cut at `fours`, a rise's progress as a record, the tolerances its stages are done by,
 * and a body toppled forward under a riser (`tests/core-rise.test.mjs`,
 * `tests/core-rise-capability.test.mjs`).
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { centreOfToRef, turnOfToRef } from "../../src/core/control/support.ts";
import { stagedRise } from "../../src/core/mind/rise/staged.ts";
import { RISE } from "../../src/core/mind/rise/stages.ts";
import { riserOf, toppled } from "../../research/core-rise-trials.mjs";

/** The game's rise as far as its first bearing stage, `fours`, and its stages before that, which are poses. */
const AT_FOURS = RISE.rise.findIndex((stage) => stage.name === "fours");
export const TO_FOURS = { ...RISE, rise: RISE.rise.slice(0, AT_FOURS + 1) }, POSES = { ...RISE, rise: RISE.rise.slice(0, AT_FOURS) };
/** `recipe` with `stage` in place of the rise's stage of its name. */
export const withStage = (recipe, stage) => ({ ...recipe, rise: recipe.rise.map((old) => (old.name === stage.name ? stage : old)) });
/** The height of `built`'s segment `name`'s centre of mass, m. */
export const heightOf = (built, name) => centreOfToRef(built.segments.get(name), new Vector3()).y;
export const speedOf = (v) => Math.hypot(v.x, v.y, v.z);
/**
 * A rise's progress as a record to compare: where it is in its stages and how it lies, its clocks
 * left out, and of its bearing records each limb's task, on or off. A supported handoff's fields are
 * core-supported-rise.test.mjs's.
 */
export const seenOf = ({ phase, lie, stage, tries, furthest, lifted, raised, bear }) =>
  ({ phase, lie, stage, time: null, still: null, tries, furthest, lifted, raised, bear: bear.tasks.map((task) => (task.on ? (task.bearing ? "bears" : "moves") : "off")) });
/** `fours`, and its place among the stages. */
export const FOURS = RISE.rise[AT_FOURS], LAST = AT_FOURS;
/** No limb of the game's recipe on; and every limb `fours` bears on bearing, the feet off. */
export const NONE = RISE.limbs.map(() => "off"), ALL = RISE.limbs.map((limb) => (FOURS.on.some((on) => on.limb === limb.name) ? "bears" : "off"));
/** Where the recipe keeps each shin and each hand, left then right. */
export const SHINS = ["shin.left", "shin.right"].map((name) => RISE.limbs.findIndex((limb) => limb.name === name));
export const HANDS = ["hand.left", "hand.right"].map((name) => RISE.limbs.findIndex((limb) => limb.name === name));
/** `body` as a mind owns it. */
export const ownOf = (built, body) => ({ spec: built.spec, built, muscles: body.muscles, assist: body.assist });
/** The fastest any segment of `built` moves, m/s; of those named `among`, if given. */
export const fastest = (built, among = null) => Math.max(...[...built.segments].filter(([name]) => among === null || among.includes(name)).map(([, segment]) => segment.body.linearVelocityToRef(new Vector3()).length()));
/** `model` toppled forward under a riser playing `recipe`. */
export const fallen = (model, recipe) => toppled({ model, held: "empty", degrees: 0 }, [(own, view) => stagedRise(own, view, recipe)]);

/** The tolerances the player and its limbs read by (`staged.ts`, `limbs.ts`): a limb down, m; the centre of mass at its place, m, and slow, m/s; the pelvis turned, rad. */
export const DOWN = 0.03, NEAR = 0.05, SLOW = 0.1, TURNED = 0.15;
export const weightOf = (built, world) => [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * Math.hypot(...world.physics.gravity);
/** How far forward `root` is pitched from upright, rad: none standing, a quarter turn on its front. */
export function pitchOf(root) {
  const forward = new Vector3(0, 0, 1).applyRotationQuaternionToRef(turnOfToRef(root, new Quaternion()), new Vector3());
  return Math.atan2(-forward.y, Math.hypot(forward.x, forward.z));
}
/** Where `stage` holds the centre of mass over `limbs` as last read: the middle of where they are borne on, by its shares. */
export const placeOf = (stage, limbs) => stage.on.reduce((at, { limb, share }) => at.addInPlace(limbs.over[RISE.limbs.findIndex(({ name }) => name === limb)].scale(share)), new Vector3());
/** Step `world` until `riser` has left the stage `index` of its rise, 16 s at most; the steps it played of that stage, and the fastest any segment (of `among`, if given) moved, m/s. */
export function playedTo(world, built, riser, index, among = null) {
  let played = 0, peak = 0;
  for (let i = 0; i < 16 * world.hz && !(riser.furthest === index && riser.phase !== "rise"); i++) {
    if (riser.phase === "rise" && riser.stage === index) played += 1;
    world.step();
    peak = Math.max(peak, fastest(built, among));
  }
  return { played, peak };
}

/**
 * The runs of steps `stage` is played in, each as whether the left limbs are let go, what each limb does, and how many
 * steps; and how the stage ended, with whether its left limbs were let go by then and what each limb did last.
 */
export async function runsOf(stage, model = "workshop-fighter") {
  const { world, body, dispose } = await fallen(model, { ...RISE, rise: [...TO_FOURS.rise, stage] });
  try {
    const riser = riserOf(body), runs = [];
    for (let i = 0; i < 16 * world.hz && !(riser.furthest === LAST + 1 && riser.phase !== "rise"); i++) {
      world.step();
      if (riser.phase !== "rise" || riser.stage !== LAST + 1 || riser.time === 0) continue;
      const key = JSON.stringify([riser.lifted, seenOf(riser).bear]);
      if (runs.at(-1)?.[0] === key) runs.at(-1)[1] += 1;
      else runs.push([key, 1]);
    }
    return { runs: runs.map(([key, steps]) => [...JSON.parse(key), steps]), phase: riser.phase, lifted: riser.lifted, bear: seenOf(riser).bear, steps: stage.limit * world.hz - 1, hz: world.hz };
  } finally { dispose(); }
}
