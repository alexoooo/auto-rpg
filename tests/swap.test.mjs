/**
 * **A part of any converted role swaps in from outside the shared code** (Node, core world,
 * vendored Rapier, 120 Hz). The fixture entrants (`tests/fixtures/swap/`), a fighter and an options
 * fighter, are registered by a line each of the kinds list, outside `src/`, and hold a stub of each
 * converted role as their own parts. For each, chosen by its config alone: the catalog offers it to
 * its own mind's slot and refuses it in another's tree, the part its maker made is the part a bout
 * runs, the bout forks and resumes to the bit and replays from its order sheets, and its tree goes
 * through a link unchanged. One bout, the two fixtures facing, holds every stub at once; an
 * executor is made with the configured guard's posture, and the fork falls inside a sub-mind's
 * takeover and resumes across its handback. A body the command layers cannot read refuses a mind
 * on them for what they lack, at construction too, and every stock legs for what they stand on.
 * The stub Commander, a line of the Commanders list from outside `src/`, leads a team and is a
 * Crypt subject. The Lab opens a fixture mind for what it takes, not for its kind.
 */
import "./fixtures/swap/hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { buildBout } = await import("../src/evaluation/bout.ts");
const { BOUT_ENGINE } = await import("../research/bout.mjs");
const { SIDES } = await import("../src/arena/duel.ts");
const { FIGHT_ENTRY, kindsFor, treeFaults, treeRefusal } = await import("../src/core/mind/catalog.ts");
const { createMind } = await import("../src/core/mind/minds.ts");
const { STAND_ORDERS } = await import("../src/core/mind/orders.ts");
const { entrantSubjects } = await import("../src/evaluation/tournament/entrants.ts");
const { MINDS } = await import("../src/core/mind/controllers.ts");
const { createBody } = await import("../src/core/body.ts");
const { coreStand } = await import("./harness/core-stand.mjs");
const { CONTROLLERS } = await import("../src/core/mind/controllers.ts");
const { RECIPE_FIGHTER } = await import("../src/core/mind/config.ts");
const { modelHolding, modelSpec } = await import("../src/core/models.ts");
const { traceOf } = await import("../src/evaluation/trace.ts");
const { parseMind, writeMind } = await import("../src/ui/mind-link.ts");
const { GAME_CONFIGS, STUBS, SWAP_DEFAULTS, SWAP_OPTIONS_DEFAULTS } = await import("./fixtures/swap/mind.mjs");
const { STUB_POSTURE } = await import("./fixtures/swap/stub-guard.mjs");
const { STUB_BLOW } = await import("./fixtures/swap/stub-blow.mjs");
const { STUB_TAKEOVER, TAKEOVER } = await import("./fixtures/swap/stub-takeover.mjs");
const { saveState } = await import("../src/core/state.ts");
const { COMMANDERS } = await import("../src/core/command/commanders.ts");
const { teamOfOne } = await import("../src/arena/team.ts");
const { CRYPT_CLEAR } = await import("../src/evaluation/crypt-clear/index.ts");
const { labMind } = await import("../src/lab/scenarios.ts");

/** The bout's steps and the step it is forked at. */
const STEPS = 240, FORK = 120;
const spec = modelSpec("workshop-fighter");

test("the fixture entrants are registered from outside src/", () => {
  for (const config of [SWAP_DEFAULTS, SWAP_OPTIONS_DEFAULTS]) {
    assert.ok(Object.hasOwn(CONTROLLERS, config.kind), `the hook put ${config.kind}'s line in the kinds list`);
    assert.deepEqual(treeFaults(config), [], `${config.kind} holding every stub of its own has no fault`);
  }
});

test("the Lab plays the fixture fighter, which takes its script under a kind of its own, and refuses the options fixture, which takes none", () => {
  assert.deepEqual(labMind(SWAP_DEFAULTS, spec, "stance"), { plays: SWAP_DEFAULTS, faults: [] });
  assert.deepEqual(labMind(SWAP_OPTIONS_DEFAULTS, spec, "stance").faults, ["the Lab drives a mind that takes its script, as a fighter does"]);
});

for (const { part, at, mind, place } of STUBS) {
  const kind = part.defaults.kind, game = GAME_CONFIGS[mind];
  test(`${kind}: offered in its own mind's ${part.role} slot only, and a fault in another mind's tree`, () => {
    assert.ok(kindsFor(part.role, spec, [], mind).some((offered) => offered.kind === kind));
    assert.ok(!kindsFor(part.role, spec, [], game.kind).some((offered) => offered.kind === kind));
    assert.deepEqual(treeFaults(place(game)), [`${at}: ${part.label} is ${mind}'s own part`]);
  });
}

test("a body without the command layer refuses a mind for what the layer lacks, at construction too, and every legs for what they stand on", async () => {
  const reptile = modelSpec("reptile"), layer = /^the command layer needs /;
  assert.match(treeRefusal(reptile, RECIPE_FIGHTER) ?? "", layer);
  const legs = kindsFor("locomotion", reptile);
  assert.ok(legs.length > 0, "the fixture offers legs to refuse");
  for (const { kind, reason } of legs) assert.equal(reason, "needs a left and a right foot, each with a box sole", kind);
  const stand = await coreStand(reptile);
  assert.throws(() => createBody(stand.built, stand.world, { servoSeconds: .1 }), (error) => layer.test(error.message.replace(/^reptile: /, "")));
});

