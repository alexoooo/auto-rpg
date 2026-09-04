import test from "node:test";
import assert from "node:assert/strict";

import { handsFor, isWeaponKind, WEAPON_KINDS } from "../src/hands.ts";
import {
  EQUIPMENT,
  advance,
  beaten,
  begin,
  defaultMatchup,
  humanSide,
  pauseAction,
  restart,
  selectScreen,
  settle,
  takeBody,
  toSelect,
  vitality,
  verdict,
  withControl,
  withEquipment,
  withPolicy,
  withUnit,
} from "../src/bout.ts";
import { POLICIES, policyMind } from "../src/mind.ts";
import { CONFIG } from "../src/config.ts";

/**
 * No DOM and no Babylon anywhere in this file's import graph, which is the whole
 * point of `src/bout.ts` being a separate module from `src/main.ts`. `Limb` and
 * `HitReport` are satisfied structurally by the two shapes below, so what is
 * being tested is exactly what the arena hands the rules and not a translation
 * of it.
 */
const BODY = [
  "torso",
  "head",
  "pelvis",
  "upperArm",
  "forearm",
  "hand",
  "offUpperArm",
  "offForearm",
  "offHand",
  "thighL",
  "shinL",
  "thighR",
  "shinR",
];

/** A fighter with nothing wrong with it. */
const whole = () => BODY.map((key) => ({ key, health: 100, maxHealth: 100, severed: false }));

/** The same, with one part cut off it -- which is how `Fighter.sever` leaves one. */
const minus = (key) =>
  whole().map((part) => (part.key === key ? { ...part, health: 0, severed: true } : part));

const flattened = () => whole().map((part) => ({ ...part, health: 0 }));

test("the_low_number_migration_preserves_melee_health_fractions_and_death_decisions", () => {
  const legacy = [
    { key: "torso", health: 80, maxHealth: 200, severed: false, fatal: true, vitalityWeight: 0.4 },
    { key: "head", health: 100, maxHealth: 100, severed: false, fatal: true, vitalityWeight: 0.3 },
    { key: "right-arm", health: 40, maxHealth: 100, severed: false, fatal: false, vitalityWeight: 0.3 },
  ];
  const migrated = legacy.map((part) => ({ ...part, health: part.health / 20, maxHealth: part.maxHealth / 20 }));
  assert.equal(vitality(migrated), vitality(legacy));
  assert.equal(beaten(migrated), beaten(legacy));
  legacy[0].health = 0; migrated[0].health = 0;
  assert.equal(beaten(migrated), beaten(legacy));
});

const blow = (by, over = {}) => ({
  by,
  limb: "Head",
  kind: "cut",
  speed: 14.2,
  at: 3.5,
  ...over,
});

const corner = (parts, lastBlow = null) => ({ parts, lastBlow });

const ring = (left, right) => ({ left, right });

// ---------- the matchup ----------

test("the screen opens with the left fighter yours and a policy opposite", () => {
  const matchup = defaultMatchup();
  assert.equal(humanSide(matchup), "left");
  assert.equal(matchup.right.control, "mind");
  assert.equal(matchup.left.policy, "idle");
  assert.equal(matchup.right.policy, "idle");
});

test("there is one of you, so taking a side gives the other one back to its policy", () => {
  const taken = withControl(defaultMatchup(), "right", "you");
  assert.equal(humanSide(taken), "right");
  assert.equal(taken.left.control, "mind");
});

test("letting go of a side leaves two policies fighting and does not hand you the other", () => {
  const nobody = withControl(defaultMatchup(), "left", "mind");
  assert.equal(humanSide(nobody), null);
  assert.equal(nobody.right.control, "mind");
});

test("choosing a policy or a unit touches one side only, and does not move the control", () => {
  const start = defaultMatchup();
  const changed = withUnit(withPolicy(start, "right", "idle"), "right", "warrior");
  assert.deepEqual(changed.left, start.left);
  assert.equal(changed.right.unit, "warrior");
  assert.equal(changed.right.control, "mind");
  assert.notEqual(changed, start, "the matchup is replaced rather than edited in place");
  assert.equal(start.right.unit, "warrior", "and the one handed in is untouched");
});

