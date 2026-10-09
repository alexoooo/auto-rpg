/**
 * **The guard's cover** (`guardSkill`, `src/core/skills/guard.ts`) and the threat a fighter reads
 * from its senses (`threatOf`, `src/core/mind/threat.ts`): a bare hand comes between the threat and
 * the head, and goes back to the guard; a club is laid across the threat's line, and is not swung
 * end over end; the threat is the foe's striking point that closes fastest on the head; in a bout
 * a club's blow at the head is met by the club that covers; an experiment's cover and threat ride
 * in the mind's config; the guard gives no goal to a hand the strike has; and a held item is
 * turned at the wrist as near upright as the wrist allows, clear of its holder (`guardPosture`) (Node core stand and
 * arena bout, Rapier, 120 Hz; each side's balance its character's).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { bodyEffectors } from "../src/core/control/effectors.ts";
import { chainTo, pointAtToRef } from "../src/core/control/kinematics.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { THREAT, threatReader } from "../src/core/mind/threat.ts";
import { GUARD, GUARD_COVER, guardPosture } from "../src/core/skills/guard.ts";
import { recipeSkills } from "../src/core/skills/skills.ts";
import { buildBout } from "../research/bout.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { withParts } from "./fixtures/minds.mjs";

const { threatOf } = threatReader();

const WARRIOR = humanSpec("workshop-fighter"), CLUBBED = armed(WARRIOR, "right", woodenClub());

/**
 * `spec` standing under its skills, each hand of `covering` given a cover of `stand.threat` (world)
 * while there is one, guarded its head; the other in the plain guard.
 */
async function covering(spec, hands) {
  const stand = await coreStand(spec, { ground: true });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const held = { threat: null };
  driveBy(body, { name: "covers", decide: ({ view }) => {
    const cover = (hand) => held.threat && hands.includes(hand) ? { threat: held.threat, guarded: view.head.asArray() } : null;
    return { move: null, face: 0, guard: { left: cover("left"), right: cover("right") }, attack: null };
  } });
  const { view } = body;
  return {
    stand, body, view, held,
    /** A point of a hand's rigid body, world. */
    point: (hand, name) => view.effectors[`hand.${hand}`].points[name].clone().applyRotationQuaternion(view.root.rotation).addInPlace(view.root.position),
    /** Where a cover of `threat` puts its point, or its two points' middle: `out` from the head toward it. */
    place: (threat) => view.head.add(Vector3.FromArray(threat).subtract(view.head).normalize().scale(GUARD_COVER.out)),
    /** The arms' angles, by channel. */
    arms: () => Object.fromEntries(Object.entries(view.angles).filter(([name]) => /^(shoulder|elbow|wrist)\./.test(name))),
    dispose() { body.dispose(); stand.dispose(); },
  };
}

/** The most two records of angles differ by, rad, over the channels `of` names. */
const apart = (a, b, of = () => true) => Math.max(...Object.keys(a).filter(of).map((name) => Math.abs(a[name] - b[name])));

test("a_bare_hand_comes_between_the_threat_and_the_head", async () => {
  const { stand, view, held, place, arms, dispose } = await covering(WARRIOR, ["left"]);
  try {
    stand.step(stand.seconds(1.5));
    const guard = arms(), head = view.head.clone();
    assert.ok(apart(guard, { ...guard, ...GUARD }) < 0.1, "it stands in the guard");
    // A threat 0.8 m before the face.
    held.threat = [head.x, head.y, head.z + 0.8];
    stand.step(stand.seconds(0.3));
    const before = Vector3.Distance(view.fists.left.position, place(held.threat));
    assert.ok(before < 0.03, `the knuckles are ${before} m from the place on the line`);
    assert.ok(Math.abs(Vector3.Distance(view.fists.left.position, view.head) - GUARD_COVER.out) < 0.03, "which is out from the head, not from the threat");
    // The threat a quarter round the head, to its left: the knuckles follow.
    held.threat = [head.x - 0.8, head.y, head.z];
    stand.step(stand.seconds(0.6));
    const beside = Vector3.Distance(view.fists.left.position, place(held.threat));
    assert.ok(beside < 0.03, `the knuckles are ${beside} m from the place at its side`);
    // The other hand was given no cover, and kept the guard.
    assert.ok(apart(arms(), guard, (name) => name.includes(".right ")) < 0.1, `the right arm moved ${apart(arms(), guard, (name) => name.includes(".right "))} rad`);
    // The cover taken away, the arm is the guard's again.
    held.threat = null;
    stand.step(stand.seconds(1));
    assert.ok(apart(arms(), guard) < 0.05, `back in the guard to ${apart(arms(), guard)} rad`);
    assert.equal(view.down, false);
  } finally { dispose(); }
});

