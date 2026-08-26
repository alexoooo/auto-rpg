import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { BoutRecorder, ENGAGEMENT_INSTRUMENT_VERSION, combatRecorder, sampleBoutRecorder,
  wireBoutRecorder } from "../src/recorder.ts";
import { EngagementTracker, opportunityForAction } from "../src/learning/engagement.ts";
import { behaviourRecord, recordBehaviourSample } from "../src/options.ts";
import { blankIntent } from "../src/policies.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

const hand = (weapon = "sword", reach = 1.2, outboard = 1) => ({
  weapon, reach, lost: false, outboard,
  shoulder: { x: 0, y: 1.4, z: 0 }, tip: { x: 0, y: 1.4, z: reach },
  tipSpeed: 0, tipVelocity: { x: 0, y: 0, z: 0 },
});
const body = (z, hands) => ({
  unit: "warrior", reach: 0.7, crownHeight: 1.8, vitalHeight: 1.1,
  collisionRadius: 0.25, naturalAttacks: {}, ground: { x: 0, y: 0, z },
  facing: z === 0 ? 0 : Math.PI, shoulder: { x: 0, y: 1.4, z },
  tip: { x: 0, y: 1.4, z }, tipSpeed: 0, hands,
  crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {},
});
const view = ({ measure = 1.2, primary = "sword", secondary = "empty", clock = 0 } = {}) =>
  assertCompleteView({
    self: body(0, { primary: hand(primary, 1.2, 1), secondary: hand(secondary, 1.2, -1) }),
    opponent: body(measure, { primary: hand(), secondary: hand("empty", 0.55, -1) }),
    projectiles: [], measure, clock,
  });
const durable = (recorder) => JSON.parse(JSON.stringify(recorder.records));
const sample = (recorder, side, published, intent, dt = 1 / 240) => {
  recorder.intent(side, published, intent);
  recorder.sample(side, { view: published, dt, clock: published.clock });
};

test("the_engagement_instrument_has_an_explicit_resume_version", () => {
  assert.equal(ENGAGEMENT_INSTRUMENT_VERSION, 1);
});