test("changing_unit_preserves_the_policy_even_when_the_new_surface_refuses_it", () => {
  const rules = {
    loadouts: [{ primary: "sword", secondary: "buckler" }],
    defaultLoadout: { primary: "sword", secondary: "buckler" },
    compatiblePolicies: ["idle", "swinger", "duelist"],
    defaultPolicy: "idle",
  };
  const valid = {
    ...defaultMatchup(),
    right: {
      ...defaultMatchup().right,
      policy: "duelist",
      handA: "sword",
      handB: "buckler",
    },
  };
  const kept = withUnit(valid, "right", "fixed-pair-unit", rules);
  assert.equal(kept.right.policy, "duelist");
  assert.equal(kept.right.handA, "sword");
  assert.equal(kept.right.handB, "buckler");

  const wrongPolicy = withUnit({
    ...valid,
    right: { ...valid.right, policy: "crawler" },
  }, "right", "fixed-pair-unit", rules);
  assert.equal(wrongPolicy.right.policy, "crawler");
  assert.equal(wrongPolicy.right.handA, "sword", "a valid pair survives a unit change");
  assert.equal(wrongPolicy.right.handB, "buckler");

  const wrongLoadout = withUnit({
    ...valid,
    right: { ...valid.right, handB: "empty" },
  }, "right", "fixed-pair-unit", rules);
  assert.equal(wrongLoadout.right.policy, "duelist", "a compatible policy survives a loadout correction");
  assert.equal(wrongLoadout.right.handA, "sword");
  assert.equal(wrongLoadout.right.handB, "buckler");

  const normalized = withUnit(defaultMatchup(), "right", "fixed-pair-unit", rules);
  assert.equal(normalized.right.unit, "fixed-pair-unit");
  assert.equal(normalized.right.policy, defaultMatchup().right.policy);
  assert.equal(normalized.right.handA, "sword");
  assert.equal(normalized.right.handB, "buckler");
  assert.deepEqual(normalized.left, defaultMatchup().left);
});

test("an unknown policy is refused by name rather than quietly becoming idle", () => {
  assert.equal(POLICIES.some((policy) => policy.name === "idle"), true);
  assert.equal(policyMind("idle").name, "idle");
  // This named `duelist` when session 05 wrote it, on the grounds that it did
  // not exist yet -- and session 06 duly made it exist and turned the test red.
  // A test whose subject is "a name nobody registered" must not borrow a name
  // somebody is about to register, so it borrows one nobody would: this is a
  // prototype about a sword, and there will never be a policy in it that is a
  // trebuchet.
  assert.throws(() => policyMind("trebuchet"), /unknown policy "trebuchet"/);
});

// ---------- the phases ----------

test("the screen starts a bout, with the matchup that was on the screen", () => {
  const chosen = withControl(defaultMatchup(), "right", "you");
  const fighting = begin(selectScreen(defaultMatchup()), chosen);

  assert.equal(fighting.phase, "fight");
  assert.equal(fighting.clock, 0);
  assert.equal(fighting.outcome, null);
  assert.equal(humanSide(fighting.matchup), "right", "the screen wins, not the old state");
});

test("the Fight button is refused anywhere but the screen", () => {
  const fighting = begin(selectScreen(defaultMatchup()), defaultMatchup());
  const other = withControl(defaultMatchup(), "right", "you");

  assert.equal(begin(fighting, other), fighting, "mid-fight it is a Resume button");

  const over = advance(fighting, ring(corner(minus("head")), corner(whole())), 1 / 60);
  assert.equal(over.phase, "over");
  assert.equal(begin(over, other), over);
});