/** How near two segments pass, m: `a` to `b`, and `c` to `d`. */
function segmentsApart(a, b, c, d) {
  const u = b.subtract(a), v = d.subtract(c), w = a.subtract(c);
  const uu = Vector3.Dot(u, u), uv = Vector3.Dot(u, v), vv = Vector3.Dot(v, v), uw = Vector3.Dot(u, w), vw = Vector3.Dot(v, w);
  const clamp = (x) => Math.max(0, Math.min(1, x)), den = uu * vv - uv * uv;
  let s = den > 1e-12 ? clamp((uv * vw - vv * uw) / den) : 0;
  const t = clamp((uv * s + vw) / vv);
  s = clamp((uv * t - uw) / uu);
  return Vector3.Distance(a.add(u.scale(s)), c.add(v.scale(t)));
}

test("a_club_is_laid_across_the_threats_line", async () => {
  const { stand, view, held, point, dispose } = await covering(CLUBBED, ["right"]);
  const radius = woodenClub().shapes[1].radius.value;
  /** The swell's axis: its two ends, how near the line from the head to the threat passes it, and the angle it is off square to that line. */
  const laid = () => {
    const from = point("right", "swellFrom"), to = point("right", "swellTo"), threat = Vector3.FromArray(held.threat);
    const along = Vector3.Dot(to.subtract(from).normalize(), threat.subtract(view.head).normalize());
    return { gap: segmentsApart(view.head, threat, from, to), off: Math.abs(Math.asin(along)), up: to.y - from.y };
  };
  try {
    stand.step(stand.seconds(1.5));
    const head = view.head.clone();
    held.threat = [head.x, head.y, head.z + 0.8];
    const uppermost = Math.sign(laid().up);
    assert.ok(uppermost !== 0);
    stand.step(stand.seconds(0.6));
    const ahead = laid();
    assert.ok(ahead.gap < radius, `the threat's line passes ${ahead.gap} m from the swell's axis, whose radius is ${radius}`);
    assert.ok(ahead.off < 0.2, `the swell lies ${ahead.off} rad off square to the line`);
    // A threat from the other side: the club is turned to it the short way, the same end uppermost at every step.
    held.threat = [head.x - 0.8, head.y, head.z];
    let least = Infinity;
    for (let i = 0; i < stand.seconds(1); i++) { stand.step(); least = Math.min(least, uppermost * laid().up); }
    assert.ok(least > 0, `the end that was uppermost was ${least} m over the other at the least`);
    assert.ok(laid().off < 0.4, `and the swell lies ${laid().off} rad off square to the line`);
    assert.equal(view.down, false);
  } finally { dispose(); }
});

/**
 * Two Warriors in one world, weightless and in the air: the first under the command layers, sensing
 * the second (`foe`, built `far` m ahead, limp) on the side `side`. `shove(hand, impulse)` pushes
 * the foe's hand toward the first's head by `impulse` N s, or with no hand named sends the whole
 * foe away along the ground at `impulse` m/s; `turn(hand, impulse, name)` spins the hand by
 * `impulse` N m s about the axis that sweeps its point `name` at the head; `read(hand, name)` is a
 * point of that hand's rigid body, how fast it closes on the head, and how fast the hand's centre of
 * mass does, read from the foe's body as it stands.
 */
