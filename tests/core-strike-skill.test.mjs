/**
 * **The strike skill and its repertoire** (`src/core/skills/strike.ts`, `strikes.ts`), on views
 * built by hand: the left hand's strike is the right's with the arms' channels swapped and the
 * trunk's sided turns reversed; a hand throws the recipe for what it holds, its body's own or
 * another's, with its window turned over for the other hand; the club blow in the repertoire is the
 * club's best (`CLUB_BEST`); an attack walks toward its place, sets the feet there, stands `STAND` s, asks
 * the window of the head as it stands, chambers, pushes and is counted; and a target out of the
 * recipe's height is struck by a placed blow, a hand goal that carries the hand's point through
 * the target in the body frame. That a blow thrown through the skill reads as its search read it,
 * to the digit, is `tests/lab-blow.test.mjs`'s; that a placed blow lands, `tests/lab-targets.test.mjs`'s.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD_ACTION } from "../src/core/mind/intent.ts";
import { CLUB_BEST } from "../src/core/rules/rulebook.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { APPROACH, PLACED, STAND, strikeSkill } from "../src/core/skills/strike.ts";
import { FIST, heldIn, mirrored, mirroredWindow, recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";

const DT = 1 / 120;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("a_left_strike_swaps_the_arms_channels_and_reverses_the_trunks_sided_turns", () => {
  const right = {
    name: "a right straight", hand: "right",
    chamber: { seconds: 0.2, pose: { "thoracic rotation right": -0.1, "thoracic flexion": 0.2, "shoulder.right flexion": 1.5 } },
    pushes: [
      { channel: "thoracic rotation right", sense: -1, from: 0, to: 0.1 },
      { channel: "thoracic lateral flexion right", sense: 1, from: 0, to: 0.1, level: 0.5 },
      { channel: "lumbar flexion", sense: 1, from: 0.05, to: 0.1 },
      { channel: "shoulder.right flexion", sense: 1, from: 0, to: 0.2 },
      { channel: "elbow.right flexion", sense: -1, from: 0.1, to: 0.2 },
    ],
  };
  assert.deepEqual(mirrored(right), {
    name: "a left straight", hand: "left",
    chamber: { seconds: 0.2, pose: { "thoracic rotation right": 0.1, "thoracic flexion": 0.2, "shoulder.left flexion": 1.5 } },
    pushes: [
      { channel: "thoracic rotation right", sense: 1, from: 0, to: 0.1 },
      { channel: "thoracic lateral flexion right", sense: -1, from: 0, to: 0.1, level: 0.5 },
      { channel: "lumbar flexion", sense: 1, from: 0.05, to: 0.1 },
      { channel: "shoulder.left flexion", sense: 1, from: 0, to: 0.2 },
      { channel: "elbow.left flexion", sense: -1, from: 0.1, to: 0.2 },
    ],
  });
  for (const recipe of REPERTOIRE) assert.deepEqual(mirrored(mirrored(recipe.strike)), recipe.strike, recipe.strike.name);
});

test("a_hand_throws_the_recipe_for_what_it_holds_its_bodys_own_or_another_bodys", () => {
  const warrior = humanSpec("workshop-fighter"), rogue = humanSpec("workshop-rogue");
  const rogueClub = armed(rogue, "right", woodenClub());
  assert.equal(heldIn(rogueClub, "right"), "wooden club");
  assert.equal(heldIn(rogueClub, "left"), FIST);
  const own = (spec, held) => REPERTOIRE.find((r) => r.model === spec.model && r.held === held);
  const as = (recipe, hand) => hand === recipe.strike.hand
    ? { recipe, strike: recipe.strike, window: recipe.window }
    : { recipe, strike: mirrored(recipe.strike), window: mirroredWindow(recipe.window) };
  assert.deepEqual(recipeFor(REPERTOIRE, warrior, "right"), { ...as(own(warrior, FIST), "right"), borrowed: false });
  assert.deepEqual(recipeFor(REPERTOIRE, rogue, "left"), { ...as(own(rogue, FIST), "left"), borrowed: false });
  // The window is turned over across the heading, not along it.
  assert.deepEqual(mirroredWindow({ along: [-0.02, 0.08], across: [-0.14, 0.01], up: [-0.3, 0.06] }), { along: [-0.02, 0.08], across: [-0.01, 0.14], up: [-0.3, 0.06] });
  // The Rogue has no club blow of its own and throws the Warrior's.
  const club = own(warrior, "wooden club");
  assert.deepEqual(recipeFor(REPERTOIRE, rogueClub, "right"), { ...as(club, "right"), borrowed: true });
  assert.deepEqual(recipeFor(REPERTOIRE, rogueClub, "left"), { ...as(own(rogue, FIST), "left"), borrowed: false });
  assert.equal(recipeFor(REPERTOIRE.filter((r) => r.held === FIST), rogueClub, "right"), null);
});

test("the_repertoires_club_blow_is_the_clubs_best", async () => {
  const unit = JSON.parse(await readFile(new URL("../research/core-club-unit.json", import.meta.url), "utf8"));
  const clubs = REPERTOIRE.filter((r) => r.held === "wooden club");
  assert.equal(clubs.length, 1);
  // Its window is measured after (`research/core-strike-window.mjs`), and holds its place.
  const { window, ...recipe } = clubs[0];
  assert.ok(window.along[0] <= 0 && 0 <= window.along[1] && window.across[0] <= 0 && 0 <= window.across[1], JSON.stringify(window));
  assert.deepEqual(plain(recipe), plain({
    model: unit.model, held: "wooden club", strike: unit.strike, distance: unit.distance, found: unit.found, readings: unit.readings,
  }));
  // The blow things are priced against is that record's converged reading.
  assert.equal(recipe.readings.at1920.mean, CLUB_BEST.value);
});

test("an_attack_walks_to_its_place_sets_the_feet_stands_asks_the_window_and_is_thrown", () => {
  const spec = armed(humanSpec("workshop-fighter"), "right", woodenClub());
  const skill = strikeSkill(spec, REPERTOIRE);
  const { strike, recipe, window } = recipeFor(REPERTOIRE, spec, "right");
  // Standing as built: the feet 0.4 m apart, the head over their middle; heading 0 faces +z.
  const stance = { phase: "stand", centre: new Vector3(0, 0.9, 0), soles: { left: new Vector3(-0.2, 0, 0), right: new Vector3(0.2, 0, 0) } };
  const head = new Vector3(0, 1.6, 0), view = { head, stance };
  const moveBy = (x, z) => { for (const v of [head, stance.centre, stance.soles.left, stance.soles.right]) { v.x += x; v.z += z; } };
  const target = [0.1, 1.6, 3];
  const attack = { left: GUARD_ACTION, right: { kind: "attack", target } };
  // Where the feet stand for the target to be at the window's middle: square, as built.
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  const mx = target[0] - middle[1], mz = target[2] - recipe.distance - middle[0];
  const footing = { left: [mx - 0.2, mz], right: [mx + 0.2, mz] };
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12;

  const far = skill.command(view, attack, 0, false, DT);
  assert.equal(skill.report.phase, "approach");
  assert.equal(far.footing, null);
  assert.ok(far.walk[0] > 0 && far.walk[1] > 0 && Math.abs(Math.hypot(...far.walk) - APPROACH.pace) < 1e-12, JSON.stringify(far.walk));
  const r = Math.hypot(0.1, 3);
  assert.equal(far.face, Math.atan2(0.1, 3) - Math.asin(middle[1] / r));
  assert.deepEqual(plain(far.posture), plain(GUARD));

  // Given up while walking, it is dropped.
  assert.equal(skill.command(view, { left: GUARD_ACTION, right: GUARD_ACTION }, 0, false, DT), null);
  assert.equal(skill.report.hand, null);

  // Within reach of its place, it asks for the feet there, and does not walk.
  moveBy(mx, mz - APPROACH.reach / 2);
  const placing = skill.command(view, attack, 0, false, DT);
  assert.equal(skill.report.phase, "place");
  assert.equal(placing.walk, null);
  assert.ok(near(placing.footing.left, footing.left) && near(placing.footing.right, footing.right), JSON.stringify(placing.footing));
  // Placed, it stands; then asks the window, and out of it (the feet set well short), sets them again.
  skill.command(view, attack, 0, true, DT);
  assert.equal(skill.report.phase, "settle");
  let command, steps = 0;
  while (skill.report.phase === "settle" && steps < 10 * 120) { command = skill.command(view, attack, 0, false, DT); steps += 1; }
  assert.equal(skill.report.phase, "place");
  assert.ok(Math.abs(steps * DT - STAND) <= 2 * DT, `asked the window after ${steps} steps`);

  // The feet at their place: it stands out its time, chambers, pushes and is counted.
  moveBy(0, APPROACH.reach / 2);
  const phases = [];
  steps = 0;
  while (skill.report.thrown.right === 0 && steps < 10 * 120) {
    command = skill.command(view, attack, 0, false, DT);
    steps += 1;
    assert.equal(command.walk, null);
    if (phases.at(-1) !== skill.report.phase) phases.push(skill.report.phase);
    if (skill.report.phase === "chamber") assert.deepEqual(plain(command.posture), plain({ ...GUARD, ...strike.chamber.pose }));
  }
  assert.deepEqual(phases, ["settle", "chamber", "swing", null]);
  assert.deepEqual({ ...skill.report.thrown }, { left: 0, right: 1 });
  const end = Math.max(...strike.pushes.map((p) => p.to));
  assert.ok(Math.abs(steps * DT - (STAND + strike.chamber.seconds + end)) <= 2 * DT, `thrown after ${steps} steps`);
  assert.equal(skill.report.still, 0);
});

/**
 * A view built by hand: the body standing as built at the origin, heading 0 (facing +z), its head
 * `height` up; the root's frame turned a quarter about the upright and set off, so a place in it
 * is not the world's.
 */
