/**
 * **The reach's bed**: the solves a bout asked of a hand's reach, each solved again alone by the
 * tree's `solveReach` (`src/core/control/kinematics.ts`). In a bout a change of the solve is
 * another bout; on the bed two solves answer the same questions.
 *
 * The questions are `tests/fixtures/reach-solves.json`: every solve of one arena bout, the
 * Warrior against the Rogue, in the order they were asked, each `{ hand, chain, angles, free,
 * tasks }`: the hand's segment and the chain's joints by name, the angles the solve started
 * from, its freedoms and its tasks. They are the Rogue's right arm's, three a step (the step
 * before, the step and the step after along the hand's path, from one start), and they are kept
 * as they were asked whatever the solve becomes (`docs/reference/step-cost.md` says which bout).
 * To capture a bout's solves again: a first line of `solveReach` that pushes a copy of its
 * `angles`, `free` and `tasks` and its chain's names onto a global list, the bout played to its
 * verdict (`buildBout`, `bout.mjs`), and the list written out.
 *
 *   node research/reach-bed.mjs
 *
 * Prints, for the bed's solves: how many ran to the cap, and the passes of all and of those that
 * ended; how many are at their place, and how far the worst of those is; the most an angle moves
 * when a solve is solved again from its own answer, which an answer does not; the greatest
 * second difference of a step's three answers, which is what motor control makes an acceleration
 * of; and the time of a pass. Kinematics alone: no step of a world is taken (Node core stand,
 * the lower trunk held). The time is the machine's: read it on a quiet one.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { chainTo, pointAtToRef, solveReach } from "../src/core/control/kinematics.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

/** The body whose arm the fixture's solves are of. */
const MODEL = "workshop-rogue";
/** How near its place a point is at it, m. */
export const AT_PLACE = 1e-4;

/**
 * The bed: the fixture's solves on a stand of their body, each with its chain found by its
 * joints' names. `solve(k)` solves the k-th from its start, or from `from`: the answer, how the
 * solve ended (`ReachEnd`), and how far its farthest point is left from its place, m.
 */
export async function reachBed() {
  const asked = JSON.parse(await readFile(new URL("../tests/fixtures/reach-solves.json", import.meta.url), "utf8"));
  const stand = await coreStand(humanSpec(MODEL), { ground: false, pinned: "lowerTrunk" });
  const chains = new Map(), at = new Vector3();
  const solves = asked.map(({ hand, chain: names, angles, free, tasks }) => {
    if (!chains.has(hand)) chains.set(hand, chainTo(stand.built, stand.built.segments.get(hand)));
    const chain = chains.get(hand), found = chain.map((joint) => joint.spec.name);
    if (found.join() !== names.join()) throw new Error(`the fixture's ${hand} hangs on ${names}, the stand's on ${found}`);
    return { chain, angles, free, tasks };
  });
  return {
    solves,
    solve(k, from = solves[k].angles) {
      const { chain, free, tasks } = solves[k], angles = from.map((row) => [...row]), end = { passes: 0, still: false };
      solveReach(chain, angles, free, tasks, end);
      const left = Math.max(...tasks.map(({ point, target }) => Vector3.Distance(pointAtToRef(chain, angles, point, at), Vector3.FromArray(target))));
      return { angles, end, left };
    },
    dispose: () => stand.dispose(),
  };
}

/** The most any angle differs between two sets of a chain's angles, rad. */
const apart = (a, b) => Math.max(...a.flatMap((row, j) => row.map((angle, k) => Math.abs(angle - b[j][k]))));

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const bed = await reachBed(), n = bed.solves.length;
  const answers = bed.solves.map((_, k) => bed.solve(k));
  const ended = answers.filter(({ end }) => end.still), passes = ended.map(({ end }) => end.passes).sort((a, b) => a - b);
  const all = answers.reduce((sum, { end }) => sum + end.passes, 0);
  console.log(`The reach's bed: ${n} solves of ${MODEL}'s arm, each solved alone from the start it was asked from. Kinematics alone (Node core stand).\n`);
  console.log(`at the cap: ${n - ended.length} of ${n}; all passes ${all}; of the ${ended.length} that end: median ${passes[passes.length >> 1]}, most ${passes.at(-1)}`);
  const placed = answers.filter(({ left }) => left < AT_PLACE);
  console.log(`at their place (within ${1000 * AT_PLACE} mm): ${placed.length}, the worst ${(1e6 * Math.max(...placed.map(({ left }) => left))).toFixed(3)} um off; `
    + `of them at the cap: ${placed.filter(({ end }) => !end.still).length}, and of those that end the most passes: ${Math.max(...placed.filter(({ end }) => end.still).map(({ end }) => end.passes))}`);
  // An answer a second solve moves is not one.
  const again = (pick) => Math.max(0, ...answers.map((answer, k) => pick(answer) ? apart(bed.solve(k, answer.angles).angles, answer.angles) : 0));
  console.log(`solved again from its own answer, the most an angle moves: of those that ended ${again(({ end }) => end.still).toExponential(1)} rad, of those at the cap ${again(({ end }) => !end.still).toExponential(1)} rad`);
  // The solves come in threes from one start, a step apart along the path.
  if (n % 3 !== 0) throw new Error(`${n} solves are not threes`);
  let second = 0;
  for (let k = 0; k < n; k += 3) {
    if (apart(bed.solves[k].angles, bed.solves[k + 1].angles) !== 0 || apart(bed.solves[k].angles, bed.solves[k + 2].angles) !== 0) throw new Error(`solves ${k} to ${k + 2} do not share a start`);
    const [before, now, after] = [0, 1, 2].map((i) => answers[k + i].angles);
    second = Math.max(second, ...now.flatMap((row, j) => row.map((angle, i) => Math.abs(after[j][i] - 2 * angle + before[j][i]))));
  }
  console.log(`the three of a step: the greatest second difference of their answers ${second.toFixed(4)} rad`);
  let best = Infinity;
  for (let reading = 0; reading < 7; reading++) {
    const started = performance.now();
    for (let k = 0; k < n; k++) bed.solve(k);
    best = Math.min(best, performance.now() - started);
  }
  console.log(`a pass: ${(1000 * best / all).toFixed(2)} us, the least of seven readings of the ${n} solves (${best.toFixed(1)} ms)`);
  bed.dispose();
}