async function facing(foeSpec, { far = 0.6, side = "right", out = () => false } = {}) {
  const stand = await coreStand(WARRIOR, { gravity: false, ground: false });
  const foe = buildBody(foeSpec, stand.world, { position: [0, 0, far] });
  const hub = createSenses(stand.world);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, senses: hub.add({ id: "a", side: "left", built: stand.built, out: () => false }) });
  hub.add({ id: "b", side, built: foe, out });
  const hand = (which) => foe.segments.get(`hand.${which}`);
  /** `name` of `which` hand's rigid body, world. */
  const at = (which, name) => {
    const segment = hand(which), { origin, x, y, z } = segment.frame, p = rigidPoints(foeSpec, segment.spec).get(name).value;
    const d = p.map((c, i) => c - origin[i]), dot = (axis) => d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    return new Vector3(dot(x), dot(y), dot(z)).applyRotationQuaternion(segment.node.rotationQuaternion).addInPlace(segment.node.position);
  };
  return {
    stand, body, foe, at,
    shove(which, impulse) {
      const centre = new Vector3();
      if (which) hand(which).body.applyImpulse(body.view.head.subtract(centreOfToRef(hand(which), centre)).normalize().scale(impulse), centre);
      else for (const segment of foe.segments.values()) segment.body.applyImpulse(new Vector3(0, 0, impulse * segment.rigid.mass), centreOfToRef(segment, centre));
    },
    turn(which, impulse, name) {
      const p = at(which, name), lever = p.subtract(centreOfToRef(hand(which), new Vector3()));
      hand(which).body.applyTorqueImpulse(Vector3.Cross(lever, body.view.head.subtract(p)).normalize().scale(impulse));
    },
    read(which, name) {
      const segment = hand(which), p = at(which, name), centre = centreOfToRef(segment, new Vector3());
      const carried = segment.body.linearVelocityToRef(new Vector3()), w = segment.body.angularVelocityToRef(new Vector3());
      const v = carried.add(Vector3.Cross(w, p.subtract(centre))), from = p.subtract(body.view.head);
      return { at: p, far: from.length(), closing: -Vector3.Dot(from, v) / from.length(), carried: -Vector3.Dot(from, carried) / from.length() };
    },
    dispose() { body.dispose(); hub.dispose(); foe.dispose(); stand.dispose(); },
  };
}

/**
 * The cover the first Warrior's senses ask for once `foeSpec` is shoved (`shoves`, each as
 * `shove` takes it, or with "turn" as `turn` does), and what the foe's body itself said of each hand's `name`
 * shoved at the step the senses show.
 */
async function threatened(foeSpec, shoves, name, options) {
  const pair = await facing(foeSpec, options);
  try {
    for (const [which, impulse, how] of shoves) if (how === "turn") pair.turn(which, impulse, name); else pair.shove(which, impulse);
    pair.stand.step();
    const said = Object.fromEntries(shoves.map(([which]) => [which ?? "right", pair.read(which ?? "right", name)])), head = pair.body.view.head.asArray();
    // The senses show a step as the one before left it: the step after the reading is the one that shows it.
    pair.stand.step();
    return { cover: threatOf(pair.body.view), said, head, knuckles: pair.at("right", "knuckles") };
  } finally { pair.dispose(); }
}