function standing(height = 1.6) {
  const stance = { phase: "stand", centre: new Vector3(0, 0.9, 0), soles: { left: new Vector3(-0.2, 0, 0), right: new Vector3(0.2, 0, 0) } };
  const head = new Vector3(0, height, 0);
  const root = { position: new Vector3(0.3, 1, -0.2), rotation: Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2) };
  const view = { head, stance, root };
  const moveBy = (x, z) => { for (const v of [head, stance.centre, stance.soles.left, stance.soles.right, root.position]) { v.x += x; v.z += z; } };
  return { view, moveBy };
}

/** The spec's own reading of `hand`'s arm: its length laid straight to `point`, and its shoulder from the head's centre of mass. */
function armOf(spec, hand, point) {
  const centre = (name) => spec.joints.find((joint) => joint.name === `${name}.${hand}`).centre.value;
  const segment = (name) => spec.segments.find((s) => s.name === name);
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const end = rigidPoints(spec, segment(`hand.${hand}`)).get(point).value, head = segment("head").centreOfMass.value;
  return {
    length: apart(centre("shoulder"), centre("elbow")) + apart(centre("elbow"), centre("wrist")) + apart(centre("wrist"), end),
    shoulder: centre("shoulder").map((c, k) => c - head[k]),
    toes: Math.max(segment("foot.left").distal.value[2], segment("foot.right").distal.value[2]) - head[2],
  };
}