test("the_bench_report_carries_the_versioned_records_from_the_shared_recorder", async () => {
  process.env.SWORD_MEASURE_LIBRARY = "1";
  const { runBout } = await import("../scripts/measure.mjs");
  let samples = 0;
  const result = runBout({
    left: "idle", right: "idle", seeds: [17, 23],
    leftLoadout: { primary: "sword", secondary: "empty" },
    rightLoadout: { primary: "sword", secondary: "empty" },
    onSample({ right }) {
      samples += 1;
      if (samples === 2) right.limbs.find((limb) => limb.key === "torso").health = 0;
    },
  });
  assert.equal(result.engagementInstrumentVersion, ENGAGEMENT_INSTRUMENT_VERSION);
  assert.equal(result.behaviour.left.seconds > 0, true);
  assert.equal(result.behaviour.right.seconds > 0, true);
  const source = await readFile(new URL("../scripts/measure.mjs", import.meta.url), "utf8");
  assert.match(source, /wireBoutRecorder\(recorder, left, right\)/,
    "the bench attaches both bodies through the shared intent adapter");
  assert.match(source, /combatRecorder\(recorder, "left"/,
    "the bench records left combat through the shared adapter");
  assert.match(source, /combatRecorder\(recorder, "right"/,
    "the bench records right combat through the shared adapter");
  assert.match(source, /sampleBoutRecorder\(recorder, left, right, FIXED, now\)/,
    "the bench samples both views through the shared adapter");
});

test("the_same_sample_and_event_stream_produces_the_same_record_in_both_loops", () => {
  const page = new BoutRecorder();
  const bench = new BoutRecorder();
  const left = view();
  const right = view({ primary: "bow" });
  const leftIntent = blankIntent(); leftIntent.primary.thrust = true;
  const rightIntent = blankIntent(); rightIntent.primary.thrust = true;

  sample(page, "left", left, leftIntent);
  sample(page, "right", right, rightIntent);
  page.combat("left", { hand: "primary", blocked: false,
    report: { weapon: "sword", damage: 7, at: 0.1 } });

  // The bench receives a pair and projects it at its call site; the page calls
  // the same per-body seam twice. No recorder branch knows which loop did so.
  for (const [side, published, intent] of [["left", left, leftIntent], ["right", right, rightIntent]]) {
    bench.intent(side, published, intent);
  }
  for (const [side, published] of [["left", left], ["right", right]]) {
    bench.sample(side, { view: published, dt: 1 / 240, clock: published.clock });
  }
  bench.combat("left", { hand: "primary", blocked: false,
    report: { weapon: "sword", damage: 7, at: 0.1 } });

  assert.deepEqual(durable(page), durable(bench));
  assert.equal(page.records.left.engagement.attacksInWindow, 1,
    "sampling before the queued intent keeps the first viable edge");
});

test("the_shared_loop_adapter_wires_intents_samples_and_combat_for_both_sides", () => {
  const recorder = new BoutRecorder();
  const bodies = { left: { view: view(), intentObserver: null },
    right: { view: view({ clock: 0 }), intentObserver: null } };
  wireBoutRecorder(recorder, bodies.left, bodies.right);
  const thrust = blankIntent(); thrust.primary.thrust = true;
  bodies.left.intentObserver(bodies.left.view, thrust);
  bodies.right.intentObserver(bodies.right.view, blankIntent());
  sampleBoutRecorder(recorder, bodies.left, bodies.right, 1 / 240, 0);
  const observed = [];
  combatRecorder(recorder, "left", (event) => observed.push(event))({ hand: "primary", blocked: true,
    report: { weapon: "sword", damage: 4, at: 0 } });
  assert.equal(recorder.records.left.engagement.attacksInWindow, 1);
  assert.equal(recorder.records.left.contacts.primary, 1);
  assert.equal(recorder.records.right.blocks, 1);
  assert.equal(observed.length, 1, "the bench observer survives the shared recording callback");
});

test("the_engagement_recorder_reads_no_controls_or_mind_identity", async () => {
  const source = await readFile(new URL("../src/recorder.ts", import.meta.url), "utf8");
  for (const forbidden of [/\bControls\b/, /\.mind\b/, /\bdriving\b/, /\bhuman\b/, /\bpointer(?:X|Y|State)?\b/]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("research_runners_version_the_label_free_instrument_before_starting_workers", async () => {
  for (const file of ["train-neat-qd.mjs", "collect-dagger.mjs", "train-lookahead.mjs"]) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
    assert.match(source, /import \{ ENGAGEMENT_INSTRUMENT_VERSION \} from "\.\.\/src\/recorder\.ts"/);
    assert.match(source, /engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION/);
    const refusal = file === "train-lookahead.mjs" ? source.indexOf("lookahead resume refused")
      : source.indexOf("resume refused: config digest changed");
    const firstWork = file === "train-lookahead.mjs" ? source.indexOf("await collectBudget(") : source.indexOf("new Worker(");
    assert.ok(refusal >= 0 && refusal < firstWork,
      `${file} must refuse a stale instrument before it starts rollout work`);
  }
});

test("every_combatant_observes_its_intent_immediately_after_deciding", async () => {
  const [common, fighter, centipede] = await Promise.all([
    readFile(new URL("../src/units.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/fighter.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/bodies/centipede.ts", import.meta.url), "utf8"),
  ]);
  assert.match(common, /intentObserver: \(\(view: FighterView, intent: Intent\) => void\) \| null/);
  assert.match(fighter, /const intent = this\.mind\.decide\(this\.view, dt\);\s*this\.intentObserver\?\.\(this\.view, intent\);/);
  assert.match(centipede, /const input = this\.mind\.decide\(this\.view, dt\);\s*this\.intentObserver\?\.\(this\.view, input\);/);
});

test("a_label_free_mind_and_a_labelled_mind_agree_on_attack_intent_for_a_single_weapon_cut", () => {
  const published = view();
  const intent = blankIntent(); intent.primary.thrust = true;
  const labelFree = new BoutRecorder(); sample(labelFree, "left", published, intent);
  const labelled = behaviourRecord();
  recordBehaviourSample(labelled, published, "cut", 1 / 240, {});
  assert.equal(labelFree.records.left.engagement.attacksInWindow, 1);
  assert.equal(labelled.engagement.attacksInWindow, 1);
});

test("the_four_known_attack_path_disagreements_are_measured_not_assumed", () => {
  const axe = view({ primary: "axe" });
  const research = new EngagementTracker(); research.sample(axe, 1 / 240);
  const unsupported = opportunityForAction(axe, "thrust", "primary");
  if (unsupported) research.attack(unsupported.key, axe.clock);
  const axeLabel = behaviourRecord(); recordBehaviourSample(axeLabel, axe, "thrust", 1 / 240, {});
  const axeFree = new BoutRecorder(); const axeIntent = blankIntent(); axeIntent.primary.thrust = true;
  sample(axeFree, "left", axe, axeIntent);

  const dual = view({ secondary: "sword" });
  const named = new EngagementTracker(); named.sample(dual, 1 / 240);
  const secondary = opportunityForAction(dual, "cut", "secondary");
  named.attack(secondary.key, dual.clock);
  const dualLabel = behaviourRecord(); recordBehaviourSample(dualLabel, dual, "cut", 1 / 240, {});
  const dualFree = new BoutRecorder(); const secondaryIntent = blankIntent(); secondaryIntent.secondary.thrust = true;
  sample(dualFree, "left", dual, secondaryIntent);

  const edgeFree = new BoutRecorder(); const edgeLabel = behaviourRecord(); const edgePrevious = {};
  const first = view(); const press = blankIntent(); press.primary.thrust = true;
  sample(edgeFree, "left", first, press); recordBehaviourSample(edgeLabel, first, "cut", 1 / 240, edgePrevious);
  const away = view({ measure: 3, clock: 1 });
  sample(edgeFree, "left", away, blankIntent()); recordBehaviourSample(edgeLabel, away, "cut", 1, edgePrevious);
  const second = view({ clock: 1.1 });
  sample(edgeFree, "left", second, press); recordBehaviourSample(edgeLabel, second, "cut", 1 / 240, edgePrevious);

  const releaseFree = new BoutRecorder(); const releaseLabel = behaviourRecord(); const releasePrevious = {};
  const guard = blankIntent(); guard.primary.guard = true;
  const guarded = view(); sample(releaseFree, "left", guarded, guard);
  recordBehaviourSample(releaseLabel, guarded, "cover", 1 / 240, releasePrevious);
  const released = view({ clock: 1 / 240 }); sample(releaseFree, "left", released, blankIntent());
  recordBehaviourSample(releaseLabel, released, "cover", 1 / 240, releasePrevious);

  assert.deepEqual({
    unsupportedThrust: [research.record.attacksInWindow, axeLabel.engagement.attacksInWindow,
      axeFree.records.left.engagement.attacksInWindow],
    namedDualWield: [named.record.attacksInWindow, dualLabel.engagement.attacksInWindow,
      dualFree.records.left.engagement.attacksInWindow],
    repeatedButtonEdge: [edgeLabel.engagement.attacksInWindow, edgeFree.records.left.engagement.attacksInWindow],
    guardRelease: [releaseLabel.engagement.attacksInWindow, releaseFree.records.left.engagement.attacksInWindow],
  }, {
    unsupportedThrust: [0, 2, 1],
    namedDualWield: [1, 2, 1],
    repeatedButtonEdge: [1, 2],
    guardRelease: [0, 1],
  });
});

test("two_same_timestamp_contacts_credit_the_striker_and_only_the_opposite_defender", () => {
  const recorder = new BoutRecorder();
  recorder.combat("left", { hand: "primary", blocked: true,
    report: { weapon: "sword", damage: 0, at: 2 } });
  recorder.combat("left", { hand: "primary", blocked: true,
    report: { weapon: "sword", damage: 3, at: 2 } });
  assert.deepEqual({
    leftContacts: recorder.records.left.contacts.primary,
    leftDamage: recorder.records.left.damage,
    leftBlocks: recorder.records.left.blocks,
    rightContacts: recorder.records.right.contacts.primary,
    rightDamage: recorder.records.right.damage,
    rightBlocks: recorder.records.right.blocks,
  }, { leftContacts: 2, leftDamage: 3, leftBlocks: 0, rightContacts: 0, rightDamage: 0, rightBlocks: 2 });
});

test("a_sample_refuses_a_clock_that_is_not_the_published_clock", () => {
  const recorder = new BoutRecorder(); const published = view({ clock: 1 });
  assert.throws(() => recorder.sample("left", { view: published, dt: 1 / 240, clock: 2 }),
    /sample clock 2 disagrees with published view clock 1/);
});
