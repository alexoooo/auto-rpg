import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ResearchArtifact, artifactChecksum, canonicalJson } from "../src/learning/artifact.ts";
import { RESEARCH_ARTIFACT_CONTRACT, decodeResearchArtifact, deployedResearchMind } from "../src/learning/deployment.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "../src/learning/features.ts";
import { initialPopulation } from "../src/learning/genome.ts";
import { META_OUTPUT_LAYOUT } from "../src/learning/meta.ts";
import { GRU_UNITS } from "../src/learning/recurrent-network.ts";
import { SeededRng } from "../src/learning/rng.ts";
import { TACTICAL_STATE_COLUMNS } from "../src/learning/tactical-model.ts";
import { freezeTournamentManifest } from "../src/learning/tournament.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES } from "../src/options.ts";
import { executeNextTournamentRows, loadFrozenArtifacts } from "../scripts/tournament-executor.mjs";

const payload = (value) => [...new TextEncoder().encode(canonicalJson(value))];
const provenance = { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" };
const artifact = (algorithm, model) => new ResearchArtifact({ algorithm, ...RESEARCH_ARTIFACT_CONTRACT,
  payload: payload(model), provenance }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
const layer = (rows, columns) => ({ rows, columns, weights: Array(rows * columns).fill(0), bias: Array(rows).fill(0) });
/**
 * The five categorical heads, built from the frozen tables rather than named
 * one by one.
 *
 * Both fixtures below spelled `movement` and `action` out and stopped there,
 * which is what a fixture does when the contract is what it is testing. Stage
 * C2b's `finiteLayer` and `predictDagger` both check a head's matrix against
 * the *runtime* table now, so a fixture that names four of five heads is an
 * artifact that fails to deploy -- which is the point, and is why this is a
 * loop over one table instead.
 */
const HEAD_TABLES = { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES,
  target: TARGET_NAMES, stance: STANCE_NAMES };
const headEntries = (build) => Object.fromEntries(Object.entries(HEAD_TABLES).map(([name, table]) => [name, build(table)]));
const ppo = () => ({ weights: { inputSize: FEATURE_COLUMNS.length, units: GRU_UNITS,
  update: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS), reset: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS),
  candidate: layer(GRU_UNITS, FEATURE_COLUMNS.length + GRU_UNITS),
  ...headEntries((table) => layer(table.length, GRU_UNITS)), value: layer(1, GRU_UNITS) } });
const dagger = () => ({ featureCount: FEATURE_COLUMNS.length, hiddenCount: 1,
  hiddenWeights: Array(FEATURE_COLUMNS.length).fill(0), hiddenBias: [0],
  ...headEntries((table) => ({ labels: table, weights: Array(table.length).fill(0), bias: Array(table.length).fill(0) })),
  persistenceWeights: [0], persistenceBias: 0 });
const lookahead = () => ({ version: 1, featureNames: TACTICAL_STATE_COLUMNS, tactics: {}, cells: {}, digest: "synthetic" });
const bytes = new Map([
  ["neat", artifact("neat-qd", initialPopulation(1, FEATURE_COLUMNS.length, META_OUTPUT_LAYOUT.width, 9)[0])], ["dagger", artifact("dagger", dagger())], ["ppo", artifact("ppo", ppo())], ["lookahead", artifact("lookahead", lookahead())],
]);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const candidates = [...bytes].map(([name, value]) => ({ name, algorithm: name === "neat" ? "neat-qd" : name,
  artifactDigest: digest(value), artifactBytes: value.byteLength }));
const job = Object.freeze({ split: "test", cell: 0, mirror: 0, actorSide: "left", actorSeed: 11, opponentSeed: 12,
  unit: "warrior", loadout: "sword+empty", opponent: "specialist", boutCapSeconds: 1 });
const manifest = freezeTournamentManifest({ candidates, jobs: [job] });

test("every_frozen_research_artifact_has_one_strict_deployment_runtime", () => {
  const loaded = loadFrozenArtifacts(manifest, bytes);
  for (const name of bytes.keys()) assert.doesNotThrow(() => deployedResearchMind(loaded.get(name), "warrior/sword+empty"));
  const changed = new Map(bytes); const corrupt = new Uint8Array(bytes.get("ppo")); corrupt[corrupt.length - 2] ^= 1; changed.set("ppo", corrupt);
  assert.throws(() => loadFrozenArtifacts(manifest, changed), /digest changed/);
});

test("the_executor_runs_only_the_next_frozen_indices_and_returns_mergeable_raw_rows", async () => {
  const loaded = loadFrozenArtifacts(manifest, bytes); const called = [];
  const mock = async (indexedJob, makeMind) => { called.push(indexedJob.index); makeMind(() => {});
    return { result: { winner: "left", seconds: 1 }, engagement: { viableOpportunities: 2, attacksInWindow: 1,
      damagingContactsInWindow: 1, nearRangeStallSeconds: 0, firstAttackSeconds: 0.2 }, actionCounts: { cut: 1 } }; };
  const rows = await executeNextTournamentRows({ manifest, rows: [], artifacts: loaded, maximum: 2, runResearchBout: mock });
  assert.deepEqual(called, [0, 0]); assert.deepEqual(rows.map((row) => row.candidate), ["neat", "dagger"]);
  assert.ok(rows.every((row) => row.manifestDigest === manifest.digest)); assert.deepEqual(rows[0].job, job);
  const resumed = await executeNextTournamentRows({ manifest, rows, artifacts: loaded, maximum: 1, runResearchBout: mock });
  assert.equal(resumed.at(-1).candidate, "ppo");
});

