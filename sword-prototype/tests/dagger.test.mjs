import test from "node:test";
import assert from "node:assert/strict";

import { aggregateDaggerRows, balancedDaggerRows, DAGGER_HEAD_NAMES, daggerClassificationMetrics, daggerModelDigest,
  predictDagger, requireTeacherEngagement, selectDaggerIteration, trainDaggerModel, validateDaggerRow } from "../src/learning/dagger.ts";
import { TACTICAL_TEACHER_VERSION, coveringEffector, tacticalTarget, tacticalTeacher } from "../src/learning/tactical-teacher.ts";
import { deployableTactics } from "../src/learning/meta.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES } from "../src/options.ts";
import { WEAPON_KINDS } from "../src/hands.ts";
import { RESEARCH_LABEL_FIELDS } from "./fixtures/label.mjs";
import { assertCompleteView } from "./fixtures/view.mjs";

const hand = (weapon, reach, x, lost = false, tipSpeed = 0) => ({ weapon, reach, lost, tipSpeed,
  // Both fields, as a real hand publishes them; see `tests/fixtures/view.mjs`.
  tipVelocity: { x: 0, y: 0, z: 0 }, outboard: Math.sign(x) || 1,
  shoulder: { x, y: 1.4, z: 0 }, tip: { x, y: 1.4, z: reach } });
const view = (measure = 0.7) => { const selfHands = { primary: hand("empty", 0.72, 0.2), secondary: hand("empty", 0.72, -0.2) };
  const opponentHands = { primary: hand("sword", 1.45, -0.2), secondary: hand("empty", 0.72, 0.2) };
  return assertCompleteView({ self: { unit: "warrior", reach: 0.72, crownHeight: 1.8, vitalHeight: 1.25, collisionRadius: 0.17,
    ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: selfHands.primary.shoulder,
    tip: selfHands.primary.tip, tipSpeed: 0, hands: selfHands, crouch: 0, trunkLean: 0, trunkTwist: 0,
    vitality: 1, health: {}, naturalAttacks: {} }, opponent: { unit: "warrior", reach: 1.45, crownHeight: 1.8,
    vitalHeight: 1.25, collisionRadius: 0.17, ground: { x: 0, y: 0, z: measure }, facing: Math.PI,
    shoulder: opponentHands.primary.shoulder, tip: opponentHands.primary.tip, tipSpeed: 0, hands: opponentHands,
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {}, naturalAttacks: {} },
    projectiles: [], measure, clock: 0 }); };

test("the_teacher_attacks_a_real_opportunity_and_closes_when_none_exists", () => {
  // The whole record against a literal, not the two fields this test used to
  // read: the teacher answers six fields now and a test that asserted three of
  // them would go green on a label the executor refuses. Its `target` and
  // `stance` come from the two rules `the_teacher_*` tests below take apart.
  assert.deepEqual(tacticalTeacher(view(0.7)), { movement: "hold", action: "punch", effector: "primary",
    target: "vital", stance: "action-default", persistence: 0.42 });
  assert.deepEqual(tacticalTeacher(view(1.2)), { movement: "close", action: "cover", effector: "primary",
    target: "threat", stance: "action-default", persistence: 0.24 });
});

test("the_teacher_does_not_label_retreat_for_an_extended_fist_outside_shoulder_range", () => {
  assert.equal(tacticalTeacher(view(0.78)).movement, "close");
});

test("every_teacher_label_names_the_same_six_fields_the_row_carries", () => {
  assert.deepEqual(Object.keys(tacticalTeacher(view(0.7))).sort(), [...RESEARCH_LABEL_FIELDS]);
});

/**
 * The effector is read back off the opportunity the teacher chose, so a body
 * whose two hands hold different things is what can tell it apart from a
 * constant.
 *
 * A shield in the primary and a sword in the secondary: `attackOpportunity`
 * publishes a row for both hands, but the shield's is filtered by
 * `isStriking("shield")` being false, so the only hand row is the secondary's --
 * and the label has to name it. A teacher that answered `"primary"` for
 * everything would pass every other assertion in this file.
 */
