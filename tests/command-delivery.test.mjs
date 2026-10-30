import "./fixtures/swap/hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
const { releaseCombatApproach } = await import("../src/core/command/delivery.ts");
const { teamOfOne } = await import("../src/arena/team.ts");
const { loadState, saveState } = await import("../src/core/state.ts");
const { buildBout } = await import("../src/evaluation/bout.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { MINDS } = await import("../src/entrants/game.ts");
const { BOUT_ENGINE } = await import("../research/bout.mjs");

test("combat approach delivery releases only the ordered foe's reached range and preserves every other order field", () => {
  const from = { x: 0, z: 0 }, target = { id: "foe", at: { x: 3, z: 4 } };
  const orders = { move: { kind: "range", focus: "foe", near: 4, far: 5 }, face: { x: 1, z: 0 }, foe: "foe", region: "head", pace: .3, walk: true };
  const before = structuredClone(orders), { move, ...rest } = orders;
  for (const at of [{ x: 3, z: 4 }, { x: 0, z: 0 }]) assert.deepEqual(releaseCombatApproach(orders, from, { ...target, at }), rest);
  assert.equal(releaseCombatApproach(orders, from, { ...target, at: { x: 3, z: 4.01 } }), orders);
  for (const request of [undefined, null, { kind: "direct", direction: { x: 1, z: 0 } },
    { kind: "place", points: [target.at], near: .1 }, { ...move, focus: "companion" }]) {
    const given = { ...orders, move: request };
    assert.equal(releaseCombatApproach(given, from, target), given);
  }
  for (const given of [{ ...orders, foe: undefined }, { ...orders, foe: "other" }]) assert.equal(releaseCombatApproach(given, from, target), given);
  assert.equal(releaseCombatApproach(orders, from, null), orders);
  assert.deepEqual(orders, before, "delivery never rewrites the standing order");
});

test("a team's retained approach releases and resumes even when its Commander emits no new orders, and forks", () => {
  const centres = { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 3 } }, delivered = [];
  let decide;
  const duel = { clock: 0, eliminated: () => false, life: () => 1, world: { sense(fn) { decide = fn; return { dispose() {} }; } },
    duelists: Object.fromEntries(["left", "right"].map(side => [side, { model: "workshop-fighter", body: { physical: { centre: centres[side] } },
      minded: { report: null } }])),
    order(side, orders) { delivered.push({ side, orders: structuredClone(orders) }); } };
  const team = teamOfOne(duel, "left", { kind: "stub-approach" });
  try {
    decide();
    const raw = structuredClone(team.state.orders), saved = saveState(team.state), far = raw.move.far;
    assert.equal(delivered.at(-1).orders.move.kind, "range", "the fixture begins outside combat range");
    const tail = () => {
      delivered.length = 0;
      for (const distance of [far, far + .01, far - .01]) { centres.right.z = distance; decide(); }
      return { delivered: structuredClone(delivered), state: saveState(team.state) };
    };
    const first = tail();
    assert.deepEqual(first.delivered.map(entry => entry.orders), [{ face: null, foe: "right" }, raw, { face: null, foe: "right" }]);
    loadState(team.state, saved);
    assert.deepEqual(tail(), first, "both the raw standing orders and Commander memory fork");
  } finally { team.dispose(); }
});

for (const id of ["puncher", "vanguard-warrior"]) test(`${id}: Commander combat handoff and explicit routes replay without a Commander`, async () => {
  const config = MINDS[id].config, recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: .9, minds: { left: config, right: config } };
  const bout = await buildBout(recipe, { engine: BOUT_ENGINE }), { world, duel } = bout;
  const team = teamOfOne(duel, "left", { kind: "party", picks: false });
  const trace = traceOf([duel.duelists.left.built, duel.duelists.right.built]);
  try {
    team.hear({ kind: "attack", foe: "right" });
    world.step(); trace.take();
    const order = duel.tape.at(-1).orders;
    assert.equal(order.foe, "right", "the fixture's Commander names its foe");
    assert.equal(order.move, undefined, "the fixture starts within the Commander's approach range");
    const report = duel.duelists.left.minded.report;
    assert.ok(report.gait && report.navigation && Number.isFinite(report.heading));
    const saved = { bout: duel.save(), team: saveState(team.state) }, until = duel.steps + 30;
    const tail = () => {
      const after = traceOf([duel.duelists.left.built, duel.duelists.right.built]);
      while (duel.steps < until) { world.step(); after.take(); }
      return { pose: after.digest(), tape: structuredClone(duel.tape), team: saveState(team.state) };
    };
    const first = tail(); duel.load(saved.bout); loadState(team.state, saved.team);
    assert.deepEqual(tail(), first);
    // Replay starts from the recipe, so the full trace is taken on the final run below.
    duel.load(saved.bout); loadState(team.state, saved.team);
    while (duel.steps < until) { world.step(); trace.take(); }
    team.hear({ kind: "go", route: { points: [{ x: -3, z: 1 }], drawing: false } });
    world.step(); trace.take();
    assert.equal(duel.tape.at(-1).orders.move.kind, "place", "an explicit route keeps movement authority");
    const replay = await buildBout(recipe, { engine: BOUT_ENGINE });
    try {
      replay.duel.play(duel.tape);
      const again = traceOf([replay.duel.duelists.left.built, replay.duel.duelists.right.built]);
      while (replay.duel.steps < duel.steps) { replay.world.step(); again.take(); }
      assert.deepEqual({ pose: again.digest(), tape: replay.duel.tape }, { pose: trace.digest(), tape: duel.tape });
    } finally { replay.dispose(); }
  } finally { team.dispose(); bout.dispose(); }
});