test("every_recipes_window_holds_its_place_each_way", () => {
  for (const { model, held, window } of REPERTOIRE) {
    for (const way of ["along", "across", "up"]) {
      assert.ok(window[way][0] <= 0 && 0 <= window[way][1], `${model}, ${held}: ${way} is ${JSON.stringify(window[way])}`);
    }
  }
});

test("a_target_in_a_recipes_window_is_thrown_at_with_it_and_one_out_of_its_height_is_placed", () => {
  const spec = humanSpec("workshop-fighter");
  const { recipe, window } = recipeFor(REPERTOIRE, spec, "right");
  const attack = (target) => ({ left: GUARD_ACTION, right: { kind: "attack", target } });
  const taken = (up) => {
    const skill = strikeSkill(spec, REPERTOIRE), { view } = standing();
    skill.command(view, attack([0, 1.6 + up, 3]), 0, false, DT);
    return { blow: skill.report.blow, chosen: skill.report.chosen?.recipe ?? null, distance: skill.report.distance };
  };
  // Either side of both ends of the height's window, a micrometre off: the window is not even about its place.
  assert.notEqual(-window.up[0], window.up[1]);
  for (const up of [window.up[0] + 1e-6, 0, window.up[1] - 1e-6]) assert.deepEqual(taken(up), { blow: "recipe", chosen: recipe, distance: recipe.distance }, `${up} m over the head`);
  const arm = armOf(spec, "right", "knuckles");
  for (const up of [window.up[0] - 1e-6, window.up[1] + 1e-6, -0.4, -0.6]) {
    const { blow, chosen, distance } = taken(up);
    assert.deepEqual({ blow, chosen }, { blow: "placed", chosen: null }, `${up} m over the head`);
    // It stands for the target to be `stretch` of the arm from the shoulder, straight ahead of the head.
    assert.ok(distance > arm.toes, `${up} m over the head, the fixture stands at its toes`);
    const from = Math.hypot(0 - arm.shoulder[0], up - arm.shoulder[1], distance - arm.shoulder[2]);
    assert.ok(Math.abs(from - PLACED.stretch * arm.length) < 1e-9, `${up} m over the head, the target stands ${from} m from the shoulder, of an arm ${arm.length} m`);
  }
  // Too low or too high for the arm's stretch from any standing place: stood for no nearer than the toes.
  for (const up of [-1.5, 0.8]) assert.deepEqual(taken(up), { blow: "placed", chosen: null, distance: arm.toes }, `${up} m over the head`);
  assert.ok(arm.toes > arm.shoulder[2], "the fixture's toes reach ahead of its shoulder: the floor is the toes'");

  // A placed blow, whole: the walk, the feet, the stand, the hand's goal each step, and the count.
  const skill = strikeSkill(spec, REPERTOIRE), { view, moveBy } = standing();
  const target = [0.1, 1.2, 3], hands = attack(target);
  const far = skill.command(view, hands, 0, false, DT);
  assert.equal(skill.report.phase, "approach");
  assert.ok(far.walk[0] > 0 && Math.abs(Math.hypot(...far.walk) - APPROACH.pace) < 1e-12, JSON.stringify(far.walk));
  assert.deepEqual(plain(far.hands), { left: null, right: null });
  const { distance } = skill.report;
  // Its feet where the target is straight ahead of the head, its distance off: it stands at once.
  moveBy(target[0], target[2] - distance);
  const phases = [], goals = [];
  let steps = 0, command;
  while (skill.report.thrown.right === 0 && steps < 10 * 120) {
    command = skill.command(view, hands, 0, false, DT);
    steps += 1;
    if (phases.at(-1) !== skill.report.phase) phases.push(skill.report.phase);
    assert.deepEqual(plain(command.posture), plain(GUARD));
    assert.deepEqual(command.pushes, []);
    assert.equal(command.walk, null);
    assert.equal(command.hands.left, null);
    assert.equal(skill.report.phase === "swing", command.hands.right !== null, `step ${steps}, ${skill.report.phase}`);
    if (command.hands.right) goals.push(command.hands.right);
  }
  assert.deepEqual(phases, ["settle", "swing", null]);
  assert.deepEqual({ ...skill.report.thrown }, { left: 0, right: 1 });
  assert.deepEqual(plain(command.hands), { left: null, right: null });
  assert.ok(Math.abs(steps * DT - (STAND + PLACED.seconds)) <= 2 * DT, `thrown after ${steps} steps`);
  assert.ok(Math.abs(goals.length * DT - PLACED.seconds) <= 2 * DT, `the hand had its goal ${goals.length} steps`);
  // The goal: the hand's own point, at the target in the root's frame, carried through, one path that follows.
  const { places: [place], ...rest } = goals[0];
  assert.deepEqual(rest, { seconds: PLACED.seconds, through: PLACED.through, follows: true });
  assert.equal(goals[0].places.length, 1);
  assert.equal(place.point, "knuckles");
  const back = new Vector3(...place.position).applyRotationQuaternion(view.root.rotation).add(view.root.position);
  assert.ok(Vector3.Distance(back, new Vector3(...target)) < 1e-12, `the place is ${back.asArray()} in the world`);
  assert.ok(Math.hypot(...place.position.map((c, k) => c - target[k])) > 0.5, "the fixture's root frame is not the world's");
  assert.deepEqual(plain(goals.at(-1)), plain(goals[0]));

  // What a placed blow takes is the skill's to be given: another time is another count of steps.
  const quick = strikeSkill(spec, REPERTOIRE, { ...PLACED, seconds: PLACED.seconds / 2 });
  for (steps = 0; quick.report.thrown.right === 0 && steps < 10 * 120; steps++) quick.command(view, hands, 0, false, DT);
  assert.ok(Math.abs(steps * DT - (STAND + PLACED.seconds / 2)) <= 2 * DT, `thrown after ${steps} steps`);

  // With the club the point is the swell's, and the arm reaches the club's length farther.
  const clubbed = armed(spec, "right", woodenClub()), held = strikeSkill(clubbed, REPERTOIRE);
  const high = [0, 1.6 + recipeFor(REPERTOIRE, clubbed, "right").window.up[1] + 0.1, 3];
  held.command(view, attack(high), 0, false, DT);
  assert.deepEqual({ blow: held.report.blow, phase: held.report.phase }, { blow: "placed", phase: "approach" });
  assert.ok(armOf(clubbed, "right", "swell").length > arm.length + 0.4);
  moveBy(high[0] - view.head.x, high[2] - held.report.distance - view.head.z);
  for (steps = 0; held.report.phase !== "swing" && steps < 10 * 120; steps++) command = held.command(view, attack(high), 0, false, DT);
  assert.equal(command.hands.right.places[0].point, "swell");
});

