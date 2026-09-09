// A fitted table loaded at run time, which nothing in `src/` had ever done before this session.
//
// Two different claims are under test here and they are worth keeping apart:
//
// 1. **The readers**, `tableFromCheckpoint`, `tableFromPoolMember` and `tableFromLeague`. These are
//    the only code in `src/` that reads a file two scripts write, and the failure they exist to
//    stop is a half-decoded table -- a mind fighting under numbers nobody wrote, which runs
//    perfectly happily and looks like a bad policy rather than like a bug. So every reader is
//    driven off a fixture cut from a real file, and every refusal is asserted by what it *says*
//    rather than only by throwing.
// 2. **The slot**, which is module state, and the picker's answer to an empty one. `Policy.create`
//    is synchronous, so `golem-snapshot` is a row whose factory can refuse; the setup screen marks
//    it incompatible by the same rule it marks any policy a unit cannot take, which is absence
//    from `driverOptions`. That is a rule stated in `SetupScreen.render` and `SetupScreen.refusal`
//    in `src/setup.ts`, and this file asserts the input those two read rather than building a DOM.
//
// Mutations watched red while writing this, because a green test that asserts nothing is the worst
// defect this tree makes:
//
// | mutation | what went red |
// |---|---|
// | return `freshPolicyTable(...)` from `assemble` without `checkPolicyWeights` | the moved-surface test |
// | read `json.norm` in `tableFromCheckpoint` as well, with `??` | the pool-member test |
// | let `golemSnapshotMind` build on an empty slot with `POLICY_WEIGHTS` | the withheld-row test |
// | put `golem-snapshot` in `driverOptions` unconditionally | the withheld-row test |
// | drop the per-entry `Number.isFinite` in `numbers` | the hole-in-a-weight-vector test |
// | ignore `sample` when building the policy | the two-fighters test |
import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/config.ts";
import { netSize } from "../src/golem/neural-net.ts";
import { PILOT_FEATURE_COUNT, PILOT_FEATURES_VERSION } from "../src/golem/pilot.ts";
import { POLICY_LAYOUT, POLICY_VERSION } from "../src/golem/policy.ts";
import {
  clearSnapshot, installSnapshot, installedSnapshot, snapshotFromJson, snapshotOptionLabel,
  snapshotProvenance, tableFromCheckpoint, tableFromLeague, tableFromPoolMember,
} from "../src/golem/snapshot.ts";
import { COMMAND_RANGES } from "../src/golem/tactics-v4.ts";
import { POLICIES, policyMind } from "../src/mind.ts";
import { unitDefinition } from "../src/units.ts";
import { checkpointJson, fill, leagueJson, poolMemberJson, SNAPSHOT_RUNS } from "./fixtures/snapshot-runs.mjs";
import { assertCompleteView } from "./fixtures/view.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;

/**
 * The slot is module state, so every test empties it on the way out.
 *
 * Not on the way in: a test that only cleaned up before itself would leave the last one installed
 * for every *other* file in the same process, and `driverOptions` is a getter that reads this slot.
 */
const withSlot = (body) => {
  try {
    body();
  } finally {
    clearSnapshot();
  }
};

// --------------------------------------------------------------------------------- the fixtures

/**
 * The fixture is only worth anything while it is the size the surface is.
 *
 * `tests/fixtures/snapshot-runs.json` records the array lengths the real files had. If a session
 * moves `POLICY_LAYOUT` or the pilot's column list, those recorded lengths stop describing this
 * build -- and every reader test below would then be asserting that a stale vector is accepted,
 * which is the one outcome worse than failing. So the fixture is checked against the build first.
 */
