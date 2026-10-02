/**
 * **The lab's Routine** (`src/lab/routine.ts`), on the Node stand as the page runs it:
 * tactics on the core's skills, each human for two loops of four targets at 120 Hz: the second
 * sets off from its targets into the turn, where a faster turn falls (`ROUTINE_GAIT`). It stays on
 * its feet, completes the loops, and reads its targets in their order, the same ones each loop,
 * with the right hand's strike and the left's in turn, each from where its feet were set
 * (`Locomotion.place`), with the head inside the recipe's window, turned over for the left hand,
 * and the fist as fast as the recipe was searched to go. A reading's peak is the fist's in the
 * air, to the pushes' end, so it is above the recipe's peak to its landing. The first target is
 * the control, where the recipe lands: it is struck. The targets are a seed's on which each human
 * stands through both loops: how often one falls is the battery's to say
 * (`docs/reference/blows.md#baseline`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { mirroredWindow, recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { ROUTINE_HANDS, ROUTINE_TARGETS, startRoutine } from "../src/lab/routine.ts";
import { LAB_TARGETS } from "../src/lab/scenarios.ts";
import { coreStand } from "./harness/core-stand.mjs";

const LOOPS = 2, TARGETS = 4, SEED = 4;
/** Seconds allowed for the loops: a loop's walk takes about 20 s, and a target about 5. */
const SECONDS = (30 + 8 * TARGETS) * LOOPS;

test("the_page_draws_the_targets_the_routine_does_unless_its_address_says", () => {
  assert.deepEqual({ count: LAB_TARGETS.count, seed: LAB_TARGETS.seed }, ROUTINE_TARGETS);
});

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model}_completes_two_routine_loops_striking_at_its_targets_from_where_its_feet_were_set`, async () => {
    const spec = humanSpec(model), stand = await coreStand(spec, { ground: true, hz: 120 });
    const routine = startRoutine(labActor(stand.built, stand.world), { targets: TARGETS, seed: SEED });
    try {
      const legs = [routine.tactics.leg];
      // What the strike skill was at from the end of a target's pushes to its reading's close; and the strikes thrown as each target came up.
      const after = new Set();
      let at = null, thrownAt = 0;
      for (let i = 0; i < stand.seconds(SECONDS) && routine.tactics.loops < LOOPS && !routine.body.view.down; i++) {
        stand.step(1);
        if (routine.tactics.leg !== legs.at(-1)) legs.push(routine.tactics.leg);
        const { thrown, phase } = routine.report.strike, up = routine.tactics.up?.index ?? null;
        if (up !== at) { at = up; thrownAt = thrown.left + thrown.right; }
        else if (up !== null && thrown.left + thrown.right > thrownAt) after.add(phase);
      }
      assert.equal(routine.body.view.down, false, routine.doing());
      assert.equal(routine.tactics.loops, LOOPS, `${routine.doing()} at ${routine.time().toFixed(1)} s`);
      assert.deepEqual(legs, ["out", "post", "back", "out", "post", "back", "out"]);
      const { targets } = routine.tactics, { readings } = routine;
      assert.deepEqual(targets.map((target) => target.stratum), ["control", "high", "middle", "low"]);
      // Each loop reads the same targets in their order, the hands in turn.
      assert.deepEqual(readings.map((r) => r.target), [...targets, ...targets]);
      assert.deepEqual(readings.map((r) => r.hand), Array.from({ length: LOOPS * TARGETS }, (_, k) => ROUTINE_HANDS[(k % TARGETS) % ROUTINE_HANDS.length]));
      assert.deepEqual(readings.map((r) => [r.hung, r.fell]), readings.map(() => [true, false]));
      for (const r of readings) {
        const { strike, recipe } = recipeFor(REPERTOIRE, spec, r.hand);
        const window = r.hand === recipe.strike.hand ? recipe.window : mirroredWindow(recipe.window);
        assert.equal(r.strike.name, strike.name);
        const { along, across } = r.strike.off, what = `${r.target.stratum}, ${r.strike.name}: off ${JSON.stringify(r.strike.off)}, window ${JSON.stringify(window)}`;
        assert.ok(window.along[0] <= along && along <= window.along[1] && window.across[0] <= across && across <= window.across[1], what);
        assert.ok(r.strike.peak >= recipe.readings.at120.peak, `${r.strike.name}: peak ${r.strike.peak} under the recipe's ${recipe.readings.at120.peak}`);
      }
      // The control is where the recipe lands: struck by the hand that threw, each loop. The low one is out of the fist's height.
      for (const k of [0, TARGETS]) {
        const { blow, nearest, hand } = readings[k];
        assert.ok(blow && blow.damage > 0 && nearest === 0, `the control read ${JSON.stringify(readings[k])}`);
        assert.deepEqual([blow.attacker, blow.striker, blow.target, blow.part], ["attacker", `hand.${hand}`, "dummy", "head"]);
      }
      for (const k of [TARGETS - 1, 2 * TARGETS - 1]) assert.ok(readings[k].blow === null && readings[k].nearest > 0.1, `the low one read ${JSON.stringify(readings[k])}`);
      // Its strike thrown, a target is watched from the guard: the next attack is the next target's.
      assert.deepEqual([...after], [null]);
      assert.equal(routine.report.strike.thrown.left + routine.report.strike.thrown.right, LOOPS * TARGETS);
      // Nothing is up once the loop has gone on.
      assert.equal(routine.ball(), null);
    } finally { routine.dispose(); stand.dispose(); }
  });
}

test("a_fall_closes_the_reading_of_the_target_that_is_up", async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, hz: 120 });
  const routine = startRoutine(labActor(stand.built, stand.world), { targets: TARGETS, seed: SEED });
  try {
    // Thrown over as its first target comes up: 400 N s through the chest, which no body stands.
    for (let i = 0; i < stand.seconds(30) && !routine.ball(); i++) stand.step(1);
    assert.deepEqual(routine.tactics.up, { index: 0, hand: "right" });
    assert.deepEqual(routine.ball().centre, routine.tactics.targets[0].at);
    const chest = stand.built.segments.get("upperTrunk");
    chest.body.applyImpulse(new Vector3(400, 0, 0), chest.node.position);
    // Down, nothing is up: a tumbling body may be seen up again, and its next target with it.
    let downs = 0;
    for (let i = 0; i < stand.seconds(5); i++) {
      stand.step(1);
      if (!routine.body.view.down) continue;
      downs += 1;
      assert.equal(routine.ball(), null, `${routine.time()} s`);
    }
    assert.ok(downs > 0 && routine.body.view.down && routine.doing() === "Fallen", `${downs} steps down, ${routine.doing()}`);
    // The reading closed as it stood: no strike had begun, so nothing was hung and nothing read.
    const { target, hand, strike, hung, nearest, blow, fell } = routine.readings[0];
    assert.deepEqual({ target, hand, strike, hung, nearest, blow, fell }, { target: routine.tactics.targets[0], hand: "right", strike: null, hung: false, nearest: null, blow: null, fell: true });
  } finally { routine.dispose(); stand.dispose(); }
});