test("a_blow_is_chosen_again_by_the_head_as_it_stands", () => {
  const spec = humanSpec("workshop-fighter"), skill = strikeSkill(spec, REPERTOIRE);
  const { recipe, window } = recipeFor(REPERTOIRE, spec, "right");
  const { view, moveBy } = standing();
  const target = [0, 1.6, 3], hands = { left: GUARD_ACTION, right: { kind: "attack", target } };
  const middle = [(window.along[0] + window.along[1]) / 2, (window.across[0] + window.across[1]) / 2];
  moveBy(target[0] - middle[1], target[2] - recipe.distance - middle[0]);
  skill.command(view, hands, 0, false, DT);
  assert.deepEqual({ blow: skill.report.blow, phase: skill.report.phase }, { blow: "recipe", phase: "settle" });
  // Standing, the head sinks under the recipe's height: asked again after the stand, the blow is placed, and walked to.
  view.head.y -= window.up[1] + 0.05;
  let steps = 0;
  while (skill.report.phase === "settle" && steps < 10 * 120) { skill.command(view, hands, 0, false, DT); steps += 1; }
  assert.ok(Math.abs(steps * DT - STAND) <= 2 * DT, `chosen again after ${steps} steps`);
  assert.deepEqual({ blow: skill.report.blow, chosen: skill.report.chosen, still: skill.report.still }, { blow: "placed", chosen: null, still: 0 });
  assert.notEqual(skill.report.distance, recipe.distance);
  assert.deepEqual({ ...skill.report.thrown }, { left: 0, right: 0 });
  const next = skill.command(view, hands, 0, false, DT);
  assert.ok(["approach", "place"].includes(skill.report.phase), skill.report.phase);
  assert.deepEqual(plain(next.hands), { left: null, right: null });
});