test("a_payload_shape_mismatch_refuses_before_the_mocked_bout_opens", () => {
  const bad = artifact("ppo", { weights: { inputSize: 1 } });
  const decoded = new ResearchArtifact({ algorithm: "ppo", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode('{"weights":{"inputSize":1}}')], provenance }, RESEARCH_ARTIFACT_CONTRACT);
  assert.ok(bad.byteLength > 0);
  assert.throws(() => deployedResearchMind(decoded, "warrior/sword+empty"), /wrong recurrent feature\/action shape/);
});

/**
 * A header from the version before, refused before anything is built from it.
 *
 * The payload here is **executable**: the same bytes, resealed under the current
 * contract, decode and deploy and run a probe. Only the header is stale. That is
 * what makes this an ordering claim rather than a restatement of the envelope's
 * validator -- the artifact is not corrupt, it is not the wrong shape, and there
 * is nothing else for the refusal to be about.
 *
 * The stale table is synthetic and is meant to be. The real v3 columns were
 * deleted with v3, and reintroducing them here so that a test could name them
 * would put a copy of a retired contract back in the tree -- which is exactly
 * what `FEATURE_VERSION` exists to make unnecessary.
 */
test("a_synthetic_stale_feature_header_is_refused_before_network_execution", () => {
  // Stale on the *input* half only: the whole output half of the header matches
  // the runtime, so the refusal below cannot be about the vocabulary a network
  // writes into.
  const staleContract = Object.freeze({
    featureVersion: FEATURE_VERSION - 1,
    featureNames: Object.freeze(FEATURE_COLUMNS.slice(0, 66)),
    tacticVersion: TACTIC_VERSION,
    movementNames: MOVEMENT_NAMES,
    actionNames: HAND_ACTION_NAMES,
    effectorNames: EFFECTOR_NAMES,
    targetNames: TARGET_NAMES,
    stanceNames: STANCE_NAMES,
  });
  const model = dagger();
  const stale = new ResearchArtifact({ algorithm: "dagger", ...staleContract,
    payload: payload(model), provenance }, staleContract).toBytes();

  assert.throws(() => decodeResearchArtifact(stale),
    new RegExp(`research artifact feature version ${FEATURE_VERSION - 1} does not match runtime ${FEATURE_VERSION}`));
  // And not for any of the other reasons an artifact can be refused. A version
  // gate that reported "feature names do not match" would be telling whoever
  // reads the log to go and edit a column list, which is the wrong repair.
  assert.throws(() => decodeResearchArtifact(stale), (error) => {
    assert.doesNotMatch(error.message,
      /feature names|tactic version|movement names|action names|effector names|target names|stance names|checksum|feature count/);
    return true;
  });

  // The same model, under the current header, is a mind that runs -- so nothing
  // above was about the payload, and the refusal happened before a network was
  // ever constructed from it.
  const current = new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: payload(model), provenance }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
  const decoded = decodeResearchArtifact(current);
  assert.equal(decoded.data.featureVersion, FEATURE_VERSION);
  assert.doesNotThrow(() => deployedResearchMind(decoded, "warrior/sword+empty"));
});

/**
 * The header from before the output contract widened, refused for that alone.
 *
 * The stale artifact here is not merely *wrong* in a field, it is **missing
 * four**: an artifact written against the thirteen-output contract carries no
 * `tacticVersion` and none of the three name tables. That is the case
 * `artifact.ts` could not catch by construction, because `fromBytes` spreads
 * whatever it decoded and rejects no key -- so an absent field is silently
 * absent, and the only thing that can see it is a comparison written out by
 * hand beside the `featureVersion` one.
 *
 * It has to be assembled from a valid artifact's data with those keys deleted
 * and a fresh checksum, because `ResearchArtifact`'s constructor is one of the
 * two things under test and will not build one. The payload is the same DAgger
 * model that deploys at the bottom of this test, so the artifact is neither
 * corrupt nor the wrong shape and there is nothing else for the refusal to be
 * about.
 */