test("the_teacher_names_the_hand_whose_opportunity_it_took", () => {
  const both = view(1.2);
  both.self.hands.primary = hand("shield", 0.80, 0.2);
  both.self.hands.secondary = hand("sword", 1.45, -0.2);
  const label = tacticalTeacher(both);
  assert.deepEqual({ action: label.action, effector: label.effector }, { action: "cut", effector: "secondary" });
  // And the counterfactual, because "it named the secondary" is only evidence if
  // naming the primary was available: swap the two and the answer swaps.
  both.self.hands.primary = hand("sword", 1.45, 0.2);
  both.self.hands.secondary = hand("shield", 0.80, -0.2);
  assert.deepEqual({ ...tacticalTeacher(both) }.effector, "primary");
});

/**
 * A cover goes in the hand a cover exists for, and that is a *rule* rather than
 * a schedule fact.
 *
 * `firstLegalEffector` was `tacticEffectors(view, action)[0]`, and
 * `tacticEffectors` returns hands in `HANDS` order regardless of what they hold
 * -- so with `accepts("cover")` answering true for every attached hand, the
 * primary won every cover on every humanoid body that has ever existed. The
 * histogram recorded `secondary 0 %` and blamed `RESEARCH_STRATA` for putting no
 * striking weapon in the off hand; measured over the same 268 decisions,
 * `secondary` was a legal effector for the action the teacher itself named on
 * **133 of them**, 121 `cover` and 12 `punch`. A reversed-loadout stratum could
 * not have moved one of the covers.
 *
 * **`RESEARCH_STRATA` now does put a striking weapon in an off hand, and the
 * diagnosis above is still wrong.** `sword+axe` was added for the effector head,
 * so `cut` reaches the secondary on two of the fifteen cells -- which changes
 * what the histogram would have looked like and changes nothing about why it
 * looked the way it did. The bug was `[0]`, and 133 of 268 is the measurement
 * that says so.
 *
 * Both directions on every tier, so a rule that answered a constant hand -- or
 * one that ranked backwards -- fails. The equal-standing rows at the bottom are
 * the counterfactual for the tie-break: they are the bodies whose answer must
 * *not* have moved, and they are most of the histogram.
 */
test("the_teacher_covers_with_the_hand_that_holds_the_better_guard", () => {
  const covering = (primary, secondary) => {
    // Out of everybody's reach, so there is no opportunity and no threat and the
    // teacher takes its quiet-cover branch on a body of any loadout.
    const world = view(3.0);
    world.self.hands.primary = hand(primary, primary === "bow" ? 0.8 : 1.45, 0.2);
    world.self.hands.secondary = hand(secondary, secondary === "bow" ? 0.8 : 1.45, -0.2);
    const label = tacticalTeacher(world);
    assert.equal(label.action, "cover", `${primary}+${secondary}`);
    return label.effector;
  };
  // A board covers before a bar of steel, for both kinds of board and in both hands.
  assert.deepEqual([covering("sword", "shield"), covering("shield", "sword")], ["secondary", "primary"]);
  assert.deepEqual([covering("sword", "buckler"), covering("buckler", "sword")], ["secondary", "primary"]);
  assert.deepEqual([covering("axe", "shield"), covering("shield", "axe")], ["secondary", "primary"]);
  // A bar of steel covers before a bare forearm, in both hands.
  assert.deepEqual([covering("sword", "empty"), covering("empty", "sword")], ["primary", "secondary"]);
  assert.deepEqual([covering("axe", "empty"), covering("empty", "axe")], ["primary", "secondary"]);
  assert.deepEqual([covering("shield", "empty"), covering("empty", "shield")], ["primary", "secondary"]);
  // Two hands of equal standing keep `HANDS` order, which is the old answer --
  // so `sword+empty`, `empty+empty` and the centipede did not move, and the
  // change is confined to the bodies that carry a guard in the off hand.
  assert.deepEqual([covering("empty", "empty"), covering("sword", "sword"), covering("shield", "buckler")],
    ["primary", "primary", "primary"]);
  // The threatened branch is the one that produced 121 of the 139 covers, and it
  // is a second call site of the same rule rather than the same one.
  const threatenedShield = view(1.2);
  threatenedShield.self.hands.primary = hand("sword", 1.45, 0.2);
  threatenedShield.self.hands.secondary = hand("shield", 0.80, -0.2);
  threatenedShield.opponent.hands.primary = hand("sword", 1.45, 0.6, false, 9);
  threatenedShield.opponent.hands.primary.tip = { x: 0.6, y: 1.4, z: 0.4 };
  assert.deepEqual({ ...tacticalTeacher(threatenedShield) }, { movement: "hold", action: "cover",
    effector: "secondary", target: "threat", stance: "slip-left", persistence: 0.24 });

  // `recover` shares the rule and `tacticalTeacher` cannot emit it -- see
  // `coveringEffector`'s own note, which names the two guards that make the
  // branch unreachable -- so it is driven directly, exactly as the thrust aim
  // rule is.
  const armed = view(3.0);
  armed.self.hands.primary = hand("sword", 1.45, 0.2);
  armed.self.hands.secondary = hand("buckler", 0.80, -0.2);
  assert.deepEqual([coveringEffector(armed, "recover"), coveringEffector(armed, "cover")], ["secondary", "secondary"]);
  // And the two answers on a body with no hand to rank: `recover` is
  // capability-neutral and a cover has nowhere to go.
  const jaws = view(3.0); jaws.self.unit = "centipede"; jaws.self.hands = {};
  jaws.self.naturalAttacks = { bite: { reach: 0.9, ready: true, active: false } };
  assert.deepEqual([coveringEffector(jaws, "recover"), coveringEffector(jaws, "cover")], ["natural", null]);
});

