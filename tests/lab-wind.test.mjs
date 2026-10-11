/**
 * **The lab's wind** (`src/lab/wind.ts`): gusts arrive at the rate asked, from every way about up,
 * each a half-sine of its strength over `GUST_SECONDS`, and a wind made again with its seed blows
 * the same gusts. On the Node stand, a standing Warrior keeps its feet under a weak gust and is
 * toppled by a strong one: the control that shows the wind pushes at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { humanSpec } from "../src/core/human/spec.ts";
import { labActor } from "../src/lab/actor.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { blow, gustForce, GUST_SECONDS, startWind, windState } from "../src/lab/wind.ts";
import { coreStand } from "./harness/core-stand.mjs";

const DT = 1 / 120;

/** Blow `seconds` of a wind from `seed`: each step's force, and the gusts begun. */
function blowFor(seed, settings, seconds) {
  const state = windState(seed), forces = [], gusts = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const count = state.count;
    forces.push([...blow(state, settings, i * DT, DT)]);
    if (state.count > count) gusts.push(state.gusts[state.gusts.length - 1]);
  }
  return { forces, gusts };
}

test("gusts_arrive_at_the_rate_asked_from_every_way", () => {
  const { gusts } = blowFor(7, { rate: 1, strength: 50 }, 2000);
  // A Poisson count of mean 2000 is within 4 % of it, about 1.8 standard deviations.
  assert.ok(Math.abs(gusts.length - 2000) < 80, `${gusts.length} gusts in 2000 s at 1 a second`);
  // Each quarter of the way round has about a quarter of them.
  const quarters = [0, 0, 0, 0];
  for (const gust of gusts) quarters[Math.floor(gust.toward / (Math.PI / 2))]++;
  for (const n of quarters) assert.ok(Math.abs(n / gusts.length - 0.25) < 0.04, `quarters ${quarters}`);
  assert.equal(blowFor(7, { rate: 0, strength: 50 }, 100).gusts.length, 0, "no gusts at rate 0");
});

test("a_gust_is_a_half_sine_of_its_strength_and_its_seed_blows_it_again", () => {
  const gust = { from: 1, toward: Math.PI / 2 };
  assert.deepEqual(gustForce([gust], 0.99, 100), [0, 0], "before it");
  const [x, z] = gustForce([gust], 1 + GUST_SECONDS / 2, 100);
  assert.ok(Math.abs(x - 100) < 1e-9 && Math.abs(z) < 1e-9, `at its peak, toward +x: ${x}, ${z}`);
  const [qx] = gustForce([gust], 1 + GUST_SECONDS / 6, 100);
  assert.ok(Math.abs(qx - 50) < 1e-9, `a sixth in, half its peak: ${qx}`);
  assert.deepEqual(gustForce([gust], 1 + GUST_SECONDS + 0.01, 100), [0, 0], "after it");
  // Two gusts at once add.
  const [sx] = gustForce([gust, gust], 1 + GUST_SECONDS / 2, 100);
  assert.ok(Math.abs(sx - 200) < 1e-9, `two at once: ${sx}`);
  const a = blowFor(3, { rate: 2, strength: 80 }, 30), b = blowFor(3, { rate: 2, strength: 80 }, 30), c = blowFor(4, { rate: 2, strength: 80 }, 30);
  assert.deepEqual(a, b, "the same seed blows the same wind");
  assert.notDeepEqual(a.gusts, c.gusts, "another seed blows another");
});

/** A Warrior standing, one gust of `strength` N on its chest toward its back from 0.5 s: whether it is down by 4 s. */
async function toppled(strength) {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true });
  const stance = startStance(labActor(stand.built, stand.world));
  // A gust a step for one step, then none: one gust.
  const wind = startWind(stand.built, stand.world, { rate: 0, strength }, 1);
  try {
    stand.step(stand.seconds(0.5));
    wind.settings = { rate: 1 / DT, strength };
    stand.step(1);
    wind.settings = { rate: 0, strength };
    assert.equal(wind.state.count, 1, "one gust");
    stand.step(stand.seconds(3.5));
    return stance.frame().fallen;
  } finally { wind.dispose(); stance.dispose(); stand.dispose(); }
}

test("a_weak_gust_leaves_a_standing_body_on_its_feet_and_a_strong_one_topples_it", async () => {
  assert.equal(await toppled(40), false, "a 40 N gust");
  assert.equal(await toppled(1500), true, "a 1500 N gust");
});