test("restart_from_fight_or_verdict_returns_a_fresh_fight_with_the_same_matchup", () => {
  const fighting = advance(
    begin(selectScreen(defaultMatchup()), defaultMatchup()),
    ring(corner(whole()), corner(whole())),
    4,
  );
  assert.equal(fighting.clock, 4);

  const again = restart(fighting);
  assert.equal(again.phase, "fight");
  assert.equal(again.clock, 0);
  assert.deepEqual(again.matchup, fighting.matchup);

  const over = advance(fighting, ring(corner(minus("head")), corner(whole())), 1 / 60);
  const verdictAgain = restart(over);
  assert.equal(verdictAgain.phase, "fight");
  assert.equal(verdictAgain.clock, 0);
  assert.equal(verdictAgain.outcome, null);
  assert.deepEqual(verdictAgain.matchup, fighting.matchup);
});

test("restart_is_refused_only_when_no_bout_exists", () => {
  const screen = selectScreen(defaultMatchup());
  assert.equal(restart(screen), screen);
});

test("a decided bout can still return to setup with the same matchup", () => {
  const chosen = withControl(defaultMatchup(), "right", "you");
  const over = advance(
    begin(selectScreen(defaultMatchup()), chosen),
    ring(corner(minus("head")), corner(whole(), blow("right"))),
    1 / 60,
  );

  const back = toSelect(over);
  assert.equal(back.phase, "select");
  assert.equal(back.outcome, null);
  assert.equal(back.clock, 0);
  assert.deepEqual(back.matchup, chosen, "the same matchup is still selected");
});

test("going back to the screen is refused when you are already on it", () => {
  const screen = selectScreen(defaultMatchup());
  assert.equal(toSelect(screen), screen);
});

test("time passes in a fight and nowhere else", () => {
  const still = ring(corner(whole()), corner(whole()));

  const screen = selectScreen(defaultMatchup());
  assert.equal(advance(screen, still, 1), screen);

  const fighting = advance(begin(screen, defaultMatchup()), still, 0.5);
  assert.equal(fighting.clock, 0.5);
  assert.equal(fighting.phase, "fight");

  const over = advance(fighting, ring(corner(minus("head")), corner(whole())), 1 / 60);
  const later = advance(over, still, 10);
  assert.equal(later, over, "a decided bout's clock does not run on");
});

// ---------- taking a body ----------

test("taking a body mid-fight makes it yours and hands the other one back", () => {
  const fighting = begin(selectScreen(defaultMatchup()), defaultMatchup());
  assert.equal(humanSide(fighting.matchup), "left");

  const swapped = takeBody(fighting, "right");
  assert.equal(humanSide(swapped.matchup), "right");
  assert.equal(swapped.matchup.left.control, "mind");
  assert.equal(swapped.phase, "fight", "it is a change of driver, not of phase");
  assert.equal(swapped.clock, fighting.clock, "and the bout goes on");
});

test("taking the body you already drive leaves the matchup where it was", () => {
  const fighting = begin(selectScreen(defaultMatchup()), defaultMatchup());
  const again = takeBody(fighting, "left");
  assert.deepEqual(again.matchup, fighting.matchup);
});

test("taking a body does not touch either side's policy", () => {
  // The policy a side carries is what it becomes the moment you step out of it,
  // which is the whole reason the setup screen leaves the picker enabled on the
  // side a person is driving. A takeover that reset it would silently make every
  // released body an idle one.
  const chosen = withPolicy(withPolicy(defaultMatchup(), "left", "duelist"), "right", "swinger");
  const swapped = takeBody(begin(selectScreen(defaultMatchup()), chosen), "right");
  assert.equal(swapped.matchup.left.policy, "duelist");
  assert.equal(swapped.matchup.right.policy, "swinger");
});

test("taking a body is refused from the screen, where there is no body to take", () => {
  const screen = selectScreen(defaultMatchup());
  assert.equal(takeBody(screen, "right"), screen);
});

test("taking a body is allowed once the bout is decided, because the world is still running", () => {
  // `over` deliberately does not stop the fighters -- see `Phase` -- so refusing
  // a takeover there would be a rule invented to protect a banner.
  const over = advance(
    begin(selectScreen(defaultMatchup()), defaultMatchup()),
    ring(corner(minus("head")), corner(whole())),
    1 / 60,
  );
  assert.equal(over.phase, "over");
  const swapped = takeBody(over, "right");
  assert.equal(humanSide(swapped.matchup), "right");
  assert.equal(swapped.phase, "over");
  assert.equal(swapped.outcome, over.outcome, "and the verdict stands");
});