/**
 * The four persistence constants, all four of them, against the branch that
 * chose each.
 *
 * Three of the four were unpinned: `shoot`'s 0.70 could be changed to 0.42 and
 * the whole suite stayed green, and so could the natural bite's 0.40. This is
 * pre-existing rather than stage C2b's -- the numbers predate the widening --
 * and a test that pinned one of four would be satisfied by any of the other
 * three drifting, which is why they are asserted as a set.
 */
test("every_teacher_persistence_is_the_number_beside_the_branch_that_chose_it", () => {
  const sworded = view(1.2);
  sworded.self.hands.primary = hand("sword", 1.45, 0.2);
  const bowed = view(1.2);
  bowed.self.hands.primary = hand("bow", 0.8, 0.2);
  const jawed = view(0.7);
  jawed.self.naturalAttacks = { bite: { reach: 0.9, ready: true, active: false } };
  const persistence = (world) => { const label = tacticalTeacher(world); return [label.action, label.persistence]; };
  assert.deepEqual([persistence(view(1.2)), persistence(view(0.7)), persistence(sworded),
    persistence(bowed), persistence(jawed)], [
    ["cover", 0.24], ["punch", 0.42], ["cut", 0.42], ["shoot", 0.70], ["bite", 0.40],
  ]);
  // The four numbers are distinct, which is what makes the list above able to
  // see one of them move onto another.
  assert.equal(new Set([0.24, 0.42, 0.70, 0.40]).size, 4);
});

/**
 * `cover` places a guard against the thing arriving, which is the one aim in
 * `TARGET_NAMES` that is a moving point rather than a height.
 */
test("the_teacher_aims_a_cover_at_the_threat_and_everything_else_at_the_vitals", () => {
  const aims = {};
  for (const action of HAND_ACTION_NAMES) aims[action] = tacticalTarget(view(1.2), action, null, 1.45, false);
  assert.deepEqual(aims, { cover: "threat", cut: "vital", thrust: "high", punch: "vital",
    shoot: "vital", bite: "vital", recover: "vital" });
  // Every one of those is a region the executor will accept for that action,
  // asked of the table the option refuses by rather than of this list.
  for (const [action, target] of Object.entries(aims)) {
    assert.ok(TARGET_NAMES.includes(target), `${action} named ${target}`);
  }
});

/**
 * The three-way thrust rule, driven directly because `tacticalTeacher` cannot
 * reach it -- see `tacticalTarget`'s own note, which names the line.
 *
 * Bounded from **both** sides on each branch. `THRUST_EDGE_FRACTION` is 0.10 of
 * the reach, so 0.144 of 1.45 is inside the last tenth and 0.146 is outside it;
 * `CROUCHED_OPPONENT` is 0.50, so 0.49 is a body that has settled and 0.51 is one
 * that has gone down. A one-sided assertion here would be satisfied by any
 * threshold above or below the value it names.
 */
