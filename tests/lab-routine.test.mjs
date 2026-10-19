/**
 * **The lab's Routine** (`src/lab/routine.ts`), on the Node research stand at 120 Hz: whatever
 * its ending, it reads its targets in their order, the hands in turn, strikes each with what the
 * repertoire says (`recipeFor`) from inside that strike's window, hangs nothing where it struck
 * nothing, and has a blow's two surfaces share it by their compliance. How far it gets, how often
 * it lands and how each target ends are `lab-routine-capability`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { energyShares } from "../src/core/rules/share.ts";
import { APPROACH } from "../src/core/skills/strike.ts";
import { recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { ROUTINE_HANDS, startRoutine } from "../src/lab/routine.ts";
import { coreStand } from "./harness/core-stand.mjs";

const TARGETS = 4, SEED = 11;
/** Seconds allowed for a loop: its walk takes about 20 s, and a target about 5. */
const SECONDS = 30 + 8 * TARGETS;

for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model}_reads_its_routine_targets_in_order_with_the_strikes_the_repertoire_gives`, async () => {
    const spec = humanSpec(model), stand = await coreStand(spec, { ground: true, hz: 120 });
    const routine = startRoutine(labActor(stand.built, stand.world), { targets: TARGETS, seed: SEED });
    try {
      // One loop at most, ended by its cap or a fall as readily as by its last target.
      const after = new Set();
      let at = null, thrownAt = 0;
      for (let i = 0; i < stand.seconds(SECONDS) && routine.tactics.loops < 1 && !routine.body.view.down; i++) {
        stand.step(1);
        const thrown = routine.report.ledger.length, phase = routine.report.actions[0]?.phase ?? null, up = routine.tactics.up?.index ?? null;
        if (up !== at) { at = up; thrownAt = thrown; }
        else if (up !== null && thrown > thrownAt) after.add(phase);
      }
      const { targets } = routine.tactics, { readings } = routine;
      assert.ok(readings.length > 0, `the fixture did not reach its case: no target read (${routine.doing()} at ${routine.time().toFixed(1)} s)`);
      assert.deepEqual(readings.map((r) => r.target), targets.slice(0, readings.length));
      assert.deepEqual(readings.map((r) => r.hand), readings.map((_, k) => ROUTINE_HANDS[k % ROUTINE_HANDS.length]));
      for (const r of readings) {
        if (r.strike === null) {
          assert.deepEqual([r.hung, r.blow, r.nearest], [false, null, null], JSON.stringify(r));
          continue;
        }
        const { along, across } = r.strike.off, what = `${r.target.stratum}, ${r.strike.name}, ${r.strike.up} m over the head: off ${JSON.stringify(r.strike.off)}`;
        const chosen = recipeFor(REPERTOIRE, spec, r.hand, r.strike.up);
        assert.deepEqual([r.strike.kind, r.strike.band, r.strike.name], chosen ? ["recipe", chosen.recipe.band, chosen.strike.name] : ["placed", null, "placed"], what);
        const window = chosen?.window ?? { along: [-APPROACH.reach, APPROACH.reach], across: [-APPROACH.reach, APPROACH.reach] };
        assert.ok(window.along[0] <= along && along <= window.along[1] && window.across[0] <= across && across <= window.across[1], `${what}, window ${JSON.stringify(window)}`);
      }
      // A blow read is shared by its two surfaces' compliance.
      const stiffness = (name) => spec.segments.find((segment) => segment.name === name).surface.stiffness.value;
      for (const { blow, took, gave } of readings.filter((r) => r.blow)) {
        const shares = energyShares([stiffness(gave.segment), stiffness("head")]);
        assert.deepEqual([gave, took].map(({ fighter, segment, item, share }) => [fighter, segment, item, share]), [["attacker", gave.segment, null, shares[0]], ["dummy", "head", null, shares[1]]]);
        assert.deepEqual(blow.sides, [gave, took]);
      }
      // Its strike thrown, a target is watched from the guard.
      assert.ok([...after].every((phase) => phase === null), JSON.stringify([...after]));
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
    const { seconds, ending, ...read } = routine.readings[0];
    assert.ok(ending === null || !ending.committed);
    assert.deepEqual(read, { target: routine.tactics.targets[0], hand: "right", strike: null, hung: false, nearest: null, blow: null, took: null, gave: null, fell: true });
    assert.ok(seconds > 0, `${seconds} s`);
  } finally { routine.dispose(); stand.dispose(); }
});
