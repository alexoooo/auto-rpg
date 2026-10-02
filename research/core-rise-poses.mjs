/**
 * Pose stages played on a fallen body, for finding them (`docs/reference/rising.md#stages`): the
 * battery's body toppled stiff the way asked (`toppled`, `core-rise-trials.mjs`), then under a
 * staged riser (`stagedRise`) whose recipe is the stages given, as the rise and as every roll, so
 * they are played however it lies. A line a stage, read at its last step: how the body lies, the
 * heights of its centre of mass and of its pelvis's, its upper trunk's and its head's, m, and the
 * freedoms furthest from the stage's posture, each angle less the posture's, rad.
 *
 *   node research/core-rise-poses.mjs [--model workshop-fighter] [--lie front|back|left|right]
 *     [--held empty] [--stages '<PoseStage[] JSON>']
 *
 * `--lie` is the shove's way: forward, backward, or to that side. Without `--stages`, the game's
 * rise (`RISE.rise`).
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { centreOfToRef } from "../src/core/control/support.ts";
import { lieOf, stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { RISE_HARNESS, riserOf, toppled } from "./core-rise-trials.mjs";

/** How many of a stage's freedoms are read: those furthest from its posture. */
const FURTHEST = 4;

/** The shove, degrees about up from the way the body faces, that fells it each way: its left is -x. */
export const SHOVE = Object.freeze({ front: 0, right: 90, back: 180, left: 270 });

/**
 * `model` holding `held`, toppled by `SHOVE[lie]`, then under a riser playing `stages` however it lies:
 * a row a stage, read at its last step, with one before them for the body as it lay when the first
 * began. Null if the shove did not fell it.
 */
export async function posed({ model, held = "empty", lie, stages }) {
  const recipe = { roll: { back: stages, left: stages, right: stages }, rise: stages };
  const { world, built, body, dispose } = await toppled({ model, held, degrees: SHOVE[lie] }, [(own, view) => stagedRise(own, view, recipe)]);
  try {
    if (!body.view.down) return null;
    const riser = riserOf(body), muscles = body.muscles, root = muscles.dynamics.root.segment, head = built.segments.get("head"), chest = built.segments.get("upperTrunk"), at = new Vector3();
    const read = (name, posture) => {
      // Each freedom's angle less its posture's, the furthest first.
      const off = !posture ? [] : muscles.channels
        .map((c, i) => [c.name, muscles.angle(i) + c.dof.spec.bind.value - (posture[c.name] ?? 0)])
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, FURTHEST);
      return { stage: name, lie: lieOf(root), centre: body.view.stance.centre.y, pelvis: centreOfToRef(root, at).y, chest: centreOfToRef(chest, at).y, head: centreOfToRef(head, at).y, off };
    };
    const rows = [];
    // To the first stage's first step, then each stage to its last: the step before the riser's stage or phase changes.
    let playing = null;
    for (let i = 0; i < Math.round(60 * world.hz); i++) {
      const before = riser.phase === "roll" || riser.phase === "rise" ? riser.stage : null;
      if (before !== null && playing === null) rows.push(read("lying", null));
      if (before !== null) playing = before;
      const row = before === null ? null : read(stages[before].name, stages[before].posture);
      world.step();
      const after = riser.phase === "roll" || riser.phase === "rise" ? riser.stage : null;
      if (before !== null && after !== before) rows.push(row);
      if (playing !== null && after === null) break;
    }
    return rows;
  } finally { dispose(); }
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}` || import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name, otherwise) => { const at = args.indexOf(`--${name}`); return at < 0 ? otherwise : args[at + 1]; };
  const model = option("model", "workshop-fighter"), lie = option("lie", "front"), held = option("held", "empty");
  if (!(lie in SHOVE)) throw new Error(`--lie is one of ${Object.keys(SHOVE).join(", ")}`);
  const given = option("stages", null), stages = given === null ? RISE.rise : JSON.parse(given);
  const rows = await posed({ model, held, lie, stages });
  console.log(`${RISE_HARNESS}; ${model}, ${held}, shoved to fall on its ${lie}; stages ${given === null ? "the game's" : given}`);
  if (rows === null) console.log("the shove did not fell it");
  else {
    console.log("| stage | lies on its | centre, m | pelvis, m | chest, m | head, m | furthest from its posture, rad |");
    console.log("|---|---|---|---|---|---|---|");
    for (const row of rows) console.log(`| ${row.stage} | ${row.lie} | ${row.centre.toFixed(2)} | ${row.pelvis.toFixed(2)} | ${row.chest.toFixed(2)} | ${row.head.toFixed(2)} | ${row.off.map(([name, by]) => `${name} ${by.toFixed(2)}`).join(", ") || "-"} |`);
  }
}