test("the_trimmed_fixtures_are_still_the_size_this_build_s_surface_is", () => {
  assert.equal(SNAPSHOT_RUNS.checkpoint.weightCount, netSize(POLICY_LAYOUT));
  assert.equal(SNAPSHOT_RUNS.pool.weightCount, netSize(POLICY_LAYOUT));
  assert.equal(SNAPSHOT_RUNS.league.weightCount, netSize(POLICY_LAYOUT));
  for (const run of [SNAPSHOT_RUNS.checkpoint.header.normalisation, SNAPSHOT_RUNS.pool.header.norm]) {
    assert.equal(run.mean.length, PILOT_FEATURE_COUNT);
    assert.equal(run.variance.length, PILOT_FEATURE_COUNT);
  }
  // The key sets, verbatim off the two writers, in the order they write them. A script that renames
  // a field leaves this green and the arena red -- `tournaments/` is gitignored and no test may read
  // it -- so the list is here to be re-cut by hand, exactly as `tests/fixtures/intent.mjs` is.
  assert.deepEqual(SNAPSHOT_RUNS.checkpoint.keys,
    ["iteration", "seed", "date", "bouts", "steps", "weights", "valueWeights", "logSigma", "normalisation"]);
  assert.deepEqual(SNAPSHOT_RUNS.pool.keys,
    ["weights", "valueWeights", "logSigma", "norm", "seed", "history", "bornAt"]);
  assert.deepEqual(SNAPSHOT_RUNS.league.keys,
    ["version", "policy", "features", "seed", "date", "iteration", "bouts", "steps", "main",
      "exploiters", "pool", "taken"]);
});

// ---------------------------------------------------------------------------------- the readers

test("a_checkpoint_installs_and_carries_the_run_s_own_provenance", () => {
  const json = checkpointJson();
  const table = tableFromCheckpoint(json);
  assert.equal(table.version, POLICY_VERSION);
  assert.equal(table.features, PILOT_FEATURES_VERSION);
  assert.equal(table.weights.length, netSize(POLICY_LAYOUT));
  assert.equal(table.normalisation.mean.length, PILOT_FEATURE_COUNT);
  // The five numbers the run paid for, not defaults. `iteration` becomes `iterations` because a
  // checkpoint names where it is in one run and a `PolicyWeights` names how many a table has had.
  assert.equal(table.iterations, json.iteration);
  assert.equal(table.seed, json.seed);
  assert.equal(table.date, json.date);
  assert.equal(table.bouts, json.bouts);
  assert.equal(table.steps, json.steps);
  // A checkpoint does not say who it sparred with, so the reader says so rather than guessing.
  assert.equal(table.opponent, null);
  assert.equal(table.score, 0);
});

test("a_pool_member_installs_under_its_own_spelling_of_the_statistics", () => {
  // `roleToJson` writes `norm`; the checkpoint writer writes `normalisation`. One reader that
  // accepted either would make the dispatch below undecidable, which is why there are two.
  const json = poolMemberJson();
  const table = tableFromPoolMember(json);
  assert.equal(table.weights.length, netSize(POLICY_LAYOUT));
  assert.equal(table.normalisation.count, json.norm.count);
  assert.equal(table.seed, json.seed);
  assert.throws(() => tableFromCheckpoint(json), /normalisation is missing/);
  // A pool member with something measured against it scores the freshest of those margins, and one
  // with nothing measured scores zero rather than inventing a number. Every pool file in the runs
  // on this machine is the second case -- see `tableFromPoolMember` -- so both are driven here.
  assert.equal(table.score, 0);
  assert.equal(tableFromPoolMember(poolMemberJson({ history: [0.11, -0.04, 0.27] })).score, 0.27);
  assert.equal(tableFromPoolMember(poolMemberJson({ bornAt: 40 })).iterations, 40);
});

test("a_league_state_installs_its_main_and_is_refused_by_the_versions_it_names", () => {
  const json = leagueJson();
  const table = tableFromLeague(json);
  assert.equal(table.iterations, json.iteration);
  assert.equal(table.bouts, json.bouts);
  assert.equal(table.steps, json.steps);
  // The one format that carries its own versions is checked against them, rather than being read
  // under this build's the way a version-less checkpoint has to be.
  assert.equal(table.version, json.policy);
  assert.equal(table.features, json.features);
  assert.throws(() => tableFromLeague(checkpointJson()), /carries its shipped mind under `main`/);
});