test("the_thrust_aim_rule_is_low_at_full_extension_and_high_against_a_standing_body", () => {
  const standing = view(1.60);
  const aim = (rangeMargin, crowded = false) => tacticalTarget(standing, "thrust", { rangeMargin }, 1.45, crowded);
  assert.equal(aim(0.144), "low", "inside the last tenth of the reach");
  assert.equal(aim(0.146), "high", "just outside it");
  // And the near end of the same window is not the far end. `rangeMargin` is
  // `min(measure - minimum, maximum - measure)`, small at *both* ends, so
  // without the `crowded` guard a fighter at contact range would be told to aim
  // at a lead leg for a reason that only holds at full extension.
  assert.equal(aim(0.01, true), "high", "crowded is the other end of the same small margin");

  const crouched = view(1.60); crouched.opponent.crouch = 0.51;
  const settled = view(1.60); settled.opponent.crouch = 0.49;
  assert.equal(tacticalTarget(crouched, "thrust", { rangeMargin: 0.5 }, 1.45, false), "vital");
  assert.equal(tacticalTarget(settled, "thrust", { rangeMargin: 0.5 }, 1.45, false), "high");
  // Extension wins over the crouch, which is the stated order rather than an
  // accident of which `if` came first.
  assert.equal(tacticalTarget(crouched, "thrust", { rangeMargin: 0.10 }, 1.45, false), "low");
});

/**
 * The sign that decides which way a fighter moves when something is coming at
 * it, pinned against the world that produces it.
 *
 * Two worlds differing only in the x of the opponent's threatening hand, which
 * is exactly the pair `threat_local_right` is measured on in
 * `tests/policy-perception.test.mjs`. Getting this backwards teaches a fighter
 * to step into the blow, and nothing downstream would say so: `applyTacticStance`
 * accepts either name and both produce a bounded, legal posture.
 *
 * **The rotation had no fixture at all until the remediation pass, and that is
 * the `handover.test.mjs` trap again.** `threatLocalRight` is
 * `dx cos f - dz sin f`, every fixture in this file published `facing: 0`, and
 * at `f = 0` that expression is exactly `dx` -- so replacing the whole body with
 * `return dx;` left all 268 tests green while moving the real histogram
 * (`slip-right` 41.8 % -> 50.0 %, `slip-left` 17.9 % -> 9.3 %). The correct
 * inverse and the plausible one agree on the one facing the fixtures had. The
 * quarter-turn pair below is where they part company: a fighter facing +X has
 * its right at -Z, so the *z* offset decides the side and `dx` decides nothing.
 * Its `dx` is held **positive in both worlds**, so `return dx;` answers
 * `slip-left` twice and a sign-flipped rotation answers the pair backwards.
 */
test("the_teacher_slips_away_from_the_side_the_threat_is_on", () => {
  // `hand(...)` seeds the tip from the reach; the threat's tip is written after
  // it, because the side rule reads the tip and not the socket.
  const threatened = (facing, tipX, tipZ) => { const world = view(1.2);
    world.self.facing = facing;
    world.opponent.hands.primary = hand("sword", 1.45, tipX, false, 9);
    world.opponent.hands.primary.tip = { x: tipX, y: 1.4, z: tipZ };
    return tacticalTeacher(world); };
  const right = threatened(0, 0.6, 0.4); const left = threatened(0, -0.6, 0.4);
  assert.equal(right.stance, "slip-left", "a blade on the right is slipped away from, not into");
  assert.equal(left.stance, "slip-right");
  // The pair, so a rule that answered one name for everything fails. Both are
  // still covers aimed at the threat, which is the branch this world reaches.
  assert.notEqual(right.stance, left.stance);
  assert.deepEqual([right.action, left.action], ["cover", "cover"]);
  assert.deepEqual([right.target, left.target], ["threat", "threat"]);

  // Facing +X, where the fighter's own right is -Z. `self.shoulder` is at
  // x 0.20, z 0, so both worlds put the blade 0.60 m in *front* of the shoulder
  // in world x and differ only in z -- which is the axis that decides the side
  // once the body has turned. Sampled on both sides of centre, as the aiming
  // envelope's own trap requires.
  const quarter = Math.PI / 2;
  const behind = threatened(quarter, 0.8, -0.6); const ahead = threatened(quarter, 0.8, 0.6);
  assert.equal(behind.stance, "slip-left", "facing +X, a blade at -z is on the right");
  assert.equal(ahead.stance, "slip-right");
  assert.notEqual(behind.stance, ahead.stance);
  assert.deepEqual([behind.action, ahead.action], ["cover", "cover"]);
});