test("the_threat_is_the_foes_striking_point_that_closes_fastest", async () => {
  // A fist shoved at the head: the threat is at the fist, and what is guarded is the head.
  const fist = await threatened(WARRIOR, [["right", 12]], "knuckles");
  assert.ok(fist.said.right.closing > THREAT.closing && fist.said.right.far < THREAT.within, `the fixture's fist closes at ${fist.said.right.closing} m/s from ${fist.said.right.far} m`);
  assert.ok(fist.cover && Vector3.Distance(Vector3.FromArray(fist.cover.threat), fist.said.right.at) < 0.01, `the threat is at ${fist.cover?.threat}, the fist at ${fist.said.right.at}`);
  assert.ok(Vector3.Distance(Vector3.FromArray(fist.cover.guarded), Vector3.FromArray(fist.head)) < 0.01, "guarded, the head");
  // Of two fists that close, the faster.
  for (const [faster, slower] of [["left", "right"], ["right", "left"]]) {
    const two = await threatened(WARRIOR, [[slower, 8], [faster, 12]], "knuckles");
    assert.ok(two.said[slower].closing > THREAT.closing && two.said[faster].closing > two.said[slower].closing, `the fixture's fists close at ${two.said[faster].closing} and ${two.said[slower].closing} m/s`);
    assert.ok(Vector3.Distance(Vector3.FromArray(two.cover.threat), two.said[faster].at) < 0.01, `the threat is the faster fist, the ${faster}`);
  }
  // A club in the hand: the threat is at its swell, not at the knuckles that carry it.
  const foeClub = armed(WARRIOR, "right", woodenClub());
  const club = await threatened(foeClub, [["right", 20]], "swell");
  assert.ok(club.said.right.closing > THREAT.closing && club.said.right.far < THREAT.within, `the fixture's swell closes at ${club.said.right.closing} m/s from ${club.said.right.far} m`);
  assert.ok(Vector3.Distance(Vector3.FromArray(club.cover.threat), club.said.right.at) < 0.01, "the threat is at the swell");
  assert.ok(Vector3.Distance(club.knuckles, club.said.right.at) > 0.3, "which is not where the knuckles are");
  // A club swung by the wrist: the swell closes as the hand's spin carries it, though the hand's centre of mass hardly does.
  const swung = await threatened(foeClub, [["right", 1.5, "turn"]], "swell");
  assert.ok(swung.said.right.closing > THREAT.closing && swung.said.right.carried < THREAT.closing, `the fixture's swell closes at ${swung.said.right.closing} m/s, its hand's centre at ${swung.said.right.carried}`);
  assert.ok(swung.cover && Vector3.Distance(Vector3.FromArray(swung.cover.threat), swung.said.right.at) < 0.01, "a swell that the spin alone brings is a threat");
  // Slower than a threat closes, moving away, beyond its distance, of its own side, out of the fight: none.
  const slow = await threatened(WARRIOR, [["right", 3]], "knuckles");
  assert.ok(slow.said.right.closing > 0.5 && slow.said.right.closing < THREAT.closing, `the slow fixture's fist closes at ${slow.said.right.closing} m/s`);
  assert.equal(slow.cover, null);
  const away = await threatened(WARRIOR, [[null, 4]], "knuckles");
  assert.ok(away.said.right.closing < -THREAT.closing, `the fixture's fist leaves at ${away.said.right.closing} m/s`);
  assert.equal(away.cover, null);
  const beyond = await threatened(WARRIOR, [["right", 12]], "knuckles", { far: 1.6 });
  assert.ok(beyond.said.right.closing > THREAT.closing && beyond.said.right.far > THREAT.within, `the far fixture's fist closes at ${beyond.said.right.closing} m/s from ${beyond.said.right.far} m`);
  assert.equal(beyond.cover, null);
  assert.equal((await threatened(WARRIOR, [["right", 12]], "knuckles", { side: "left" })).cover, null, "its own side's");
  assert.equal((await threatened(WARRIOR, [["right", 12]], "knuckles", { out: () => true })).cover, null, "out of the fight");
});

/**
 * The first blow between a Rogue who throws its club and a Warrior ordered to stand `gap` m off
 * under `guard`: the surface of the one who stands.
 */
async function firstBlow(gap, guard, experiment = {}) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-rogue", right: "workshop-fighter", gap, minds: { left: RECIPE_FIGHTER, right: withParts(RECIPE_FIGHTER, { tactics: { guard, tuning: { threat: experiment.threat } }, guard: { tuning: { covering: experiment.covering } } }) } });
  try {
    duel.play([{ step: 0, side: "right", orders: STAND_ORDERS }]);
    while (duel.blows.length === 0 && duel.clock < 20) world.step();
    const [blow] = duel.blows;
    if (!blow) return null;
    const { segment, item } = blow.sides.find((side) => side.fighter === duel.duelists.right.id);
    return { segment, item, time: blow.time, energy: blow.energy };
  } finally { dispose(); }
}

test("a_clubs_blow_at_the_head_is_met_by_the_club_that_covers", async () => {
  // The pose takes the first blow on the head from every gap from 2.6 to 6 m. From these the covering
  // hand meets it first, as from 32 of the 35 gaps 0.1 m apart from 2.6 to 6 m; from 2.7, 3.6 and
  // 4.4 m the cover is late, and the blow lands on the head.
  for (const gap of [3, 4.5, 5.4]) {
    const { segment, item } = await firstBlow(gap, "pose");
    assert.deepEqual({ segment, item }, { segment: "head", item: null }, `in the pose, from ${gap} m`);
    const met = await firstBlow(gap, "cover");
    assert.ok(met && (met.item === "wooden club" || /^(hand|forearm)\./.test(met.segment)), `covering, from ${gap} m, the blow met ${JSON.stringify(met)}`);
  }
});