test("the body you took mid-fight is the one selected when you get back to the screen", () => {
  // The same argument `toSelect` already makes for keeping the matchup at all:
  // the thing you want after a bout is the same bout again, and a choice made
  // with a click is as much a choice as one made with a radio button.
  const fighting = begin(selectScreen(defaultMatchup()), defaultMatchup());
  const back = toSelect(takeBody(fighting, "right"));
  assert.equal(back.phase, "select");
  assert.equal(humanSide(back.matchup), "right");
});

test("five takeovers in one bout leave one driver, not five", () => {
  let state = begin(selectScreen(defaultMatchup()), defaultMatchup());
  for (const side of ["right", "left", "right", "right", "left"]) {
    state = takeBody(state, side);
    const human = ["left", "right"].filter((s) => state.matchup[s].control === "you");
    assert.deepEqual(human, [side]);
  }
  assert.equal(humanSide(state.matchup), "left");
});

// ---------- the endings ----------

test("two whole fighters are still fighting", () => {
  assert.equal(beaten(whole()), false);
  assert.equal(settle(ring(corner(whole()), corner(whole())), 0), null);
});

test("a_whole_body_has_full_vitality", () => {
  assert.equal(vitality(whole()), 1);
});

test("zero_torso_or_head_health_exhausts_the_one_vitality_bar", () => {
  for (const key of ["torso", "head"]) {
    const hurt = whole().map((part) => (part.key === key ? { ...part, health: 0 } : part));
    assert.equal(vitality(hurt), 0, key);
    assert.equal(beaten(hurt), true, key);
  }
});

test("several_non_vital_wounds_can_finish_what_none_finishes_alone", () => {
  const keys = new Set(["pelvis", "thighL", "shinL", "thighR", "shinR"]);
  for (const key of keys) {
    assert.ok(vitality(whole().map((part) => part.key === key ? { ...part, health: 0 } : part)) > 0);
  }
  const hurt = whole().map((part) => keys.has(part.key) ? { ...part, health: 0 } : part);
  assert.equal(vitality(hurt), 0);
  assert.equal(beaten(hurt), true);
});

test("one_ruined_arm_does_not_kill_its_owner", () => {
  const keys = new Set(["upperArm", "forearm", "hand"]);
  const hurt = whole().map((part) => keys.has(part.key) ? { ...part, health: 0 } : part);
  assert.ok(vitality(hurt) > 0);
  assert.equal(beaten(hurt), false);
});

test("an_unknown_part_cannot_silently_escape_the_vitality_rule", () => {
  assert.throws(
    () => vitality([...whole(), { key: "mystery", health: 100, maxHealth: 100, severed: false }]),
    /unknown vital part "mystery"/,
  );
});

test("non_finite_health_cannot_poison_the_vitality_bar", () => {
  for (const health of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const hurt = whole().map((part) => part.key === "head" ? { ...part, health } : part);
    assert.throws(() => vitality(hurt), /invalid health for vital part "head"/);
  }

  const overflow = whole().map((part) => part.key === "torso"
    ? { ...part, health: Number.MAX_VALUE, maxHealth: Number.MIN_VALUE }
    : part);
  assert.throws(() => vitality(overflow), /invalid health ratio for vital part "torso"/);
});

test("a_disposed_body_is_not_reported_dead", () => {
  assert.equal(vitality([]), 1);
  assert.equal(beaten([]), false);
});

test("a head off ends it", () => {
  assert.equal(beaten(minus("head")), true);
});

test("a torso off ends it too, though no body can lose one yet", () => {
  // `Fighter` gives the torso `attachment: null`, so this cannot happen today.
  // The rule names it anyway because severability is a property of the body and
  // session 08 authors a new one; a rule that only knew about the parts that
  // happen to come off this week would have to be found and edited by somebody
  // who had no reason to look here.
  assert.equal(beaten(minus("torso")), true);
});

