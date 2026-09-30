/**
 * **A hand closed on the club** (`src/core-lab/club-grip.ts`): on each model's skin, CPU-skinned
 * from its GLB as `scripts/core-lab/fist-probe.mjs` does, both hands posed with `CLUB_GRIP` around
 * the haft where the core's grip puts it (`scripts/core-lab/haft.mjs`). Nothing of the hand is in
 * the haft, and every finger and the thumb touch it. The control: the fist sinks into it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CLUB_GRIP } from "../src/core-lab/club-grip.ts";
import { fistTurns } from "../src/core-lab/fist.ts";
import { loadGlb, restBones, skinHand } from "../scripts/core-lab/fist-probe.mjs";
import { haftGaps, haftOf } from "../scripts/core-lab/haft.mjs";

const MODELS = ["workshop-fighter", "workshop-rogue"];
/** The deepest a hand part may sit in the haft, and the farthest a digit's nearest phalanx may lie from it, mm. */
const INSIDE = 1.5, TOUCH = 2;

/** Each hand part's nearest gap to the haft, mm, with `pose` on `model`'s `side` hand. */
async function gaps(model, side, pose) {
  const glb = await loadGlb(model);
  return haftGaps(skinHand(glb, side, fistTurns(restBones(glb, side), side, pose)), haftOf(glb, model, side));
}

/** What is wrong with `pose` on the haft, on both hands of `model`. */
async function faults(model, pose) {
  const out = [];
  for (const side of ["r", "l"]) {
    const g = await gaps(model, side, pose);
    for (const [part, gap] of g) if (gap < -INSIDE) out.push(`${part} ${(-gap).toFixed(1)} mm in the haft`);
    for (const digit of ["index", "middle", "ring", "pinky", "thumb"]) {
      const nearest = Math.min(...[1, 2, 3].map((k) => g.get(`${digit}_0${k}_${side}`)));
      if (nearest > TOUCH) out.push(`${digit}_${side} ${nearest.toFixed(1)} mm off the haft`);
    }
  }
  return out;
}

test("each_hand_closes_on_the_club_without_sinking_into_it", async () => {
  for (const model of MODELS) assert.deepEqual(await faults(model, CLUB_GRIP[model]), [], model);
});

test("the_control_the_fist_sinks_into_the_haft", async () => {
  // Closed into a fist, the fingers run through the haft.
  const fist = {
    fingers: Object.fromEntries(["index", "middle", "ring", "pinky"].map((f) => [f, { mcp: 65, pip: 85, dip: 55 }])),
    thumb: CLUB_GRIP["workshop-fighter"].thumb,
  };
  const found = await faults("workshop-fighter", fist);
  assert.ok(found.some((f) => /middle_02_r .* in the haft/.test(f)), found.join("; "));
  // And an open hand reaches nothing.
  const open = { fingers: Object.fromEntries(["index", "middle", "ring", "pinky"].map((f) => [f, { mcp: 0, pip: 0, dip: 0 }])),
    thumb: CLUB_GRIP["workshop-fighter"].thumb };
  assert.ok((await faults("workshop-fighter", open)).some((f) => /index_r .* off the haft/.test(f)));
});