test("the_teacher_goes_compact_when_crowded_and_neutral_otherwise", () => {
  // `crowded` is `measure < max(0.28, ownReach * 0.36)`, and a bare fist's reach
  // here is 0.72, so the boundary is 0.28 -- bracketed rather than named.
  assert.equal(tacticalTeacher(view(0.27)).stance, "compact");
  assert.equal(tacticalTeacher(view(0.29)).stance, "action-default");
  // And `extended` is never emitted at all, on any of these.
  for (const measure of [0.2, 0.27, 0.29, 0.7, 1.2, 2.0]) {
    assert.notEqual(tacticalTeacher(view(measure)).stance, "extended");
  }
});

/**
 * **The hard invariant of this stage**, swept over the capability space rather
 * than sampled: every tuple the teacher emits is a member of
 * `deployableTactics(view)`, so a network trained on these labels is never
 * trained toward a decision the executor refuses.
 *
 * The sweep is every ordered weapon pair (49), both loss flags on each hand (4),
 * with and without a published bite (2), across four measures and a threatening
 * and a quiet opponent -- plus the centipede, which publishes no hand slots at
 * all. **The pair sweep is what catches the one this found**: a sword in the
 * primary and a bow in the secondary is a body where `attackOpportunity`
 * publishes a viable sword row and `tacticEffectors("cut")` answers `[]`,
 * because `Fighter.update` welds the trailing hand to the bow's stave and the
 * two-handed holder rule refuses every other hand. The teacher labelled `cut`
 * there and `composeTactic` refused it by name one call later. No
 * `RESEARCH_STRATA` row carries that loadout, which is why a sampled fixture
 * never saw it.
 */
test("the_teacher_only_ever_labels_a_tuple_the_body_can_execute", () => {
  const legal = (world) => new Set(deployableTactics(world).map((row) => `${row.action}|${row.effector}|${row.target}`));
  let labelled = 0; let inert = 0;
  const check = (world, cell) => {
    const capable = Object.values(world.self.hands).some((row) => !row.lost) ||
      Object.keys(world.self.naturalAttacks ?? {}).length > 0;
    if (!capable) { assert.throws(() => tacticalTeacher(world), /no published attack capability/, cell); inert += 1; return; }
    const label = tacticalTeacher(world); labelled += 1;
    assert.ok(MOVEMENT_NAMES.includes(label.movement), `${cell}: movement ${label.movement}`);
    assert.ok(STANCE_NAMES.includes(label.stance), `${cell}: stance ${label.stance}`);
    assert.ok(legal(world).has(`${label.action}|${label.effector}|${label.target}`),
      `${cell}: ${label.action}+${label.effector}+${label.target} is not in deployableTactics`);
  };
  for (const primary of WEAPON_KINDS) for (const secondary of WEAPON_KINDS) {
    for (const lostPrimary of [false, true]) for (const lostSecondary of [false, true]) {
      for (const bite of [false, true]) for (const measure of [0.2, 0.7, 1.2, 3.0]) for (const menace of [0, 9]) {
        const world = view(measure);
        world.self.hands.primary = hand(primary, primary === "bow" ? 0.8 : 1.45, 0.2, lostPrimary);
        world.self.hands.secondary = hand(secondary, secondary === "bow" ? 0.8 : 1.45, -0.2, lostSecondary);
        world.self.naturalAttacks = bite ? { bite: { reach: 0.9, ready: true, active: false } } : {};
        world.opponent.hands.primary = hand("sword", 1.45, -0.2, false, menace);
        check(world, `${primary}${lostPrimary ? "(lost)" : ""}+${secondary}${lostSecondary ? "(lost)" : ""}` +
          `${bite ? "+bite" : ""}@${measure}/${menace}`);
      }
    }
  }
  // The centipede, and a warrior that has lost both arms: the two bodies that
  // are not a weapon pair at all.
  for (const measure of [0.2, 0.7, 1.2, 3.0]) for (const menace of [0, 9]) {
    const jaws = view(measure); jaws.self.unit = "centipede"; jaws.self.hands = {};
    jaws.self.naturalAttacks = { bite: { reach: 0.9, ready: true, active: false } };
    jaws.opponent.hands.primary = hand("sword", 1.45, -0.2, false, menace);
    check(jaws, `centipede@${measure}/${menace}`);
    const armless = view(measure);
    armless.self.hands.primary = hand("sword", 1.45, 0.2, true);
    armless.self.hands.secondary = hand("empty", 0.72, -0.2, true);
    armless.opponent.hands.primary = hand("sword", 1.45, -0.2, false, menace);
    check(armless, `armless@${measure}/${menace}`);
  }
  // 49 pairs x 4 loss flags x 2 bites x 4 measures x 2 menaces = 3136, plus 8
  // centipede cells and 8 armless ones. The counts are asserted so a sweep that
  // quietly stopped iterating is a failure rather than a fast pass.
  assert.equal(labelled + inert, 3152);
  // Inert is exactly "both hands lost and no bite": 49 pairs x 4 measures x 2
  // menaces of the one loss/bite combination, plus the eight armless cells.
  assert.equal(inert, 49 * 4 * 2 + 8, "an armless warrior with no bite is the only inert body");
  assert.equal(labelled, 2752);
});