test("an arm off does not end it, however much it changes the fight", () => {
  assert.equal(beaten(minus("upperArm")), false);
  assert.equal(beaten(minus("thighL")), false);
});

test("every part at zero ends it, with nothing severed at all", () => {
  const spent = flattened();
  assert.equal(spent.every((part) => !part.severed), true);
  assert.equal(beaten(spent), true);
});

test("one badly hurt non-vital part is a fighter still standing", () => {
  const hurt = whole().map((part) => (part.key === "pelvis" ? { ...part, health: 0.5 } : part));
  assert.equal(beaten(hurt), false);
});

test("a body with no parts at all is a disposed fighter, not a beaten one", () => {
  assert.equal(beaten([]), false);
});

test("the winner is named by its own last blow, not by the last blow anybody struck", () => {
  // The loser got a hit in after the one that decided it, which is exactly what
  // happens when a severed head's owner is still swinging on the way down.
  const outcome = settle(
    ring(
      corner(minus("head"), blow("left", { limb: "Left thigh", at: 9.1 })),
      corner(whole(), blow("right", { limb: "Head", speed: 14.24, at: 8.0 })),
    ),
    8.5,
  );

  assert.equal(outcome.winner, "right");
  assert.equal(outcome.ending, "exhausted");
  assert.equal(outcome.blow.at, 8.0);
  assert.equal(outcome.text, "right, as the other was exhausted by a cut to the head at 14.2 m/s");
});

test("a fighter that falls apart with no blow to its name still wins", () => {
  const outcome = settle(ring(corner(flattened()), corner(whole())), 3);
  assert.equal(outcome.winner, "right");
  assert.equal(outcome.blow, null);
  assert.equal(outcome.text, "right, left standing as the other was exhausted");
});

test("both of them down on one step is a draw", () => {
  const outcome = settle(
    ring(corner(minus("head"), blow("left")), corner(minus("head"), blow("right"))),
    5,
  );
  assert.equal(outcome.winner, null);
  assert.equal(outcome.ending, "exhausted");
  assert.equal(outcome.blow, null);
  assert.equal(outcome.text, "a draw: both were exhausted together");
});

test("the cap ends a bout nobody is winning, and names a draw", () => {
  const cap = CONFIG.bout.capSeconds;
  const still = ring(corner(whole()), corner(whole()));

  assert.equal(settle(still, cap - 0.001), null);

  const outcome = settle(still, cap);
  assert.equal(outcome.ending, "time");
  assert.equal(outcome.winner, null);
  assert.equal(outcome.text, `a draw: neither could finish it inside ${cap} s`);
});

test("a bout that is being won on damage is still a draw at the cap", () => {
  // Deliberate: deciding a fight on accumulated damage means writing a scoring
  // rule, and a scoring rule invented by the function that needed a tie-break
  // quietly becomes the balance of the game. `scoring.ts` is where one would
  // belong, with a test, on the day anybody wants it.
  const hurt = whole().map((part) => (part.key === "torso" ? { ...part, health: 1 } : part));
  const outcome = settle(ring(corner(hurt), corner(whole())), CONFIG.bout.capSeconds + 1);
  assert.equal(outcome.winner, null);
  assert.equal(outcome.ending, "time");
});

test("the verdict spells the four kinds of blow, and lower-cases the limb", () => {
  const at = (kind) => verdict("left", "exhausted", blow("left", { kind, limb: "Sword arm" }));
  assert.equal(at("cut"), "left, as the other was exhausted by a cut to the sword arm at 14.2 m/s");
  assert.equal(at("thrust"), "left, as the other was exhausted by a thrust to the sword arm at 14.2 m/s");
  assert.equal(at("slap"), "left, as the other was exhausted by a flat to the sword arm at 14.2 m/s");
  assert.equal(at("weak"), "left, as the other was exhausted by a shove to the sword arm at 14.2 m/s");
});

// ---------- and all of it end to end ----------