test("an_experiments_cover_and_threat_ride_in_the_minds_config", async () => {
  const pose = await firstBlow(3, "pose"), cover = await firstBlow(3, "cover");
  assert.notDeepEqual(cover, pose);
  // The cover and the threat that are set, written out, are the bout with none written.
  assert.deepEqual(await firstBlow(3, "cover", { covering: { ...GUARD_COVER }, threat: { ...THREAT } }), cover);
  // A threat nothing can be is the pose's bout, to the bit; a cover held further out is another bout.
  assert.deepEqual(await firstBlow(3, "cover", { threat: { within: 0, closing: THREAT.closing } }), pose);
  assert.deepEqual(await firstBlow(3, "cover", { threat: { within: THREAT.within, closing: 1e9 } }), pose);
  const further = await firstBlow(3, "cover", { covering: { out: GUARD_COVER.out + 0.15, seconds: GUARD_COVER.seconds } });
  assert.notDeepEqual(further, cover);
  assert.notDeepEqual(further, pose);
  // In the pose neither is read.
  assert.deepEqual(await firstBlow(3, "pose", { covering: { out: 0.5, seconds: 1 }, threat: { within: 9, closing: 0 } }), pose);
});

test("the_guard_has_the_hands_the_strike_has_not", async () => {
  const stand = await coreStand(WARRIOR, { ground: true });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const skills = recipeSkills(body);
  // The right hand attacks until its recipe's pushes begin, and is then told to cover as the left is all along.
  const held = { target: null, covers: false, seen: [] };
  body.drive((view, dt) => {
    const cover = { threat: [view.head.x, view.head.y, view.head.z + 0.8], guarded: view.head.asArray() };
    const attack = !held.covers && held.target ? { kind: "blow", hand: "right", target: held.target } : null;
    const command = skills.command(view, { move: null, face: 0, guard: { left: held.target ? cover : null, right: held.covers ? cover : null }, attack }, dt);
    const { hand, phase, blow } = skills.report.strike;
    if (phase === "swing") held.covers = true;
    held.seen.push({ hand, phase, blow, covers: held.covers, left: command.effectors["hand.left"]?.places.map((place) => place.point) ?? null, right: command.effectors["hand.right"]?.places.map((place) => place.point) ?? null });
    return command;
  });
  try {
    stand.step(stand.seconds(1));
    assert.ok(held.seen.every(({ left, right }) => left === null && right === null), "with no cover asked, no hand has a goal");
    // A target the fist's recipe is thrown at: straight ahead, at the height of the head.
    const { head } = body.view;
    held.target = [head.x, head.y + 0.04, head.z + skills.report.strike.rangeAt("right", 0).reach];
    held.seen.length = 0;
    stand.step(stand.seconds(6));
    const { seen } = held;
    // While the strike had the right hand, the guard gave it nothing, whatever it was told; the left covered throughout.
    const taken = seen.filter(({ hand }) => hand === "right"), told = taken.filter(({ covers }) => covers);
    assert.ok(told.length > 5 && told.every(({ blow }) => blow === "recipe"), `the recipe went on ${told.length} steps after its hand was told to cover`);
    assert.deepEqual(taken.filter(({ right }) => right !== null), [], "the guard places no hand the strike has");
    assert.deepEqual(seen.filter(({ left }) => left?.join() !== "knuckles"), [], "the left hand covers at every step");
    // The strike over, the right hand is the guard's, and covers.
    const after = seen.slice(seen.findLastIndex(({ hand }) => hand === "right") + 1);
    assert.ok(after.length > 100 && after.every(({ hand, right }) => hand === null && right?.join() === "knuckles"), `${after.length} steps after the strike, the right hand covers`);
    assert.equal(skills.report.strike.thrown.right, 1);
  } finally { body.dispose(); stand.dispose(); }
});