test("a_snapshot_from_a_moved_surface_is_refused_by_the_check_that_caught_it", () => {
  // Four of `checkPolicyWeights`'s six refusals, reached through a reader rather than by handing
  // the checker a table directly, because the point is that a file cannot get past a reader.
  assert.throws(() => tableFromLeague(leagueJson({ policy: POLICY_VERSION + 1 })), /version/i);
  assert.throws(() => tableFromLeague(leagueJson({ features: PILOT_FEATURES_VERSION + 1 })),
    /feature/i);
  const shortWeights = { ...checkpointJson(), weights: fill(netSize(POLICY_LAYOUT) - 1, 1) };
  assert.throws(() => tableFromCheckpoint(shortWeights), /weight/i);
  assert.throws(() => tableFromCheckpoint(checkpointJson({ logSigma: [0, 0, 0] })),
    /sigma|spread|gate|axis|axes/i);
  assert.throws(
    () => tableFromCheckpoint(checkpointJson({ normalisation: { count: 1, mean: [0, 0], variance: [1, 1] } })),
    /normalisation|feature|column|width/i,
  );
});

test("a_weight_vector_with_a_hole_in_it_is_refused_by_index_rather_than_loaded", () => {
  // JSON carries `null` where a writer let a `NaN` through, and one null propagates through the
  // whole head on the first forward pass and comes out as a command of nothing.
  const holed = checkpointJson();
  holed.weights = [...holed.weights];
  holed.weights[5000] = null;
  assert.throws(() => tableFromCheckpoint(holed), /weights holds null at 5000/);
  assert.throws(() => tableFromCheckpoint(checkpointJson({ logSigma: "nine numbers" })),
    /logSigma is not an array/);
  assert.throws(() => tableFromCheckpoint(checkpointJson({ normalisation: undefined })),
    /normalisation is missing/);
});

test("which_of_the_three_shapes_a_file_is_is_read_from_the_file_and_not_its_name", () => {
  // Every one of these is handed a *lying* path, because a URL says nothing about a format and
  // somebody who renames a checkpoint has not changed what is in it.
  assert.equal(snapshotFromJson(leagueJson(), "pool-40.json").source.kind, "league");
  assert.equal(snapshotFromJson(poolMemberJson(), "league.json").source.kind, "pool");
  assert.equal(snapshotFromJson(checkpointJson(), "league-anchored/main.json").source.kind, "checkpoint");
  assert.throws(() => snapshotFromJson({ weights: [] }, "whatever.json"),
    /none of the three snapshot shapes/);
  assert.throws(() => snapshotFromJson([1, 2, 3], "array.json"), /not a JSON object/);
});

// ------------------------------------------------------------------------------------- the slot

test("the_picker_row_names_the_file_when_the_file_cannot_name_its_iteration", () => {
  withSlot(() => {
    assert.equal(snapshotOptionLabel(), "Golem snapshot");
    assert.equal(snapshotProvenance(), null);
    // A pool member stamps `bornAt` 0 and no history, so "it 0" would be a claim and not an
    // absence; the path is what separates two members of the same league in the picker.
    const pool = snapshotFromJson(poolMemberJson(), "league-anchored/pool-40.json");
    installSnapshot(pool.table, { source: pool.source });
    assert.equal(snapshotOptionLabel(), "Golem snapshot -- pool-40.json, greedy");
    assert.equal(snapshotProvenance(), "pool league-anchored/pool-40.json, greedy");
    // A checkpoint does stamp itself, and drawn is a different fighter from greedy, so both show.
    const check = snapshotFromJson(checkpointJson(), "ppo-run1-checkpoint.json");
    installSnapshot(check.table, { sample: true, source: check.source });
    assert.equal(snapshotOptionLabel(),
      `Golem snapshot -- ppo-run1-checkpoint.json, it ${SNAPSHOT_RUNS.checkpoint.header.iteration}, drawn`);
    assert.equal(installedSnapshot().sample, true);
  });
  assert.equal(installedSnapshot(), null);
});

