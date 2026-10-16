/**
 * **The lab's Routine** (`src/lab/routine.ts`), on the Node research stand:
 * tactics on the core's skills, each human for two loops of four targets at 120 Hz: the second
 * sets off from its targets into the turn, where a faster turn falls (`ROUTINE_GAIT`). It stays on
 * its feet, completes the loops, and reads its targets in their order, the same ones each loop,
 * with the right hand's blow and the left's in turn, each from where its feet were set
 * (`Locomotion.place`). What each is struck with is the repertoire's to say (`recipeFor`), by how
 * high the target stood over the head as its strike began: a recipe whose window holds that
 * height, thrown with the head inside its window along the heading and across it, or a blow
 * placed from within the approach's reach of its place. The control and high targets are struck
 * by the arm that was sent, the two surfaces sharing the blow by their compliance. The middle
 * target exhausts preparation before the feet and height window agree, and its explicit ending
 * lets the routine continue. The low one is under
 * the arm's reach and is explicitly refused before a dummy is hung. The
 * targets are a seed's on which each human stands through both loops: how often one falls is the
 * battery's to say (`docs/reference/blows.md#baseline`).
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

const LOOPS = 2, TARGETS = 4, SEED = 11;
/** Seconds allowed for the loops: a loop's walk takes about 20 s, and a target about 5. */
const SECONDS = (30 + 8 * TARGETS) * LOOPS;
/** How far off a hand that lands a blow may read, m: at the ball at a control step, or within a centimetre of it between two. */
const LANDS_WITHIN = 0.01;



for (const model of ["workshop-fighter", "workshop-rogue"]) {
  test(`${model}_completes_two_routine_loops_striking_at_its_targets_from_where_its_feet_were_set`, { todo: model === "workshop-rogue" ? "a bare hand strikes with its fist's measured surface (`closesToStrike`), about 9 cm short of the open capsule's fingers that its blows' spacing, aim and recipes were tuned to" : undefined }, async () => {
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
        const thrown = routine.report.ledger.length, phase = routine.report.actions[0]?.phase ?? null, up = routine.tactics.up?.index ?? null;
        if (up !== at) { at = up; thrownAt = thrown; }
        else if (up !== null && thrown > thrownAt) after.add(phase);
      }
      assert.equal(routine.body.view.down, false, routine.doing());
      assert.equal(routine.tactics.loops, LOOPS, `${routine.doing()} at ${routine.time().toFixed(1)} s`);
      assert.deepEqual(legs, ["out", "post", "back", "out", "post", "back", "out"]);
      const { targets } = routine.tactics, { readings } = routine;
      assert.deepEqual(targets.map((target) => target.stratum), ["control", "high", "middle", "low"]);
      // Each loop reads the same targets in their order, the hands in turn.
      assert.deepEqual(readings.map((r) => r.target), [...targets, ...targets]);
      assert.deepEqual(readings.map((r) => r.hand), Array.from({ length: LOOPS * TARGETS }, (_, k) => ROUTINE_HANDS[(k % TARGETS) % ROUTINE_HANDS.length]));
      assert.deepEqual(readings.map((r) => r.fell), readings.map(() => false));
      // Each admitted target uses the repertoire entry for its actual launch height.
      for (const r of readings.filter(r => r.strike !== null)) {
        const { along, across } = r.strike.off, what = `${r.target.stratum}, ${r.strike.name}, ${r.strike.up} m over the head: off ${JSON.stringify(r.strike.off)}`;
        const chosen = recipeFor(REPERTOIRE, spec, r.hand, r.strike.up);
        assert.deepEqual([r.strike.kind, r.strike.band, r.strike.name], chosen ? ["recipe", chosen.recipe.band, chosen.strike.name] : ["placed", null, "placed"], what);
        const window = chosen?.window ?? { along: [-APPROACH.reach, APPROACH.reach], across: [-APPROACH.reach, APPROACH.reach] };
        assert.ok(window.along[0] <= along && along <= window.along[1] && window.across[0] <= across && across <= window.across[1] && r.strike.peak > 0, `${what}, window ${JSON.stringify(window)}`);
      }
      // Reachable recipe targets are struck by the arm that was sent in each loop.
      const stiffness = (name) => spec.segments.find((segment) => segment.name === name).surface.stiffness.value;
      for (const reading of readings.filter((r) => r.target.stratum === "control" || r.target.stratum === "high")) {
        const { blow, took, gave, nearest, hand, hung } = reading;
        assert.ok(hung && blow && took.damage > 0, `the ${reading.target.stratum} one read ${JSON.stringify(reading)}`);
        // The hand's own blow, or the forearm's behind it: a hand that landed one read within `LANDS_WITHIN`.
        assert.ok(gave.segment === `hand.${hand}` ? nearest < LANDS_WITHIN : gave.segment === `forearm.${hand}`, `${gave.segment}, the hand ${nearest} m off`);
        const shares = energyShares([stiffness(gave.segment), stiffness("head")]);
        assert.deepEqual([gave, took].map(({ fighter, segment, item, share }) => [fighter, segment, item, share]), [["attacker", gave.segment, null, shares[0]], ["dummy", "head", null, shares[1]]]);
        assert.deepEqual(blow.sides, [gave, took]);
      }
      const energies = (kind) => readings.filter((r) => r.blow && r.strike.kind === kind).map((r) => r.blow.energy);
      assert.ok(energies("recipe").length > 0 && (!energies("placed").length || Math.min(...energies("recipe")) > Math.max(...energies("placed"))), `recipes ${energies("recipe")} J, placed ${energies("placed")} J`);
      for (const k of [TARGETS - 1, 2 * TARGETS - 1]) {
        const low = readings[k];
        assert.equal(low.ending?.ending.kind, "refused", JSON.stringify(low));
        assert.deepEqual([low.strike, low.hung, low.blow, low.nearest], [null, false, null, null]);
      }
      assert.deepEqual(readings.map(r => r.ending?.ending.kind), ["completed", "completed", "stalled", "refused", "completed", "completed", "stalled", "refused"]);
      for (const middle of readings.filter(r => r.target.stratum === "middle")) {
        assert.deepEqual(middle.ending.ending, { kind: "stalled", reason: "preparation deadline" });
        assert.deepEqual([middle.strike, middle.hung, middle.blow, middle.nearest, middle.ending.committed], [null, false, null, null, false]);
        assert.ok(middle.ending.ended - middle.ending.began <= 7.3);
      }
      // Its strike thrown, a target is watched from the guard: the next attack is the next target's.
      assert.deepEqual([...after], [null]);
      assert.equal(routine.report.ledger.length, LOOPS * TARGETS);
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
    const { seconds, ending, ...read } = routine.readings[0];
    assert.ok(ending === null || !ending.committed);
    assert.deepEqual(read, { target: routine.tactics.targets[0], hand: "right", strike: null, hung: false, nearest: null, blow: null, took: null, gave: null, fell: true });
    assert.ok(seconds > 0, `${seconds} s`);
  } finally { routine.dispose(); stand.dispose(); }
});