test("a_held_item_is_turned_at_the_wrist_as_near_upright_as_the_wrist_allows", async () => {
  const empty = await coreStand(WARRIOR, { ground: true });
  try { assert.equal(guardPosture(empty.built.spec), GUARD, "a body that holds nothing holds GUARD"); } finally { empty.dispose(); }
  const cases = [
    [CLUBBED, "right", true],
    [armed(humanSpec("workshop-rogue"), "left", woodenClub()), "left", true],
    // The skeleton's wrist cannot stand it up: its range stops it.
    [armed(modelSpec("crypt-skeleton"), "right", woodenClub()), "right", false],
  ];
  for (const [spec, side, upright] of cases) {
    const stand = await coreStand(spec, { ground: true });
    try {
      const pose = guardPosture(stand.built.spec), hand = stand.built.segments.get(`hand.${side}`), chain = chainTo(stand.built, hand);
      const { free } = bodyEffectors(stand.built).find((e) => e.segment === hand), wrist = free.filter((f) => f.joint === chain.length - 1);
      const holding = spec.held.find((h) => h.segment === `hand.${side}`), grip = holding.origin.value;
      const haft = grip.map((v, k) => v + holding.along.value[k]);
      // The arm as GUARD holds it: its angles within their ranges.
      const angles = (posture) => chain.map((joint) => joint.dofs.map((dof) => posture[`${joint.spec.name} ${dof.spec.positive}`] ?? 0));
      const held = (posture) => { const a = angles(posture); for (const f of free) a[f.joint][f.k] = Math.min(f.max, Math.max(f.min, a[f.joint][f.k])); return a; };
      const at = (a, point) => pointAtToRef(chain, a, point, new Vector3()).clone();
      const tilt = (a) => { const line = at(a, haft).subtract(at(a, grip)); return Math.acos(line.y / line.length()); };
      const before = tilt(held(GUARD)), after = tilt(held(pose));
      assert.ok(after < before - 0.3, `${spec.model}'s ${side} haft stands nearer upright: ${after} rad off, where GUARD's is ${before}`);
      // A human's wrist stands it up, its grip moved by the wrist's turn alone, a few centimetres;
      // the skeleton's stops at its range.
      if (upright) {
        assert.ok(after < 0.02, `${spec.model}'s ${side} haft stands upright: ${after} rad off`);
        const moved = Vector3.Distance(at(held(pose), grip), at(held(GUARD), grip));
        assert.ok(moved < 0.06, `the ${side} grip stays near where GUARD holds it: ${moved} m off`);
      } else assert.ok(wrist.some((f) => Math.min(pose[f.name] - f.min, f.max - pose[f.name]) < 1e-9), `${spec.model}'s wrist is at its range`);
      for (const f of wrist) assert.ok(pose[f.name] >= f.min - 1e-12 && pose[f.name] <= f.max + 1e-12, `${f.name} within its range`);
      // Only the holding wrist is turned: every other entry is GUARD's.
      const turned = new Set(wrist.map((f) => f.name));
      assert.deepEqual(Object.entries(pose).filter(([name]) => !turned.has(name)), Object.entries(GUARD));
      assert.ok(turned.size === 3 && [...turned].every((name) => name.startsWith(`wrist.${side} `) && name in pose));
    } finally { stand.dispose(); }
  }
});

test("a_club_held_in_the_guard_bears_on_none_of_its_holder", async () => {
  // The Rogue at size x0.9 is the body whose club fell on its own arm; the Warrior's rested on its head.
  for (const spec of [CLUBBED, armed(humanSpec("workshop-rogue", { size: 0.9 }), "right", woodenClub()), armed(modelSpec("crypt-skeleton"), "right", woodenClub())]) {
    const stand = await coreStand(spec, { ground: true });
    const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
    const skills = recipeSkills(body);
    body.drive((view, dt) => skills.command(view, { move: null, face: 0, guard: { left: null, right: null }, attack: null }, dt));
    try {
      stand.step(stand.seconds(2));
      const hand = stand.built.segments.get("hand.right"), own = new Map([...stand.built.segments.values()].map((s) => [s.body, s.spec.name]));
      const touched = new Set();
      for (let i = 0; i < stand.seconds(2); i++) {
        stand.step(1);
        for (const contact of stand.world.physics.contactsOf(hand.body)) if (contact.other && own.has(contact.other)) touched.add(own.get(contact.other));
      }
      assert.deepEqual([...touched], [], `${spec.model}'s club touches nothing of it`);
      const { swellFrom: a, swellTo: b } = body.view.effectors["hand.right"].points;
      if (spec.model !== "crypt-skeleton") assert.ok(Math.acos((b.y - a.y) / Vector3.Distance(a, b)) < 0.1, `${spec.model}'s haft stands within 0.1 rad of upright`);
    } finally { body.dispose(); stand.dispose(); }
  }
});