test("the_golem_offers_the_snapshot_row_and_withholds_it_until_one_is_installed", () => {
  const golem = unitDefinition("golem");
  const registered = POLICIES.filter((policy) => policy.name === "golem-snapshot");
  assert.equal(registered.length, 1, "one row, and the slot behind it");
  assert.equal(registered[0].surface, golem.controlSurface);
  // The setup screen has exactly one way of saying "this unit cannot take this policy", and it is
  // absence from `driverOptions`: `SetupScreen.render` prepends a disabled `(incompatible)` row for
  // a chosen policy that is not in the list, and `SetupScreen.refusal` blocks Fight for the same
  // reason. So this is the whole of the incompatible marking, asserted at the input those read.
  assert.ok(golem.compatiblePolicies.includes("golem-snapshot"),
    "the golem is the unit whose surface the row is on");
  assert.ok(!golem.driverOptions.some((driver) => driver.name === "golem-snapshot"),
    "and it is not offered while the slot is empty");
  assert.throws(() => policyMind("golem-snapshot", 1), /golem-snapshot/);
  withSlot(() => {
    const { table, source } = snapshotFromJson(poolMemberJson(), "league-anchored/pool-40.json");
    installSnapshot(table, { source });
    const row = golem.driverOptions.find((driver) => driver.name === "golem-snapshot");
    assert.ok(row, "installing one puts the row in the picker");
    assert.equal(row.label, snapshotOptionLabel());
  });
  assert.ok(!golem.driverOptions.some((driver) => driver.name === "golem-snapshot"),
    "and taking it back out withdraws the row again");
});

// -------------------------------------------------------------------------------- and it fights

/**
 * What this body's own modules can be asked for, as `GolemCapabilities` in `src/golem/module.ts`.
 *
 * A golem's self view is a `BodyView` **plus** this, and the fourth executor's `plan` returns on
 * the first line when it is absent -- so a fixture without it is a body with no mind, and every
 * assertion below it would pass while asserting nothing about a loaded table. The numbers are a
 * plain two-socket arm that can thrust, cut and cover; nothing here is a measurement and nothing
 * downstream is compared against a threshold, because what is under test is that a table off a
 * file drives the executor at all.
 */
const ENVELOPE = Object.freeze({
  reachMin: 0.35, reachMax: 0.95, swingMin: -0.6, swingMax: 1.4,
  liftMin: -0.9, liftMax: 0.9, carryMin: -0.2,
});
const EFFECTOR = Object.freeze({
  strokes: Object.freeze(["thrust", "cut", "cover"]), reachable: ENVELOPE, rollMax: 1.2, bendMax: 0.6,
});
const CAPABILITIES = Object.freeze({
  effectors: Object.freeze({ primary: EFFECTOR, secondary: EFFECTOR }),
  trunkTwistMax: 0.7,
  crouchTravel: 0.25,
  pairedHands: false,
});

/**
 * A golem looking at an opponent `gap` metres down +Z.
 *
 * The geometry is deliberately simpler than the arena's -- both shoulders on the centre line, the
 * opponent straight ahead -- for the reason `tests/minds.test.mjs` gives about its own fixture: a
 * sign in an answer then means what it looks like it means. What it is here for is narrow: a table
 * loaded off a file has to survive one real `decide` and produce a command inside the executor's
 * ranges, which is the difference between "the JSON parsed" and "a mind is playing".
 *
 * `assertCompleteView` is run over the two bodies with `capabilities` taken off, because that
 * asserter describes `BodyView` exactly, both directions, and self-knowledge is the one field a
 * golem's self view adds on top of it. Running it at all is the point: it is what catches a
 * fixture that left out a field the arena publishes, which then arrives downstream as `NaN` and
 * loses every comparison in silence rather than throwing.
 */