test("one pass through every phase, in the order a player walks it", () => {
  const chosen = withPolicy(withControl(defaultMatchup(), "right", "you"), "left", "idle");
  const still = ring(corner(whole()), corner(whole()));

  let state = selectScreen(defaultMatchup());
  assert.equal(state.phase, "select");

  state = begin(state, chosen);
  assert.equal(state.phase, "fight");

  state = advance(state, still, 12);
  assert.equal(state.phase, "fight");
  assert.equal(state.clock, 12);

  state = restart(state);
  assert.equal(state.clock, 0, "and R starts the same bout over");

  state = advance(state, still, CONFIG.bout.capSeconds);
  assert.equal(state.phase, "over");
  assert.equal(state.outcome.ending, "time");

  state = toSelect(state);
  assert.equal(state.phase, "select");
  assert.equal(state.outcome, null);
  assert.deepEqual(state.matchup, chosen);

  state = begin(state, state.matchup);
  assert.equal(state.phase, "fight");
  assert.equal(
    humanSide(state.matchup),
    "right",
    "the second bout is the same bout, on the side that was chosen",
  );
});

// ---- the pause ------------------------------------------------------------
//
// Every case here is a bug that shipped. `Space` paused a fight, and then from
// the phase the pause had put you in it did something else entirely: `over` ran
// `toSelect` on the way past, which raised the character selector over a fight
// that was still standing, and from `select` the resume branch could never be
// reached again, so the key was dead for the rest of the session.

test("pausing and resuming is one toggle, and it is the same one in both live phases", () => {
  for (const phase of ["fight", "over"]) {
    assert.equal(pauseAction(phase, true), "pause", `${phase}: a running world pauses`);
    assert.equal(pauseAction(phase, false), "resume", `${phase}: a stopped one resumes`);
  }
});

test("a decided bout is paused, not abandoned", () => {
  // The whole of "I click space and then the game is gone". `over` keeps its
  // world -- see `Phase` -- so it has something to pause, and pausing it must
  // not be spelled the same way as throwing it away. Leaving is `R`.
  assert.equal(pauseAction("over", true), "pause");
  assert.notEqual(pauseAction("over", true), "nothing");
});

test("resuming is reachable from every state a pause can leave you in", () => {
  // The second half of the bug, and the half that made it permanent: the resume
  // branch was written as `phase === "fight"`, so a pause taken in any other
  // phase could not be lifted by the key that took it.
  for (const phase of ["fight", "over"]) {
    assert.equal(
      pauseAction(phase, false),
      "resume",
      `a pause taken in ${phase} can be lifted by the same key that took it`,
    );
  }
});

test("behind the setup screen there is nothing to pause, and it says so", () => {
  assert.equal(pauseAction("select", false), "nothing");
  // `isActive` cannot honestly be true here, but the rule must not depend on a
  // caller getting that right: there are no bodies behind the setup screen.
  assert.equal(pauseAction("select", true), "nothing");
});

test("the bout cap that ships is a player's, not the bench's", () => {
  // 60 s is `scripts/measure.mjs`'s number and the argument for it is entirely
  // about running a hundred bouts. Applied to the page it ended a fight
  // underneath whoever was having it after one minute, which is what put the
  // phase into `over` without anybody asking -- and every pause bug above only
  // ever fired because something had moved the phase. If this fails because the
  // cap went back to 60, the pause is broken again by a different route.
  assert.ok(
    CONFIG.bout.capSeconds >= 300,
    `a cap of ${CONFIG.bout.capSeconds} s interrupts a fight somebody is having`,
  );
});

// ---- what is in each hand -------------------------------------------------