/**
 * A real row, which is what this fixture stopped being when the label widened.
 *
 * The label-key comparison in `validateDaggerRow` runs **before** the
 * feature-version and finiteness checks, so a three-field label made every
 * assertion below reach `DAgger label contains a privileged or unknown column`
 * instead of the check it names. The order is deliberate -- an unknown column is
 * a privileged-information leak and is the first thing worth refusing -- so the
 * fixture is what moved.
 */
const row = (iteration, unitCell, action, sourceStep) => ({ featureVersion: 3, features: [0.1, 0.2],
  label: { movement: "close", action, effector: "primary", target: "vital", stance: "action-default", persistence: 0.4 },
  unitCell, sourceSeed: 310013, sourceStep, iteration, teacherVersion: TACTICAL_TEACHER_VERSION });

test("dagger_rows_contain_only_versioned_observation_features_and_labels", () => {
  const teacher = TACTICAL_TEACHER_VERSION;
  assert.doesNotThrow(() => validateDaggerRow(row(0, "warrior/bare", "punch", 1), 3, 2, teacher));
  assert.throws(() => validateDaggerRow({ ...row(0, "warrior/bare", "punch", 1), features: [0.1, NaN] }, 3, 2, teacher), /finite published features/);
  assert.throws(() => validateDaggerRow({ ...row(0, "warrior/bare", "punch", 1), exactEnemyPose: [1, 2, 3] }, 3, 2, teacher), /privileged/);
  // A label that is still the pre-C2b shape, refused as a column set rather than
  // trained on. This is the check that used to fire for every case above.
  const narrow = row(0, "warrior/bare", "punch", 1);
  assert.throws(() => validateDaggerRow({ ...narrow, label: { movement: "close", action: "punch", persistence: 0.4 } }, 3, 2, teacher),
    /DAgger label contains a privileged or unknown column/);
  assert.throws(() => trainDaggerModel([row(0, "warrior/bare", "punch", 1),
    { ...row(0, "warrior/bare", "punch", 2), featureVersion: 4 }], 2, labels(["close"], ["punch"]), teacher),
  /feature version 4 does not match 3/);
});

/**
 * The version nobody compared, compared.
 *
 * `TACTICAL_TEACHER_VERSION` had three writers and no reader: two in
 * `collect-dagger.mjs` and one in `research-rollout-worker.mjs`, all of them
 * writing. `validateDaggerRow` checked it for being a non-negative safe integer
 * beside the seed and the step counters and nothing else, so a row labelled by
 * the three-field teacher and one labelled by the six-field teacher were the
 * same row to every consumer once the feature version matched.
 */