function facing(gap = 1.6) {
  const socket = (x, z) => ({ x, y: 1.4, z });
  const hand = (name, z, sign) => ({
    weapon: "empty",
    shoulder: socket(name === "primary" ? 0.21 * sign : -0.21 * sign, z),
    tip: socket(0, z + sign * 0.7),
    tipSpeed: 0,
    tipVelocity: { x: 0, y: 0, z: 0 },
    reach: 0.95,
    lost: false,
    outboard: name === "primary" ? 1 : -1,
  });
  const body = (z, sign) => ({
    unit: "golem",
    reach: 0.95,
    crownHeight: 1.75,
    vitalHeight: 1.15,
    collisionRadius: 0.22,
    naturalAttacks: {},
    ground: { x: 0, y: 0, z },
    facing: sign > 0 ? 0 : Math.PI,
    shoulder: socket(0.21 * sign, z),
    tip: socket(0, z + sign * 0.7),
    tipSpeed: 0,
    hands: { primary: hand("primary", z, sign), secondary: hand("secondary", z, sign) },
    crouch: 0,
    trunkLean: 0,
    trunkTwist: 0,
    vitality: 1,
    health: {},
  });
  const view = {
    self: { ...body(0, 1), capabilities: CAPABILITIES },
    opponent: body(gap, -1),
    projectiles: [],
    measure: gap - 0.4,
    clock: 0,
  };
  const bare = ({ capabilities, ...rest }) => rest;
  assertCompleteView({ ...view, self: bare(view.self), opponent: bare(view.opponent) });
  return view;
}

/** Half a second of one mind in front of that view, and what it was asking for at the end. */
function askedFor(mind, steps = 30) {
  const view = facing();
  for (let step = 0; step < steps; step += 1) {
    view.clock += FIXED;
    mind.decide(view, FIXED);
  }
  return { ...mind.driven.command };
}

test("an_installed_snapshot_builds_a_mind_whose_command_is_a_style_command", () => {
  withSlot(() => {
    const { table, source } = snapshotFromJson(checkpointJson(), "ppo-run1-checkpoint.json");
    installSnapshot(table, { source });
    const mind = policyMind("golem-snapshot", 4242);
    assert.equal(mind.name, "golem-snapshot");
    const command = askedFor(mind);
    // Every axis and gate the executor knows about, present, finite and inside the range the
    // executor clamps to -- which is what makes it a `StyleCommand` rather than an object with
    // some of the right keys. `COMMAND_RANGES` is the executor's own list, so a session that adds
    // an axis makes this assert the new one without being edited.
    assert.deepEqual(Object.keys(command).sort(), Object.keys(COMMAND_RANGES).sort());
    for (const [axis, [low, high]] of Object.entries(COMMAND_RANGES)) {
      const value = command[axis];
      assert.equal(typeof value, "number", axis);
      assert.ok(Number.isFinite(value), `${axis} is ${value}`);
      assert.ok(value >= low && value <= high, `${axis} is ${value}, outside [${low}, ${high}]`);
    }
    // The head ran, rather than the mind falling back on something scripted: the policy publishes
    // the raw output it drew the command from, and it asked for a command at all.
    assert.equal(mind.lastHead.length, POLICY_LAYOUT.outputs);
    assert.ok(mind.driven.asks > 0, "and it asked at least once in half a second");
  });
});

test("the_greedy_mind_and_the_drawn_one_are_two_different_fighters", () => {
  // `scripts/idle-probe.mjs` measured the gap in kills; here it is enough that the same weights
  // and the same seed do not produce the same command, because a `sample` flag that never reached
  // `golemPolicy` would be invisible in every other assertion in this file.
  const commandsUnder = (sample) => {
    let asked = null;
    withSlot(() => {
      const { table, source } = snapshotFromJson(checkpointJson(), "ppo-run1-checkpoint.json");
      installSnapshot(table, { sample, source });
      asked = askedFor(policyMind("golem-snapshot", 909));
    });
    return asked;
  };
  const greedy = commandsUnder(false);
  assert.deepEqual(commandsUnder(false), greedy, "the head's mean is the same mind twice");
  assert.notDeepEqual(commandsUnder(true), greedy, "and the draw is a different one");
});