test("a Commander registered from outside src/ is listed, leads a team of one and is a Crypt subject", async () => {
  assert.ok(Object.hasOwn(COMMANDERS, "stub-hold"), "the hook put the stub's line in the Commanders list");
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue", gap: 3 }, { engine: BOUT_ENGINE });
  const team = teamOfOne(duel, "left", { kind: "stub-hold" });
  try {
    for (let i = 0; i < world.hz; i++) world.step();
    assert.ok(team.commander.state.decided > 0, "the stub's maker made the Commander that led");
  } finally { team.dispose(); dispose(); }
  const [subject] = CRYPT_CLEAR.subjects(["stub-hold"]);
  assert.deepEqual(CRYPT_CLEAR.protocols.standard.faults(subject.value, CRYPT_CLEAR.protocols.standard.conditions[0]), [], "it leads a party, so the Crypt-clearing task takes it");
});

test("a mind that never strikes carries a club on a stand, is refused from a bout for the bout's rule, and enters no default pool", async () => {
  const still = { ...SWAP_DEFAULTS, actions: [] }, club = { left: "empty", right: "club" }, held = modelHolding("workshop-fighter", club);
  assert.deepEqual([treeFaults(still), treeRefusal(held, still)], [[], null], "fit is what the body can carry out, not what it uses");
  const stand = await coreStand(held);
  const minded = createMind(stand.built, stand.world, still, { name: "stand", orders: () => STAND_ORDERS });
  for (let i = 0; i < stand.world.hz; i++) stand.world.step();
  assert.equal(minded.body.down, false, "the mind holds its body up a second on the stand");
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds: { left: still, right: SWAP_DEFAULTS }, loadouts: { left: club, right: club } };
  assert.ok(FIGHT_ENTRY.includes("attacks"), "a fight asks for an attack");
  await assert.rejects(buildBout(recipe, { engine: BOUT_ENGINE }), { message: "the left mind cannot play workshop-fighter carrying empty,club: it strikes with nothing the body has" });
  const fixtures = Object.keys(MINDS).filter((id) => id.startsWith("swap-"));
  assert.ok(fixtures.length > 0, "the fixture minds are among those a person may pick");
  assert.deepEqual(entrantSubjects([]).filter((subject) => fixtures.some((id) => subject.id.startsWith(`${id}/`))), [], "an experimental mind is in no default pool");
});

test("each part a bout runs is the one its config names, and the bout forks, resumes, replays and links", async () => {
  const minds = { left: SWAP_DEFAULTS, right: SWAP_OPTIONS_DEFAULTS }, recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: 3, minds };
  const played = async (hooks, fork) => {
    const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks });
    try {
      duel.play([]);
      const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
      const run = (until, traces) => { while (duel.steps < until) { world.step(); for (const one of traces) one.take(); } };
      run(FORK, [trace]);
      const saved = fork ? duel.save() : null, atFork = SIDES.map((side) => duel.duelists[side].minded.body.state.mind?.has ?? null);
      run(STEPS, [trace, tail]);
      const states = SIDES.map((side) => ({ kind: minds[side].kind, mind: saveState(duel.duelists[side].minded.state), body: saveState(duel.duelists[side].minded.body.state) }));
      let resumed = null;
      if (saved) { duel.load(saved); const again = traceOf(builts); run(STEPS, [again]); resumed = again.digest(); }
      return { digest: trace.digest(), tail: tail.digest(), resumed, states, atFork, sheets: Object.fromEntries(SIDES.map((side) => [side, duel.duelists[side].sheets])) };
    } finally { dispose(); }
  };
  const first = await played({ record: true }, true);
  const taker = SWAP_DEFAULTS.subs.findIndex((sub) => sub.kind === STUB_TAKEOVER.defaults.kind);
  assert.ok(FORK >= TAKEOVER.FROM && STEPS >= TAKEOVER.UNTIL, "the bout is long enough to fork inside the takeover and hand back after it");
  assert.equal(first.atFork[SIDES.indexOf("left")], taker, "the fixture forked while the takeover stub had the body");
  for (const state of first.states) for (const { part, read } of STUBS.filter((stub) => stub.mind === state.kind)) {
    const kind = part.defaults.kind, own = read(state.mind, state.body);
    assert.equal(own?.stub, kind, `the ${part.role} the mind runs is its config's stub`);
    assert.ok(own.steps > 0, `the ${kind} stub was asked`);
  }
  for (const state of first.states.filter((state) => state.kind === SWAP_DEFAULTS.kind)) {
    assert.deepEqual(read(STUB_BLOW, state).guard, STUB_POSTURE, "the executor is made with the configured guard's posture, where its blows return");
    const standUp = state.body.mind.subs[0];
    assert.equal(standUp.motor.stub, "stub-motor", "the stand-up is made with the configured motor");
    assert.equal(standUp.techniques["step-up"].motor.stub, "stub-motor", "its technique is made with the configured motor");
    assert.equal(state.body.mind.has, -1, "the takeover stub handed the body back to its host");
  }
  assert.equal(first.resumed, first.tail, "the bout forked and resumed is the bout");
  const replay = await played({ replay: first.sheets }, false);
  assert.equal(replay.digest, first.digest, "the replay is the bout");
  for (const config of Object.values(minds)) assert.deepEqual(parseMind(writeMind(config), spec, FIGHT_ENTRY), { config, faults: [] }, `${config.kind}'s tree goes through a link unchanged`);
});

/** `part`'s stub state in a side's saved mind and body state. */
function read(part, { mind, body }) {
  return STUBS.find((stub) => stub.part === part).read(mind, body);
}
