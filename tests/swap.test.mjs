/**
 * **A part of any converted role swaps in from outside the shared code** (Node, core world,
 * vendored Rapier, 120 Hz). The fixture entrant (`tests/fixtures/swap/`) is registered by one line
 * of the kinds list, outside `src/`, and holds a stub of each converted role as its own part. For
 * each, chosen by its config alone: the catalog offers it to its own mind's slot and refuses it in
 * another's tree, the part its maker made is the part a bout runs, the bout forks and resumes to
 * the bit and replays from its order sheets, and its tree goes through a link unchanged.
 */
import "./fixtures/swap/hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { buildBout } = await import("../src/evaluation/bout.ts");
const { BOUT_ENGINE } = await import("../research/bout.mjs");
const { SIDES } = await import("../src/arena/duel.ts");
const { kindsFor, treeFaults } = await import("../src/core/mind/catalog.ts");
const { CONTROLLERS } = await import("../src/core/mind/controllers.ts");
const { RECIPE_FIGHTER } = await import("../src/core/mind/config.ts");
const { modelSpec } = await import("../src/core/models.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { parseMind, writeMind } = await import("../src/ui/mind-link.ts");
const { STUBS, SWAP_DEFAULTS } = await import("./fixtures/swap/mind.mjs");

/** The bout's steps and the step it is forked at. */
const STEPS = 240, FORK = 120;
const spec = modelSpec("workshop-fighter");

test("the fixture entrant is registered from outside src/", () => {
  assert.ok(Object.hasOwn(CONTROLLERS, "swap-stub"), "the hook put the fixture's line in the kinds list");
});

for (const [slot, stub] of Object.entries(STUBS)) {
  const kind = stub.defaults.kind, config = SWAP_DEFAULTS;
  assert.equal(config[slot]?.kind, kind, `the fixture's ${slot} slot holds its stub`);

  test(`${kind}: offered in its own mind's ${slot} slot only, and a fault in another mind's tree`, () => {
    assert.ok(kindsFor(stub.role, spec, [], "swap-stub").some((offered) => offered.kind === kind));
    assert.ok(!kindsFor(stub.role, spec, [], "fighter").some((offered) => offered.kind === kind));
    assert.deepEqual(treeFaults(config), []);
    assert.deepEqual(treeFaults({ ...RECIPE_FIGHTER, [slot]: stub.defaults }), [`${slot}: ${stub.label} is swap-stub's own part`]);
  });

  test(`${kind}: the part a bout runs is the one its config names, and it forks, resumes, replays and links`, async () => {
    const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds: { left: config, right: config } };
    const played = async (hooks, fork) => {
      const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks });
      try {
        duel.play([]);
        const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
        const run = (until, traces) => { while (duel.steps < until) { world.step(); for (const one of traces) one.take(); } };
        run(FORK, [trace]);
        const saved = fork ? duel.save() : null;
        run(STEPS, [trace, tail]);
        const states = SIDES.map((side) => duel.duelists[side].minded.state);
        let resumed = null;
        if (saved) { duel.load(saved); const again = traceOf(builts); run(STEPS, [again]); resumed = again.digest(); }
        return { digest: trace.digest(), tail: tail.digest(), resumed, states, sheets: Object.fromEntries(SIDES.map((side) => [side, duel.duelists[side].sheets])) };
      } finally { dispose(); }
    };
    const first = await played({ record: true }, true);
    for (const state of first.states) {
      assert.equal(state?.[slot]?.stub, kind, `the ${slot} the mind runs is its config's stub`);
      assert.ok(state[slot].steps > 0, `the stub's ${slot} was asked`);
    }
    assert.equal(first.resumed, first.tail, "the bout forked and resumed is the bout");
    const replay = await played({ replay: first.sheets }, false);
    assert.equal(replay.digest, first.digest, "the replay is the bout");
    const linked = parseMind(writeMind(config), spec);
    assert.deepEqual(linked, { config, faults: [] }, "the tree goes through a link unchanged");
  });
}