test("a_row_from_the_previous_teacher_is_refused_by_a_sentence_naming_both_versions", () => {
  const stale = { ...row(0, "warrior/bare", "punch", 1), teacherVersion: TACTICAL_TEACHER_VERSION - 1 };
  assert.throws(() => validateDaggerRow(stale, 3, 2, TACTICAL_TEACHER_VERSION),
    new RegExp(`DAgger row teacher version ${TACTICAL_TEACHER_VERSION - 1} does not match ${TACTICAL_TEACHER_VERSION}`));
  // And the whole training entry, not just the validator, because that is where
  // a stale row would actually arrive.
  assert.throws(() => trainDaggerModel([stale], 2, labels(["close"], ["punch"]), TACTICAL_TEACHER_VERSION),
    /teacher version 1 does not match 2/);
  // The teacher version is not the feature version, and a row can be stale in
  // exactly one of them: this row's features are current and its labels are not.
  assert.doesNotThrow(() => validateDaggerRow({ ...stale, teacherVersion: TACTICAL_TEACHER_VERSION }, 3, 2, TACTICAL_TEACHER_VERSION));
});

test("validation_selects_an_iteration_without_reading_test_rows", () => {
  const selected = selectDaggerIteration([{ iteration: 0, validationLoss: 0.5, testLoss: 0 },
    { iteration: 1, validationLoss: 0.2, testLoss: 99 }]);
  assert.equal(selected.iteration, 1);
});

test("a_teacher_below_the_engagement_floor_refuses_before_training", () => {
  assert.throws(() => requireTeacherEngagement(0.04, 0.05), /below frozen floor/);
  assert.doesNotThrow(() => requireTeacherEngagement(0.05, 0.05));
});

test("learner_visited_states_are_relabelled_and_aggregated_in_stable_order", () => {
  const rows = [row(1, "warrior/bare", "punch", 5), row(0, "warrior/bare", "cover", 8), row(1, "broot/bare", "punch", 2)];
  assert.deepEqual(aggregateDaggerRows([rows.slice(1), rows.slice(0, 1)]).map((value) => [value.iteration, value.unitCell, value.sourceStep]), [
    [0, "warrior/bare", 8], [1, "broot/bare", 2], [1, "warrior/bare", 5],
  ]);
});

test("class_balancing_cannot_drop_a_rare_legal_attack_or_unit_cell", () => {
  const rows = Array.from({ length: 5 }, (_, index) => row(0, "warrior/bare", "cover", index));
  rows.push(row(0, "warrior/bare", "punch", 20), row(0, "centipede/natural", "bite", 30));
  const balanced = balancedDaggerRows(rows, 2);
  assert.equal(balanced.filter((value) => value.label.action === "cover").length, 2);
  assert.ok(balanced.some((value) => value.label.action === "punch"));
  assert.ok(balanced.some((value) => value.label.action === "bite"));
});

/**
 * The stratum key stayed `unitCell\0movement\0action` while the label space grew
 * about seventy-twofold, and that was decided rather than defaulted into.
 *
 * The check is that the key is *coarse* on purpose: five rows that differ only in
 * their aim are five rows of one stratum and are truncated together. A key that
 * had grown to include the tuple would keep all five, which is the behaviour
 * `dagger.ts`' own note argues against -- it raises the effective cap per action
 * by the number of distinct tuples and weakens the only thing this function does.
 */
test("the_stratum_cap_is_keyed_on_the_action_rather_than_on_the_whole_tuple", () => {
  const aimed = TARGET_NAMES.map((target, index) => { const base = row(0, "warrior/bare", "cut", index);
    return { ...base, label: { ...base.label, target } }; });
  assert.equal(new Set(aimed.map((value) => value.label.target)).size, TARGET_NAMES.length);
  assert.equal(balancedDaggerRows(aimed, 2).length, 2, "four aims of one action are one stratum");
  // And the coarse key still separates what it is for: a different action on the
  // same cell is its own stratum and survives beside it.
  const mixed = [...aimed, row(0, "warrior/bare", "bite", 9)];
  assert.deepEqual(balancedDaggerRows(mixed, 2).map((value) => value.label.action).sort(),
    ["bite", "cut", "cut"]);
});