test("a_placed_blow_is_over_when_the_body_is_resumed", () => {
  const spec = humanSpec("workshop-fighter");
  const target = [0, 1.2, 3], hands = { left: GUARD_ACTION, right: { kind: "attack", target } };
  /** A skill with its placed blow under way, a third of the way through. */
  const swinging = () => {
    const skill = strikeSkill(spec, REPERTOIRE), { view, moveBy } = standing();
    skill.command(view, hands, 0, false, DT);
    moveBy(0, target[2] - skill.report.distance);
    let command, steps = 0;
    while (skill.report.since < PLACED.seconds / 3 && steps < 10 * 120) { command = skill.command(view, hands, 0, false, DT); steps += 1; }
    assert.deepEqual({ phase: skill.report.phase, blow: skill.report.blow, goal: command.hands.right !== null }, { phase: "swing", blow: "placed", goal: true });
    return { skill, view };
  };
  const over = (skill) => ({ hand: skill.report.hand, phase: skill.report.phase, blow: skill.report.blow, distance: skill.report.distance,
    thrown: { ...skill.report.thrown }, still: skill.report.still });
  const none = { hand: null, phase: null, blow: null, distance: null, thrown: { left: 0, right: 0 }, still: 0 };

  const resumed = swinging();
  resumed.skill.resume();
  assert.deepEqual(over(resumed.skill), none);
  // Asked again, it stands anew before it throws: no goal for the hand until then.
  const again = resumed.skill.command(resumed.view, hands, 0, false, DT);
  assert.equal(resumed.skill.report.phase, "settle");
  assert.deepEqual(plain(again.hands), { left: null, right: null });

  // Its attack given up, a placed blow is over too, unthrown: nothing carries it on.
  const given = swinging();
  assert.equal(given.skill.command(given.view, { left: GUARD_ACTION, right: GUARD_ACTION }, 0, false, DT), null);
  assert.deepEqual(over(given.skill), none);
});