test("a_synthetic_stale_action_header_is_refused_before_solver_work", () => {
  const model = dagger();
  const current = new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: payload(model), provenance }, RESEARCH_ARTIFACT_CONTRACT);
  const { tacticVersion, effectorNames, targetNames, stanceNames, ...body } = current.data;
  assert.equal(tacticVersion, TACTIC_VERSION);
  assert.deepEqual([effectorNames, targetNames, stanceNames], [EFFECTOR_NAMES, TARGET_NAMES, STANCE_NAMES]);
  const stale = new TextEncoder().encode(canonicalJson({ ...body, checksum: artifactChecksum(canonicalJson(body)) }));
  // The fixture can exhibit the defect, checked rather than assumed: these are
  // absent keys and not mismatched ones, which is the whole point of the test.
  const wire = JSON.parse(new TextDecoder().decode(stale));
  for (const key of ["tacticVersion", "effectorNames", "targetNames", "stanceNames"]) {
    assert.equal(Object.hasOwn(wire, key), false, key);
  }
  assert.equal(wire.featureVersion, FEATURE_VERSION, "the input half of the header is current");

  assert.throws(() => decodeResearchArtifact(stale),
    new RegExp(`research artifact tactic version undefined does not match runtime ${TACTIC_VERSION}`));
  // And not for one of the six other reasons. "effector names do not match"
  // would send whoever reads the log to edit a table that is not the problem,
  // and a bare `TypeError` from reading `.length` of `undefined` would not name
  // the artifact at all -- which is what this refusal replaced.
  assert.throws(() => decodeResearchArtifact(stale), (error) => {
    assert.equal(error instanceof TypeError, false, error.message);
    assert.doesNotMatch(error.message,
      /feature version|feature names|movement names|action names|effector names|target names|stance names|checksum/);
    return true;
  });

  // The same payload under the current header decodes and deploys, so the
  // refusal was the header and happened before a network was built from it.
  const decoded = decodeResearchArtifact(current.toBytes());
  assert.equal(decoded.data.tacticVersion, TACTIC_VERSION);
  assert.doesNotThrow(() => deployedResearchMind(decoded, "warrior/sword+empty"));
});

/**
 * A version of the right value and the wrong type, on both halves of the header.
 *
 * **Neither comparison was pinned to strict equality.** Relaxing `!==` to `!=`
 * in either of `artifact.ts`'s two version gates left all four contract suites
 * green, and an artifact carrying `"featureVersion": "4"` or `"tacticVersion":
 * "2"` -- the numbers as JSON *strings* -- was then accepted outright: `"2" == 2`
 * is true. A hand-edited header, a foreign writer or a template that quoted its
 * substitutions is the only thing that produces one, which is exactly the
 * artifact these gates exist for.
 *
 * **And the refusal read as a contradiction.** The message interpolated the
 * value bare, so a string `"2"` produced `research artifact tactic version 2 does
 * not match runtime 2` -- a sentence that sends whoever reads the log looking for
 * a bug in the comparison. `JSON.stringify` quotes a string, leaves a number
 * alone and renders `undefined` as `undefined`, so the sentence names the real
 * problem without disturbing the two refusals above.
 *
 * The artifact has to be assembled on the wire, because `ResearchArtifact`'s
 * constructor is the thing under test and will not build one.
 */
test("a_version_header_of_the_right_value_and_the_wrong_type_is_refused_by_type", () => {
  const current = new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: payload(dagger()), provenance }, RESEARCH_ARTIFACT_CONTRACT);
  const rewritten = (field, value) => { const body = { ...current.data, [field]: value };
    return new TextEncoder().encode(canonicalJson({ ...body, checksum: artifactChecksum(canonicalJson(body)) })); };

  for (const [field, runtime, label] of [["featureVersion", FEATURE_VERSION, "feature version"],
    ["tacticVersion", TACTIC_VERSION, "tactic version"]]) {
    const stringly = rewritten(field, String(runtime));
    // The fixture can exhibit the defect: the value is right, the type is not,
    // and `==` cannot tell them apart.
    const wire = JSON.parse(new TextDecoder().decode(stringly));
    assert.equal(typeof wire[field], "string", field);
    // Loosely equal and strictly unequal, which is the whole fixture: `==` is
    // written out rather than described, because it is the operator under test.
    assert.ok(wire[field] == runtime, "the fixture must be loosely equal to the runtime version"); // eslint-disable-line eqeqeq
    assert.ok(wire[field] !== runtime, "and strictly unequal, or there is nothing for `!==` to catch");

    assert.throws(() => decodeResearchArtifact(stringly),
      new RegExp(`research artifact ${label} "${runtime}" does not match runtime ${runtime}`), field);
    // The quotes are the whole point, so the contradictory sentence is refused
    // by name: without them this reads "tactic version 2 does not match runtime 2".
    assert.throws(() => decodeResearchArtifact(stringly), (error) => {
      assert.doesNotMatch(error.message, new RegExp(`${label} ${runtime} does not match`), error.message);
      return true;
    }, field);
  }

  // A genuine numeric mismatch is unchanged by the quoting: no quotes, and still
  // refused for that field alone rather than by one of the name tables.
  const older = rewritten("tacticVersion", TACTIC_VERSION - 1);
  assert.throws(() => decodeResearchArtifact(older),
    new RegExp(`research artifact tactic version ${TACTIC_VERSION - 1} does not match runtime ${TACTIC_VERSION}`));
  assert.doesNotThrow(() => decodeResearchArtifact(current.toBytes()));
});