const labels = (movement = MOVEMENT_NAMES, action = HAND_ACTION_NAMES) =>
  ({ movement, action, effector: EFFECTOR_NAMES, target: TARGET_NAMES, stance: STANCE_NAMES });

test("the_same_seed_and_dataset_produce_byte_identical_weights_and_report", () => {
  const rows = [row(0, "warrior/bare", "cover", 0), row(1, "warrior/bare", "punch", 1)];
  const tables = labels(["close", "hold"], ["cover", "punch"]);
  const a = trainDaggerModel(rows, 2, tables, TACTICAL_TEACHER_VERSION);
  const b = trainDaggerModel([...rows].reverse(), 2, tables, TACTICAL_TEACHER_VERSION);
  assert.equal(daggerModelDigest(a), daggerModelDigest(b));
});

/**
 * The silent classifier, made to speak.
 *
 * `classify` scored each label from `weights[index * hidden.length + feature]`,
 * so a head whose matrix is shorter than its label list scored every label `NaN`,
 * lost every `NaN > best.score` comparison, and fell through the reduce to its
 * seed -- **returning `labels[0]` with no error at all**. Demonstrated with a
 * zero-row action head: the model serialises, passes the artifact envelope,
 * passes `deployment.ts`'s `exactNames` (which reads `labels`, which is intact)
 * and passes its all-zero probe, because `cover` is a perfectly legal answer.
 * `LinearHead` carries no row count, so nothing above `classify` could have
 * cross-checked it either, and C2b adds three more matrices to the same blind
 * spot.
 */
test("a_head_whose_matrix_is_shorter_than_its_labels_is_refused_by_name", () => {
  const rows = [row(0, "warrior/bare", "cover", 0), row(1, "warrior/bare", "punch", 1)];
  const model = trainDaggerModel(rows, 2, labels(), TACTICAL_TEACHER_VERSION);
  assert.doesNotThrow(() => predictDagger(model, [0.1, 0.2]));
  for (const name of DAGGER_HEAD_NAMES) {
    const starved = { ...model, [name]: { ...model[name], weights: [] } };
    assert.throws(() => predictDagger(starved, [0.1, 0.2]),
      new RegExp(`DAgger ${name} head is 0 weights and ${model[name].labels.length} biases`), name);
    const shortBias = { ...model, [name]: { ...model[name], bias: model[name].bias.slice(1) } };
    assert.throws(() => predictDagger(shortBias, [0.1, 0.2]), new RegExp(`DAgger ${name} head is`), `${name} bias`);
  }
  // What it used to answer instead, spelled out: the first label of the table,
  // silently. `cover` is `HAND_ACTION_NAMES[0]`, which is why this was invisible.
  assert.equal(HAND_ACTION_NAMES[0], "cover");
});

test("a_trained_model_answers_all_five_heads_and_scores_each_of_them", () => {
  const rows = [row(0, "warrior/bare", "cover", 0), row(1, "warrior/bare", "punch", 1),
    row(2, "centipede/natural", "bite", 2)];
  const model = trainDaggerModel(rows, 2, labels(), TACTICAL_TEACHER_VERSION);
  const predicted = predictDagger(model, [0.1, 0.2]);
  assert.deepEqual(Object.keys(predicted).sort(), [...RESEARCH_LABEL_FIELDS]);
  assert.ok(MOVEMENT_NAMES.includes(predicted.movement)); assert.ok(HAND_ACTION_NAMES.includes(predicted.action));
  assert.ok(EFFECTOR_NAMES.includes(predicted.effector)); assert.ok(TARGET_NAMES.includes(predicted.target));
  assert.ok(STANCE_NAMES.includes(predicted.stance));
  const metrics = daggerClassificationMetrics(rows, model);
  assert.deepEqual(Object.keys(metrics).sort(),
    [...DAGGER_HEAD_NAMES.map((name) => `${name}MacroF1`), "attackRecall"].sort());
  for (const [name, value] of Object.entries(metrics)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name} = ${value}`);
  }
});

test("human_trace_absence_does_not_change_the_required_experiment_matrix", () => {
  const required = [row(0, "warrior/bare", "punch", 0)];
  assert.deepEqual(aggregateDaggerRows([required, []]), aggregateDaggerRows([required]));
});