test("the picker offers exactly the equipment the code has", () => {
  // Against `WEAPON_KINDS` rather than against a literal, and that is the whole
  // point of the list existing: it was exported and read by nobody for three
  // sessions, which is the state `AGENTS.md` has a rule about. A kind added to
  // the union, given a builder and a row in every table, and then forgotten on
  // the setup screen, is a weapon nobody can choose -- and this is the only
  // thing in the tree that would say so.
  //
  // The order is asserted too. Both lists are declaration-ordered and the picker
  // is what a person reads top to bottom, so `sword` first is a choice rather
  // than an accident.
  assert.deepEqual(
    EQUIPMENT.map((item) => item.name),
    [...WEAPON_KINDS],
  );
  assert.deepEqual(
    [...WEAPON_KINDS],
    ["sword", "axe", "bow", "shield", "buckler", "club", "empty"],
    "and the union itself has not quietly gained or lost one",
  );
  for (const item of EQUIPMENT) {
    assert.ok(item.label.length > 0, `${item.name} needs a label for the screen`);
  }
});

test("a hand can be given a kind that takes two, and the table is what says so", () => {
  // `withEquipment` used to spell "it takes two hands" as `kind === "club"`,
  // which was the same sentence right up until the moment it was not. It asks
  // `handsFor` now, so a second two-handed kind is a row rather than an edit
  // here -- and the club, which is that kind today, still behaves exactly as it
  // did.
  const both = withEquipment(defaultMatchup(), "left", "handA", "club");
  assert.equal(both.left.handA, "club");
  assert.equal(both.left.handB, "club", "a two-handed weapon fills the other hand");

  const freed = withEquipment(both, "left", "handB", "axe");
  assert.equal(freed.left.handB, "axe");
  assert.equal(freed.left.handA, "empty", "and putting something else down empties it");

  // The kinds that take one hand leave the other alone, all of them.
  for (const kind of WEAPON_KINDS.filter((k) => handsFor(k) === 1)) {
    const one = withEquipment(defaultMatchup(), "left", "handA", kind);
    assert.equal(one.left.handB, "empty", `${kind} should not reach across`);
  }
});

test("a hand offered a kind the code does not have is left empty rather than trusted", () => {
  // The value arrives from a `<select>`, so it is a string, and it was cast
  // rather than checked. That held while every question about a kind had a
  // default; the tables are total now, so an unrecognised string is a
  // `TypeError` from inside `handsFor` instead of a quiet mistake. This is the
  // door it is refused at.
  assert.equal(isWeaponKind("sword"), true);
  assert.equal(isWeaponKind("halberd"), false);
  assert.equal(isWeaponKind("toString"), false, "and not a prototype member either");

  // A stale matchup does not crash the reducer on its way past.
  const stale = withEquipment(defaultMatchup(), "left", "handA", "halberd");
  assert.equal(stale.left.handB, "empty");
});

test("equipping a hand touches that hand, that side, and nothing else", () => {
  const before = defaultMatchup();
  const after = withEquipment(before, "left", "handB", "shield");

  assert.equal(after.left.handB, "shield");
  assert.equal(after.left.handA, "sword", "the other hand is left alone");
  assert.deepEqual(after.right, before.right, "and so is the other corner");
  assert.equal(before.left.handB, "empty", "the input is not mutated");
});

test("a club fills both hands, because it is one weapon", () => {
  const club = withEquipment(defaultMatchup(), "right", "handA", "club");
  assert.equal(club.right.handA, "club");
  assert.equal(club.right.handB, "club", "the second hand is on the haft");

  // And from the other side, which is the case a rule written once and applied
  // to `handA` only would get wrong.
  const other = withEquipment(defaultMatchup(), "right", "handB", "club");
  assert.equal(other.right.handA, "club");
  assert.equal(other.right.handB, "club");
});

test("putting something else in a hand puts the club down", () => {
  const club = withEquipment(defaultMatchup(), "left", "handA", "club");
  const after = withEquipment(club, "left", "handA", "sword");

  assert.equal(after.left.handA, "sword");
  assert.equal(after.left.handB, "empty", "half a club is not a weapon");
});

test("a bout opens with the loadout every measurement was taken from", () => {
  // A sword and an empty hand, on both sides. Every number in
  // `docs/measurements.md` predates there being a choice, and a default that
  // quietly changed the body would have invalidated all of them at once.
  const opening = defaultMatchup();
  for (const side of ["left", "right"]) {
    assert.equal(opening[side].handA, "sword");
    assert.equal(opening[side].handB, "empty");
  }
});
