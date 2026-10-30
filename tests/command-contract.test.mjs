/**
 * **What every registered Commander keeps to** (Node, core world, vendored Rapier, 120 Hz): each
 * Commander (`COMMANDERS`) leads the left side of an Arena bout as a team of one, as a person's side
 * is led (`teamOfOne`), until it has sent its member at the foe and the member stands within its
 * reach of it; the bout forks there and goes on to
 * the bit with the team's memory and standing orders copied (`TeamOfOne.state`), and plays again to the bit from the orders it
 * gave alone (`Duel.play`), with no Commander. How well a Commander leads is measured apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { COMMANDERS } from "../src/core/command/commanders.ts";
import { loadState, saveState } from "../src/core/state.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { cryptModel } from "../src/dungeon/actors.ts";
import { SIDES } from "../src/arena/duel.ts";
import { teamOfOne } from "../src/arena/team.ts";

/** The bout: two bodies a little beyond the member's reach, so that its Commander must send it in. */
const RECIPE = Object.freeze({ left: "workshop-fighter", right: "workshop-rogue", gap: 2.5 });
/** The longest it may take a Commander to send its member at the foe, s: the bout's own cap. */
const REACH_SECONDS = 10;

/** A bout of `RECIPE` whose left side `kind` leads as a team of one (`teamOfOne`), given its orders each step in the sensing phase, before every Mind. */
async function led(kind) {
  const bout = await buildBout(RECIPE, { engine: BOUT_ENGINE }), { duel } = bout;
  const team = teamOfOne(duel, "left", COMMANDERS[kind].defaults);
  const at = (side) => { const c = duel.duelists[side].body.physical.centre; return { x: c.x, z: c.z }; };
  const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
  const gap = () => { const l = at("left"), r = at("right"); return Math.sqrt((r.x - l.x) ** 2 + (r.z - l.z) ** 2); };
  return { ...bout, teamState: team.state, trace, gap, reach: cryptModel(RECIPE.left).attackMetres, dispose() { team.dispose(); bout.dispose(); } };
}

for (const kind of Object.keys(COMMANDERS)) {
  test(`the ${kind} Commander leads a bout that forks and replays from its orders alone`, async () => {
    const a = await led(kind);
    let fork;
    try {
      const closed = () => a.duel.tape.some((entry) => entry.orders?.foe === "right") && a.gap() <= a.reach;
      while (!closed() && a.duel.clock < REACH_SECONDS) { a.world.step(); a.trace.take(); }
      assert.ok(closed(), `the ${kind} Commander did not bring its member within reach of the foe in ${REACH_SECONDS} s: the fixture did not reach its case`);
      // On past the next look, so that the fork decides on the memory it was given until then.
      const steps = a.world.hz;
      fork = { duel: a.duel.save(), team: saveState(a.teamState) };
      const after = traceOf(SIDES.map((side) => a.duel.duelists[side].built));
      for (let i = 0; i < steps; i++) { a.world.step(); a.trace.take(); after.take(); }

      const b = await led(kind);
      try {
        b.duel.load(fork.duel);
        loadState(b.teamState, fork.team);
        for (let i = 0; i < steps; i++) { b.world.step(); b.trace.take(); }
        assert.deepEqual({ pose: b.trace.digest(), tape: b.duel.tape }, { pose: after.digest(), tape: a.duel.tape }, "the fork goes on as the bout did");
      } finally { b.dispose(); }

      const c = await buildBout(RECIPE, { engine: BOUT_ENGINE });
      try {
        c.duel.play(a.duel.tape);
        const replay = traceOf(SIDES.map((side) => c.duel.duelists[side].built));
        while (c.duel.steps < a.duel.steps) { c.world.step(); replay.take(); }
        assert.deepEqual({ pose: replay.digest(), tape: c.duel.tape }, { pose: a.trace.digest(), tape: a.duel.tape }, "the orders alone play the bout again");
      } finally { c.dispose(); }
    } finally { a.dispose(); }
  });
}

test("a drill Commander orders nothing before its moment: the bout is its member's own to the bit until then", async () => {
  const { MINDS } = await import("../src/core/mind/controllers.ts");
  // The Vanguard's planner wraps another and prepares the skills: a mind with every layer a drill once had to pass through.
  const mind = MINDS["vanguard-warrior"].config, foe = MINDS.counter.config;
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", capSeconds: 31, recoverySeconds: null, entry: [], ends: [], minds: { left: mind, right: foe } };
  const plain = await buildBout(recipe, { engine: BOUT_ENGINE }), drilled = await buildBout({ ...recipe, commanders: { left: { kind: "drill", after: 0, pace: 1, moment: 2 } } }, { engine: BOUT_ENGINE });
  const poses = (built) => SIDES.flatMap((side) => [...built.duel.duelists[side].built.segments.values()]
    .flatMap(({ node: { position: p, rotationQuaternion: q } }) => [p.x, p.y, p.z, q.x, q.y, q.z, q.w]));
  const task = () => drilled.duel.commanded("left")?.task;
  try {
    plain.duel.play([]); drilled.duel.play([]);
    let steps = 0;
    for (; task() === "fighting" && steps < 20 * 120; steps++) {
      plain.world.step(); drilled.world.step();
      if (task() === "fighting") assert.deepEqual(poses(drilled), poses(plain), `the bouts part at step ${steps + 1}, before the moment`);
    }
    assert.notEqual(task(), "fighting", "the fixture's fight never ended its first action in 20 s");
    // The order the drill gives at its moment is on the tape at the step it was given, the last one played as the mind's own.
    assert.deepEqual(drilled.duel.tape.filter((entry) => entry.step < steps - 1), [], "no order before the moment");
  } finally { plain.dispose(); drilled.dispose(); }
});
